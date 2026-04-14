# Authentication Research Report: Nodes and Dashboard

**Task:** FN-1783
**Date:** 2026-04-14
**Type:** Research Only — No Implementation

---

## Executive Summary

Fusion currently operates with **minimal authentication boundaries**. Nodes in the mesh network store API keys but only validate them on a single endpoint (`POST /api/mesh/sync`), while the dashboard and all other API routes are completely open. This creates a security gap, especially for `fn serve` which binds to `0.0.0.0` by default.

This report documents the **current authentication posture**, analyzes **three options for completing node-to-node authentication**, and **three options for adding dashboard/API authentication**. The report provides concrete recommendations and implementation considerations.

**Key Findings:**
- Node auth uses Bearer tokens with `Authorization` headers but validation is limited to one endpoint
- Dashboard has **no authentication whatsoever** — all API routes are open
- `fn serve` binds to all network interfaces, making it accessible to anyone on the network
- Existing infrastructure (rate-limiting, error helpers) can be leveraged for auth implementation
- A layered approach (separate node auth from dashboard auth) is recommended

---

## 1. Current State Analysis

### 1.1 Node Authentication

#### Where API Keys Are Stored
- **`NodeConfig.apiKey`** is stored in the `nodes` table (SQLite in `~/.pi/fusion/fusion-central.db`)
- Defined in `packages/core/src/types.ts`:
  ```typescript
  interface NodeConfig {
    id: string;
    name: string;
    type: "local" | "remote";
    url?: string;
    apiKey?: string;  // Stored plaintext
    status: "offline" | "online" | "error";
    // ...
  }
  ```

#### How API Keys Are Sent
- **`NodeConnection.test()`** (`packages/core/src/node-connection.ts`):
  ```typescript
  const response = await fetch(healthUrl, {
    method: "GET",
    headers: options.apiKey
      ? { Authorization: `Bearer ${options.apiKey}` }
      : undefined,
    signal: controller.signal,
  });
  ```

- **`CentralCore.checkNodeHealth()`** (`packages/core/src/central-core.ts`):
  ```typescript
  const response = await fetch(healthUrl, {
    method: "GET",
    headers: node.apiKey ? { Authorization: `Bearer ${node.apiKey}` } : undefined,
    signal: controller.signal,
  });
  ```

#### Where API Keys Are Validated
- **Only `POST /api/mesh/sync`** validates the Bearer token:
  ```typescript
  // In central-core.ts mesh sync handler
  const senderNode = await this.getNode(senderNodeId);
  if (!senderNode || senderNode.apiKey !== bearerToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  ```

#### Critical Gaps

| Endpoint | Validates Token? | Notes |
|-----------|-------------------|-------|
| `GET /api/health` | **NO** | Returns status without auth check |
| `GET /api/mesh/state` | **NO** | Returns mesh topology |
| `GET /api/nodes` | **NO** | Lists all registered nodes |
| `GET /api/nodes/:id` | **NO** | Returns node details including API keys |
| `POST /api/mesh/sync` | **YES** | Only endpoint that validates |
| `GET /api/nodes/:id/metrics` | **NO** | Returns system metrics |
| `GET /api/nodes/:id/version` | **NO** | Returns version info |
| `POST /api/nodes/:id/sync-plugins` | **NO** | Plugin sync endpoint |

**Security Impact:** Anyone who knows a remote node's URL can:
- Query its health and system metrics
- List all registered nodes and their API keys
- Trigger plugin sync operations
- Access the mesh topology

### 1.2 Dashboard Authentication

#### Current State
- **No authentication** on any dashboard or API route
- `fn dashboard` binds to `localhost` (somewhat protected by network isolation)
- `fn serve` binds to `0.0.0.0` (**network-accessible!**)
- `AuthStorage` is **only for AI provider credentials** (OAuth/API keys for OpenAI, Anthropic, etc.)
- No session management, cookies, or API key validation

#### Relevant Code

**Dashboard startup** (`packages/cli/src/commands/dashboard.ts`):
```typescript
const server = app.listen(selectedPort);  // Binds to localhost by default
```

**Serve startup** (`packages/cli/src/commands/serve.ts`):
```typescript
const selectedHost = opts.host ?? "0.0.0.0";  // Network-accessible!
const server = app.listen(selectedPort, selectedHost);
```

**Health endpoint** (`packages/dashboard/src/server.ts`):
```typescript
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.4.0",
    uptime: Math.floor(process.uptime()),
  });
});
```

**Rate limiting exists but no auth** (`packages/dashboard/src/rate-limit.ts`):
```typescript
export const RATE_LIMITS = {
  api: { windowMs: 60_000, max: 100 },
  mutation: { windowMs: 60_000, max: 30 },
  sse: { windowMs: 60_000, max: 10 },
};
```

**Error helpers available** (`packages/dashboard/src/api-error.ts`):
```typescript
export function unauthorized(message: string): ApiError {
  return new ApiError(401, message);
}
```

#### Critical Gaps

| Area | Gap |
|------|-----|
| Browser access | No login required to access dashboard |
| API access | No API key required for programmatic access |
| `fn serve` | Bound to `0.0.0.0` — anyone on network can access |
| Credentials storage | No user credential storage |
| Session management | No sessions or cookies |
| Multi-user | Single-user only — no user isolation |

---

## 2. Node Authentication Options

### Option A: Shared Secret / Static API Key

**Concept:** Reuse the existing `apiKey` field but validate it on *all* node-facing endpoints.

#### Implementation Approach
1. Add Bearer token validation middleware
2. Apply to all `/api/nodes/`, `/api/mesh/`, `/api/health` endpoints
3. Support both `Authorization: Bearer <token>` header and `?api_key=<token>` query param for browser compatibility

#### Security Properties
- **Strength:** Basic protection against casual access
- **Weakness:** Static keys can be leaked, no rotation mechanism
- **Replay:** Vulnerable to replay attacks if tokens are captured

#### Operational Complexity
- **Key Generation:** Simple UUID or random string
- **Key Storage:** Already exists in `nodes` table
- **Key Rotation:** Manual process — requires updating all nodes
- **Revocation:** Not supported — keys are eternal
- **Onboarding:** Share key out-of-band (secure channel required)

#### Compatibility with Current Architecture
- **Minimal changes** — leverages existing `apiKey` field
- `NodeConnection` already sends Bearer tokens
- `CentralCore` already validates on one endpoint

#### Endpoints to Protect
```typescript
// All of these need Bearer token validation:
GET  /api/health
GET  /api/mesh/state
GET  /api/mesh/peer-exchange
POST /api/mesh/sync
GET  /api/nodes
POST /api/nodes
GET  /api/nodes/:id
PATCH /api/nodes/:id
DELETE /api/nodes/:id
GET  /api/nodes/:id/metrics
GET  /api/nodes/:id/version
POST /api/nodes/:id/sync-plugins
GET  /api/nodes/:id/compatibility
```

#### Impact on Existing Code
```typescript
// packages/dashboard/src/server.ts
app.get("/api/health", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") ||
                req.query.api_key;
  
  // Validate against configured admin key or node registry
  if (!validateToken(token)) {
    return unauthorized(res, "Invalid API key");
  }
  // ... rest of handler
});
```

#### Works For
- `fn serve` — Yes
- `fn dashboard` — Yes (separate auth layer recommended)

---

### Option B: Mutual TLS (mTLS)

**Concept:** Nodes present client certificates validated by the server. Uses TLS client authentication.

#### Implementation Approach
1. Generate CA for signing node certificates
2. Each node gets a signed client certificate
3. Server validates client certificate on TLS handshake
4. Certificate CN/SAN identifies the node

#### Security Properties
- **Strength:** Strong — certificates are cryptographically verified
- **Weakness:** Complex PKI infrastructure
- **Replay:** Certificates can be revoked but revocation checking adds latency

#### Operational Complexity
- **Key Generation:** Certificate authority + per-node certificates
- **Key Storage:** Certificate files on each node
- **Key Rotation:** Certificate renewal with CA re-signing
- **Revocation:** Certificate revocation lists (CRLs) or OCSP
- **Onboarding:** Certificate issuance workflow required

#### Compatibility with Current Architecture
- **Major changes** — requires TLS infrastructure
- Node connection code needs certificate loading
- Central registry needs certificate pinning

#### Additional Considerations
```typescript
// Server TLS configuration
const server = https.createServer({
  cert: serverCert,
  key: serverKey,
  requestCert: true,        // Request client certificate
  rejectUnauthorized: true,  // Reject invalid client certs
}, app);

// Node connection
const response = await fetch(healthUrl, {
  cert: nodeCertificate,
  key: nodePrivateKey,
  ca: caCertificate,        // Trust our CA
});
```

#### Works For
- `fn serve` — Yes
- `fn dashboard` — Yes (separate auth layer recommended)
- **Not suitable for:** Quick setup, development environments

---

### Option C: JWT or Signed Requests

**Concept:** Short-lived tokens signed with a shared secret or asymmetric key. Includes timestamp and optional claims.

#### Implementation Approach
1. Generate a signing secret (HMAC-SHA256) or keypair (RSA/Ed25519)
2. Issue tokens with expiration (e.g., 1 hour)
3. Include node ID in token claims
4. Validate signature + expiration on each request
5. Token refresh mechanism for long-running operations

#### Security Properties
- **Strength:** Strong — cryptographic signatures + time-based expiry
- **Replay:** Limited by token lifetime; use nonces for additional protection
- **Rotation:** Shared secret rotation with grace period

#### Operational Complexity
- **Key Generation:** Simple secret or keypair
- **Key Storage:** Shared secret per-node or public key registry
- **Key Rotation:** Secret rotation with token invalidation
- **Revocation:** Token expiration handles revocation; for immediate revocation, maintain denylist
- **Onboarding:** Token issuance workflow

#### Compatibility with Current Architecture
- **Moderate changes** — add token generation/validation
- Can reuse existing `apiKey` as shared secret
- `NodeConnection` needs token generation

#### Token Structure
```typescript
interface NodeToken {
  nodeId: string;
  issuedAt: number;      // Unix timestamp
  expiresAt: number;     // Unix timestamp
  nonce?: string;        // For replay protection
}

// JWT payload example:
// {
//   "nodeId": "node_abc123",
//   "iat": 1713000000,
//   "exp": 1713003600,
//   "jti": "unique-token-id"
// }

// Signed with HMAC-SHA256 using shared secret
```

#### Works For
- `fn serve` — Yes
- `fn dashboard` — Yes (separate auth layer recommended)

---

### Node Auth Options Comparison

| Aspect | Option A: Static API Key | Option B: mTLS | Option C: JWT |
|--------|-------------------------|----------------|---------------|
| **Implementation Effort** | Low | High | Medium |
| **Security Level** | Basic | Strong | Strong |
| **Key Rotation** | Manual | CA-based | Graceful |
| **Replay Protection** | None | Certificate revocation | Token lifetime |
| **Infrastructure** | None | PKI required | Signing only |
| **Node Onboarding** | Share key | Certificate issuance | Token issuance |
| **Audit Trail** | Basic | Strong (certificates) | Strong (tokens) |
| **Compatibility** | High | Low | Medium |

---

## 3. Dashboard Authentication Options

### Option A: Static API Key

**Concept:** A single `FUSION_API_KEY` environment variable or config setting. All requests must include it in an `Authorization: Bearer` header.

#### Implementation Approach
1. Add `FUSION_API_KEY` to environment/config
2. Create auth middleware checking `Authorization` header
3. Apply to all `/api/*` routes except `/api/health`
4. Provide `?api_key=` query param fallback for browser convenience

#### Security Properties
- **Strength:** Basic protection against unauthorized access
- **Weakness:** Single key — if leaked, full access
- **No multi-user support**

#### User Experience
- **Setup:** Set one environment variable
- **Login:** Include header in all requests
- **CLI:** `fn` commands need to send the key

#### Frontend Impact
```typescript
// Dashboard API wrapper
const api = {
  async fetch(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${getApiKey()}`,
      },
    });
  },
};
```

#### CLI Impact
```bash
# CLI commands need to send credentials
fn task list --api-key $FUSION_API_KEY

# Or configured in settings
fn config set api-key <key>
```

#### Multi-Project Considerations
- Single global key for all projects
- Could add per-project keys in the future

#### Works For
- `fn serve` — Yes (primary use case)
- `fn dashboard` — Yes
- **Recommended for:** Headless deployments, single-user setups

---

### Option B: Session-Based Login

**Concept:** Username/password stored in SQLite, session cookies for the React frontend, and CSRF protection.

#### Implementation Approach
1. Add `users` table to project database
2. Password hashing with bcrypt/argon2
3. Session cookie with secure/httpOnly flags
4. CSRF token in requests
5. Login/logout endpoints
6. Login page UI

#### Security Properties
- **Strength:** Strong — proven session pattern
- **Multi-user:** Yes
- **Password storage:** Hashed, salted

#### User Experience
- **Setup:** Create admin user on first run
- **Login:** Username/password form
- **Session:** Cookie-based, auto-renew

#### Frontend Impact
```typescript
// Login page component
interface LoginPage {
  username: string;
  password: string;
  onLogin: (creds) => Promise<void>;
}

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  return children;
};
```

#### Database Schema
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',  -- 'admin', 'user'
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

#### Multi-Project Considerations
- Users are per-project
- Could add global users in the future
- Dashboard settings need admin-only access

#### Works For
- `fn dashboard` — Yes (primary use case)
- `fn serve` — Yes
- **Recommended for:** Team environments, multiple users

---

### Option C: OAuth / SSO Integration

**Concept:** Delegate authentication to external identity providers (GitHub, Google, generic OIDC).

#### Implementation Approach
1. OAuth 2.0 / OIDC flow
2. Support GitHub OAuth (common for developer tools)
3. Support generic OIDC for enterprise
4. Callback URL configuration
5. User provisioning on first login

#### Security Properties
- **Strength:** Strong — delegated to identity providers
- **Multi-user:** Yes
- **SSO:** Enterprise ready

#### User Experience
- **Setup:** Register OAuth application, configure client ID/secret
- **Login:** "Sign in with GitHub" button
- **Session:** Managed by dashboard

#### Callback URL Challenges
```typescript
// For fn serve on remote host:
// - User configures callback URL during OAuth app registration
// - Must be publicly accessible
// - Example: https://fusion.example.com/api/auth/callback/github

// For localhost development:
// - Use ngrok or similar for callback
// - Configure FUSION_PUBLIC_URL for correct callback
```

#### Frontend Impact
```typescript
// OAuth login button
<Button onClick={() => window.location.href = '/api/auth/github'}>
  <GitHubIcon /> Sign in with GitHub
</Button>

// Protected routes
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return children;
};
```

#### Multi-Project Considerations
- Users are typically global (single sign-on)
- Project permissions can be managed separately
- Works well for enterprise deployments

#### Works For
- `fn dashboard` — Yes (primary use case)
- `fn serve` — Complex (requires public callback URL)

---

### Dashboard Auth Options Comparison

| Aspect | Option A: Static API Key | Option B: Session Login | Option C: OAuth/SSO |
|--------|-------------------------|----------------------|---------------------|
| **Implementation Effort** | Low | Medium | High |
| **Security Level** | Basic | Strong | Strong |
| **Multi-User** | No | Yes | Yes |
| **User Management** | None | Built-in | External (IdP) |
| **Setup Complexity** | Low | Medium | High |
| **Callback URL Needed** | No | No | Yes |
| **Enterprise Ready** | No | Partial | Yes |
| **CLI Support** | Native | Cookie/Token | Token |

---

## 4. Recommendations

### 4.1 Recommended Node Auth: Option A (Shared Secret) + Option C (JWT) Hybrid

**Recommendation:** Start with Option A (Static API Key) for simplicity, then evolve to Option C (JWT) for better security.

#### Phase 1: Static API Key Validation
- **Effort:** Low — add middleware to existing routes
- **Impact:** Immediately secures all node endpoints
- **Migration:** Update `NodeConnection` to send keys, existing keys work

#### Phase 2: JWT Migration
- **Effort:** Medium — add token generation/validation
- **Benefits:** Expiring tokens, replay protection, auditability
- **Compatibility:** Can issue JWTs using existing `apiKey` as secret

#### Key Design Decisions
1. **Protect all node endpoints** — not just `/api/mesh/sync`
2. **Keep `/api/health` public** — health checks for load balancers
3. **Support both header and query param** — flexibility for different clients
4. **Document key rotation** — operational runbook

### 4.2 Recommended Dashboard Auth: Option A (Static API Key) for Headless, Option B (Sessions) for Dashboard

**Recommendation:** Use different auth strategies for different use cases.

#### For `fn serve` (Headless Deployments)
- **Primary:** Static API key (`FUSION_API_KEY`)
- **Rationale:** Simple, matches node auth, works well for scripts/CI
- **CLI support:** `fn --api-key <key> task list`

#### For `fn dashboard` (Browser UI)
- **Primary:** Session-based login (Option B)
- **Fallback:** Static API key for API access
- **Rationale:** Better UX for human users, natural multi-user support

#### Unified Approach
Consider a unified auth system:
1. Static key for API access (CLI, scripts)
2. Session login for browser access
3. API key can be converted to session

### 4.3 Should Node Auth and Dashboard Auth Be the Same?

**Answer: No — they serve different purposes.**

| Dimension | Node Auth | Dashboard Auth |
|-----------|-----------|---------------|
| **Client type** | Machine (other nodes) | Human (browser) |
| **Credential type** | API key/token | Username/password or OAuth |
| **Session length** | Minutes to hours | Hours to days |
| **Transport** | Headers only | Cookies + headers |
| **Trust model** | Shared secrets | Interactive login |

**Exception:** A single static API key could work for both, but with different validation paths:
- Node: `Authorization: Bearer <key>` validated server-side
- Dashboard: Configured in settings, sent with API requests

---

## 5. Prerequisites for Implementation

### 5.1 Database Changes

```sql
-- New table for dashboard users (if session auth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- New table for sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Add token fields to nodes table (for JWT support)
ALTER TABLE nodes ADD COLUMN tokenSecret TEXT;
ALTER TABLE nodes ADD COLUMN tokenIssuedAt TEXT;
```

### 5.2 Settings Changes

```typescript
// packages/core/src/types.ts
interface ProjectSettings {
  // ... existing fields ...
  
  // New auth settings
  dashboardApiKey?: string;           // For API access
  requireDashboardAuth?: boolean;    // Enable/disable auth
  sessionDurationMs?: number;         // Session timeout
  allowedOrigins?: string[];          // CORS origins
}
```

### 5.3 CLI Changes

```typescript
// New CLI flags
interface GlobalOptions {
  // ... existing ...
  apiKey?: string;      // --api-key flag
}

// Config location for API key
~/.pi/fusion/settings.json: {
  "apiKey": "..."
}
```

### 5.4 Environment Variables

```bash
# For fn serve
FUSION_API_KEY=                    # Required API key
FUSION_REQUIRE_AUTH=true          # Enable auth enforcement
FUSION_PUBLIC_URL=https://...     # For OAuth callbacks
```

---

## 6. Security Pitfalls to Avoid

### 6.1 SSE/WebSocket Security

**Issue:** SSE endpoints and WebSockets need special handling.

```typescript
// SSE heartbeat - maintain auth context
app.get("/api/events", (req, res) => {
  // Validate token, then maintain context
  const token = req.headers.authorization?.replace("Bearer ", "");
  // Store validated token in res.locals for use in connection
});

// WebSocket - validate on upgrade
server.on("upgrade", (req, socket, head) => {
  const token = parseTokenFromUrl(req.url);
  if (!validateToken(token)) {
    socket.destroy();
    return;
  }
  // ... handle upgrade
});
```

### 6.2 File Service Routes

**Issue:** File upload/download routes bypass normal API.

```typescript
// Protect all file routes
app.post("/api/files/upload", authMiddleware, uploadHandler);
app.get("/api/files/*", authMiddleware, downloadHandler);
```

### 6.3 Plugin Routes

**Issue:** Plugin routes need consistent auth.

```typescript
// All plugin routes mounted under /api/plugins/:id/*
app.use("/api/plugins", authMiddleware, pluginRouter);
```

### 6.4 Rate Limiting + Auth

**Issue:** Don't count auth failures against rate limits.

```typescript
// Auth failures should be rate-limited separately
const authLimiter = rateLimit({ max: 5, windowMs: 60_000 });
const apiLimiter = rateLimit({ max: 100, windowMs: 60_000 });

app.post("/api/auth/login", authLimiter, loginHandler);
app.get("/api/*", apiLimiter, authMiddleware, apiHandler);
```

### 6.5 Health Endpoint

**Issue:** Load balancers need health checks without auth.

```typescript
// Keep health endpoint public
app.get("/api/health", healthHandler);

// Separate liveness vs readiness
app.get("/api/health/live", liveHandler);      // Can auth fail
app.get("/api/health/ready", readyHandler);    // Requires auth
```

---

## 7. Open Questions / Risks

### 7.1 Node Auth Questions

1. **Should local node auth be required?** Local dashboard calls from browser may need different treatment than remote node-to-node calls.

2. **Token distribution:** How do remote nodes get their initial API key? Manual configuration? Bootstrap flow?

3. **Key rotation during operation:** If we rotate the shared secret, how do we update all nodes without downtime?

4. **Cross-project node access:** If a node serves multiple projects, should auth be per-project or global?

### 7.2 Dashboard Auth Questions

1. **First-run experience:** How does the first user log in if there's no auth configured yet?

2. **CLI + browser hybrid:** If I use the dashboard in browser AND the CLI, should they share sessions?

3. **API access for tools:** Should programmatic API access (from other tools/scripts) use the same auth as browser sessions?

4. **Guest/read-only access:** Do we need role-based access control (RBAC) for different permission levels?

### 7.3 Risks

1. **Breaking existing setups:** Adding auth to a running system requires migration strategy
2. **Key management:** Storing keys securely, key rotation, key loss recovery
3. **Multi-project complexity:** Different auth domains per project vs. global auth
4. **Performance:** Auth validation adds latency to every request

---

## 8. Appendix: Affected Files and Endpoints

### 8.1 Files to Modify

#### Core Infrastructure
| File | Changes |
|------|---------|
| `packages/core/src/types.ts` | Add auth-related types |
| `packages/core/src/central-core.ts` | Add token validation to node endpoints |
| `packages/dashboard/src/server.ts` | Add auth middleware, protect routes |
| `packages/dashboard/src/routes.ts` | Add login/logout endpoints |
| `packages/dashboard/src/api-error.ts` | Already has `unauthorized()` |

#### CLI Commands
| File | Changes |
|------|---------|
| `packages/cli/src/commands/serve.ts` | Read `FUSION_API_KEY`, enforce auth |
| `packages/cli/src/commands/dashboard.ts` | Add auth flag support |

#### Middleware
| File | Changes |
|------|---------|
| `packages/dashboard/src/rate-limit.ts` | Already exists, may need extension |
| `packages/dashboard/src/auth-middleware.ts` | **New file** — Bearer token validation |

### 8.2 Endpoints Requiring Protection

#### Node Endpoints (New Protection)
```
GET    /api/health                      # Keep public or protect?
GET    /api/mesh/state
POST   /api/mesh/sync                  # Already protected
GET    /api/nodes
POST   /api/nodes
GET    /api/nodes/:id
PATCH  /api/nodes/:id
DELETE /api/nodes/:id
GET    /api/nodes/:id/metrics
GET    /api/nodes/:id/version
POST   /api/nodes/:id/sync-plugins
GET    /api/nodes/:id/compatibility
```

#### Dashboard Endpoints (New Protection)
```
# All /api/* routes except /api/health
GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
# ... all other task, agent, mission, plugin endpoints
```

#### New Auth Endpoints
```
POST   /api/auth/login                 # Session login
POST   /api/auth/logout                # Session logout
GET    /api/auth/me                   # Current user info
POST   /api/auth/setup                # First-run user setup
```

### 8.3 New Files Required

| File | Purpose |
|------|---------|
| `packages/dashboard/src/auth-middleware.ts` | Token validation middleware |
| `packages/dashboard/src/auth-routes.ts` | Login/logout/register endpoints |
| `packages/dashboard/app/pages/Login.tsx` | Login page UI |
| `packages/dashboard/app/hooks/useAuth.ts` | Auth state hook |
| `packages/dashboard/app/contexts/AuthContext.tsx` | Auth context provider |

---

## 9. Implementation Phases

### Phase 1: Node Auth (Low Effort, High Impact)
1. Add Bearer token validation middleware
2. Protect all `/api/nodes/` and `/api/mesh/` endpoints
3. Test with existing `NodeConnection` code
4. Document key management

### Phase 2: Dashboard API Key (Medium Effort)
1. Add `FUSION_API_KEY` environment variable
2. Protect all `/api/` routes with key validation
3. Add `--api-key` flag to CLI
4. Update dashboard to send key with requests

### Phase 3: Dashboard Sessions (Higher Effort)
1. Add users/sessions tables
2. Create login page
3. Implement session management
4. Add protected route wrapper
5. Implement CSRF protection

### Phase 4: Advanced Auth (Future)
1. OAuth integration
2. Role-based access control
3. Audit logging
4. Token refresh mechanisms

---

## 10. References

### Code References
- `packages/core/src/node-connection.ts` — Node connection + Bearer token sending
- `packages/core/src/central-core.ts` — Node registry + mesh sync validation
- `packages/dashboard/src/server.ts` — Server creation + route mounting
- `packages/dashboard/src/api-error.ts` — `unauthorized()` helper
- `packages/dashboard/src/rate-limit.ts` — Rate limiting infrastructure
- `packages/cli/src/commands/serve.ts` — `fn serve` startup
- `packages/cli/src/commands/dashboard.ts` — `fn dashboard` startup

### Authentication Patterns
- Bearer token: RFC 6750
- JWT: RFC 7519
- Session cookies: OWASP Session Management Cheat Sheet
- Password hashing: OWASP Password Storage Cheat Sheet
- mTLS: RFC 5246 / TLS 1.3

---

*Report generated as part of FN-1783 research task.*

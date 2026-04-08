import { CentralCore, type NodeConfig } from "@fusion/core";
import { createInterface } from "node:readline/promises";

/** Options for node list command. */
export interface NodeListOptions {
  /** Output as JSON instead of table */
  json?: boolean;
}

/** Options for node add command. */
export interface NodeAddOptions {
  /** Remote node URL (if provided, node is registered as remote) */
  url?: string;
  /** Optional API key for remote node authentication */
  apiKey?: string;
  /** Max concurrent tasks for the node */
  maxConcurrent?: number;
}

/** Options for node remove command. */
export interface NodeRemoveOptions {
  /** Skip confirmation prompt */
  force?: boolean;
}

/**
 * List all registered nodes.
 */
export async function runNodeList(options: NodeListOptions = {}): Promise<void> {
  const central = new CentralCore();
  await central.init();

  try {
    const nodes = await central.listNodes();

    if (nodes.length === 0) {
      if (options.json) {
        console.log(JSON.stringify([], null, 2));
      } else {
        console.log("\n  No nodes registered.");
        console.log("  Register one with: kb node add <name>\n");
      }
      return;
    }

    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));

    if (options.json) {
      console.log(JSON.stringify(sorted, null, 2));
      return;
    }

    console.log();
    console.log("  Registered Nodes:");
    console.log();
    console.log("  Name              Type     Status       Max  URL");
    console.log(`  ${"─".repeat(78)}`);

    for (const node of sorted) {
      const name = node.name.padEnd(16);
      const type = node.type.padEnd(8);
      const status = node.status.padEnd(12);
      const max = String(node.maxConcurrent).padStart(3);
      const url = node.type === "remote" ? (node.url ?? "-") : "-";
      console.log(`  ${name}  ${type} ${status}  ${max}  ${url}`);
    }

    console.log();
    console.log(`  ${sorted.length} node${sorted.length === 1 ? "" : "s"} registered`);
    console.log();
  } finally {
    await central.close();
  }
}

/**
 * Register a node (local by default, remote when --url is provided).
 */
export async function runNodeAdd(name: string, options: NodeAddOptions = {}): Promise<void> {
  if (!name) {
    console.error("Usage: kb node add <name> [--url <url>] [--api-key <key>] [--max-concurrent <n>]");
    process.exit(1);
  }

  if (!isValidNodeName(name)) {
    console.error(`\n  ✗ Invalid node name '${name}'`);
    console.error("  Name must be 1-64 characters and contain only: a-z, A-Z, 0-9, _, -\n");
    process.exit(1);
  }

  const type: "local" | "remote" = options.url ? "remote" : "local";
  const url = options.url?.trim();

  if (type === "remote" && !url) {
    console.error("\n  ✗ --url is required when adding a remote node\n");
    process.exit(1);
  }

  if (type === "local" && options.apiKey) {
    console.error("\n  ✗ --api-key is only valid for remote nodes\n");
    process.exit(1);
  }

  if (
    options.maxConcurrent !== undefined
    && (!Number.isFinite(options.maxConcurrent) || options.maxConcurrent < 1)
  ) {
    console.error("\n  ✗ --max-concurrent must be a number >= 1\n");
    process.exit(1);
  }

  const central = new CentralCore();
  await central.init();

  try {
    const node = await central.registerNode({
      name: name.trim(),
      type,
      url,
      apiKey: options.apiKey,
      maxConcurrent: options.maxConcurrent,
    });

    console.log();
    console.log(`  ✓ Registered node '${node.name}'`);
    console.log(`    ID: ${node.id}`);
    console.log(`    Type: ${node.type}`);
    console.log(`    Max Concurrent: ${node.maxConcurrent}`);
    if (node.type === "remote") {
      console.log(`    URL: ${node.url ?? "(missing)"}`);
    }
    console.log();
  } finally {
    await central.close();
  }
}

/**
 * Unregister a node.
 */
export async function runNodeRemove(name: string, options: NodeRemoveOptions = {}): Promise<void> {
  if (!name) {
    console.error("Usage: kb node remove <name> [--force]");
    process.exit(1);
  }

  const central = new CentralCore();
  await central.init();

  try {
    const node = await findNodeByNameOrId(central, name);
    if (!node) {
      console.error(`Error: Node '${name}' not found.`);
      process.exit(1);
    }

    if (!options.force) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Unregister node '${node.name}'? [y/N] `);
      rl.close();

      if (answer.trim().toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }

    await central.unregisterNode(node.id);

    console.log();
    console.log(`  ✓ Unregistered node '${node.name}'`);
    if (node.type === "remote" && node.url) {
      console.log(`    URL: ${node.url}`);
    }
    console.log();
  } finally {
    await central.close();
  }
}

/**
 * Show detailed node information.
 */
export async function runNodeShow(name?: string): Promise<void> {
  const central = new CentralCore();
  await central.init();

  try {
    let node: NodeConfig | undefined;

    if (name) {
      node = await findNodeByNameOrId(central, name);
    } else {
      const nodes = await central.listNodes();
      node = nodes.find((candidate) => candidate.type === "local");
    }

    if (!node) {
      console.error(`Error: Node '${name || "local"}' not found.`);
      process.exit(1);
    }

    console.log();
    console.log(`  Node: ${node.name}`);
    console.log(`  ID: ${node.id}`);
    console.log(`  Type: ${node.type}`);
    console.log(`  Status: ${node.status}`);
    if (node.type === "remote") {
      console.log(`  URL: ${node.url ?? "(missing)"}`);
    }
    console.log(`  Max Concurrent: ${node.maxConcurrent}`);
    console.log(`  Capabilities: ${node.capabilities?.length ? node.capabilities.join(", ") : "(none)"}`);
    console.log(`  Created: ${node.createdAt}`);
    console.log(`  Updated: ${node.updatedAt}`);
    console.log();
  } finally {
    await central.close();
  }
}

/**
 * Run a health check for a node.
 */
export async function runNodeHealth(name: string): Promise<void> {
  if (!name) {
    console.error("Usage: kb node health <name>");
    process.exit(1);
  }

  const central = new CentralCore();
  await central.init();

  try {
    const node = await findNodeByNameOrId(central, name);
    if (!node) {
      console.error(`Error: Node '${name}' not found.`);
      process.exit(1);
    }

    const status = await central.checkNodeHealth(node.id);

    console.log();
    console.log(`  Node '${node.name}' health: ${status}`);
    console.log();
  } finally {
    await central.close();
  }
}

export async function findNodeByNameOrId(
  central: CentralCore,
  nameOrId: string,
): Promise<NodeConfig | undefined> {
  const byId = await central.getNode(nameOrId);
  if (byId) {
    return byId;
  }
  return central.getNodeByName(nameOrId);
}

export function isValidNodeName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 64) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

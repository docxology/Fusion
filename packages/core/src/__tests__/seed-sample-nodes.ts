/**
 * Seed script for populating the central database with sample nodes.
 *
 * This script creates a realistic set of nodes (1 local + 5 remote) for
 * visual testing of the multi-node dashboard.
 *
 * Usage:
 *   - Direct execution (seeds real central database):
 *     npx tsx packages/core/src/__tests__/seed-sample-nodes.ts
 *
 *   - As a module (for tests):
 *     import { seedSampleNodes } from "./seed-sample-nodes";
 *     await seedSampleNodes(central);
 */

import { CentralCore } from "../central-core.js";
import type { NodeConfig, NodeStatus } from "../types.js";
import { homedir } from "node:os";
import { join } from "node:path";

/** Sample remote nodes to create for visual testing */
const SAMPLE_REMOTE_NODES = [
  {
    name: "Staging Server",
    url: "https://staging.runfusion.ai",
    status: "online" as NodeStatus,
    maxConcurrent: 4,
  },
  {
    name: "Build Machine",
    url: "https://build.runfusion.ai",
    status: "online" as NodeStatus,
    maxConcurrent: 8,
  },
  {
    name: "GPU Cluster",
    url: "https://gpu.runfusion.ai",
    status: "offline" as NodeStatus,
    maxConcurrent: 16,
  },
  {
    name: "Dev Box (John)",
    url: "http://192.168.1.100:4040",
    status: "error" as NodeStatus,
    maxConcurrent: 2,
  },
  {
    name: "QA Environment",
    url: "https://qa.runfusion.ai",
    status: "connecting" as NodeStatus,
    maxConcurrent: 4,
  },
] as const;

/**
 * Seed the central database with sample nodes for visual testing.
 *
 * @param central - An initialized CentralCore instance
 * @returns Array of registered nodes (1 local + up to 5 remote)
 */
export async function seedSampleNodes(central: CentralCore): Promise<NodeConfig[]> {
  const nodes: NodeConfig[] = [];

  // Ensure central is initialized
  if (!central.isInitialized()) {
    await central.init();
  }

  // 1. Get or create the local node (auto-created on init)
  const existingNodes = await central.listNodes();
  const existingLocal = existingNodes.find((n) => n.type === "local");
  let localNode: NodeConfig;

  if (existingLocal) {
    // Update local node status to online
    localNode = await central.updateNode(existingLocal.id, { status: "online" });
  } else {
    // Create local node
    localNode = await central.registerNode({
      name: "local",
      type: "local",
      maxConcurrent: 4,
    });
    localNode = await central.updateNode(localNode.id, { status: "online" });
  }
  nodes.push(localNode);

  // 2. Register remote nodes (idempotently)
  for (const sampleNode of SAMPLE_REMOTE_NODES) {
    const existingByName = await central.getNodeByName(sampleNode.name);

    if (existingByName) {
      // Update existing node status
      const updated = await central.updateNode(existingByName.id, { status: sampleNode.status });
      nodes.push(updated);
      console.log(`  Updated existing node: ${sampleNode.name} (${sampleNode.status})`);
    } else {
      // Create new node
      const remoteNode = await central.registerNode({
        name: sampleNode.name,
        type: "remote",
        url: sampleNode.url,
        maxConcurrent: sampleNode.maxConcurrent,
      });

      // Update status to the desired state
      const updated = await central.updateNode(remoteNode.id, { status: sampleNode.status });
      nodes.push(updated);
      console.log(`  Registered new node: ${sampleNode.name} (${sampleNode.status})`);
    }
  }

  return nodes;
}

/**
 * Seed the real central database and print results.
 * Use this when running directly via tsx.
 */
async function main(): Promise<void> {
  console.log("\n🌐 Seeding sample nodes into central database...\n");

  const central = new CentralCore();
  await central.init();

  try {
    const nodes = await seedSampleNodes(central);

    console.log("\n📊 Registered nodes:\n");
    console.log("┌─────────────────────────────────────────┬────────┬──────────────────────────────┬─────────┐");
    console.log("│ Name                                    │ Type   │ URL                         │ Status  │");
    console.log("├─────────────────────────────────────────┼────────┼──────────────────────────────┼─────────┤");

    for (const node of nodes) {
      const type = node.type.padEnd(6);
      const name = node.name.slice(0, 39).padEnd(39);
      const url = (node.url ?? "-").slice(0, 28).padEnd(28);
      const status = node.status.padEnd(7);
      console.log(`│ ${name} │ ${type} │ ${url} │ ${status} │`);
    }

    console.log("└─────────────────────────────────────────┴────────┴──────────────────────────────┴─────────┘");

    // Summary stats
    const total = nodes.length;
    const localCount = nodes.filter((n) => n.type === "local").length;
    const remoteCount = nodes.filter((n) => n.type === "remote").length;
    const onlineCount = nodes.filter((n) => n.status === "online").length;
    const offlineCount = nodes.filter((n) => n.status === "offline").length;
    const errorCount = nodes.filter((n) => n.status === "error").length;
    const connectingCount = nodes.filter((n) => n.status === "connecting").length;

    console.log("\n📈 Summary:");
    console.log(`   Total nodes: ${total}`);
    console.log(`   Local: ${localCount}, Remote: ${remoteCount}`);
    console.log(`   Online: ${onlineCount}, Offline: ${offlineCount}, Error: ${errorCount}, Connecting: ${connectingCount}`);
    console.log(`\n✅ Database: ${central.getDatabasePath()}\n`);
  } finally {
    await central.close();
  }
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith("seed-sample-nodes.ts");
if (isMainModule) {
  main().catch((err) => {
    console.error("\n❌ Seeding failed:", err);
    process.exit(1);
  });
}

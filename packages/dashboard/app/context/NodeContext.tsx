/**
 * NodeContext provides React context for tracking which node the dashboard is currently viewing.
 * This enables seamless routing of API calls through the proxy when viewing remote nodes.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { NodeConfig } from "@fusion/core";

const STORAGE_KEY = "fusion-dashboard-current-node";

export interface NodeContextValue {
  /** Currently selected node or null if viewing local node */
  currentNode: NodeConfig | null;
  /** Currently selected node ID or null if viewing local node */
  currentNodeId: string | null;
  /** Whether the current view is a remote node */
  isRemote: boolean;
  /** Set the current node to view */
  setCurrentNode: (node: NodeConfig | null) => void;
  /** Clear the current node selection (return to local view) */
  clearCurrentNode: () => void;
}

const NodeContext = createContext<NodeContextValue | null>(null);

export interface NodeProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that manages the current node state.
 * Persists the selected nodeId to localStorage and derives isRemote from node type.
 */
export function NodeProvider({ children }: NodeProviderProps) {
  const [currentNode, setCurrentNodeState] = useState<NodeConfig | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as NodeConfig;
        // Only restore if it's a remote node
        if (parsed && parsed.type === "remote") {
          setCurrentNodeState(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Persist remote node to localStorage
  useEffect(() => {
    if (currentNode && currentNode.type === "remote") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentNode));
      } catch {
        // Ignore localStorage errors
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [currentNode]);

  const setCurrentNode = useCallback((node: NodeConfig | null) => {
    setCurrentNodeState(node);
  }, []);

  const clearCurrentNode = useCallback(() => {
    setCurrentNodeState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const value: NodeContextValue = {
    currentNode,
    currentNodeId: currentNode?.id ?? null,
    isRemote: currentNode !== null && currentNode.type === "remote",
    setCurrentNode,
    clearCurrentNode,
  };

  return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}

/**
 * Hook to access the current node context.
 * @throws Error if used outside of NodeProvider
 */
export function useNodeContext(): NodeContextValue {
  const context = useContext(NodeContext);
  if (context === null) {
    throw new Error("useNodeContext must be used within a NodeProvider");
  }
  return context;
}

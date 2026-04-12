import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import type { Agent } from "../api";
import { useQuickChat, type ChatMessageInfo } from "../hooks/useQuickChat";
import { useAgents } from "../hooks/useAgents";

interface QuickChatFABProps {
  projectId?: string;
  addToast: (msg: string, type?: "success" | "error") => void;
  /** When false, the FAB button is hidden but the panel can still be opened programmatically via the open prop */
  showFAB?: boolean;
  /** When true, the chat panel is open */
  open?: boolean;
  /** Callback when the panel should be opened/closed */
  onOpenChange?: (open: boolean) => void;
}

function getAgentLabel(agent: Agent): string {
  const base = agent.name?.trim() || agent.id;
  return `${base} (${agent.role})`;
}

export function QuickChatFAB({ projectId, addToast, showFAB = true, open, onOpenChange }: QuickChatFABProps) {
  const { agents } = useAgents(projectId);
  // Internal state for uncontrolled mode, controlled state when open prop is provided
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled
    ? (value: boolean | ((prev: boolean) => boolean)) => {
        if (typeof value === "function") {
          onOpenChange?.(value(isOpen));
        } else {
          onOpenChange?.(value);
        }
      }
    : setInternalOpen;
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [messageInput, setMessageInput] = useState("");

  // Chat session hook
  const {
    messages,
    isStreaming,
    streamingText,
    streamingThinking,
    sessionsLoading,
    messagesLoading,
    sendMessage,
    switchSession,
  } = useQuickChat(projectId, addToast);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Track the previous agent ID to detect changes
  const prevAgentIdRef = useRef<string>("");

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentId("");
      return;
    }

    const selectedStillExists = agents.some((agent) => agent.id === selectedAgentId);
    if (!selectedStillExists) {
      setSelectedAgentId(agents[0]?.id ?? "");
    }
  }, [agents, selectedAgentId]);

  // Initialize session when an agent is selected and panel opens
  useEffect(() => {
    if (!isOpen || !selectedAgentId) return;
    if (selectedAgentId !== prevAgentIdRef.current) {
      prevAgentIdRef.current = selectedAgentId;
      void switchSession(selectedAgentId);
    }
  }, [isOpen, selectedAgentId, switchSession]);

  // Handle agent selector changes
  const handleAgentChange = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      prevAgentIdRef.current = agentId;
      void switchSession(agentId);
    },
    [switchSession],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  // Click outside and escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (fabRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Auto-scroll messages
  useEffect(() => {
    if (!isOpen) return;
    const messagesEl = messagesRef.current;
    if (!messagesEl) return;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, [messages, streamingText, streamingThinking, isOpen]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = messageInput.trim();
    if (!selectedAgentId || !trimmed || isStreaming) return;

    setMessageInput("");
    await sendMessage(trimmed);
  }, [sendMessage, isStreaming, messageInput, selectedAgentId]);

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSendMessage();
  }, [handleSendMessage]);

  if (agents.length === 0) {
    return null;
  }

  return (
    <>
      {showFAB && (
        <button
          ref={fabRef}
          type="button"
          className="quick-chat-fab"
          aria-label="Open quick chat"
          data-testid="quick-chat-fab"
          onClick={() => setIsOpen((open) => !open)}
        >
          <MessageSquare size={24} />
        </button>
      )}

      {isOpen && (
        <div className="quick-chat-panel" ref={panelRef} data-testid="quick-chat-panel">
          <div className="quick-chat-panel-header">
            <h3>Quick Chat</h3>
            <button
              type="button"
              className="btn-icon"
              aria-label="Close quick chat"
              data-testid="quick-chat-close"
              onClick={() => setIsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="quick-chat-panel-agent-select">
            <label htmlFor="quick-chat-agent-select" className="visually-hidden">Select agent</label>
            <select
              id="quick-chat-agent-select"
              value={selectedAgentId}
              onChange={(event) => handleAgentChange(event.target.value)}
              data-testid="quick-chat-agent-select"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {getAgentLabel(agent)}
                </option>
              ))}
            </select>
          </div>

          <div className="quick-chat-panel-messages" ref={messagesRef} data-testid="quick-chat-messages">
            {sessionsLoading || messagesLoading ? (
              <div className="quick-chat-panel-empty">Loading conversation…</div>
            ) : messages.length === 0 && !streamingText && !streamingThinking ? (
              <div className="quick-chat-panel-empty">No messages yet. Start the conversation!</div>
            ) : (
              <>
                {messages.map((message: ChatMessageInfo) => {
                  const isSent = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`quick-chat-panel-message ${isSent ? "quick-chat-panel-message--sent" : "quick-chat-panel-message--received"}`}
                      data-testid={`quick-chat-message-${message.id}`}
                    >
                      <p>{message.content}</p>
                    </div>
                  );
                })}
                {/* Streaming message bubble */}
                {(streamingText || streamingThinking) && (
                  <div
                    className="quick-chat-panel-message quick-chat-panel-message--received quick-chat-panel-message--streaming"
                    data-testid="quick-chat-streaming-message"
                  >
                    {streamingThinking && (
                      <p className="quick-chat-panel-thinking" data-testid="quick-chat-streaming-thinking">
                        {streamingThinking}
                      </p>
                    )}
                    {streamingText && (
                      <p data-testid="quick-chat-streaming-text">{streamingText}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="quick-chat-panel-input">
            <input
              type="text"
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={selectedAgent ? `Message ${selectedAgent.name || selectedAgent.id}` : "Type a message"}
              disabled={!selectedAgentId || isStreaming}
              data-testid="quick-chat-input"
            />
            <button
              type="button"
              onClick={() => void handleSendMessage()}
              disabled={!selectedAgentId || messageInput.trim().length === 0 || isStreaming}
              data-testid="quick-chat-send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

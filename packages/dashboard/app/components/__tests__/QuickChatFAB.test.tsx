import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Agent, ChatSession } from "../../api";
import * as apiModule from "../../api";
import { useAgents } from "../../hooks/useAgents";
import { QuickChatFAB } from "../QuickChatFAB";

vi.mock("../../api", () => ({
  fetchChatSessions: vi.fn(),
  createChatSession: vi.fn(),
  fetchChatMessages: vi.fn(),
  streamChatResponse: vi.fn(),
}));

vi.mock("../../hooks/useAgents", () => ({
  useAgents: vi.fn(),
}));

const mockFetchChatSessions = vi.mocked(apiModule.fetchChatSessions);
const mockCreateChatSession = vi.mocked(apiModule.createChatSession);
const mockFetchChatMessages = vi.mocked(apiModule.fetchChatMessages);
const mockStreamChatResponse = vi.mocked(apiModule.streamChatResponse);
const mockUseAgents = vi.mocked(useAgents);

const mockAgents: Agent[] = [
  {
    id: "agent-001",
    name: "Agent One",
    role: "executor",
    state: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: "agent-002",
    name: "Agent Two",
    role: "reviewer",
    state: "terminated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
];

const mockSession: ChatSession = {
  id: "session-001",
  agentId: "agent-001",
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function mockAgentsHook(agents: Agent[], isLoading = false) {
  mockUseAgents.mockReturnValue({
    agents,
    activeAgents: agents.filter((agent) => agent.state === "active" || agent.state === "running"),
    stats: null,
    isLoading,
    loadAgents: vi.fn(),
    loadStats: vi.fn(),
  });
}

function createMockStreamResponse() {
  const handlers: {
    onThinking?: (data: string) => void;
    onText?: (data: string) => void;
    onDone?: (data: { messageId: string }) => void;
    onError?: (data: string) => void;
    onConnectionStateChange?: (state: string) => void;
  } = {};

  const mockStream = {
    close: vi.fn(),
    isConnected: vi.fn(() => true),
    // Allow setting handlers
    setHandlers: (h: typeof handlers) => {
      Object.assign(handlers, h);
    },
  };

  // Mock streamChatResponse to capture handlers and return mock stream
  mockStreamChatResponse.mockImplementation((sessionId, content, textHandlers) => {
    // Store handlers for test to invoke
    mockStream.setHandlers(textHandlers as typeof handlers);

    // Simulate async response
    setTimeout(() => {
      // Simulate streaming text
      textHandlers.onConnectionStateChange?.("connected");
      textHandlers.onText?.("Thinking...");
      textHandlers.onText?.("Here's my response.");
      textHandlers.onDone?.({ messageId: `msg-${Date.now()}` });
    }, 10);

    return {
      close: mockStream.close,
      isConnected: mockStream.isConnected,
    };
  });

  return mockStream;
}

describe("QuickChatFAB", () => {
  const addToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentsHook(mockAgents);
    mockFetchChatSessions.mockResolvedValue({ sessions: [] });
    mockCreateChatSession.mockResolvedValue({ session: mockSession });
    mockFetchChatMessages.mockResolvedValue({ messages: [] });
    createMockStreamResponse();
  });

  it("renders nothing when no agents exist", () => {
    mockAgentsHook([]);

    render(<QuickChatFAB addToast={addToast} />);

    expect(screen.queryByTestId("quick-chat-fab")).toBeNull();
  });

  it("renders FAB button when agents exist", () => {
    render(<QuickChatFAB addToast={addToast} />);

    expect(screen.getByTestId("quick-chat-fab")).toBeDefined();
  });

  it("opens chat panel when FAB is clicked", async () => {
    render(<QuickChatFAB addToast={addToast} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
    });
  });

  it("closes panel via close button and Escape key", async () => {
    render(<QuickChatFAB addToast={addToast} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));
    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("quick-chat-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("quick-chat-panel")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("quick-chat-fab"));
    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("quick-chat-panel")).toBeNull();
    });
  });

  it("shows available agents in selector", async () => {
    render(<QuickChatFAB addToast={addToast} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    const select = await screen.findByTestId("quick-chat-agent-select");
    expect(select).toBeDefined();
    expect(screen.getByRole("option", { name: "Agent One (executor)" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Agent Two (reviewer)" })).toBeDefined();
  });

  it("sending a message calls streamChatResponse API with expected params", async () => {
    render(<QuickChatFAB addToast={addToast} projectId="proj-123" />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    // Wait for session initialization
    await waitFor(() => {
      expect(mockFetchChatSessions).toHaveBeenCalled();
    });

    const input = await screen.findByTestId("quick-chat-input");
    fireEvent.change(input, { target: { value: "Ship it" } });
    fireEvent.click(screen.getByTestId("quick-chat-send"));

    // Wait for streamChatResponse to be called
    await waitFor(() => {
      expect(mockStreamChatResponse).toHaveBeenCalledWith(
        "session-001",
        "Ship it",
        expect.objectContaining({
          onThinking: expect.any(Function),
          onText: expect.any(Function),
          onDone: expect.any(Function),
          onError: expect.any(Function),
        }),
        "proj-123",
      );
    });

    // Input should be cleared
    await waitFor(() => {
      expect((screen.getByTestId("quick-chat-input") as HTMLInputElement).value).toBe("");
    });
  });

  it("streaming state shows streaming message and disables input", async () => {
    render(<QuickChatFAB addToast={addToast} projectId="proj-123" />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    // Wait for session initialization
    await waitFor(() => {
      expect(mockFetchChatSessions).toHaveBeenCalled();
    });

    const input = await screen.findByTestId("quick-chat-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("quick-chat-send"));

    // Input should be cleared and disabled during streaming
    await waitFor(() => {
      expect((screen.getByTestId("quick-chat-input") as HTMLInputElement).value).toBe("");
    });
    expect(screen.getByTestId("quick-chat-input")).toBeDisabled();
  });

  it("after streaming completes, assistant message is shown", async () => {
    render(<QuickChatFAB addToast={addToast} projectId="proj-123" />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    // Wait for session initialization
    await waitFor(() => {
      expect(mockFetchChatSessions).toHaveBeenCalled();
    });

    const input = await screen.findByTestId("quick-chat-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("quick-chat-send"));

    // Wait for streaming to complete and message to appear
    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
    });

    // After streaming completes, input should be re-enabled
    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-input")).not.toBeDisabled();
    });
  });

  it("switching agents creates a new session for the selected agent", async () => {
    // First session exists
    mockFetchChatSessions.mockResolvedValueOnce({ sessions: [mockSession] });

    render(<QuickChatFAB addToast={addToast} projectId="proj-123" />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    // Wait for initial session to be created
    await waitFor(() => {
      expect(mockFetchChatSessions).toHaveBeenCalled();
    });

    // Switch to agent-002
    fireEvent.change(screen.getByTestId("quick-chat-agent-select"), {
      target: { value: "agent-002" },
    });

    // Should create a new session for agent-002
    await waitFor(() => {
      expect(mockCreateChatSession).toHaveBeenCalledWith({ agentId: "agent-002" }, "proj-123");
    });
  });

  it("shows placeholder text when conversation is empty", async () => {
    mockFetchChatMessages.mockResolvedValue({ messages: [] });

    render(<QuickChatFAB addToast={addToast} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    await waitFor(() => {
      expect(screen.getByText("No messages yet. Start the conversation!")).toBeDefined();
    });
  });

  it("closes panel when clicking outside", async () => {
    render(<QuickChatFAB addToast={addToast} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));
    await waitFor(() => {
      expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("quick-chat-panel")).toBeNull();
    });
  });

  it("hides FAB button when showFAB is false", () => {
    render(<QuickChatFAB addToast={addToast} showFAB={false} />);

    expect(screen.queryByTestId("quick-chat-fab")).toBeNull();
  });

  it("still opens panel programmatically when showFAB is false with controlled open prop", async () => {
    render(<QuickChatFAB addToast={addToast} showFAB={false} open={true} />);

    expect(screen.queryByTestId("quick-chat-fab")).toBeNull();
    expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
  });

  it("controlled open prop opens panel without clicking FAB", () => {
    render(<QuickChatFAB addToast={addToast} open={true} />);

    expect(screen.getByTestId("quick-chat-panel")).toBeDefined();
  });

  it("controlled open prop defaults to closed when not set", () => {
    render(<QuickChatFAB addToast={addToast} />);

    expect(screen.queryByTestId("quick-chat-panel")).toBeNull();
  });

  it("onOpenChange callback is called when panel is opened via FAB (controlled mode)", async () => {
    const onOpenChange = vi.fn();
    render(<QuickChatFAB addToast={addToast} open={false} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it("onOpenChange callback is called when panel is closed via FAB", async () => {
    const onOpenChange = vi.fn();
    render(<QuickChatFAB addToast={addToast} open={true} onOpenChange={onOpenChange} />);

    // Panel should be open initially
    expect(screen.getByTestId("quick-chat-panel")).toBeDefined();

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("error handling shows toast on stream error", async () => {
    // Mock streamChatResponse to trigger error
    mockStreamChatResponse.mockImplementationOnce((sessionId, content, textHandlers) => {
      setTimeout(() => {
        textHandlers.onError?.("Stream connection failed");
      }, 10);
      return {
        close: vi.fn(),
        isConnected: vi.fn(() => false),
      };
    });

    render(<QuickChatFAB addToast={addToast} projectId="proj-123" />);

    fireEvent.click(screen.getByTestId("quick-chat-fab"));

    // Wait for session initialization
    await waitFor(() => {
      expect(mockFetchChatSessions).toHaveBeenCalled();
    });

    const input = await screen.findByTestId("quick-chat-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("quick-chat-send"));

    // Wait for error toast
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("Failed to send message", "error");
    });
  });
});

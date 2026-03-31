import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubtaskBreakdownModal } from "./SubtaskBreakdownModal";

const mockStartSubtaskBreakdown = vi.fn();
const mockConnectSubtaskStream = vi.fn();
const mockCreateTasksFromBreakdown = vi.fn();
const mockCancelSubtaskBreakdown = vi.fn();

vi.mock("../api", () => ({
  startSubtaskBreakdown: (...args: any[]) => mockStartSubtaskBreakdown(...args),
  connectSubtaskStream: (...args: any[]) => mockConnectSubtaskStream(...args),
  createTasksFromBreakdown: (...args: any[]) => mockCreateTasksFromBreakdown(...args),
  cancelSubtaskBreakdown: (...args: any[]) => mockCancelSubtaskBreakdown(...args),
}));

const SAMPLE_SUBTASKS = [
  { id: "subtask-1", title: "First", description: "Do first", suggestedSize: "S" as const, dependsOn: [] },
  { id: "subtask-2", title: "Second", description: "Do second", suggestedSize: "M" as const, dependsOn: ["subtask-1"] },
];

describe("SubtaskBreakdownModal", () => {
  const onClose = vi.fn();
  const onTasksCreated = vi.fn();
  let streamHandlers: any;

  beforeEach(() => {
    vi.clearAllMocks();
    streamHandlers = undefined;
    mockStartSubtaskBreakdown.mockResolvedValue({ sessionId: "session-123" });
    mockConnectSubtaskStream.mockImplementation((_sessionId, handlers) => {
      streamHandlers = handlers;
      return { close: vi.fn(), isConnected: () => true };
    });
    mockCreateTasksFromBreakdown.mockResolvedValue({ tasks: [{ id: "KB-101" }, { id: "KB-102" }] });
    mockCancelSubtaskBreakdown.mockResolvedValue(undefined);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderModal() {
    return render(
      <SubtaskBreakdownModal
        isOpen={true}
        onClose={onClose}
        initialDescription="Build a complex feature"
        onTasksCreated={onTasksCreated}
      />,
    );
  }

  it("shows generating state after auto-start", async () => {
    renderModal();
    await waitFor(() => expect(mockStartSubtaskBreakdown).toHaveBeenCalledWith("Build a complex feature"));
    expect(await screen.findByText("AI is generating subtasks...")).toBeInTheDocument();
  });

  it("renders editable subtasks when stream returns items", async () => {
    renderModal();
    await waitFor(() => expect(streamHandlers).toBeDefined());
    streamHandlers.onSubtasks(SAMPLE_SUBTASKS);
    expect(await screen.findByDisplayValue("First")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Do second")).toBeInTheDocument();
  });

  it("adds and removes subtasks", async () => {
    renderModal();
    await waitFor(() => expect(streamHandlers).toBeDefined());
    streamHandlers.onSubtasks([SAMPLE_SUBTASKS[0]]);

    fireEvent.click(await screen.findByText("Add subtask"));
    expect(screen.getAllByText(/subtask-/i).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByText(/Remove/));
    await waitFor(() => expect(screen.queryByDisplayValue("First")).not.toBeInTheDocument());
  });

  it("changes size and dependency selection", async () => {
    renderModal();
    await waitFor(() => expect(streamHandlers).toBeDefined());
    streamHandlers.onSubtasks(SAMPLE_SUBTASKS);

    fireEvent.click(await screen.findAllByText("L").then((buttons) => buttons[0]!));
    fireEvent.click(screen.getByLabelText(/subtask-1/i, { selector: 'input[type="checkbox"]' }));
    expect(screen.getByText("subtask-1")).toBeInTheDocument();
  });

  it("saves via API with edited data", async () => {
    renderModal();
    await waitFor(() => expect(streamHandlers).toBeDefined());
    streamHandlers.onSubtasks(SAMPLE_SUBTASKS);

    const titleInputs = await screen.findAllByRole("textbox");
    fireEvent.change(titleInputs[0], { target: { value: "Updated first" } });
    fireEvent.click(screen.getByText("Create Tasks"));

    await waitFor(() => expect(mockCreateTasksFromBreakdown).toHaveBeenCalled());
    expect(onTasksCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("cancel closes modal", async () => {
    renderModal();
    await waitFor(() => expect(mockStartSubtaskBreakdown).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText("Close"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("escape closes modal", async () => {
    renderModal();
    await waitFor(() => expect(mockStartSubtaskBreakdown).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

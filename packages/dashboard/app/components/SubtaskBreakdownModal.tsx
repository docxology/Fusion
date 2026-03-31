import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@kb/core";
import {
  startSubtaskBreakdown,
  connectSubtaskStream,
  createTasksFromBreakdown,
  cancelSubtaskBreakdown,
  type SubtaskItem,
} from "../api";
import { CheckCircle, Loader2, ListTree, Plus, Trash2, X } from "lucide-react";

interface SubtaskBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDescription: string;
  onTasksCreated: (tasks: Task[]) => void;
  parentTaskId?: string;
}

type ViewState =
  | { type: "initial" }
  | { type: "generating"; sessionId: string }
  | { type: "editing"; sessionId: string }
  | { type: "creating"; sessionId: string };

function createEmptySubtask(index: number): SubtaskItem {
  return {
    id: `subtask-${index}`,
    title: "",
    description: "",
    suggestedSize: "M",
    dependsOn: [],
  };
}

function hasDependencyCycle(subtasks: SubtaskItem[]): boolean {
  const graph = new Map(subtasks.map((item) => [item.id, item.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (graph.has(dep) && visit(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return subtasks.some((item) => visit(item.id));
}

export function SubtaskBreakdownModal({ isOpen, onClose, initialDescription, onTasksCreated, parentTaskId }: SubtaskBreakdownModalProps) {
  const [view, setView] = useState<ViewState>({ type: "initial" });
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [thinkingOutput, setThinkingOutput] = useState("");
  const [showThinking, setShowThinking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const streamRef = useRef<{ close: () => void; isConnected: () => boolean } | null>(null);
  const titleRefs = useRef<Array<HTMLInputElement | null>>([]);
  const autoStartedRef = useRef(false);

  const sessionId = view.type === "generating" || view.type === "editing" || view.type === "creating"
    ? view.sessionId
    : null;

  const isInvalid = useMemo(() => {
    if (subtasks.length === 0) return true;
    if (subtasks.some((subtask) => !subtask.title.trim())) return true;
    return hasDependencyCycle(subtasks);
  }, [subtasks]);

  const resetState = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    setView({ type: "initial" });
    setSubtasks([]);
    setThinkingOutput("");
    setShowThinking(true);
    setError(null);
    setDirty(false);
    autoStartedRef.current = false;
  }, []);

  const handleClose = useCallback(async () => {
    if ((dirty || view.type === "editing" || view.type === "creating") && !confirm("Close subtask breakdown? Unsaved changes will be lost.")) {
      return;
    }
    if (sessionId) {
      try {
        await cancelSubtaskBreakdown(sessionId);
      } catch {
        // ignore cancel errors
      }
    }
    resetState();
    onClose();
  }, [dirty, onClose, resetState, sessionId, view.type]);

  const beginBreakdown = useCallback(async () => {
    if (!initialDescription.trim()) return;
    setError(null);
    setThinkingOutput("");

    try {
      const { sessionId } = await startSubtaskBreakdown(initialDescription.trim());
      setView({ type: "generating", sessionId });
      streamRef.current?.close();
      streamRef.current = connectSubtaskStream(sessionId, {
        onThinking: (data) => setThinkingOutput((prev) => prev + data),
        onSubtasks: (items) => {
          setSubtasks(items);
          setView({ type: "editing", sessionId });
          setDirty(false);
        },
        onError: (message) => {
          setError(message);
          setView({ type: "initial" });
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to start subtask breakdown");
      setView({ type: "initial" });
    }
  }, [initialDescription]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }

    if (isOpen && initialDescription && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void beginBreakdown();
    }
  }, [isOpen, initialDescription, beginBreakdown, resetState]);

  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const updateSubtask = useCallback((id: string, patch: Partial<SubtaskItem>) => {
    setSubtasks((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setDirty(true);
  }, []);

  const addSubtask = useCallback(() => {
    setSubtasks((current) => [...current, createEmptySubtask(current.length + 1)]);
    setDirty(true);
  }, []);

  const removeSubtask = useCallback((id: string) => {
    setSubtasks((current) => current
      .filter((item) => item.id !== id)
      .map((item) => ({ ...item, dependsOn: item.dependsOn.filter((dep) => dep !== id) })));
    setDirty(true);
  }, []);

  const moveFocusToNext = useCallback((index: number) => {
    titleRefs.current[index + 1]?.focus();
  }, []);

  const handleCreateTasks = useCallback(async () => {
    if (!sessionId || isInvalid) return;
    setError(null);
    setView({ type: "creating", sessionId });
    try {
      const result = await createTasksFromBreakdown(sessionId, subtasks, parentTaskId);
      onTasksCreated(result.tasks);
      resetState();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create tasks");
      setView({ type: "editing", sessionId });
    }
  }, [isInvalid, onClose, onTasksCreated, parentTaskId, resetState, sessionId, subtasks]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={(event) => event.target === event.currentTarget && void handleClose()}>
      <div className="modal modal-lg planning-modal">
        <div className="modal-header">
          <div className="detail-title-row">
            <ListTree size={20} style={{ color: "var(--triage)" }} />
            <h3>Subtask Breakdown</h3>
          </div>
          <button className="modal-close" onClick={() => void handleClose()} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="planning-modal-body">
          {error && <div className="form-error planning-error">{error}</div>}

          {view.type === "initial" && (
            <div className="planning-initial">
              <div className="planning-view-scroll">
                <p className="text-muted">Preparing to break this task into subtasks.</p>
                <pre className="planning-thinking-output">{initialDescription}</pre>
              </div>
            </div>
          )}

          {view.type === "generating" && (
            <div className="planning-loading">
              <Loader2 size={40} className="spin" style={{ color: "var(--todo)" }} />
              <p>AI is generating subtasks...</p>
              <div className="planning-thinking-container">
                <button className="planning-thinking-toggle" onClick={() => setShowThinking(!showThinking)} type="button">
                  {showThinking ? "Hide thinking" : "Show thinking"}
                </button>
                {showThinking && thinkingOutput && (
                  <div className="planning-thinking-output">
                    <pre>{thinkingOutput}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {(view.type === "editing" || view.type === "creating") && (
            <div className="planning-summary">
              <div className="planning-view-scroll planning-summary-scroll">
                <div className="planning-summary-header">
                  <CheckCircle size={24} style={{ color: "var(--color-success)" }} />
                  <h4>Review your subtasks</h4>
                  <p className="text-muted">Edit titles, descriptions, sizes, and dependencies before creating all tasks at once.</p>
                </div>

                <div className="planning-summary-form">
                  {subtasks.map((subtask, index) => (
                    <div key={subtask.id} className="task-detail-section" data-testid={`subtask-item-${index}`}>
                      <div className="detail-title-row" style={{ justifyContent: "space-between" }}>
                        <strong>{subtask.id}</strong>
                        <button type="button" className="btn btn-sm" onClick={() => removeSubtask(subtask.id)} disabled={view.type === "creating"}>
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>

                      <div className="form-group">
                        <label>Title</label>
                        <input
                          ref={(element) => { titleRefs.current[index] = element; }}
                          value={subtask.title}
                          onChange={(event) => updateSubtask(subtask.id, { title: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              moveFocusToNext(index);
                            }
                          }}
                          disabled={view.type === "creating"}
                        />
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          rows={3}
                          value={subtask.description}
                          onChange={(event) => updateSubtask(subtask.id, { description: event.target.value })}
                          disabled={view.type === "creating"}
                        />
                      </div>

                      <div className="form-group">
                        <label>Size</label>
                        <div className="planning-size-selector">
                          {(["S", "M", "L"] as const).map((size) => (
                            <button
                              key={size}
                              type="button"
                              className={`planning-size-btn ${subtask.suggestedSize === size ? "selected" : ""}`}
                              onClick={() => updateSubtask(subtask.id, { suggestedSize: size })}
                              disabled={view.type === "creating"}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Dependencies</label>
                        <div className="planning-deps-list">
                          {subtasks.filter((item) => item.id !== subtask.id).map((candidate) => {
                            const selected = subtask.dependsOn.includes(candidate.id);
                            return (
                              <label key={candidate.id} className={`planning-dep-chip ${selected ? "selected" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    const nextDeps = selected
                                      ? subtask.dependsOn.filter((dep) => dep !== candidate.id)
                                      : [...subtask.dependsOn, candidate.id];
                                    updateSubtask(subtask.id, { dependsOn: nextDeps });
                                  }}
                                  disabled={view.type === "creating"}
                                />
                                <span className="planning-dep-id">{candidate.id}</span>
                                <span className="planning-dep-title">{candidate.title || "Untitled"}</span>
                              </label>
                            );
                          })}
                          {subtasks.filter((item) => item.id !== subtask.id).length === 0 && (
                            <div className="text-muted">No other subtasks available yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button type="button" className="btn" onClick={addSubtask} disabled={view.type === "creating"}>
                    <Plus size={16} style={{ marginRight: 6 }} /> Add subtask
                  </button>

                  {hasDependencyCycle(subtasks) && (
                    <div className="form-error planning-error">Dependencies contain a cycle. Remove circular references before creating tasks.</div>
                  )}
                </div>
              </div>

              <div className="planning-actions planning-summary-actions">
                <button className="btn" onClick={() => void handleClose()} disabled={view.type === "creating"}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={() => void handleCreateTasks()} disabled={view.type === "creating" || isInvalid}>
                  {view.type === "creating" ? (
                    <>
                      <Loader2 size={16} className="spin" style={{ marginRight: 8 }} />
                      Creating...
                    </>
                  ) : (
                    <>Create Tasks</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { SubtaskBreakdownModalProps };

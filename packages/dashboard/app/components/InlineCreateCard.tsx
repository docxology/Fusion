import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "lucide-react";
import type { Task, TaskCreateInput } from "@kb/core";
import type { ToastType } from "../hooks/useToast";
import { uploadAttachment } from "../api";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

interface PendingImage {
  file: File;
  previewUrl: string;
}

interface InlineCreateCardProps {
  tasks: Task[];
  onSubmit: (input: TaskCreateInput) => Promise<Task>;
  onCancel: () => void;
  addToast: (msg: string, type?: ToastType) => void;
}

export function InlineCreateCard({ tasks, onSubmit, onCancel, addToast }: InlineCreateCardProps) {
  const [description, setDescription] = useState("");
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [showDeps, setShowDeps] = useState(false);
  const [depSearch, setDepSearch] = useState("");
  const [breakIntoSubtasks, setBreakIntoSubtasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showDeps) setDepSearch("");
  }, [showDeps]);

  // Cancel when focus leaves the card entirely and there's no content
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const handleFocusOut = (e: FocusEvent) => {
      // relatedTarget is the element receiving focus — if it's inside the card, ignore
      if (e.relatedTarget instanceof Node && card.contains(e.relatedTarget)) return;
      // Only cancel if empty and dropdown is not open
      if (
        description.trim() === "" &&
        pendingImages.length === 0 &&
        dependencies.length === 0 &&
        !breakIntoSubtasks &&
        !showDeps
      ) {
        onCancel();
      }
    };
    card.addEventListener("focusout", handleFocusOut);
    return () => card.removeEventListener("focusout", handleFocusOut);
  }, [description, pendingImages, dependencies, breakIntoSubtasks, showDeps, onCancel]);

  // Clean up object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

  /**
   * Handles paste events on the textarea. Extracts image files from the
   * clipboard data, creates object URL previews, and appends them to
   * the pendingImages state. Non-image files are silently ignored.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (submitting) return;
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;

      const newImages: PendingImage[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
          newImages.push({ file, previewUrl: URL.createObjectURL(file) });
        }
      }
      if (newImages.length > 0) {
        setPendingImages((prev) => [...prev, ...newImages]);
      }
    },
    [submitting],
  );

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const task = await onSubmit({
        description: description.trim(),
        column: "triage",
        dependencies: dependencies.length ? dependencies : undefined,
        breakIntoSubtasks,
      });

      // Upload pending images as attachments
      if (pendingImages.length > 0) {
        const failures: string[] = [];
        for (const img of pendingImages) {
          try {
            await uploadAttachment(task.id, img.file);
          } catch {
            failures.push(img.file.name);
          }
        }
        if (failures.length > 0) {
          addToast(`Failed to upload: ${failures.join(", ")}`, "error");
        }
      }

      // Clean up preview URLs
      pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setPendingImages([]);

      addToast(`Created ${task.id}`, "success");
    } catch (err: any) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }, [description, dependencies, breakIntoSubtasks, submitting, pendingImages, onSubmit, addToast]);

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, onCancel],
  );

  const toggleDep = useCallback((id: string) => {
    setDependencies((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }, []);

  const truncate = (s: string, len: number) =>
    s.length > len ? s.slice(0, len) + "…" : s;

  return (
    <div className="inline-create-card" ref={cardRef}>
      <textarea
        ref={inputRef}
        rows={1}
        className="inline-create-input"
        placeholder="What needs to be done?"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = el.scrollHeight + "px";
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={submitting}
      />
      {pendingImages.length > 0 && (
        <div className="inline-create-previews">
          {pendingImages.map((img, i) => (
            <div key={img.previewUrl} className="inline-create-preview">
              <img src={img.previewUrl} alt={img.file.name} />
              <button
                type="button"
                className="inline-create-preview-remove"
                onClick={() => removeImage(i)}
                disabled={submitting}
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="inline-create-footer">
        <div className="dep-trigger-wrap">
          <button
            type="button"
            className="btn btn-sm dep-trigger"
            onClick={() => setShowDeps((v) => !v)}
          >
            <Link size={12} style={{ verticalAlign: 'middle' }} />{dependencies.length > 0 ? ` ${dependencies.length} deps` : " Deps"}
          </button>
          {!submitting && (
            <label className="inline-create-hint" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
              <input
                type="checkbox"
                data-testid="break-into-subtasks-toggle"
                checked={breakIntoSubtasks}
                onChange={(e) => setBreakIntoSubtasks(e.target.checked)}
              />
              Break into subtasks
            </label>
          )}
          {showDeps && (() => {
            const term = depSearch.toLowerCase();
            const filtered = (term
              ? tasks.filter((t) =>
                  t.id.toLowerCase().includes(term) ||
                  (t.title && t.title.toLowerCase().includes(term)) ||
                  (t.description && t.description.toLowerCase().includes(term))
                )
              : [...tasks]
            ).sort((a, b) => {
              const cmp = b.createdAt.localeCompare(a.createdAt);
              if (cmp !== 0) return cmp;
              const aNum = parseInt(a.id.slice(a.id.lastIndexOf("-") + 1), 10) || 0;
              const bNum = parseInt(b.id.slice(b.id.lastIndexOf("-") + 1), 10) || 0;
              return bNum - aNum;
            });
            return (
              <div className="dep-dropdown" onMouseDown={(e) => e.preventDefault()}>
                <input
                  className="dep-dropdown-search"
                  placeholder="Search tasks…"
                  autoFocus
                  value={depSearch}
                  onChange={(e) => setDepSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                {filtered.length === 0 ? (
                  <div className="dep-dropdown-empty">No existing tasks</div>
                ) : (
                  filtered.map((t) => (
                    <div
                      key={t.id}
                      className={`dep-dropdown-item${dependencies.includes(t.id) ? " selected" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleDep(t.id)}
                    >
                      <span className="dep-dropdown-id">{t.id}</span>
                      <span className="dep-dropdown-title">{truncate(t.title || t.description || t.id, 30)}</span>
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </div>
        <div className="inline-create-actions">
          <span className="inline-create-hint">Enter to create · Esc to cancel</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
          >
            {submitting ? "Creating..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

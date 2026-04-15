import { useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { ToastType } from "../hooks/useToast";
import { useRoadmaps } from "../hooks/useRoadmaps";
import type {
  Roadmap,
  RoadmapMilestone,
  RoadmapFeature,
  RoadmapCreateInput,
  RoadmapUpdateInput,
  RoadmapMilestoneCreateInput,
  RoadmapMilestoneUpdateInput,
  RoadmapFeatureCreateInput,
  RoadmapFeatureUpdateInput,
} from "@fusion/core";

export interface RoadmapsViewProps {
  projectId?: string;
  addToast: (message: string, type?: ToastType) => void;
}

// ── Inline Edit State Types ─────────────────────────────────────────

interface InlineEditState {
  roadmapId: string | null;
  field: "title" | "description" | null;
  value: string;
}

interface MilestoneInlineEditState {
  milestoneId: string | null;
  field: "title" | "description" | null;
  value: string;
}

interface FeatureInlineEditState {
  featureId: string | null;
  field: "title" | "description" | null;
  value: string;
}

// ── Create Form State ───────────────────────────────────────────────

interface CreateFormState {
  type: "roadmap" | "milestone" | "feature" | null;
  parentId?: string;
  title: string;
  description: string;
}

// ── Roadmap Item ─────────────────────────────────────────────────────

function RoadmapItem({
  roadmap,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  roadmap: Roadmap;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSelect();
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      className={`roadmaps-view__sidebar-item${isSelected ? " roadmaps-view__sidebar-item--active" : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      data-testid={`roadmap-item-${roadmap.id}`}
    >
      <div className="roadmaps-view__sidebar-item-content">
        <div className="roadmaps-view__sidebar-item-title">{roadmap.title}</div>
        {roadmap.description && (
          <div className="roadmaps-view__sidebar-item-desc">{roadmap.description}</div>
        )}
      </div>
      <div className="roadmaps-view__sidebar-item-actions" onClick={handleEditClick} role="presentation">
        <span
          className="roadmaps-view__icon-btn"
          onClick={handleEditClick}
          role="button"
          title="Edit roadmap"
          aria-label="Edit roadmap"
          data-testid={`roadmap-edit-${roadmap.id}`}
          tabIndex={0}
        >
          <Pencil size={14} />
        </span>
        <span
          className="roadmaps-view__icon-btn roadmaps-view__icon-btn--danger"
          onClick={handleDeleteClick}
          role="button"
          title="Delete roadmap"
          aria-label="Delete roadmap"
          data-testid={`roadmap-delete-${roadmap.id}`}
          tabIndex={0}
        >
          <Trash2 size={14} />
        </span>
      </div>
    </div>
  );
}

// ── Milestone Card ───────────────────────────────────────────────────

function MilestoneCard({
  milestone,
  features,
  onEditMilestone,
  onDeleteMilestone,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
  milestoneEdit,
  onStartMilestoneEdit,
  onCancelMilestoneEdit,
  onSaveMilestoneEdit,
  featureEdit,
  onStartFeatureEdit,
  onCancelFeatureEdit,
  onSaveFeatureEdit,
  projectId,
  addToast,
}: {
  milestone: RoadmapMilestone;
  features: RoadmapFeature[];
  onEditMilestone: () => void;
  onDeleteMilestone: () => void;
  onAddFeature: () => void;
  onEditFeature: (featureId: string) => void;
  onDeleteFeature: (featureId: string) => void;
  milestoneEdit: MilestoneInlineEditState | null;
  onStartMilestoneEdit: () => void;
  onCancelMilestoneEdit: () => void;
  onSaveMilestoneEdit: (updates: RoadmapMilestoneUpdateInput) => void;
  featureEdit: FeatureInlineEditState | null;
  onStartFeatureEdit: (featureId: string, currentTitle: string, currentDescription?: string) => void;
  onCancelFeatureEdit: () => void;
  onSaveFeatureEdit: (updates: RoadmapFeatureUpdateInput) => void;
  projectId?: string;
  addToast: (message: string, type?: ToastType) => void;
}) {
  const isEditingMilestone = milestoneEdit?.milestoneId === milestone.id;

  const handleMilestoneTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (milestoneEdit) {
        onSaveMilestoneEdit({ title: milestoneEdit.value });
      }
    } else if (e.key === "Escape") {
      onCancelMilestoneEdit();
    }
  };

  const handleMilestoneDescKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      onCancelMilestoneEdit();
    }
  };

  return (
    <div className="roadmaps-view__milestone">
      <div className="roadmaps-view__milestone-header">
        {isEditingMilestone ? (
          <div className="roadmaps-view__inline-edit">
            <div className="roadmaps-view__inline-edit-row">
              <input
                type="text"
                className="roadmaps-view__inline-input"
                value={milestoneEdit.value}
                onChange={(e) =>
                  onStartMilestoneEdit()
                }
                onKeyDown={handleMilestoneTitleKeyDown}
                placeholder="Milestone title"
                autoFocus
                data-testid={`milestone-title-input-${milestone.id}`}
              />
              <button
                className="roadmaps-view__icon-btn roadmaps-view__icon-btn--success"
                onClick={() => onSaveMilestoneEdit({ title: milestoneEdit.value })}
                aria-label="Save milestone title"
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                className="roadmaps-view__icon-btn"
                onClick={onCancelMilestoneEdit}
                aria-label="Cancel editing"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="roadmaps-view__inline-textarea"
              value={milestoneEdit.field === "description" ? milestoneEdit.value : milestone.description || ""}
              onChange={(e) => {
                // Update the edit state with description
              }}
              onKeyDown={handleMilestoneDescKeyDown}
              placeholder="Milestone description (optional)"
              rows={2}
              data-testid={`milestone-desc-input-${milestone.id}`}
            />
          </div>
        ) : (
          <>
            <div className="roadmaps-view__milestone-title-row">
              <h3 className="roadmaps-view__milestone-title">{milestone.title}</h3>
              <div className="roadmaps-view__milestone-actions">
                <button
                  className="roadmaps-view__icon-btn"
                  onClick={onEditMilestone}
                  title="Edit milestone"
                  aria-label="Edit milestone"
                  data-testid={`milestone-edit-${milestone.id}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="roadmaps-view__icon-btn roadmaps-view__icon-btn--danger"
                  onClick={onDeleteMilestone}
                  title="Delete milestone"
                  aria-label="Delete milestone"
                  data-testid={`milestone-delete-${milestone.id}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {milestone.description && (
              <p className="roadmaps-view__milestone-desc">{milestone.description}</p>
            )}
          </>
        )}
      </div>

      <div className="roadmaps-view__milestone-actions-bar">
        <button
          className="roadmaps-view__add-feature-btn"
          onClick={onAddFeature}
          title="Add feature"
          aria-label="Add feature"
          data-testid={`add-feature-${milestone.id}`}
        >
          <Plus size={12} />
          <span>Add Feature</span>
        </button>
      </div>

      <div className="roadmaps-view__feature-list">
        {features.length === 0 ? (
          <p className="roadmaps-view__empty-features">No features yet.</p>
        ) : (
          features.map((feature) => {
            const isEditingFeature = featureEdit?.featureId === feature.id;

            const handleFeatureTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (featureEdit) {
                  onSaveFeatureEdit({ title: featureEdit.value });
                }
              } else if (e.key === "Escape") {
                onCancelFeatureEdit();
              }
            };

            return (
              <div key={feature.id} className="roadmaps-view__feature-item">
                {isEditingFeature ? (
                  <div className="roadmaps-view__inline-edit roadmaps-view__inline-edit--compact">
                    <div className="roadmaps-view__inline-edit-row">
                      <input
                        type="text"
                        className="roadmaps-view__inline-input"
                        value={featureEdit.value}
                        onChange={() => {}}
                        onKeyDown={handleFeatureTitleKeyDown}
                        placeholder="Feature title"
                        autoFocus
                        data-testid={`feature-title-input-${feature.id}`}
                      />
                      <button
                        className="roadmaps-view__icon-btn roadmaps-view__icon-btn--success"
                        onClick={() => onSaveFeatureEdit({ title: featureEdit.value })}
                        aria-label="Save feature title"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="roadmaps-view__icon-btn"
                        onClick={onCancelFeatureEdit}
                        aria-label="Cancel editing"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="roadmaps-view__feature-content">
                      <span className="roadmaps-view__feature-title">{feature.title}</span>
                      {feature.description && (
                        <p className="roadmaps-view__feature-desc">{feature.description}</p>
                      )}
                    </div>
                    <div className="roadmaps-view__feature-actions">
                      <button
                        className="roadmaps-view__icon-btn"
                        onClick={() => onEditFeature(feature.id)}
                        title="Edit feature"
                        aria-label="Edit feature"
                        data-testid={`feature-edit-${feature.id}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="roadmaps-view__icon-btn roadmaps-view__icon-btn--danger"
                        onClick={() => onDeleteFeature(feature.id)}
                        title="Delete feature"
                        aria-label="Delete feature"
                        data-testid={`feature-delete-${feature.id}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Create Form ───────────────────────────────────────────────────────

function CreateRoadmapForm({
  onSave,
  onCancel,
}: {
  onSave: (input: RoadmapCreateInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() || undefined });
  };

  return (
    <div className="roadmaps-view__create-form" data-testid="create-roadmap-form">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          className="roadmaps-view__inline-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Roadmap title"
          autoFocus
          data-testid="create-roadmap-title"
        />
        <textarea
          className="roadmaps-view__inline-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Roadmap description (optional)"
          rows={2}
          data-testid="create-roadmap-description"
        />
        <div className="roadmaps-view__create-form-actions">
          <button
            type="submit"
            className="roadmaps-view__btn roadmaps-view__btn--primary"
            disabled={!title.trim()}
            data-testid="create-roadmap-submit"
          >
            Create
          </button>
          <button
            type="button"
            className="roadmaps-view__btn"
            onClick={onCancel}
            data-testid="create-roadmap-cancel"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateMilestoneForm({
  onSave,
  onCancel,
}: {
  onSave: (input: RoadmapMilestoneCreateInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() || undefined });
  };

  return (
    <div className="roadmaps-view__create-form roadmaps-view__create-form--inline" data-testid="create-milestone-form">
      <form onSubmit={handleSubmit} className="roadmaps-view__inline-form">
        <input
          type="text"
          className="roadmaps-view__inline-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Milestone title"
          autoFocus
          data-testid="create-milestone-title"
        />
        <textarea
          className="roadmaps-view__inline-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={1}
          data-testid="create-milestone-description"
        />
        <div className="roadmaps-view__inline-form-actions">
          <button
            type="submit"
            className="roadmaps-view__icon-btn roadmaps-view__icon-btn--success"
            disabled={!title.trim()}
            aria-label="Save milestone"
            title="Save"
            data-testid="create-milestone-submit"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className="roadmaps-view__icon-btn"
            onClick={onCancel}
            aria-label="Cancel"
            title="Cancel"
            data-testid="create-milestone-cancel"
          >
            <X size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateFeatureForm({
  onSave,
  onCancel,
}: {
  onSave: (input: RoadmapFeatureCreateInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() || undefined });
  };

  return (
    <div className="roadmaps-view__create-form roadmaps-view__create-form--inline" data-testid="create-feature-form">
      <form onSubmit={handleSubmit} className="roadmaps-view__inline-form">
        <input
          type="text"
          className="roadmaps-view__inline-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feature title"
          autoFocus
          data-testid="create-feature-title"
        />
        <textarea
          className="roadmaps-view__inline-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={1}
          data-testid="create-feature-description"
        />
        <div className="roadmaps-view__inline-form-actions">
          <button
            type="submit"
            className="roadmaps-view__icon-btn roadmaps-view__icon-btn--success"
            disabled={!title.trim()}
            aria-label="Save feature"
            title="Save"
            data-testid="create-feature-submit"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className="roadmaps-view__icon-btn"
            onClick={onCancel}
            aria-label="Cancel"
            title="Cancel"
            data-testid="create-feature-cancel"
          >
            <X size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function RoadmapsView({ projectId, addToast }: RoadmapsViewProps) {
  const {
    roadmaps,
    selectedRoadmapId,
    selectedRoadmap,
    milestones,
    featuresByMilestoneId,
    loading,
    error,
    createRoadmap,
    updateRoadmap,
    deleteRoadmap,
    selectRoadmap,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createFeature,
    updateFeature,
    deleteFeature,
  } = useRoadmaps({ projectId });

  // Inline edit states
  const [roadmapEdit, setRoadmapEdit] = useState<InlineEditState>({
    roadmapId: null,
    field: null,
    value: "",
  });
  const [milestoneEdit, setMilestoneEdit] = useState<MilestoneInlineEditState>({
    milestoneId: null,
    field: null,
    value: "",
  });
  const [featureEdit, setFeatureEdit] = useState<FeatureInlineEditState>({
    featureId: null,
    field: null,
    value: "",
  });

  // Create form state
  const [createForm, setCreateForm] = useState<CreateFormState>({
    type: null,
    parentId: undefined,
    title: "",
    description: "",
  });

  // Mobile sidebar state
  const [mobileSelectedRoadmapId, setMobileSelectedRoadmapId] = useState<string | null>(null);

  // Roadmap handlers
  const handleStartRoadmapEdit = useCallback((roadmap: Roadmap) => {
    setRoadmapEdit({
      roadmapId: roadmap.id,
      field: "title",
      value: roadmap.title,
    });
  }, []);

  const handleCancelRoadmapEdit = useCallback(() => {
    setRoadmapEdit({ roadmapId: null, field: null, value: "" });
  }, []);

  const handleSaveRoadmapEdit = useCallback(
    async (updates: RoadmapUpdateInput) => {
      if (!roadmapEdit.roadmapId) return;
      try {
        await updateRoadmap(roadmapEdit.roadmapId, updates, {
          onError: (err) => addToast(err.message, "error"),
        });
        handleCancelRoadmapEdit();
      } catch {
        // Error handled in callback
      }
    },
    [roadmapEdit.roadmapId, updateRoadmap, handleCancelRoadmapEdit, addToast]
  );

  const handleDeleteRoadmap = useCallback(
    async (roadmapId: string) => {
      if (!window.confirm("Delete this roadmap? This cannot be undone.")) return;
      try {
        await deleteRoadmap(roadmapId, {
          onError: (err) => addToast(err.message, "error"),
        });
        addToast("Roadmap deleted", "success");
      } catch {
        // Error handled in callback
      }
    },
    [deleteRoadmap, addToast]
  );

  const handleCreateRoadmap = useCallback(
    async (input: RoadmapCreateInput) => {
      try {
        await createRoadmap(input, {
          onError: (err) => addToast(err.message, "error"),
        });
        setCreateForm({ type: null, parentId: undefined, title: "", description: "" });
        addToast("Roadmap created", "success");
      } catch {
        // Error handled in callback
      }
    },
    [createRoadmap, addToast]
  );

  // Milestone handlers
  const handleStartMilestoneEdit = useCallback((milestone: RoadmapMilestone) => {
    setMilestoneEdit({
      milestoneId: milestone.id,
      field: "title",
      value: milestone.title,
    });
  }, []);

  const handleCancelMilestoneEdit = useCallback(() => {
    setMilestoneEdit({ milestoneId: null, field: null, value: "" });
  }, []);

  const handleSaveMilestoneEdit = useCallback(
    async (updates: RoadmapMilestoneUpdateInput) => {
      if (!milestoneEdit.milestoneId) return;
      try {
        await updateMilestone(milestoneEdit.milestoneId, updates, {
          onError: (err) => addToast(err.message, "error"),
        });
        handleCancelMilestoneEdit();
      } catch {
        // Error handled in callback
      }
    },
    [milestoneEdit.milestoneId, updateMilestone, handleCancelMilestoneEdit, addToast]
  );

  const handleDeleteMilestone = useCallback(
    async (milestoneId: string) => {
      if (!window.confirm("Delete this milestone and all its features?")) return;
      try {
        await deleteMilestone(milestoneId, {
          onError: (err) => addToast(err.message, "error"),
        });
        addToast("Milestone deleted", "success");
      } catch {
        // Error handled in callback
      }
    },
    [deleteMilestone, addToast]
  );

  const handleCreateMilestone = useCallback(
    async (input: RoadmapMilestoneCreateInput) => {
      try {
        await createMilestone(input, {
          onError: (err) => addToast(err.message, "error"),
        });
        setCreateForm({ type: null, parentId: undefined, title: "", description: "" });
        addToast("Milestone created", "success");
      } catch {
        // Error handled in callback
      }
    },
    [createMilestone, addToast]
  );

  // Feature handlers
  const handleStartFeatureEdit = useCallback(
    (featureId: string, currentTitle: string, currentDescription?: string) => {
      setFeatureEdit({
        featureId,
        field: "title",
        value: currentTitle,
      });
    },
    []
  );

  const handleCancelFeatureEdit = useCallback(() => {
    setFeatureEdit({ featureId: null, field: null, value: "" });
  }, []);

  const handleSaveFeatureEdit = useCallback(
    async (updates: RoadmapFeatureUpdateInput) => {
      if (!featureEdit.featureId) return;
      try {
        await updateFeature(featureEdit.featureId, updates, {
          onError: (err) => addToast(err.message, "error"),
        });
        handleCancelFeatureEdit();
      } catch {
        // Error handled in callback
      }
    },
    [featureEdit.featureId, updateFeature, handleCancelFeatureEdit, addToast]
  );

  const handleDeleteFeature = useCallback(
    async (featureId: string) => {
      if (!window.confirm("Delete this feature?")) return;
      try {
        await deleteFeature(featureId, {
          onError: (err) => addToast(err.message, "error"),
        });
        addToast("Feature deleted", "success");
      } catch {
        // Error handled in callback
      }
    },
    [deleteFeature, addToast]
  );

  const handleCreateFeature = useCallback(
    async (milestoneId: string, input: RoadmapFeatureCreateInput) => {
      try {
        await createFeature(milestoneId, input, {
          onError: (err) => addToast(err.message, "error"),
        });
        setCreateForm({ type: null, parentId: undefined, title: "", description: "" });
        addToast("Feature created", "success");
      } catch {
        // Error handled in callback
      }
    },
    [createFeature, addToast]
  );

  // Get the currently selected roadmap ID (handles both desktop and mobile)
  const effectiveSelectedRoadmapId = selectedRoadmapId;

  if (loading && roadmaps.length === 0) {
    return (
      <div className="roadmaps-view roadmaps-view--loading">
        <div className="roadmaps-view__loading-state">Loading roadmaps...</div>
      </div>
    );
  }

  if (error && roadmaps.length === 0) {
    return (
      <div className="roadmaps-view roadmaps-view--error">
        <div className="roadmaps-view__error-state">
          <p>Failed to load roadmaps</p>
          <p className="roadmaps-view__error-msg">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="roadmaps-view">
      {/* Desktop sidebar */}
      <aside className="roadmaps-view__sidebar" aria-label="Roadmaps">
        <div className="roadmaps-view__sidebar-header">
          <h2 className="roadmaps-view__sidebar-title">Roadmaps</h2>
          <button
            className="roadmaps-view__add-btn"
            onClick={() => setCreateForm({ type: "roadmap", title: "", description: "" })}
            title="Create roadmap"
            aria-label="Create roadmap"
            data-testid="create-roadmap-btn"
          >
            <Plus size={16} />
          </button>
        </div>

        {createForm.type === "roadmap" && (
          <CreateRoadmapForm
            onSave={handleCreateRoadmap}
            onCancel={() => setCreateForm({ type: null, parentId: undefined, title: "", description: "" })}
          />
        )}

        <div className="roadmaps-view__sidebar-list">
          {roadmaps.length === 0 ? (
            <p className="roadmaps-view__empty-sidebar">No roadmaps yet. Click + to create one.</p>
          ) : (
            roadmaps.map((roadmap) => (
              <RoadmapItem
                key={roadmap.id}
                roadmap={roadmap}
                isSelected={roadmap.id === effectiveSelectedRoadmapId}
                onSelect={() => selectRoadmap(roadmap.id)}
                onEdit={() => handleStartRoadmapEdit(roadmap)}
                onDelete={() => handleDeleteRoadmap(roadmap.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="roadmaps-view__main" aria-label="Roadmap content">
        {!effectiveSelectedRoadmapId ? (
          <div className="roadmaps-view__empty-main">
            <p>Select a roadmap from the sidebar to view its milestones.</p>
          </div>
        ) : (
          <>
            {/* Roadmap header */}
            <div className="roadmaps-view__roadmap-header">
              {roadmapEdit.roadmapId === effectiveSelectedRoadmapId ? (
                <div className="roadmaps-view__inline-edit">
                  <div className="roadmaps-view__inline-edit-row">
                    <input
                      type="text"
                      className="roadmaps-view__inline-input roadmaps-view__inline-input--large"
                      value={roadmapEdit.value}
                      onChange={(e) =>
                        setRoadmapEdit((prev) => ({ ...prev, value: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveRoadmapEdit({ title: roadmapEdit.value });
                        } else if (e.key === "Escape") {
                          handleCancelRoadmapEdit();
                        }
                      }}
                      placeholder="Roadmap title"
                      autoFocus
                      data-testid="roadmap-title-input"
                    />
                    <button
                      className="roadmaps-view__icon-btn roadmaps-view__icon-btn--success"
                      onClick={() => handleSaveRoadmapEdit({ title: roadmapEdit.value })}
                      aria-label="Save"
                      title="Save"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="roadmaps-view__icon-btn"
                      onClick={handleCancelRoadmapEdit}
                      aria-label="Cancel"
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="roadmaps-view__roadmap-title-row">
                    <h1 className="roadmaps-view__roadmap-title">
                      {selectedRoadmap?.title || "Untitled Roadmap"}
                    </h1>
                    <div className="roadmaps-view__roadmap-actions">
                      <button
                        className="roadmaps-view__icon-btn"
                        onClick={() => {
                          if (selectedRoadmap) handleStartRoadmapEdit(selectedRoadmap);
                        }}
                        title="Edit roadmap"
                        aria-label="Edit roadmap"
                        data-testid="edit-roadmap-btn"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="roadmaps-view__icon-btn roadmaps-view__icon-btn--danger"
                        onClick={() => handleDeleteRoadmap(effectiveSelectedRoadmapId)}
                        title="Delete roadmap"
                        aria-label="Delete roadmap"
                        data-testid="delete-roadmap-btn"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {selectedRoadmap?.description && (
                    <p className="roadmaps-view__roadmap-desc">{selectedRoadmap.description}</p>
                  )}
                </>
              )}
            </div>

            {/* Milestone lanes */}
            <div className="roadmaps-view__milestone-lanes">
              {createForm.type === "milestone" && (
                <CreateMilestoneForm
                  onSave={handleCreateMilestone}
                  onCancel={() => setCreateForm({ type: null, parentId: undefined, title: "", description: "" })}
                />
              )}

              {milestones.length === 0 && createForm.type !== "milestone" ? (
                <div className="roadmaps-view__empty-milestones">
                  <p>This roadmap has no milestones.</p>
                  <button
                    className="roadmaps-view__add-milestone-btn"
                    onClick={() => setCreateForm({ type: "milestone", title: "", description: "" })}
                    data-testid="add-milestone-btn-empty"
                  >
                    <Plus size={14} />
                    <span>Add Milestone</span>
                  </button>
                </div>
              ) : (
                <>
                  {createForm.type !== "milestone" && (
                    <button
                      className="roadmaps-view__add-milestone-fab"
                      onClick={() => setCreateForm({ type: "milestone", title: "", description: "" })}
                      data-testid="add-milestone-btn"
                    >
                      <Plus size={14} />
                      <span>Add Milestone</span>
                    </button>
                  )}
                  {milestones.map((milestone) => (
                    <MilestoneCard
                      key={milestone.id}
                      milestone={milestone}
                      features={featuresByMilestoneId[milestone.id] || []}
                      onEditMilestone={() => handleStartMilestoneEdit(milestone)}
                      onDeleteMilestone={() => handleDeleteMilestone(milestone.id)}
                      onAddFeature={() => setCreateForm({ type: "feature", parentId: milestone.id, title: "", description: "" })}
                      onEditFeature={(featureId) => {
                        const feature = featuresByMilestoneId[milestone.id]?.find((f) => f.id === featureId);
                        if (feature) {
                          handleStartFeatureEdit(featureId, feature.title, feature.description);
                        }
                      }}
                      onDeleteFeature={handleDeleteFeature}
                      milestoneEdit={milestoneEdit}
                      onStartMilestoneEdit={() => handleStartMilestoneEdit(milestone)}
                      onCancelMilestoneEdit={handleCancelMilestoneEdit}
                      onSaveMilestoneEdit={handleSaveMilestoneEdit}
                      featureEdit={featureEdit}
                      onStartFeatureEdit={handleStartFeatureEdit}
                      onCancelFeatureEdit={handleCancelFeatureEdit}
                      onSaveFeatureEdit={handleSaveFeatureEdit}
                      projectId={projectId}
                      addToast={addToast}
                    />
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Feature create form overlay */}
      {createForm.type === "feature" && createForm.parentId && (
        <div className="roadmaps-view__feature-create-overlay">
          <CreateFeatureForm
            onSave={(input) => handleCreateFeature(createForm.parentId!, input)}
            onCancel={() => setCreateForm({ type: null, parentId: undefined, title: "", description: "" })}
          />
        </div>
      )}
    </div>
  );
}

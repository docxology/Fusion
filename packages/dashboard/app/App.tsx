import { useState, useCallback } from "react";
import type { TaskDetail } from "@hai/core";
import { Header } from "./components/Header";
import { Board } from "./components/Board";
import { CreateTaskModal } from "./components/CreateTaskModal";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { ToastContainer } from "./components/ToastContainer";
import { useTasks } from "./hooks/useTasks";
import { ToastProvider, useToast } from "./hooks/useToast";

function AppInner() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const { tasks, createTask, moveTask, deleteTask, mergeTask } = useTasks();
  const { toasts, addToast, removeToast } = useToast();

  const handleCreateOpen = useCallback(() => setCreateModalOpen(true), []);
  const handleCreateClose = useCallback(() => setCreateModalOpen(false), []);

  const handleDetailOpen = useCallback((task: TaskDetail) => {
    setDetailTask(task);
  }, []);

  const handleDetailClose = useCallback(() => setDetailTask(null), []);

  return (
    <>
      <Header onNewTask={handleCreateOpen} />
      <Board
        tasks={tasks}
        onMoveTask={moveTask}
        onOpenDetail={handleDetailOpen}
        addToast={addToast}
      />
      {createModalOpen && (
        <CreateTaskModal
          onClose={handleCreateClose}
          onCreateTask={createTask}
          addToast={addToast}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={handleDetailClose}
          onMoveTask={moveTask}
          onDeleteTask={deleteTask}
          onMergeTask={mergeTask}
          addToast={addToast}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

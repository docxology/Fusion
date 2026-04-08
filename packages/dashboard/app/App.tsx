import { useState, useCallback, useEffect } from "react";
import type { TaskDetail, TaskCreateInput, Task, ThemeMode } from "@fusion/core";
import { updateProject, unregisterProject } from "./api";
import type { ProjectInfo } from "./api";
import { Header, useViewportMode } from "./components/Header";
import { Board } from "./components/Board";
import { ListView } from "./components/ListView";
import { ProjectOverview } from "./components/ProjectOverview";
import { SetupWizardModal } from "./components/SetupWizardModal";
import { TaskDetailModal } from "./components/TaskDetailModal";
import { TerminalModal } from "./components/TerminalModal";
import { FileBrowserModal } from "./components/FileBrowserModal";
import { SettingsModal } from "./components/SettingsModal";
import { ModelOnboardingModal } from "./components/ModelOnboardingModal";
import { PlanningModeModal } from "./components/PlanningModeModal";
import { SubtaskBreakdownModal } from "./components/SubtaskBreakdownModal";
import { ToastContainer } from "./components/ToastContainer";
import { GitHubImportModal } from "./components/GitHubImportModal";
import { GitManagerModal } from "./components/GitManagerModal";
import { UsageIndicator } from "./components/UsageIndicator";
import { NewTaskModal } from "./components/NewTaskModal";
import { ScheduledTasksModal } from "./components/ScheduledTasksModal";
import { ActivityLogModal } from "./components/ActivityLogModal";
import { WorkflowStepManager } from "./components/WorkflowStepManager";
import { MissionManager } from "./components/MissionManager";
import { AgentListModal } from "./components/AgentListModal";
import { AgentsView } from "./components/AgentsView";
import { NodesView } from "./components/NodesView";
import { MailboxModal } from "./components/MailboxModal";
import { ScriptsModal } from "./components/ScriptsModal";
import { ExecutorStatusBar } from "./components/ExecutorStatusBar";
import { MobileNavBar } from "./components/MobileNavBar";
import { QuickChatFAB } from "./components/QuickChatFAB";
import { useBackgroundSessions } from "./hooks/useBackgroundSessions";
import { useTasks } from "./hooks/useTasks";
import { useProjects } from "./hooks/useProjects";
import { useNodes } from "./hooks/useNodes";
import { useCurrentProject } from "./hooks/useCurrentProject";
import { ToastProvider, useToast } from "./hooks/useToast";
import { useTheme } from "./hooks/useTheme";
import { useModalManager } from "./hooks/useModalManager";
import { useAppSettings } from "./hooks/useAppSettings";
import { useDeepLink } from "./hooks/useDeepLink";
import { useFavorites } from "./hooks/useFavorites";
import { useAuthOnboarding } from "./hooks/useAuthOnboarding";

type ViewMode = "overview" | "project";
type TaskView = "board" | "list" | "agents";

function AppInner() {
  const { toasts, addToast, removeToast } = useToast();
  const isElectron = typeof window !== "undefined" && Boolean((window as Window & { electronAPI?: unknown }).electronAPI);
  
  // Project management hooks - MUST be called before any conditional logic
  const { projects, loading: projectsLoading, error: projectsError, refresh: refreshProjects, register: registerProject, update: updateProjectHook, unregister: unregisterProjectHook } = useProjects();
  const { nodes } = useNodes();
  const { currentProject, setCurrentProject, clearCurrentProject, loading: currentProjectLoading } = useCurrentProject(projects);
  
  // Tasks hook with project context
  const { tasks, createTask, moveTask, deleteTask, mergeTask, retryTask, updateTask, duplicateTask, archiveTask, unarchiveTask, archiveAllDone } = useTasks(
    currentProject ? { projectId: currentProject.id } : undefined
  );

  // Theme management
  const { themeMode, colorTheme, setThemeMode, setColorTheme } = useTheme();

  // Background AI sessions
  const { sessions: bgSessions, generating: bgGenerating, needsInput: bgNeedsInput, planningSessions: bgPlanningSessions, dismissSession: bgDismiss } = useBackgroundSessions(currentProject?.id);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("kb-dashboard-view-mode");
      if (saved === "overview" || saved === "project") return saved;
    }
    return "overview";
  });
  
  const [taskView, setTaskView] = useState<TaskView>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("kb-dashboard-task-view");
      if (saved === "board" || saved === "list" || saved === "agents") return saved;
    }
    return "board";
  });

  const viewportMode = useViewportMode();
  const isMobile = viewportMode === "mobile";

  // Modal state/handlers extracted to a dedicated manager hook.
  const {
    newTaskModalOpen,
    isPlanningOpen,
    planningInitialPlan,
    planningResumeSessionId,
    isSubtaskOpen,
    subtaskInitialDescription,
    subtaskResumeSessionId,
    detailTask,
    detailTaskInitialTab,
    settingsOpen,
    settingsInitialSection,
    schedulesOpen,
    githubImportOpen,
    usageOpen,
    terminalOpen,
    terminalInitialCommand,
    filesOpen,
    fileBrowserWorkspace,
    activityLogOpen,
    mailboxOpen,
    mailboxUnreadCount,
    mailboxAgents,
    gitManagerOpen,
    workflowStepsOpen,
    missionsOpen,
    missionResumeSessionId,
    missionTargetId,
    agentsOpen,
    scriptsOpen,
    setupWizardOpen,
    modelOnboardingOpen,
    anyModalOpen,
    openNewTask,
    closeNewTask,
    openPlanning,
    openPlanningWithInitialPlan,
    resumePlanning,
    openPlanningWithSession,
    closePlanning,
    openSubtaskBreakdown,
    openSubtaskWithSession,
    closeSubtask,
    openDetailTask,
    openDetailWithChangesTab,
    updateDetailTask,
    closeDetailTask,
    openSettings,
    closeSettings,
    openSchedules,
    closeSchedules,
    openGitHubImport,
    closeGitHubImport,
    openUsage,
    closeUsage,
    toggleTerminal,
    closeTerminal,
    openFiles,
    closeFiles,
    setFileWorkspace,
    openActivityLog,
    closeActivityLog,
    openMailbox,
    closeMailbox,
    openGitManager,
    closeGitManager,
    openWorkflowSteps,
    closeWorkflowSteps,
    openMissions,
    openMissionById,
    openMissionWithSession,
    closeMissions,
    closeAgents,
    openScripts,
    closeScripts,
    runScript,
    openSetupWizard,
    closeSetupWizard,
    openModelOnboarding,
    closeModelOnboarding,
    onPlanningTaskCreated,
    onPlanningTasksCreated,
    onSubtaskTasksCreated,
  } = useModalManager({
    projectId: currentProject?.id,
    planningSessions: bgPlanningSessions,
  });

  // Nodes management is an overlay view (not a modal), so it stays local to App.
  const [nodesOpen, setNodesOpen] = useState(false);

  // Settings state
  const {
    maxConcurrent,
    rootDir,
    autoMerge,
    globalPaused,
    enginePaused,
    taskStuckTimeoutMs,
    githubTokenConfigured,
    toggleAutoMerge,
    toggleGlobalPause,
    toggleEnginePause,
  } = useAppSettings(currentProject?.id);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    availableModels,
    favoriteProviders,
    favoriteModels,
    toggleFavoriteProvider,
    toggleFavoriteModel,
  } = useFavorites();

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("kb-dashboard-view-mode", viewMode);
  }, [viewMode]);

  // Persist task view
  useEffect(() => {
    localStorage.setItem("kb-dashboard-task-view", taskView);
  }, [taskView]);

  // Sync view mode when current project is restored from localStorage
  useEffect(() => {
    // Wait for both loading states to complete before syncing
    if (projectsLoading || currentProjectLoading) return;

    // If we have a restored current project but viewMode is overview, sync to project view
    if (currentProject && viewMode === "overview") {
      setViewMode("project");
    }
  }, [projectsLoading, currentProjectLoading, currentProject, viewMode]);

  // Auto-open setup wizard on first run (no projects)
  useEffect(() => {
    // Wait for both loading states to complete before making decision
    if (projectsLoading || currentProjectLoading) return;

    // Don't open if wizard is already open
    if (setupWizardOpen) return;

    // Don't open if we have projects OR a saved current project
    if (projects.length > 0 || currentProject) return;

    // Only open when truly no projects exist and no project is being restored
    const timer = setTimeout(() => {
      openSetupWizard();
    }, 500);
    return () => clearTimeout(timer);
  }, [projectsLoading, projects.length, currentProjectLoading, currentProject, setupWizardOpen, openSetupWizard]);

  // Theme toggle handler: cycles Dark → Light → System → Dark
  const handleToggleTheme = useCallback(() => {
    const cycle: ThemeMode[] = ["dark", "light", "system"];
    const currentIndex = cycle.indexOf(themeMode);
    const nextMode = cycle[(currentIndex + 1) % cycle.length];
    setThemeMode(nextMode);
  }, [themeMode, setThemeMode]);

  // Auth and onboarding bootstrap logic extracted to a dedicated hook.
  useAuthOnboarding({
    projectId: currentProject?.id,
    openModelOnboarding,
    openSettings,
  });

  const handleToggleFavorite = useCallback(async (provider: string) => {
    try {
      await toggleFavoriteProvider(provider);
    } catch {
      addToast("Failed to update favorites", "error");
    }
  }, [toggleFavoriteProvider, addToast]);

  const handleToggleModelFavorite = useCallback(async (modelId: string) => {
    try {
      await toggleFavoriteModel(modelId);
    } catch {
      addToast("Failed to update model favorites", "error");
    }
  }, [toggleFavoriteModel, addToast]);

  const { handleDetailClose } = useDeepLink({
    projectId: currentProject?.id,
    projects,
    projectsLoading,
    currentProject,
    setCurrentProject,
    addToast,
    openTaskDetail: openDetailTask,
    closeTaskDetail: closeDetailTask,
  });

  // View change handlers
  const handleChangeTaskView = useCallback((newView: TaskView) => {
    setTaskView(newView);
  }, []);

  // Project selection handlers
  const handleSelectProject = useCallback((project: ProjectInfo) => {
    setCurrentProject(project);
    setViewMode("project");
  }, [setCurrentProject]);

  const handleViewAllProjects = useCallback(() => {
    clearCurrentProject();
    setViewMode("overview");
  }, [clearCurrentProject]);

  const handleOpenSettings = useCallback(() => {
    openSettings();
  }, [openSettings]);

  const handleAddProject = useCallback(() => {
    openSetupWizard();
  }, [openSetupWizard]);

  const handleSetupComplete = useCallback((project: ProjectInfo) => {
    closeSetupWizard();
    setCurrentProject(project);
    setViewMode("project");
    addToast(`Project ${project.name} registered successfully`, "success");
    refreshProjects();
  }, [closeSetupWizard, setCurrentProject, addToast, refreshProjects]);

  const handleModelOnboardingComplete = useCallback(() => {
    closeModelOnboarding();
  }, [closeModelOnboarding]);

  const handlePauseProject = useCallback(async (project: ProjectInfo) => {
    try {
      await updateProject(project.id, { status: "paused" });
      addToast(`Project ${project.name} paused`, "success");
      refreshProjects();
    } catch {
      addToast(`Failed to pause project ${project.name}`, "error");
    }
  }, [addToast, refreshProjects]);

  const handleResumeProject = useCallback(async (project: ProjectInfo) => {
    try {
      await updateProject(project.id, { status: "active" });
      addToast(`Project ${project.name} resumed`, "success");
      refreshProjects();
    } catch {
      addToast(`Failed to resume project ${project.name}`, "error");
    }
  }, [addToast, refreshProjects]);

  const handleRemoveProject = useCallback(async (project: ProjectInfo) => {
    try {
      await unregisterProject(project.id);
      addToast(`Project ${project.name} removed`, "success");
      // If we removed the current project, go back to overview
      if (currentProject?.id === project.id) {
        clearCurrentProject();
        setViewMode("overview");
      }
      refreshProjects();
    } catch {
      addToast(`Failed to remove project ${project.name}`, "error");
    }
  }, [unregisterProject, currentProject, clearCurrentProject, addToast, refreshProjects]);

  // Task handlers
  const handleNewTaskOpen = openNewTask;
  const handleNewTaskClose = closeNewTask;

  const handleBoardQuickCreate = useCallback(
    async (input: TaskCreateInput): Promise<void> => {
      await createTask({ ...input, column: "triage" });
    },
    [createTask],
  );

  const handleModalCreate = useCallback(
    async (input: TaskCreateInput): Promise<Task> => {
      const task = await createTask({ ...input, column: "triage" });
      return task;
    },
    [createTask],
  );

  // Planning mode handlers
  const handlePlanningOpen = openPlanning;
  const handleResumePlanning = resumePlanning;
  const handlePlanningClose = closePlanning;
  const handlePlanningTaskCreated = useCallback((task: Task) => {
    onPlanningTaskCreated(task, addToast);
  }, [onPlanningTaskCreated, addToast]);

  const handlePlanningTasksCreated = useCallback((createdTasks: Task[]) => {
    onPlanningTasksCreated(createdTasks, addToast);
  }, [onPlanningTasksCreated, addToast]);

  // Handle planning mode from new task dialog
  const handleNewTaskPlanningMode = openPlanningWithInitialPlan;

  // Handle subtask breakdown from inline/quick create
  const handleSubtaskBreakdown = openSubtaskBreakdown;
  const handleSubtaskClose = closeSubtask;

  const handleSubtaskTasksCreated = useCallback((createdTasks: Task[]) => {
    onSubtaskTasksCreated(createdTasks, addToast);
  }, [onSubtaskTasksCreated, addToast]);

  // Usage indicator handlers
  const handleOpenUsage = openUsage;
  const handleCloseUsage = closeUsage;

  // Schedules modal handlers
  const handleOpenSchedules = openSchedules;
  const handleCloseSchedules = closeSchedules;

  const handleToggleAutoMerge = toggleAutoMerge;
  const handleToggleGlobalPause = toggleGlobalPause;
  const handleToggleEnginePause = toggleEnginePause;

  const handleDetailOpen = openDetailTask;

  const handleOpenDetailWithTab = useCallback((task: TaskDetail, initialTab: "changes") => {
    if (initialTab === "changes") {
      openDetailWithChangesTab(task);
      return;
    }
    openDetailTask(task, initialTab);
  }, [openDetailTask, openDetailWithChangesTab]);


  const handleGitHubImport = useCallback((task: Task) => {
    addToast(`Imported ${task.id} from GitHub`, "success");
  }, [addToast]);

  const handleToggleTerminal = toggleTerminal;
  const handleOpenFiles = openFiles;
  const handleWorkspaceChange = setFileWorkspace;

  // Activity log handlers
  const handleOpenActivityLog = openActivityLog;
  const handleCloseActivityLog = closeActivityLog;

  const handleOpenMailbox = openMailbox;
  const handleCloseMailbox = closeMailbox;

  // Mission link handler from TaskCard
  const handleOpenMission = openMissionById;

  // Git Manager handlers
  const handleOpenGitManager = openGitManager;
  const handleCloseGitManager = closeGitManager;

  // Agent handlers
  const handleCloseAgents = closeAgents;

  // Node management view handlers
  const handleOpenNodes = useCallback(() => {
    setNodesOpen((prev) => !prev);
  }, []);
  const handleCloseNodes = useCallback(() => {
    setNodesOpen(false);
  }, []);

  // Scripts handlers
  const handleOpenScripts = openScripts;
  const handleCloseScripts = closeScripts;
  const handleRunScript = runScript;

  // Terminal close handler
  const handleTerminalClose = closeTerminal;

  // Render main content based on view mode
  const renderMainContent = () => {
    if (nodesOpen) {
      return (
        <div className="nodes-management-overlay">
          <div className="nodes-management-overlay__header">
            <button className="btn btn-sm" onClick={handleCloseNodes}>Close Nodes</button>
          </div>
          <NodesView addToast={addToast} />
        </div>
      );
    }

    if (viewMode === "overview") {
      return (
        <ProjectOverview
          projects={projects}
          loading={projectsLoading}
          onSelectProject={handleSelectProject}
          onAddProject={handleAddProject}
          onPauseProject={handlePauseProject}
          onResumeProject={handleResumeProject}
          onRemoveProject={handleRemoveProject}
          nodes={nodes}
        />
      );
    }

    // Project view
    if (taskView === "agents") {
      return <AgentsView addToast={addToast} projectId={currentProject?.id} />;
    }

    if (taskView === "board") {
      return (
        <Board
          tasks={tasks}
          projectId={currentProject?.id}
          maxConcurrent={maxConcurrent}
          onMoveTask={moveTask}
          onOpenDetail={handleDetailOpen}
          addToast={addToast}
          onQuickCreate={handleBoardQuickCreate}
          onNewTask={handleNewTaskOpen}
          onPlanningMode={handleNewTaskPlanningMode}
          onSubtaskBreakdown={handleSubtaskBreakdown}
          autoMerge={autoMerge}
          onToggleAutoMerge={handleToggleAutoMerge}
          globalPaused={globalPaused}
          onUpdateTask={updateTask}
          onArchiveTask={archiveTask}
          onUnarchiveTask={unarchiveTask}
          onArchiveAllDone={archiveAllDone}
          searchQuery={searchQuery}
          availableModels={availableModels}
          onOpenDetailWithTab={handleOpenDetailWithTab}
          favoriteProviders={favoriteProviders}
          favoriteModels={favoriteModels}
          onToggleFavorite={handleToggleFavorite}
          onToggleModelFavorite={handleToggleModelFavorite}
          taskStuckTimeoutMs={taskStuckTimeoutMs}
          onOpenMission={handleOpenMission}
        />
      );
    }

    // List view
    return (
      <ListView
        tasks={tasks}
        projectId={currentProject?.id}
        onMoveTask={moveTask}
        onOpenDetail={handleDetailOpen}
        addToast={addToast}
        globalPaused={globalPaused}
        onNewTask={handleNewTaskOpen}
        onQuickCreate={handleBoardQuickCreate}
        onPlanningMode={handleNewTaskPlanningMode}
        onSubtaskBreakdown={handleSubtaskBreakdown}
        availableModels={availableModels}
        favoriteProviders={favoriteProviders}
        favoriteModels={favoriteModels}
        onToggleFavorite={handleToggleFavorite}
        onToggleModelFavorite={handleToggleModelFavorite}
        taskStuckTimeoutMs={taskStuckTimeoutMs}
      />
    );
  };

  return (
    <>
      <Header
        isElectron={isElectron}
        onOpenSettings={handleOpenSettings}
        onOpenGitHubImport={openGitHubImport}
        onOpenPlanning={handlePlanningOpen}
        onResumePlanning={handleResumePlanning}
        activePlanningSessionCount={bgPlanningSessions.length}
        onOpenUsage={handleOpenUsage}
        onOpenActivityLog={handleOpenActivityLog}
        onOpenMailbox={handleOpenMailbox}
        mailboxUnreadCount={mailboxUnreadCount}
        onOpenSchedules={handleOpenSchedules}
        onOpenGitManager={handleOpenGitManager}
        onOpenNodes={handleOpenNodes}
        onOpenWorkflowSteps={openWorkflowSteps}
        onOpenMissions={viewMode === "project" && currentProject ? openMissions : undefined}
        onOpenScripts={handleOpenScripts}
        onRunScript={handleRunScript}
        onToggleTerminal={handleToggleTerminal}
        onOpenFiles={handleOpenFiles}
        filesOpen={filesOpen}
        globalPaused={globalPaused}
        enginePaused={enginePaused}
        onToggleGlobalPause={handleToggleGlobalPause}
        onToggleEnginePause={handleToggleEnginePause}
        view={taskView}
        onChangeView={viewMode === "project" && currentProject ? handleChangeTaskView : undefined}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        projects={projects}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
        onViewAllProjects={handleViewAllProjects}
        projectId={currentProject?.id}
        mobileNavEnabled={isMobile}
      />
      <div
        className={`project-content${viewMode === "project" && currentProject ? " project-content--with-footer" : ""}${isMobile ? " project-content--with-mobile-nav" : ""}`}
      >
        {renderMainContent()}
      </div>
      {viewMode === "project" && currentProject && !nodesOpen && (
        <ExecutorStatusBar
          tasks={tasks}
          projectId={currentProject.id}
          taskStuckTimeoutMs={taskStuckTimeoutMs}
          backgroundSessions={bgSessions}
          backgroundGenerating={bgGenerating}
          backgroundNeedsInput={bgNeedsInput}
          onOpenBackgroundSession={(session) => {
            if (session.type === "planning") {
              openPlanningWithSession(session.id);
            } else if (session.type === "subtask") {
              openSubtaskWithSession(session.id);
            } else if (session.type === "mission_interview") {
              openMissionWithSession(session.id);
            }
          }}
          onDismissBackgroundSession={bgDismiss}
        />
      )}
      <MobileNavBar
        view={taskView}
        onChangeView={viewMode === "project" && currentProject ? handleChangeTaskView : () => {}}
        footerVisible={viewMode === "project" && !!currentProject}
        modalOpen={anyModalOpen}
        onOpenSettings={handleOpenSettings}
        onOpenActivityLog={handleOpenActivityLog}
        onOpenMailbox={handleOpenMailbox}
        mailboxUnreadCount={mailboxUnreadCount}
        onOpenGitManager={handleOpenGitManager}
        onOpenWorkflowSteps={openWorkflowSteps}
        onOpenMissions={viewMode === "project" && currentProject ? openMissions : undefined}
        onOpenSchedules={handleOpenSchedules}
        onOpenScripts={handleOpenScripts}
        onToggleTerminal={handleToggleTerminal}
        onOpenFiles={handleOpenFiles}
        onOpenGitHubImport={openGitHubImport}
        onOpenPlanning={handlePlanningOpen}
        onResumePlanning={handleResumePlanning}
        activePlanningSessionCount={bgPlanningSessions.length}
        onOpenUsage={handleOpenUsage}
        onRunScript={handleRunScript}
        projectId={currentProject?.id}
      />
      {viewMode === "project" && currentProject && (
        <QuickChatFAB projectId={currentProject.id} addToast={addToast} />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projectId={currentProject?.id}
          tasks={tasks}
          onClose={handleDetailClose}
          onOpenDetail={handleDetailOpen}
          onMoveTask={moveTask}
          onDeleteTask={deleteTask}
          onMergeTask={mergeTask}
          onRetryTask={retryTask}
          onDuplicateTask={duplicateTask}
          onTaskUpdated={updateDetailTask}
          addToast={addToast}
          githubTokenConfigured={githubTokenConfigured}
          initialTab={detailTaskInitialTab}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={closeSettings}
          addToast={addToast}
          initialSection={settingsInitialSection}
          projectId={currentProject?.id}
          themeMode={themeMode}
          colorTheme={colorTheme}
          onThemeModeChange={setThemeMode}
          onColorThemeChange={setColorTheme}
        />
      )}
      <GitHubImportModal
        isOpen={githubImportOpen}
        onClose={closeGitHubImport}
        onImport={handleGitHubImport}
        tasks={tasks}
      />
      <PlanningModeModal
        isOpen={isPlanningOpen}
        onClose={handlePlanningClose}
        onTaskCreated={handlePlanningTaskCreated}
        onTasksCreated={handlePlanningTasksCreated}
        tasks={tasks}
        initialPlan={planningInitialPlan ?? undefined}
        projectId={currentProject?.id}
        resumeSessionId={planningResumeSessionId}
      />
      <SubtaskBreakdownModal
        isOpen={isSubtaskOpen}
        onClose={handleSubtaskClose}
        initialDescription={subtaskInitialDescription ?? ""}
        onTasksCreated={handleSubtaskTasksCreated}
        projectId={currentProject?.id}
        resumeSessionId={subtaskResumeSessionId}
      />
      <TerminalModal
        isOpen={terminalOpen}
        onClose={handleTerminalClose}
        initialCommand={terminalInitialCommand}
      />
      <ScriptsModal
        isOpen={scriptsOpen}
        onClose={handleCloseScripts}
        addToast={addToast}
        onRunScript={handleRunScript}
        projectId={currentProject?.id}
      />
      {filesOpen && (
        <FileBrowserModal
          initialWorkspace={fileBrowserWorkspace}
          isOpen={true}
          onClose={closeFiles}
          onWorkspaceChange={handleWorkspaceChange}
        />
      )}
      <UsageIndicator
        isOpen={usageOpen}
        onClose={handleCloseUsage}
      />
      {schedulesOpen && (
        <ScheduledTasksModal
          onClose={handleCloseSchedules}
          addToast={addToast}
        />
      )}
      <NewTaskModal
        isOpen={newTaskModalOpen}
        onClose={handleNewTaskClose}
        tasks={tasks}
        onCreateTask={handleModalCreate}
        addToast={addToast}
        projectId={currentProject?.id}
        onPlanningMode={handleNewTaskPlanningMode}
        onSubtaskBreakdown={handleSubtaskBreakdown}
      />
      <ActivityLogModal
        isOpen={activityLogOpen}
        onClose={handleCloseActivityLog}
        tasks={tasks}
        projectId={currentProject?.id}
        projects={projects}
        currentProject={currentProject}
        onOpenTaskDetail={(taskId) => {
          const task = tasks.find((t) => t.id === taskId);
          if (task) {
            handleDetailOpen(task as TaskDetail);
          }
        }}
      />
      <GitManagerModal
        isOpen={gitManagerOpen}
        onClose={handleCloseGitManager}
        tasks={tasks}
        addToast={addToast}
      />
      <WorkflowStepManager
        isOpen={workflowStepsOpen}
        onClose={closeWorkflowSteps}
        addToast={addToast}
        projectId={currentProject?.id}
      />
      <MissionManager
        isOpen={missionsOpen}
        onClose={closeMissions}
        addToast={addToast}
        projectId={currentProject?.id}
        resumeSessionId={missionResumeSessionId}
        targetMissionId={missionTargetId}
        availableTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
        onSelectTask={(taskId) => {
          const task = tasks.find((t) => t.id === taskId);
          if (task) {
            openDetailTask(task as TaskDetail);
          }
        }}
      />
      <AgentListModal
        isOpen={agentsOpen}
        onClose={handleCloseAgents}
        addToast={addToast}
        projectId={currentProject?.id}
      />
      <MailboxModal
        isOpen={mailboxOpen}
        onClose={handleCloseMailbox}
        projectId={currentProject?.id}
        addToast={addToast}
        agents={mailboxAgents}
      />
      {setupWizardOpen && (
        <SetupWizardModal
          onProjectRegistered={handleSetupComplete}
          onClose={closeSetupWizard}
        />
      )}
      {modelOnboardingOpen && (
        <ModelOnboardingModal
          onComplete={handleModelOnboardingComplete}
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

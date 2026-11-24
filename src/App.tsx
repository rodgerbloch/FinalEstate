import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { auth, testConnection } from './firebase';
import {
  acceptCollaboratorInvitation,
  bulkCreateEstateTasks,
  createEstateTask,
  createTaskComment,
  declineCollaboratorInvitation,
  deleteEstateTask,
  deleteTaskComment,
  deleteVaultDocument,
  ensureUserAndStarterEstate,
  fetchVaultDocumentBlob,
  revokeCollaboratorInvitation,
  sendCollaboratorInvitation,
  subscribeEstateDoc,
  subscribeEstateDocuments,
  subscribeEstateMemberDoc,
  subscribeEstateMembers,
  subscribeEstateTasks,
  subscribeIncomingInvitations,
  subscribeOutgoingInvitations,
  subscribeOwnedEstates,
  subscribeTaskComments,
  updateEstateProfile,
  updateEstateTask,
  updateInvitationPermissions,
  updateTaskComment,
  updateVaultDocumentMetadata,
  uploadVaultDocument,
  type CreateTaskInput,
} from './services/estateService';
import type {
  CollaboratorPermission,
  CollaboratorRole,
  DocumentCategory,
  Estate,
  EstateMember,
  EstateStage,
  EstateTask,
  Invitation,
  NavSection,
  TaskCategory,
  TaskComment,
  TaskCommentKind,
  TaskPriority,
  TaskStatusBucket,
  VaultDocument,
} from './types/estate';
import {
  getDependentTasks,
  getTodayIso,
  isReminderActive,
  isReminderDueSoon,
  isTaskBlocked,
} from './utils/taskHelpers';
import { AiConsultantView } from './components/AiConsultantView';
import { AuthGate } from './components/AuthGate';
import { DocumentVault } from './components/DocumentVault';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EstateProfileModal } from './components/EstateProfileModal';
import { ExecutiveSummaryView } from './components/ExecutiveSummaryView';
import { ExecutorOnboardingTour } from './components/ExecutorOnboardingTour';
import { ExportReportModal, type ExportOptions } from './components/ExportReportModal';
import { PrintableReport } from './components/PrintableReport';
import { SharedAccessWorkspace } from './components/SharedAccessWorkspace';
import { ShareTaskModal } from './components/ShareTaskModal';
import { Sidebar } from './components/Sidebar';
import { TaskFormModal } from './components/TaskFormModal';
import { TaskInspector } from './components/TaskInspector';
import { TaskWorkspace } from './components/TaskWorkspace';
import { TopBar } from './components/TopBar';

function LedgerShell() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [bootingEstate, setBootingEstate] = useState(false);
  const [estateBootReady, setEstateBootReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [ownedEstates, setOwnedEstates] = useState<Estate[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<Invitation[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<Invitation[]>([]);

  const [activeEstateId, setActiveEstateId] = useState<string | null>(null);
  const [activeEstate, setActiveEstate] = useState<Estate | null>(null);
  const [activeMemberDoc, setActiveMemberDoc] = useState<EstateMember | null>(null);
  const [estateMembers, setEstateMembers] = useState<EstateMember[]>([]);
  const [tasks, setTasks] = useState<EstateTask[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<NavSection>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Modals
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EstateTask | null>(null);
  const [defaultTaskCategory, setDefaultTaskCategory] = useState<TaskCategory>('Assets');
  const [sharingTask, setSharingTask] = useState<EstateTask | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeCompleted: true,
    includeVault: true,
    includeInstructions: true,
  });
  const [tourOpen, setTourOpen] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);

  // Inspector file preview modal
  const [inspectorPreviewDoc, setInspectorPreviewDoc] = useState<VaultDocument | null>(null);
  const [inspectorPreviewUrl, setInspectorPreviewUrl] = useState<string | null>(null);
  const [inspectorPreviewText, setInspectorPreviewText] = useState<string | null>(null);

  // Notifications
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );
  const notifiedKeysRef = useRef<Set<string>>(new Set());

  const initializeUserEstate = async (targetUser: User) => {
    setBootError(null);
    setBootingEstate(true);
    setEstateBootReady(false);
    try {
      const defaultId = await ensureUserAndStarterEstate(targetUser);
      setActiveEstateId((prev) => prev || defaultId);
      setEstateBootReady(true);
    } catch (error) {
      setBootError(
        error instanceof Error
          ? error.message
          : 'Unable to initialize your Estate Ledger. Please try again.'
      );
    } finally {
      setBootingEstate(false);
    }
  };

  // 1. Test Firestore connectivity & watch auth state
  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setBootError(null);
      if (nextUser) {
        try {
          const seen = window.localStorage.getItem(`estate_ledger_tour_seen_${nextUser.uid}`) === '1';
          setTourDismissed(seen);
        } catch {
          setTourDismissed(false);
        }
        await initializeUserEstate(nextUser);
      } else {
        setEstateBootReady(false);
        setActiveEstateId(null);
        setActiveEstate(null);
        setTasks([]);
        setDocuments([]);
        setTourOpen(false);
        setTourDismissed(false);
      }
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to owned estates & invitations once signed in & estate boot finished
  useEffect(() => {
    if (!user || !estateBootReady) return;
    const unsubEstates = subscribeOwnedEstates(user.uid, (estates) => {
      setOwnedEstates(estates);
      if (estates.length > 0) {
        setActiveEstateId((prev) => prev || estates[0].id);
      }
    });
    const unsubOut = subscribeOutgoingInvitations(user.uid, setOutgoingInvites);
    const emailLower = (user.email || '').toLowerCase();
    const unsubIn = emailLower
      ? subscribeIncomingInvitations(emailLower, setIncomingInvites)
      : () => {};

    return () => {
      unsubEstates();
      unsubOut();
      unsubIn();
    };
  }, [user, estateBootReady]);

  // 3. Subscribe to active estate + membership + members + tasks + documents
  const isOwner = Boolean(user && activeEstate && activeEstate.ownerId === user.uid);

  useEffect(() => {
    if (!user || !estateBootReady || !activeEstateId) return;
    const unsubEstate = subscribeEstateDoc(activeEstateId, (est) => {
      setActiveEstate(est);
    });
    const unsubMember = subscribeEstateMemberDoc(activeEstateId, user.uid, (mem) => {
      setActiveMemberDoc(mem);
    });
    return () => {
      unsubEstate();
      unsubMember();
    };
  }, [user, estateBootReady, activeEstateId]);

  useEffect(() => {
    if (!user || !estateBootReady || !activeEstateId || !activeEstate) return;
    const ownerViewing = activeEstate.ownerId === user.uid;
    if (!ownerViewing && !activeMemberDoc) return;

    const restrictedTaskIds =
      !ownerViewing && activeMemberDoc && activeMemberDoc.taskIds.length > 0
        ? activeMemberDoc.taskIds
        : null;
    const ownerUidIfOwner = ownerViewing ? user.uid : null;

    const unsubTasks = subscribeEstateTasks(activeEstateId, ownerUidIfOwner, restrictedTaskIds, setTasks);
    const unsubDocs = subscribeEstateDocuments(activeEstateId, ownerUidIfOwner, setDocuments);
    const unsubMembers = ownerViewing
      ? subscribeEstateMembers(activeEstateId, user.uid, setEstateMembers)
      : () => {};

    return () => {
      unsubTasks();
      unsubDocs();
      unsubMembers();
    };
  }, [user, estateBootReady, activeEstateId, activeEstate, activeMemberDoc]);

  // 4. Subscribe to real-time collaborator comments for the currently inspected task
  const inspectedTaskId =
    activeNav === 'tasks' && selectedTaskId && tasks.some((t) => t.id === selectedTaskId)
      ? selectedTaskId
      : null;

  useEffect(() => {
    if (!user || !estateBootReady || !activeEstateId || !activeEstate || !inspectedTaskId) {
      setTaskComments([]);
      return;
    }
    const ownerUidIfOwner = activeEstate.ownerId === user.uid ? user.uid : null;
    const unsub = subscribeTaskComments(activeEstateId, inspectedTaskId, ownerUidIfOwner, setTaskComments);
    return () => unsub();
  }, [user, estateBootReady, activeEstateId, activeEstate, inspectedTaskId]);

  const canEdit = Boolean(
    isOwner || (activeMemberDoc && activeMemberDoc.permission === 'View & Update')
  );

  const currentAuthorRole = isOwner
    ? 'Estate Owner'
    : activeMemberDoc?.role || 'Collaborator';

  // Build switcher list of owned + accepted shared estates
  const allAccessibleEstates = useMemo(() => {
    const owned = ownedEstates.map((e) => ({
      id: e.id,
      title: e.title,
      isOwner: true,
      roleLabel: 'Owner',
    }));
    const shared = incomingInvites
      .filter((i) => i.status === 'accepted' && !owned.some((o) => o.id === i.estateId))
      .map((i) => ({
        id: i.estateId,
        title: i.estateTitle,
        isOwner: false,
        roleLabel: i.role,
      }));
    return [...owned, ...shared];
  }, [ownedEstates, incomingInvites]);

  // Due & active reminders monitor
  const activeRemindersCount = useMemo(
    () => tasks.filter((t) => isReminderActive(t)).length,
    [tasks]
  );

  const dueReminders = useMemo(
    () => tasks.filter((t) => isReminderDueSoon(t)),
    [tasks]
  );

  useEffect(() => {
    const checkAndNotify = () => {
      if (notifPermission !== 'granted') return;
      const now = new Date();
      for (const t of tasks) {
        if (isReminderDueSoon(t, now)) {
          const key = `${t.id}_${t.reminderAt}`;
          if (!notifiedKeysRef.current.has(key)) {
            notifiedKeysRef.current.add(key);
            try {
              new Notification(`Estate Ledger Reminder: ${t.title}`, {
                body: `${t.category} · ${t.timingLabel || 'Action needed'}`,
              });
            } catch {
              // Ignore browser environments restricting Notification constructor
            }
          }
        }
      }
    };
    checkAndNotify();
    const timer = window.setInterval(checkAndNotify, 30000);
    return () => window.clearInterval(timer);
  }, [tasks, notifPermission]);

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await window.Notification.requestPermission();
    setNotifPermission(perm);
  };

  // Handlers
  const handleToggleComplete = async (task: EstateTask) => {
    if (!activeEstateId || !canEdit) return;
    const nextCompleted = !task.completed;
    if (nextCompleted && isTaskBlocked(task, tasks)) {
      setSelectedTaskId(task.id);
      return;
    }
    await updateEstateTask(activeEstateId, task.id, {
      completed: nextCompleted,
      completedAt: nextCompleted ? new Date().toISOString() : '',
    });
  };

  const handleMoveTaskCategory = async (task: EstateTask, targetCategory: TaskCategory) => {
    if (!activeEstateId || !canEdit || task.category === targetCategory) return;
    await updateEstateTask(activeEstateId, task.id, {
      category: targetCategory,
    });
  };

  const handleUpdateTaskPriority = async (task: EstateTask, priority: TaskPriority) => {
    if (!activeEstateId || !canEdit || task.priority === priority) return;
    await updateEstateTask(activeEstateId, task.id, { priority });
  };

  const handleMoveTaskStatus = async (task: EstateTask, targetStatus: TaskStatusBucket) => {
    if (!activeEstateId || !canEdit) return;
    const todayIso = getTodayIso();
    const offsetDate = (days: number) => {
      const d = new Date(`${todayIso}T00:00:00`);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    if (targetStatus === 'completed') {
      if (isTaskBlocked(task, tasks)) {
        setSelectedTaskId(task.id);
        return;
      }
      await updateEstateTask(activeEstateId, task.id, {
        completed: true,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    if (targetStatus === 'past_due') {
      const nextDueDate = task.dueDate && task.dueDate < todayIso ? task.dueDate : offsetDate(-1);
      await updateEstateTask(activeEstateId, task.id, {
        completed: false,
        completedAt: '',
        dueDate: nextDueDate,
      });
      return;
    }

    if (targetStatus === 'upcoming') {
      const limit14 = offsetDate(14);
      const isAlreadyUpcoming = task.dueDate && task.dueDate >= todayIso && task.dueDate <= limit14;
      const nextDueDate = isAlreadyUpcoming ? task.dueDate : offsetDate(7);
      await updateEstateTask(activeEstateId, task.id, {
        completed: false,
        completedAt: '',
        dueDate: nextDueDate,
      });
      return;
    }

    // targetStatus === 'outstanding'
    const limit14 = offsetDate(14);
    const keepFarDueDate = task.dueDate && task.dueDate > limit14 ? task.dueDate : '';
    await updateEstateTask(activeEstateId, task.id, {
      completed: false,
      completedAt: '',
      dueDate: keepFarDueDate,
    });
  };

  const handleSaveTaskModal = async (input: CreateTaskInput) => {
    if (!activeEstate || !user) return;
    if (editingTask) {
      await updateEstateTask(activeEstate.id, editingTask.id, {
        ...input,
        reminderDismissed: input.reminderAt !== editingTask.reminderAt ? false : editingTask.reminderDismissed,
      });
    } else {
      const createdId = await createEstateTask(
        activeEstate.id,
        activeEstate.ownerId,
        user.uid,
        input
      );
      setSelectedTaskId(createdId);
    }
  };

  const handleInspectorPreview = async (docItem: VaultDocument) => {
    if (!activeEstateId) return;
    setInspectorPreviewDoc(docItem);
    setInspectorPreviewUrl(null);
    setInspectorPreviewText(null);
    const blob = await fetchVaultDocumentBlob(activeEstateId, docItem);
    if (
      docItem.mimeType.startsWith('text/') ||
      docItem.name.endsWith('.csv') ||
      docItem.name.endsWith('.txt') ||
      docItem.name.endsWith('.md') ||
      docItem.name.endsWith('.json')
    ) {
      setInspectorPreviewText(await blob.text());
    } else {
      setInspectorPreviewUrl(URL.createObjectURL(blob));
    }
  };

  const closeInspectorPreview = () => {
    if (inspectorPreviewUrl) URL.revokeObjectURL(inspectorPreviewUrl);
    setInspectorPreviewDoc(null);
    setInspectorPreviewUrl(null);
    setInspectorPreviewText(null);
  };

  const handleDownloadDoc = async (docItem: VaultDocument) => {
    if (!activeEstateId) return;
    const blob = await fetchVaultDocumentBlob(activeEstateId, docItem);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docItem.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FBF9F4] flex items-center justify-center text-sm text-[#56635C]">
        Loading Estate Ledger...
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-[#FBF9F4] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white border border-[#E5E0D5] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="font-display text-xl font-semibold text-[#1C2420]">
            Unable to Open Estate Ledger
          </div>
          <p className="text-sm text-[#56635C]">
            We ran into a permission or connection issue while preparing your ledger. Please try again.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => initializeUserEstate(user)}
              className="px-4 py-2 rounded-lg bg-[#1F3A2E] text-white text-sm font-medium hover:bg-[#172C23] transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="px-4 py-2 rounded-lg border border-[#E5E0D5] text-[#1C2420] text-sm font-medium hover:bg-[#F6F3EC] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bootingEstate || !activeEstate) {
    return (
      <div className="min-h-screen bg-[#FBF9F4] flex flex-col items-center justify-center p-6 text-center space-y-2">
        <div className="font-display text-xl font-semibold text-[#1C2420]">
          Preparing Your Estate Ledger
        </div>
        <p className="text-sm text-[#56635C]">
          Syncing your seven-category playbook and document vault...
        </p>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.completed).length;
  const pendingIncomingCount = incomingInvites.filter((i) => i.status === 'pending').length;
  const inspectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  return (
    <>
      <div id="app-shell" className="h-screen flex overflow-hidden bg-[#FBF9F4]">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          activeNav={activeNav}
          onSelectNav={setActiveNav}
          estate={activeEstate}
          allEstates={allAccessibleEstates}
          onSwitchEstate={(id) => {
            setSelectedTaskId(null);
            setActiveEstateId(id);
          }}
          onOpenNewTask={() => {
            setEditingTask(null);
            setDefaultTaskCategory('Assets');
            setTaskModalOpen(true);
          }}
          onEditEstateProfile={() => setProfileModalOpen(true)}
          canEdit={canEdit}
          isOwner={isOwner}
          completedCount={completedCount}
          totalCount={tasks.length}
          pendingInvitesCount={pendingIncomingCount}
          activeRemindersCount={activeRemindersCount}
          userEmail={user.email || ''}
          userName={user.displayName || 'Account Holder'}
          userPhoto={user.photoURL || ''}
          onOpenTour={() => setTourOpen(true)}
          onSignOut={() => signOut(auth)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            estate={activeEstate}
            activeNav={activeNav}
            isOwner={isOwner}
            onChangeStage={(stage: EstateStage) =>
              updateEstateProfile(activeEstate.id, { activeStage: stage })
            }
            onOpenExportModal={() => setExportModalOpen(true)}
            dueReminders={dueReminders}
            onInspectTask={(tid) => {
              setActiveNav('tasks');
              setSelectedTaskId(tid);
            }}
            onDismissReminder={(tid) =>
              updateEstateTask(activeEstate.id, tid, { reminderDismissed: true })
            }
            notificationPermission={notifPermission}
            onRequestNotificationPermission={handleRequestNotifications}
          />

          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="max-w-[1280px] mx-auto h-full">
                {activeNav === 'tasks' && (
                  <TaskWorkspace
                    estateTitle={activeEstate.title}
                    principalName={activeEstate.principalName}
                    activeStage={activeEstate.activeStage}
                    estateNotes={activeEstate.notes}
                    tasks={tasks}
                    documents={documents}
                    selectedTaskId={selectedTaskId}
                    canEdit={canEdit}
                    onSelectTask={(tid) => setSelectedTaskId(tid)}
                    onToggleComplete={handleToggleComplete}
                    onUpdateTaskPriority={handleUpdateTaskPriority}
                    onOpenNewTask={(cat) => {
                      setEditingTask(null);
                      setDefaultTaskCategory(cat || 'Assets');
                      setTaskModalOpen(true);
                    }}
                    onQuickCreateTask={(input) =>
                      createEstateTask(
                        activeEstate.id,
                        activeEstate.ownerId,
                        user.uid,
                        input
                      )
                    }
                    onMoveTaskCategory={handleMoveTaskCategory}
                    onMoveTaskStatus={handleMoveTaskStatus}
                    onImportTasks={(items) =>
                      bulkCreateEstateTasks(
                        activeEstate.id,
                        activeEstate.ownerId,
                        user.uid,
                        items
                      )
                    }
                    showTourBanner={!tourDismissed}
                    onStartTour={() => setTourOpen(true)}
                    onDismissTourBanner={() => {
                      setTourDismissed(true);
                      try {
                        window.localStorage.setItem(`estate_ledger_tour_seen_${user.uid}`, '1');
                      } catch {
                        // Ignore storage failures
                      }
                    }}
                  />
                )}

                {activeNav === 'vault' && (
                  <DocumentVault
                    documents={documents}
                    tasks={tasks}
                    canEdit={canEdit}
                    onUploadDocument={async (file, category, taskId, notes) => {
                      await uploadVaultDocument(
                        activeEstate.id,
                        activeEstate.ownerId,
                        user,
                        file,
                        category,
                        taskId,
                        notes
                      );
                    }}
                    onUpdateDocument={(docId, updates) =>
                      updateVaultDocumentMetadata(activeEstate.id, docId, updates)
                    }
                    onDeleteDocument={(docId) =>
                      deleteVaultDocument(activeEstate.id, docId, activeEstate.ownerId)
                    }
                    onFetchBlob={(docItem) => fetchVaultDocumentBlob(activeEstate.id, docItem)}
                  />
                )}

                {activeNav === 'sharing' && (
                  <SharedAccessWorkspace
                    estate={activeEstate}
                    isOwner={isOwner}
                    tasks={tasks}
                    members={estateMembers}
                    outgoingInvitations={outgoingInvites}
                    incomingInvitations={incomingInvites}
                    onSendInvite={async (email, role, permission, taskIds) => {
                      await sendCollaboratorInvitation(
                        activeEstate,
                        email,
                        role,
                        permission,
                        taskIds,
                        tasks
                      );
                    }}
                    onUpdateInvite={(inv, role, perm) =>
                      updateInvitationPermissions(inv, role, perm)
                    }
                    onRevokeInvite={(inv) => revokeCollaboratorInvitation(inv)}
                    onAcceptIncoming={async (inv) => {
                      await acceptCollaboratorInvitation(inv, user);
                      setActiveEstateId(inv.estateId);
                    }}
                    onDeclineIncoming={(inv) => declineCollaboratorInvitation(inv, user)}
                    onSwitchEstate={(id) => {
                      setSelectedTaskId(null);
                      setActiveEstateId(id);
                      setActiveNav('tasks');
                    }}
                  />
                )}

                {activeNav === 'summary' && (
                  <ExecutiveSummaryView
                    estate={activeEstate}
                    tasks={tasks}
                    documents={documents}
                    canEdit={canEdit}
                    onInspectTask={(tid) => {
                      setActiveNav('tasks');
                      setSelectedTaskId(tid);
                    }}
                    onNavigateVault={() => setActiveNav('vault')}
                    onSaveSummaryToVault={async (file, notes) => {
                      await uploadVaultDocument(
                        activeEstate.id,
                        activeEstate.ownerId,
                        user,
                        file,
                        'General',
                        '',
                        notes
                      );
                    }}
                  />
                )}

                {activeNav === 'consultant' && (
                  <AiConsultantView
                    estate={activeEstate}
                    tasks={tasks}
                    documents={documents}
                  />
                )}
              </div>
            </main>

            {/* Right-side Docked Task Inspector (Desktop) / Modal (< 1024px) */}
            {activeNav === 'tasks' && inspectedTask && (
              <TaskInspector
                task={inspectedTask}
                allTasks={tasks}
                comments={taskComments}
                currentUserUid={user.uid}
                linkedDocs={documents.filter((d) => d.taskId === inspectedTask.id)}
                canEdit={canEdit}
                isOwner={isOwner}
                onClose={() => setSelectedTaskId(null)}
                onSelectTask={(tid) => setSelectedTaskId(tid)}
                onToggleComplete={handleToggleComplete}
                onSaveNotes={(tid, notes) =>
                  updateEstateTask(activeEstate.id, tid, { executorNotes: notes })
                }
                onUpdateReminder={(tid, reminderAt) =>
                  updateEstateTask(activeEstate.id, tid, {
                    reminderAt,
                    reminderDismissed: false,
                  })
                }
                onUpdatePrerequisites={(tid, prerequisiteTaskIds) =>
                  updateEstateTask(activeEstate.id, tid, { prerequisiteTaskIds })
                }
                onAddComment={async (tid, kind: TaskCommentKind, body: string) => {
                  await createTaskComment(
                    activeEstate.id,
                    activeEstate.ownerId,
                    tid,
                    user,
                    currentAuthorRole,
                    kind,
                    body
                  );
                }}
                onUpdateComment={(tid, cid, kind: TaskCommentKind, body: string) =>
                  updateTaskComment(activeEstate.id, tid, cid, kind, body)
                }
                onDeleteComment={(tid, cid) =>
                  deleteTaskComment(activeEstate.id, tid, cid)
                }
                onEditTask={(t) => {
                  setEditingTask(t);
                  setTaskModalOpen(true);
                }}
                onDeleteTask={async (tid) => {
                  await deleteEstateTask(
                    activeEstate.id,
                    tid,
                    getDependentTasks(tid, tasks),
                    activeEstate.ownerId
                  );
                  setSelectedTaskId(null);
                }}
                onShareTask={(t) => setSharingTask(t)}
                onUploadFileToTask={async (file, t) => {
                  await uploadVaultDocument(
                    activeEstate.id,
                    activeEstate.ownerId,
                    user,
                    file,
                    t.category as DocumentCategory,
                    t.id,
                    `Attached to task: ${t.title}`
                  );
                }}
                onPreviewDocument={handleInspectorPreview}
                onDownloadDocument={handleDownloadDoc}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {taskModalOpen && (
        <TaskFormModal
          initialTask={editingTask}
          allTasks={tasks}
          defaultStage={activeEstate.activeStage}
          defaultCategory={defaultTaskCategory}
          onClose={() => {
            setTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTaskModal}
        />
      )}

      {sharingTask && (
        <ShareTaskModal
          task={sharingTask}
          onClose={() => setSharingTask(null)}
          onSendInvite={async (
            email: string,
            role: CollaboratorRole,
            permission: CollaboratorPermission,
            taskIds: string[]
          ) => {
            await sendCollaboratorInvitation(
              activeEstate,
              email,
              role,
              permission,
              taskIds,
              tasks
            );
          }}
        />
      )}

      {exportModalOpen && (
        <ExportReportModal
          estate={activeEstate}
          tasks={tasks}
          documents={documents}
          options={exportOptions}
          onChangeOptions={setExportOptions}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {profileModalOpen && (
        <EstateProfileModal
          estate={activeEstate}
          onClose={() => setProfileModalOpen(false)}
          onSave={(updates) => updateEstateProfile(activeEstate.id, updates)}
        />
      )}

      {inspectorPreviewDoc && (
        <div className="fixed inset-0 z-50 bg-[#1C2420]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between gap-4">
              <div className="font-semibold text-sm text-[#1C2420] truncate">
                {inspectorPreviewDoc.name}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadDoc(inspectorPreviewDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closeInspectorPreview}
                  className="p-1.5 text-[#56635C] hover:text-[#1C2420] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#F4EFE4] p-4 flex items-center justify-center">
              {inspectorPreviewText !== null ? (
                <pre className="w-full h-full bg-white border border-[#E4DFD3] rounded-lg p-4 text-xs font-mono text-[#1C2420] overflow-auto whitespace-pre-wrap">
                  {inspectorPreviewText}
                </pre>
              ) : inspectorPreviewUrl && inspectorPreviewDoc.mimeType.startsWith('image/') ? (
                <img
                  src={inspectorPreviewUrl}
                  alt={inspectorPreviewDoc.name}
                  className="max-w-full max-h-full object-contain rounded border border-[#E4DFD3] bg-white"
                />
              ) : inspectorPreviewUrl && inspectorPreviewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={inspectorPreviewUrl}
                  title={inspectorPreviewDoc.name}
                  className="w-full h-full rounded border border-[#E4DFD3] bg-white"
                />
              ) : (
                <div className="bg-white border border-[#E4DFD3] rounded-xl p-8 text-center space-y-3">
                  <FileSpreadsheet className="w-8 h-8 text-[#1B4332] mx-auto" />
                  <p className="text-sm text-[#1C2420]">
                    Download to view {inspectorPreviewDoc.name}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tourOpen && (
        <ExecutorOnboardingTour
          estate={activeEstate}
          tasks={tasks}
          documentsCount={documents.length}
          isOwner={isOwner}
          onSelectNav={setActiveNav}
          onChangeStage={(stage: EstateStage) =>
            updateEstateProfile(activeEstate.id, { activeStage: stage })
          }
          onSelectTask={(tid) => {
            setActiveNav('tasks');
            setSelectedTaskId(tid);
          }}
          onOpenExportModal={() => setExportModalOpen(true)}
          onCompleteTour={() => {
            setTourOpen(false);
            setTourDismissed(true);
            setActiveNav('tasks');
            try {
              window.localStorage.setItem(`estate_ledger_tour_seen_${user.uid}`, '1');
            } catch {
              // Ignore storage failures
            }
          }}
          onCloseTour={() => {
            setTourOpen(false);
            setTourDismissed(true);
            try {
              window.localStorage.setItem(`estate_ledger_tour_seen_${user.uid}`, '1');
            } catch {
              // Ignore storage failures
            }
          }}
        />
      )}

      {/* Printable Legal Meeting Briefing (visible only in @media print) */}
      <PrintableReport
        estate={activeEstate}
        tasks={tasks}
        documents={documents}
        options={exportOptions}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LedgerShell />
    </ErrorBoundary>
  );
}

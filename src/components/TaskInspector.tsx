import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  GitBranch,
  HelpCircle,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  EstateTask,
  TaskComment,
  TaskCommentKind,
  VaultDocument,
} from '../types/estate';
import {
  computeTaskStatus,
  formatBytes,
  formatDateTime,
  formatFirestoreTimestamp,
  formatShortDate,
  getDependentTasks,
  getFirestoreTimestampMillis,
  getTaskPrerequisites,
  wouldCreatePrerequisiteCycle,
} from '../utils/taskHelpers';

interface TaskInspectorProps {
  task: EstateTask;
  allTasks: EstateTask[];
  comments: TaskComment[];
  currentUserUid: string;
  linkedDocs: VaultDocument[];
  canEdit: boolean;
  isOwner: boolean;
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
  onToggleComplete: (task: EstateTask) => Promise<void>;
  onSaveNotes: (taskId: string, notes: string) => Promise<void>;
  onUpdateReminder: (taskId: string, reminderAt: string) => Promise<void>;
  onUpdatePrerequisites: (taskId: string, prerequisiteTaskIds: string[]) => Promise<void>;
  onAddComment: (taskId: string, kind: TaskCommentKind, body: string) => Promise<void>;
  onUpdateComment: (
    taskId: string,
    commentId: string,
    kind: TaskCommentKind,
    body: string
  ) => Promise<void>;
  onDeleteComment: (taskId: string, commentId: string) => Promise<void>;
  onEditTask: (task: EstateTask) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onShareTask: (task: EstateTask) => void;
  onUploadFileToTask: (file: File, task: EstateTask) => Promise<void>;
  onPreviewDocument: (doc: VaultDocument) => void;
  onDownloadDocument: (doc: VaultDocument) => void;
}

export function TaskInspector({
  task,
  allTasks,
  comments,
  currentUserUid,
  linkedDocs,
  canEdit,
  isOwner,
  onClose,
  onSelectTask,
  onToggleComplete,
  onSaveNotes,
  onUpdateReminder,
  onUpdatePrerequisites,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onEditTask,
  onDeleteTask,
  onShareTask,
  onUploadFileToTask,
  onPreviewDocument,
  onDownloadDocument,
}: TaskInspectorProps) {
  const [notesDraft, setNotesDraft] = useState(task.executorNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState(false);
  const [reminderDraft, setReminderDraft] = useState(task.reminderAt);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [prereqPickerOpen, setPrereqPickerOpen] = useState(false);
  const [prereqSearch, setPrereqSearch] = useState('');
  const [savingPrereqs, setSavingPrereqs] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentKind, setCommentKind] = useState<TaskCommentKind>('note');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [editCommentKind, setEditCommentKind] = useState<TaskCommentKind>('note');
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);

  useEffect(() => {
    setNotesDraft(task.executorNotes);
    setReminderDraft(task.reminderAt);
    setConfirmDelete(false);
    setPrereqPickerOpen(false);
    setPrereqSearch('');
    setCommentBody('');
    setCommentKind('note');
    setCommentError('');
    setEditingCommentId(null);
  }, [task.id, task.executorNotes, task.reminderAt]);

  const status = computeTaskStatus(task);
  const statusLabel =
    status === 'completed'
      ? 'Completed'
      : status === 'past_due'
      ? 'Past Due'
      : status === 'upcoming'
      ? 'Upcoming (14d)'
      : 'Outstanding';

  const prerequisites = useMemo(
    () => getTaskPrerequisites(task, allTasks),
    [task, allTasks]
  );

  const blockingPrereqs = useMemo(
    () => prerequisites.filter((p) => !p.completed),
    [prerequisites]
  );

  const dependentTasks = useMemo(
    () => getDependentTasks(task.id, allTasks),
    [task.id, allTasks]
  );

  const isCompletionBlocked = !task.completed && blockingPrereqs.length > 0;

  const eligibleCandidates = useMemo(() => {
    const currentSet = new Set(task.prerequisiteTaskIds || []);
    const q = prereqSearch.trim().toLowerCase();
    return allTasks
      .filter((candidate) => {
        if (candidate.id === task.id || currentSet.has(candidate.id)) return false;
        if (wouldCreatePrerequisiteCycle(task.id, candidate.id, allTasks)) return false;
        if (q) {
          const hay = `${candidate.title} ${candidate.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.title.localeCompare(b.title);
      });
  }, [allTasks, task.id, task.prerequisiteTaskIds, prereqSearch]);

  const handleAddPrerequisite = async (prereqId: string) => {
    if (!canEdit || savingPrereqs) return;
    if (wouldCreatePrerequisiteCycle(task.id, prereqId, allTasks)) return;
    setSavingPrereqs(true);
    try {
      const next = Array.from(new Set([...(task.prerequisiteTaskIds || []), prereqId]));
      await onUpdatePrerequisites(task.id, next);
      setPrereqPickerOpen(false);
      setPrereqSearch('');
    } finally {
      setSavingPrereqs(false);
    }
  };

  const handleRemovePrerequisite = async (prereqId: string) => {
    if (!canEdit || savingPrereqs) return;
    setSavingPrereqs(true);
    try {
      const next = (task.prerequisiteTaskIds || []).filter((id) => id !== prereqId);
      await onUpdatePrerequisites(task.id, next);
    } finally {
      setSavingPrereqs(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(task.id, notesDraft);
      setNotesSavedAt(true);
      setTimeout(() => setNotesSavedAt(false), 2000);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleReminderChange = async (nextVal: string) => {
    setReminderDraft(nextVal);
    await onUpdateReminder(task.id, nextVal);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUploadFileToTask(file, task);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePostComment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed || postingComment) return;
    setPostingComment(true);
    setCommentError('');
    try {
      await onAddComment(task.id, commentKind, trimmed);
      setCommentBody('');
      setCommentKind('note');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to post message.');
    } finally {
      setPostingComment(false);
    }
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    const trimmed = editCommentBody.trim();
    if (!trimmed || savingCommentEdit) return;
    setSavingCommentEdit(true);
    setCommentError('');
    try {
      await onUpdateComment(task.id, commentId, editCommentKind, trimmed);
      setEditingCommentId(null);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Unable to update message.');
    } finally {
      setSavingCommentEdit(false);
    }
  };

  const inspectorBody = (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#56635C] flex-wrap">
            <span className="font-medium text-[#1B4332]">{task.category}</span>
            <span aria-hidden="true">·</span>
            <span>{task.stage}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-medium ${
                isCompletionBlocked
                  ? 'text-[#B42318]'
                  : status === 'past_due'
                  ? 'text-[#B42318]'
                  : status === 'upcoming'
                  ? 'text-[#B45309]'
                  : status === 'completed'
                  ? 'text-[#1B5E3A]'
                  : 'text-[#4F5B54]'
              }`}
            >
              {isCompletionBlocked ? 'Blocked by Dependency' : statusLabel}
            </span>
          </div>
          <h2 className="font-display text-lg font-semibold text-[#1C2420] leading-snug">
            {task.title}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="p-1.5 text-[#56635C] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded-lg shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Completion & Actions Row */}
        <div className="space-y-2.5 pb-4 border-b border-[#E4DFD3]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={!canEdit || isCompletionBlocked}
              onClick={() => {
                if (canEdit && !isCompletionBlocked) {
                  onToggleComplete(task);
                }
              }}
              title={
                isCompletionBlocked
                  ? `Resolve ${blockingPrereqs.length} blocking pre-requisite task(s) first`
                  : undefined
              }
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                isCompletionBlocked
                  ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318] cursor-not-allowed'
                  : task.completed
                  ? 'bg-[#ECFDF3] border-[#ABEFC6] text-[#1B5E3A]'
                  : 'bg-[#FBF9F4] border-[#E4DFD3] text-[#1C2420] hover:bg-[#F4EFE4]'
              } ${
                !canEdit
                  ? 'opacity-60 cursor-not-allowed'
                  : isCompletionBlocked
                  ? 'cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              {isCompletionBlocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isCompletionBlocked
                ? `Blocked (${blockingPrereqs.length} pending)`
                : task.completed
                ? 'Marked Complete'
                : 'Mark Complete'}
            </button>

            <div className="flex items-center gap-2">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => onShareTask(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4F5B54] hover:text-[#1C2420] border border-[#E4DFD3] rounded-lg hover:bg-[#FBF9F4] whitespace-nowrap cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEditTask(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4F5B54] hover:text-[#1C2420] border border-[#E4DFD3] rounded-lg hover:bg-[#FBF9F4] whitespace-nowrap cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {isCompletionBlocked && (
            <p className="text-[11px] text-[#B42318] leading-relaxed">
              Completion is locked until {blockingPrereqs.length} blocking pre-requisite{' '}
              {blockingPrereqs.length === 1 ? 'task is' : 'tasks are'} resolved below.
            </p>
          )}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[#78827B] mb-0.5">Priority</div>
            <div className="font-semibold text-[#1C2420]">{task.priority} Priority</div>
          </div>
          <div>
            <div className="text-[#78827B] mb-0.5">Timing Guidance</div>
            <div className="font-medium text-[#1C2420]">{task.timingLabel || 'Flexible'}</div>
          </div>
          <div>
            <div className="text-[#78827B] mb-0.5">Due Date</div>
            <div className="font-mono text-[#1C2420] tabular-nums inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#56635C]" />
              {task.dueDate ? formatShortDate(task.dueDate) : 'Unscheduled'}
            </div>
          </div>
          <div>
            <div className="text-[#78827B] mb-0.5">Collaborators</div>
            <div className="font-medium text-[#1C2420] inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#56635C]" />
              {task.sharedWithEmails.length > 0
                ? `${task.sharedWithEmails.length} shared`
                : 'Estate-wide'}
            </div>
          </div>
        </div>

        {/* Pre-requisite Tasks & Visual Dependency Link */}
        <div
          className={`p-4 rounded-xl border space-y-3 ${
            isCompletionBlocked
              ? 'bg-[#FEF3F2]/50 border-[#FECDCA]'
              : 'bg-[#FBF9F4] border-[#E4DFD3]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch
                className={`w-3.5 h-3.5 shrink-0 ${
                  isCompletionBlocked ? 'text-[#B42318]' : 'text-[#1B4332]'
                }`}
              />
              <span className="text-xs font-semibold text-[#1C2420]">
                Pre-requisite Tasks
              </span>
              {prerequisites.length > 0 && (
                <span
                  className={`font-mono text-[11px] font-medium tabular-nums ${
                    blockingPrereqs.length > 0 ? 'text-[#B42318]' : 'text-[#1B5E3A]'
                  }`}
                >
                  {blockingPrereqs.length > 0
                    ? `${blockingPrereqs.length} blocking`
                    : `${prerequisites.length} resolved`}
                </span>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={() => setPrereqPickerOpen((prev) => !prev)}
                disabled={savingPrereqs}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#1B4332] bg-white hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                {prereqPickerOpen ? 'Close' : 'Add Pre-requisite'}
              </button>
            )}
          </div>

          {/* Inline Pre-requisite Selector */}
          {prereqPickerOpen && canEdit && (
            <div className="p-2.5 bg-white border border-[#D7CFC0] rounded-lg space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#78827B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={prereqSearch}
                  onChange={(e) => setPrereqSearch(e.target.value)}
                  placeholder="Search estate tasks to link as pre-requisite..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
                />
              </div>

              <div className="max-h-44 overflow-y-auto divide-y divide-[#EFECE4]">
                {eligibleCandidates.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-[#78827B]">
                    No eligible tasks available (circular dependencies are prevented).
                  </p>
                ) : (
                  eligibleCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={savingPrereqs}
                      onClick={() => handleAddPrerequisite(candidate.id)}
                      className="w-full text-left px-2 py-2 hover:bg-[#F4EFE4] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#1C2420] truncate">
                          {candidate.title}
                        </div>
                        <div className="text-[11px] text-[#56635C]">
                          {candidate.category} ·{' '}
                          {candidate.completed ? 'Completed' : 'Open'}
                        </div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-[#1B4332] shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Visual Dependency Chain */}
          {prerequisites.length === 0 ? (
            <p className="text-xs text-[#56635C]">
              No pre-requisite tasks defined. This task can be completed independently.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="relative pl-5 space-y-2">
                {/* Vertical visual link rail */}
                <div
                  aria-hidden="true"
                  className={`absolute left-[7px] top-3 bottom-3 w-px ${
                    blockingPrereqs.length > 0 ? 'bg-[#F09A92]' : 'bg-[#86CFAC]'
                  }`}
                />

                {prerequisites.map((prereq) => {
                  const isBlocking = !prereq.completed;
                  return (
                    <div key={prereq.id} className="relative flex items-stretch gap-2">
                      {/* Node Dot on Visual Rail */}
                      <span
                        aria-hidden="true"
                        className={`absolute -left-5 top-3.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center bg-white ${
                          isBlocking ? 'border-[#B42318]' : 'border-[#1B5E3A]'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isBlocking ? 'bg-[#B42318]' : 'bg-[#1B5E3A]'
                          }`}
                        />
                      </span>

                      <div
                        className={`flex-1 rounded-lg border p-2.5 transition-colors flex items-start justify-between gap-2 ${
                          isBlocking
                            ? 'bg-white border-[#FECDCA]'
                            : 'bg-[#ECFDF3]/70 border-[#ABEFC6]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectTask(prereq.id)}
                          className="min-w-0 flex-1 text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            {isBlocking ? (
                              <Lock className="w-3 h-3 text-[#B42318] shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-[#1B5E3A] shrink-0" />
                            )}
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide ${
                                isBlocking ? 'text-[#B42318]' : 'text-[#1B5E3A]'
                              }`}
                            >
                              {isBlocking ? 'Blocking' : 'Resolved'}
                            </span>
                            <span className="text-[11px] text-[#78827B] truncate">
                              · {prereq.category}
                            </span>
                          </div>
                          <div
                            className={`text-xs font-medium mt-0.5 leading-snug group-hover:underline ${
                              prereq.completed
                                ? 'line-through text-[#4F5B54]'
                                : 'text-[#1C2420]'
                            }`}
                          >
                            {prereq.title}
                          </div>
                          {prereq.dueDate && !prereq.completed && (
                            <div className="text-[11px] font-mono text-[#56635C] tabular-nums mt-0.5">
                              Due {formatShortDate(prereq.dueDate)}
                            </div>
                          )}
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectTask(prereq.id)}
                            title="Inspect pre-requisite task"
                            className="p-1 text-[#4F5B54] hover:text-[#1B4332] hover:bg-[#F4EFE4] rounded cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              disabled={savingPrereqs}
                              onClick={() => handleRemovePrerequisite(prereq.id)}
                              title="Remove pre-requisite link"
                              aria-label={`Remove ${prereq.title} pre-requisite`}
                              className="p-1 text-[#78827B] hover:text-[#B42318] hover:bg-[#FEF3F2] rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Target Task Link Anchor */}
              <div className="flex items-center gap-2 pl-0.5 pt-0.5 text-[11px]">
                <ArrowDown
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isCompletionBlocked ? 'text-[#B42318]' : 'text-[#1B5E3A]'
                  }`}
                />
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    isCompletionBlocked ? 'text-[#B42318]' : 'text-[#1B5E3A]'
                  }`}
                >
                  {isCompletionBlocked ? (
                    <>
                      <Lock className="w-3 h-3" />
                      This task remains locked until blocking dependencies are completed
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      All dependencies resolved — ready for completion
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Downstream Tasks Unlocked by This Task */}
          {dependentTasks.length > 0 && (
            <div className="pt-2.5 border-t border-[#E4DFD3] space-y-1.5">
              <div className="text-[11px] font-medium text-[#56635C]">
                Required before {dependentTasks.length} downstream{' '}
                {dependentTasks.length === 1 ? 'task' : 'tasks'}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dependentTasks.map((dep) => (
                  <button
                    key={dep.id}
                    type="button"
                    onClick={() => onSelectTask(dep.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#1B4332] bg-white hover:bg-[#EFE9DC] border border-[#E4DFD3] rounded-md max-w-full cursor-pointer"
                  >
                    <span className="truncate max-w-[240px]">{dep.title}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date-Picker Task Reminder */}
        <div className="p-4 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C2420]">
              <Bell className="w-3.5 h-3.5 text-[#9C7832]" />
              Task Reminder
            </span>
            {reminderDraft && canEdit && (
              <button
                type="button"
                onClick={() => handleReminderChange('')}
                className="text-[11px] font-medium text-[#B42318] hover:underline cursor-pointer"
              >
                Clear Reminder
              </button>
            )}
          </div>
          <input
            type="datetime-local"
            disabled={!canEdit}
            value={reminderDraft}
            onChange={(e) => handleReminderChange(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25 disabled:opacity-60"
          />
          {reminderDraft && (
            <div className="text-[11px] text-[#56635C] font-mono">
              Scheduled: {formatDateTime(reminderDraft)}
            </div>
          )}
        </div>

        {/* Step-by-Step Instructions */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[#1C2420]">
            Step-by-Step Instructions
          </h3>
          {task.instructions.length === 0 ? (
            <p className="text-xs text-[#78827B]">No detailed steps recorded yet.</p>
          ) : (
            <ol className="space-y-2.5">
              {task.instructions.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-[#1C2420] leading-relaxed">
                  <span className="font-mono text-xs font-semibold text-[#1B4332] bg-[#F4EFE4] border border-[#E4DFD3] w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Editable Executor Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="inspector-notes" className="text-xs font-semibold text-[#1C2420]">
              Executor Notes &amp; Record Details
            </label>
            {notesSavedAt && (
              <span className="text-[11px] font-medium text-[#1B5E3A]">Saved</span>
            )}
          </div>
          <textarea
            id="inspector-notes"
            rows={4}
            disabled={!canEdit}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Record confirmation numbers, attorney contacts, vault locations, or call dates..."
            className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25 disabled:opacity-70"
          />
          {canEdit && notesDraft !== task.executorNotes && (
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
            >
              {savingNotes ? 'Saving...' : 'Save Notes'}
            </button>
          )}
        </div>

        {/* Collaborator Discussion & Questions */}
        <div className="space-y-3 pt-4 border-t border-[#E4DFD3]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C2420]">
              <MessageSquare className="w-3.5 h-3.5 text-[#1B4332]" />
              Collaborator Discussion
            </h3>
            <span className="font-mono text-xs text-[#56635C] tabular-nums">
              {comments.length} {comments.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {commentError && (
            <div className="p-2.5 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg">
              {commentError}
            </div>
          )}

          {/* Comment Thread */}
          {comments.length === 0 ? (
            <p className="text-xs text-[#78827B]">
              No messages or questions yet. Leave a timestamped note or question for co-executors, family, or legal counsel.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
              {comments.map((comment) => {
                const isAuthor = comment.authorUid === currentUserUid;
                const canDeleteComment = isAuthor || isOwner;
                const isEditingThis = editingCommentId === comment.id;
                const createdMs = getFirestoreTimestampMillis(comment.createdAt);
                const updatedMs = getFirestoreTimestampMillis(comment.updatedAt);
                const wasEdited =
                  createdMs !== null && updatedMs !== null && updatedMs - createdMs > 2000;

                const cardSurface =
                  comment.kind === 'question'
                    ? 'bg-[#FFFDF7] border-[#E7D8B1]'
                    : comment.kind === 'update'
                    ? 'bg-[#F4F8F5] border-[#C9DDD0]'
                    : 'bg-[#FBF9F4] border-[#E4DFD3]';

                return (
                  <div key={comment.id} className={`rounded-lg border p-3 space-y-1.5 ${cardSurface}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                          <span className="font-semibold text-[#1C2420]">
                            {comment.authorName}
                          </span>
                          <span className="text-[#78827B]">·</span>
                          <span className="text-[11px] text-[#56635C]">
                            {comment.authorRole}
                          </span>
                          {comment.kind === 'question' && (
                            <>
                              <span className="text-[#78827B]">·</span>
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#9C7832]">
                                <HelpCircle className="w-3 h-3" />
                                Question
                              </span>
                            </>
                          )}
                          {comment.kind === 'update' && (
                            <>
                              <span className="text-[#78827B]">·</span>
                              <span className="text-[11px] font-semibold text-[#1B4332]">
                                Update
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#78827B] tabular-nums mt-0.5">
                          {formatFirestoreTimestamp(comment.createdAt)}
                          {wasEdited ? ' · edited' : ''}
                        </div>
                      </div>

                      {(isAuthor || canDeleteComment) && !isEditingThis && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {isAuthor && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditCommentBody(comment.body);
                                setEditCommentKind(comment.kind);
                              }}
                              title="Edit message"
                              aria-label="Edit message"
                              className="p-1 text-[#56635C] hover:text-[#1C2420] hover:bg-white rounded cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {canDeleteComment && (
                            <button
                              type="button"
                              onClick={() => onDeleteComment(task.id, comment.id)}
                              title="Delete message"
                              aria-label="Delete message"
                              className="p-1 text-[#78827B] hover:text-[#B42318] hover:bg-white rounded cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditingThis ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-1">
                          {(
                            [
                              { value: 'note', label: 'Message' },
                              { value: 'question', label: 'Question' },
                              { value: 'update', label: 'Update' },
                            ] as Array<{ value: TaskCommentKind; label: string }>
                          ).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setEditCommentKind(opt.value)}
                              className={`px-2 py-0.5 text-[11px] font-medium rounded border cursor-pointer ${
                                editCommentKind === opt.value
                                  ? 'bg-[#1B4332] text-white border-[#1B4332]'
                                  : 'bg-white text-[#56635C] border-[#E4DFD3]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          maxLength={2000}
                          value={editCommentBody}
                          onChange={(e) => setEditCommentBody(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E4DFD3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#56635C] bg-white border border-[#E4DFD3] rounded cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingCommentEdit || !editCommentBody.trim()}
                            onClick={() => handleSaveCommentEdit(comment.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-60 rounded cursor-pointer"
                          >
                            {savingCommentEdit ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#1C2420] leading-relaxed whitespace-pre-wrap break-words">
                        {comment.body}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Comment Composer */}
          <form
            onSubmit={handlePostComment}
            className="p-3 bg-[#FBF9F4] border border-[#E4DFD3] rounded-xl space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" role="group" aria-label="Message type">
                {(
                  [
                    { value: 'note', label: 'Message' },
                    { value: 'question', label: 'Question' },
                    { value: 'update', label: 'Status Update' },
                  ] as Array<{ value: TaskCommentKind; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCommentKind(opt.value)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      commentKind === opt.value
                        ? 'bg-[#1B4332] text-white border-[#1B4332]'
                        : 'bg-white text-[#56635C] border-[#E4DFD3] hover:text-[#1C2420]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-[#78827B] tabular-nums">
                {commentBody.length}/2000
              </span>
            </div>

            <textarea
              rows={2}
              maxLength={2000}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handlePostComment();
                }
              }}
              placeholder={
                commentKind === 'question'
                  ? 'Ask a question for the executor, family, or legal counsel...'
                  : 'Post a timestamped message or handoff update...'
              }
              className="w-full px-3 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#78827B]">
                Visible to authorized collaborators
              </span>
              <button
                type="submit"
                disabled={postingComment || !commentBody.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3 h-3" />
                {postingComment
                  ? 'Posting...'
                  : commentKind === 'question'
                  ? 'Post Question'
                  : 'Post Message'}
              </button>
            </div>
          </form>
        </div>

        {/* Linked Vault Documents */}
        <div className="space-y-3 pt-2 border-t border-[#E4DFD3]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#1C2420]">
              Linked Documents ({linkedDocs.length})
            </h3>
            {canEdit && (
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] border border-[#E4DFD3] rounded-lg cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Attach File'}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleFilePick}
                />
              </label>
            )}
          </div>

          {linkedDocs.length === 0 ? (
            <p className="text-xs text-[#78827B]">
              No files linked to this task. Attach deeds, statements, or forms directly above.
            </p>
          ) : (
            <div className="space-y-2">
              {linkedDocs.map((docItem) => (
                <div
                  key={docItem.id}
                  className="flex items-center justify-between gap-2 p-2.5 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-[#1B4332] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#1C2420] truncate">
                        {docItem.name}
                      </div>
                      <div className="text-[11px] font-mono text-[#78827B] tabular-nums">
                        {formatBytes(docItem.sizeBytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPreviewDocument(docItem)}
                      title="Preview file"
                      className="p-1.5 text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadDocument(docItem)}
                      title="Download file"
                      className="p-1.5 text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Task (Owner Only) */}
        {isOwner && (
          <div className="pt-4 border-t border-[#E4DFD3]">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B42318] hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2 p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-lg">
                <span className="text-xs text-[#B42318] font-medium">Delete permanently?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 text-xs text-[#4F5B54] bg-white border border-[#E4DFD3] rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="px-2.5 py-1 text-xs text-white bg-[#B42318] rounded cursor-pointer"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Inspector Pane (>= 1024px) */}
      <aside className="hidden lg:block w-[420px] shrink-0 border-l border-[#E4DFD3] bg-white h-full overflow-hidden">
        {inspectorBody}
      </aside>

      {/* Tablet & Mobile Popup Modal (< 1024px) */}
      <div className="lg:hidden fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
        <div className="w-full max-w-xl max-h-[90vh] rounded-xl overflow-hidden border border-[#E4DFD3] flex flex-col">
          {inspectorBody}
        </div>
      </div>
    </>
  );
}

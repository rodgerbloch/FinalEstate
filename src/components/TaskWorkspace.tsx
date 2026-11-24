import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock,
  Columns3,
  Compass,
  FileSpreadsheet,
  FileText,
  Flag,
  GitBranch,
  GripVertical,
  Landmark,
  LayoutGrid,
  ListFilter,
  ListTodo,
  Loader2,
  Lock,
  Pin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  TASK_CATEGORIES,
  type EstateTask,
  type StageFilter,
  type TaskCategory,
  type TaskPriority,
  type TaskStatusBucket,
  type TaskStatusFilter,
  type VaultDocument,
  type ViewMode,
} from '../types/estate';
import {
  computeTaskStatus,
  formatShortDate,
  getBlockingPrerequisites,
  getTaskPrerequisites,
  getTodayIso,
  isReminderActive,
  isTaskBlocked,
} from '../utils/taskHelpers';
import { ProgressOverview } from './ProgressOverview';
import { CsvTasksModal } from './CsvTasksModal';
import { TaskAnalyticsOverlay } from './TaskAnalyticsOverlay';
import { CashflowProjectionModal } from './CashflowProjectionModal';
import type { CsvImportTaskInput } from '../utils/csvTasks';
import type { CreateTaskInput } from '../services/estateService';
import { getQuickActionTemplates, type QuickTaskTemplate } from '../utils/quickTaskTemplates';

interface TaskWorkspaceProps {
  estateTitle: string;
  principalName: string;
  activeStage: string;
  estateNotes?: string;
  tasks: EstateTask[];
  documents: VaultDocument[];
  selectedTaskId: string | null;
  canEdit: boolean;
  onSelectTask: (taskId: string) => void;
  onToggleComplete: (task: EstateTask) => Promise<void>;
  onUpdateTaskPriority?: (task: EstateTask, priority: TaskPriority) => Promise<void>;
  onOpenNewTask: (defaultCategory?: TaskCategory) => void;
  onQuickCreateTask: (input: CreateTaskInput) => Promise<string>;
  onMoveTaskCategory: (task: EstateTask, targetCategory: TaskCategory) => Promise<void>;
  onMoveTaskStatus: (task: EstateTask, targetStatus: TaskStatusBucket) => Promise<void>;
  onImportTasks: (items: CsvImportTaskInput[]) => Promise<number>;
  showTourBanner?: boolean;
  onStartTour: () => void;
  onDismissTourBanner?: () => void;
}

type QuickFilter =
  | 'all'
  | 'high_priority'
  | 'due_soon'
  | 'past_due'
  | 'executor'
  | 'reminders';

export function TaskWorkspace({
  estateTitle,
  principalName,
  activeStage,
  estateNotes = '',
  tasks,
  documents,
  selectedTaskId,
  canEdit,
  onSelectTask,
  onToggleComplete,
  onUpdateTaskPriority,
  onOpenNewTask,
  onQuickCreateTask,
  onMoveTaskCategory,
  onMoveTaskStatus,
  onImportTasks,
  showTourBanner = false,
  onStartTour,
  onDismissTourBanner,
}: TaskWorkspaceProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | TaskCategory>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('buckets');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<string, boolean>>({});
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [cashflowModalOpen, setCashflowModalOpen] = useState(false);
  const [creatingTemplateKey, setCreatingTemplateKey] = useState<string | null>(null);
  const [quickActionNotice, setQuickActionNotice] = useState<{
    taskId: string;
    title: string;
    isError?: boolean;
  } | null>(null);
  const [quickBarMinimized, setQuickBarMinimized] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<TaskCategory | null>(null);
  const [dragOverStatusCol, setDragOverStatusCol] = useState<TaskStatusBucket | null>(null);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  const todayIso = getTodayIso();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stats = useMemo(() => {
    let completed = 0;
    let pastDue = 0;
    let upcoming = 0;
    let outstanding = 0;
    for (const t of tasks) {
      const s = computeTaskStatus(t, todayIso);
      if (s === 'completed') completed += 1;
      else if (s === 'past_due') pastDue += 1;
      else if (s === 'upcoming') upcoming += 1;
      else outstanding += 1;
    }
    return { total: tasks.length, completed, pastDue, upcoming, outstanding };
  }, [tasks, todayIso]);

  const docsByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      if (d.taskId) {
        map.set(d.taskId, (map.get(d.taskId) || 0) + 1);
      }
    }
    return map;
  }, [documents]);

  const quickCounts = useMemo(() => {
    let highPriority = 0;
    let dueSoon = 0;
    let pastDue = 0;
    let executorOpen = 0;
    let reminders = 0;
    for (const t of tasks) {
      const s = computeTaskStatus(t, todayIso);
      if (!t.completed && t.priority === 'High') highPriority += 1;
      if (s === 'past_due' || s === 'upcoming') dueSoon += 1;
      if (s === 'past_due') pastDue += 1;
      if (!t.completed && t.stage === 'Executor Action') executorOpen += 1;
      if (isReminderActive(t)) reminders += 1;
    }
    return {
      all: tasks.length,
      high_priority: highPriority,
      due_soon: dueSoon,
      past_due: pastDue,
      executor: executorOpen,
      reminders,
    };
  }, [tasks, todayIso]);

  const filteredTasks = useMemo(() => {
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tasks
      .filter((t) => {
        if (activeCategory !== 'all' && t.category !== activeCategory) return false;
        if (stageFilter !== 'all' && t.stage !== stageFilter) return false;
        const s = computeTaskStatus(t, todayIso);
        if (statusFilter !== 'all' && s !== statusFilter) return false;
        if (quickFilter === 'high_priority' && (t.completed || t.priority !== 'High')) return false;
        if (quickFilter === 'due_soon' && s !== 'past_due' && s !== 'upcoming') return false;
        if (quickFilter === 'past_due' && s !== 'past_due') return false;
        if (quickFilter === 'executor' && (t.completed || t.stage !== 'Executor Action')) return false;
        if (quickFilter === 'reminders' && !isReminderActive(t)) return false;
        if (tokens.length > 0) {
          const hay = [
            t.title,
            t.category,
            t.stage,
            t.timingLabel,
            t.executorNotes,
            ...(t.instructions || []),
            ...(t.sharedWithEmails || []),
          ]
            .join(' ')
            .toLowerCase();
          if (!tokens.every((tok) => hay.includes(tok))) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const aHigh = a.priority === 'High';
        const bHigh = b.priority === 'High';
        if (aHigh !== bHigh) return aHigh ? -1 : 1;
        const prioOrder: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        if (prioOrder[a.priority] !== prioOrder[b.priority]) {
          return prioOrder[a.priority] - prioOrder[b.priority];
        }
        return a.title.localeCompare(b.title);
      });
  }, [tasks, activeCategory, stageFilter, statusFilter, quickFilter, searchQuery, todayIso]);

  const getSearchMatchSnippet = (task: EstateTask): { source: string; text: string } | null => {
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const titleLower = task.title.toLowerCase();
    if (tokens.every((tok) => titleLower.includes(tok))) return null;

    if (task.executorNotes) {
      const notesLower = task.executorNotes.toLowerCase();
      if (tokens.some((tok) => notesLower.includes(tok))) {
        return { source: 'Notes', text: task.executorNotes };
      }
    }
    for (const step of task.instructions || []) {
      const stepLower = step.toLowerCase();
      if (tokens.some((tok) => stepLower.includes(tok))) {
        return { source: 'Description', text: step };
      }
    }
    return null;
  };

  const draggingTask = useMemo(
    () => (draggingTaskId ? tasks.find((t) => t.id === draggingTaskId) || null : null),
    [draggingTaskId, tasks]
  );

  const showMoveConfirmation = (message: string) => {
    setMoveNotice(message);
    window.setTimeout(() => {
      setMoveNotice((prev) => (prev === message ? null : prev));
    }, 2600);
  };

  const resetDragState = () => {
    setDraggingTaskId(null);
    setDragOverCategory(null);
    setDragOverStatusCol(null);
  };

  const handleDropToCategory = async (targetCategory: TaskCategory, transferredTaskId?: string) => {
    const taskId = transferredTaskId || draggingTaskId;
    resetDragState();
    if (!canEdit || !taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.category === targetCategory) return;
    await onMoveTaskCategory(task, targetCategory);
    showMoveConfirmation(`Moved "${task.title}" to ${targetCategory}`);
  };

  const handleDropToStatus = async (targetStatus: TaskStatusBucket, transferredTaskId?: string) => {
    const taskId = transferredTaskId || draggingTaskId;
    resetDragState();
    if (!canEdit || !taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const currentStatus = computeTaskStatus(task, todayIso);
    if (currentStatus === targetStatus) return;
    if (targetStatus === 'completed' && isTaskBlocked(task, tasks)) {
      const blockingCount = getBlockingPrerequisites(task, tasks).length;
      onSelectTask(task.id);
      showMoveConfirmation(
        `Cannot complete "${task.title}" — ${blockingCount} pre-requisite ${
          blockingCount === 1 ? 'task' : 'tasks'
        } must be resolved first.`
      );
      return;
    }
    await onMoveTaskStatus(task, targetStatus);
    const labelMap: Record<TaskStatusBucket, string> = {
      past_due: 'Past Due',
      upcoming: 'Upcoming (14d)',
      outstanding: 'Outstanding',
      completed: 'Completed',
    };
    showMoveConfirmation(`Updated "${task.title}" to ${labelMap[targetStatus]}`);
  };

  const toggleBucket = (key: string) => {
    setCollapsedBuckets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPriorityMark = (task: EstateTask) => {
    const isHigh = task.priority === 'High';
    const canTogglePriority = canEdit && Boolean(onUpdateTaskPriority) && !task.completed;

    if (isHigh) {
      if (canTogglePriority) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateTaskPriority?.(task, 'Medium');
            }}
            aria-pressed={true}
            aria-label={`Remove High Priority flag from ${task.title}`}
            title="Pinned High Priority — click to unpin"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1 rounded text-xs font-semibold text-[#B42318] bg-[#FEF3F2] hover:bg-[#FEE4E2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pin className="w-3 h-3 shrink-0" />
            <span>High Priority</span>
          </button>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B42318] whitespace-nowrap shrink-0">
          <Pin className="w-3 h-3 shrink-0" />
          <span>High Priority</span>
        </span>
      );
    }

    const baseLabel =
      task.priority === 'Medium' ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B45309] whitespace-nowrap shrink-0">
          <Flag className="w-3.5 h-3.5 shrink-0" />
          <span>Medium</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#4F5B54] whitespace-nowrap shrink-0">
          <CircleDot className="w-3.5 h-3.5 shrink-0" />
          <span>Low</span>
        </span>
      );

    if (!canTogglePriority) return baseLabel;

    return (
      <div className="inline-flex items-center gap-1.5">
        {baseLabel}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateTaskPriority?.(task, 'High');
          }}
          aria-pressed={false}
          aria-label={`Flag ${task.title} as High Priority`}
          title="Flag as High Priority to pin to top"
          className="p-0.5 rounded text-[#9BA39D] hover:text-[#B42318] hover:bg-[#FEF3F2] opacity-80 group-hover:opacity-100 transition-colors cursor-pointer"
        >
          <Pin className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const renderTaskCard = (task: EstateTask, compact = false) => {
    const status = computeTaskStatus(task, todayIso);
    const selected = selectedTaskId === task.id;
    const docCount = docsByTask.get(task.id) || 0;
    const hasReminder = isReminderActive(task);
    const isBeingDragged = draggingTaskId === task.id;
    const totalPrereqs = getTaskPrerequisites(task, tasks);
    const blockingPrereqs = getBlockingPrerequisites(task, tasks);
    const isBlocked = !task.completed && blockingPrereqs.length > 0;
    const isPinnedHigh = !task.completed && task.priority === 'High';

    return (
      <div
        key={task.id}
        draggable={canEdit}
        onDragStart={(e) => {
          if (!canEdit) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
          setDraggingTaskId(task.id);
        }}
        onDragEnd={resetDragState}
        onClick={() => onSelectTask(task.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTask(task.id);
          }
        }}
        className={`group rounded-xl border transition-all flex flex-col justify-between gap-3 ${
          compact ? 'p-3.5' : 'p-4'
        } ${
          isPinnedHigh ? 'bg-[#FFFCFB]' : 'bg-white'
        } ${
          isBeingDragged
            ? 'opacity-45 border-dashed border-[#1B4332]'
            : selected
            ? 'border-[#1B4332] ring-2 ring-[#1B4332]/15'
            : isPinnedHigh
            ? 'border-[#EBC3BE] hover:border-[#D99B94]'
            : 'border-[#E4DFD3] hover:border-[#B9B09E]'
        } ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
          task.completed && !isBeingDragged ? 'opacity-75' : ''
        }`}
      >
        <div className="space-y-2">
          {/* Top line: Drag grip + Checkbox + Priority + Status text */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {canEdit && (
                <GripVertical
                  className="w-3.5 h-3.5 text-[#9BA39D] group-hover:text-[#4F5B54] shrink-0"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                disabled={!canEdit || isBlocked}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isBlocked) {
                    onSelectTask(task.id);
                    return;
                  }
                  if (canEdit) onToggleComplete(task);
                }}
                title={
                  isBlocked
                    ? `Blocked by ${blockingPrereqs.length} pre-requisite task(s)`
                    : undefined
                }
                aria-label={
                  isBlocked
                    ? `${task.title} is blocked by ${blockingPrereqs.length} pre-requisite tasks`
                    : task.completed
                    ? `Mark ${task.title} incomplete`
                    : `Mark ${task.title} complete`
                }
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                  isBlocked
                    ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318] cursor-not-allowed'
                    : task.completed
                    ? 'bg-[#1B4332] border-[#1B4332] text-white'
                    : 'bg-[#FBF9F4] border-[#C6BFAE] hover:border-[#1B4332]'
                } ${canEdit && !isBlocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                {isBlocked ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  task.completed && <Check className="w-3.5 h-3.5" />
                )}
              </button>
              {renderPriorityMark(task)}
            </div>

            {isBlocked ? (
              <span className="text-[11px] font-semibold text-[#B42318] whitespace-nowrap shrink-0">Blocked</span>
            ) : status === 'past_due' ? (
              <span className="text-[11px] font-semibold text-[#B42318] whitespace-nowrap shrink-0">Past Due</span>
            ) : status === 'upcoming' ? (
              <span className="text-[11px] font-semibold text-[#B45309] whitespace-nowrap shrink-0">Due Soon</span>
            ) : status === 'completed' ? (
              <span className="text-[11px] font-medium text-[#1B5E3A] whitespace-nowrap shrink-0">Complete</span>
            ) : null}
          </div>

          {/* Title */}
          <h3
            className={`text-sm font-semibold leading-snug ${
              task.completed ? 'line-through text-[#56635C]' : 'text-[#1C2420]'
            }`}
          >
            {task.title}
          </h3>

          {(() => {
            const snippet = getSearchMatchSnippet(task);
            if (!snippet) return null;
            return (
              <p className="text-xs text-[#56635C] line-clamp-1 leading-relaxed">
                <span className="font-medium text-[#1B4332]">{snippet.source}:</span>{' '}
                {snippet.text}
              </p>
            );
          })()}
        </div>

        {/* Quiet Unboxed Metadata Footer */}
        <div className="pt-2.5 border-t border-[#EFECE4] flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#56635C]">
          {viewMode === 'status' && (
            <>
              <span className="font-medium text-[#1B4332]">{task.category}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{task.stage === 'Pre-Need Planning' ? 'Planning' : 'Executor'}</span>
          {task.timingLabel && !compact && (
            <>
              <span aria-hidden="true">·</span>
              <span>{task.timingLabel}</span>
            </>
          )}
          {task.dueDate && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                  status === 'past_due' ? 'text-[#B42318] font-medium' : ''
                }`}
              >
                <Calendar className="w-3 h-3" />
                {formatShortDate(task.dueDate)}
              </span>
            </>
          )}
          {hasReminder && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[#9C7832] font-medium" title="Reminder scheduled">
                <Bell className="w-3 h-3" />
                Reminder
              </span>
            </>
          )}
          {docCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#1B4332]">
                <FileText className="w-3 h-3" />
                {docCount}
              </span>
            </>
          )}
          {totalPrereqs.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                  isBlocked ? 'text-[#B42318] font-medium' : 'text-[#1B5E3A]'
                }`}
                title={
                  isBlocked
                    ? `${blockingPrereqs.length} blocking pre-requisite(s)`
                    : 'All pre-requisites resolved'
                }
              >
                {isBlocked ? <Lock className="w-3 h-3" /> : <GitBranch className="w-3 h-3" />}
                {isBlocked
                  ? `${blockingPrereqs.length} blocking`
                  : `${totalPrereqs.length} prereq`}
              </span>
            </>
          )}
          {task.sharedWithEmails.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Users className="w-3 h-3" />
                {task.sharedWithEmails.length}
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  const gridColsClass = selectedTaskId
    ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

  const visibleCategories =
    activeCategory === 'all' ? TASK_CATEGORIES : [activeCategory];

  const statusColumns: Array<{
    key: TaskStatusBucket;
    label: string;
    subtitle: string;
    icon: typeof AlertCircle;
    accentClass: string;
    items: EstateTask[];
  }> = useMemo(() => {
    const groups: Record<TaskStatusBucket, EstateTask[]> = {
      past_due: [],
      upcoming: [],
      outstanding: [],
      completed: [],
    };
    for (const t of filteredTasks) {
      groups[computeTaskStatus(t, todayIso)].push(t);
    }
    return [
      {
        key: 'past_due',
        label: 'Past Due',
        subtitle: 'Overdue deadlines',
        icon: AlertCircle,
        accentClass: 'text-[#B42318]',
        items: groups.past_due,
      },
      {
        key: 'upcoming',
        label: 'Upcoming (14d)',
        subtitle: 'Due within 14 days',
        icon: Clock,
        accentClass: 'text-[#B45309]',
        items: groups.upcoming,
      },
      {
        key: 'outstanding',
        label: 'Outstanding',
        subtitle: 'Open / later schedule',
        icon: ListTodo,
        accentClass: 'text-[#4F5B54]',
        items: groups.outstanding,
      },
      {
        key: 'completed',
        label: 'Completed',
        subtitle: 'Archived & verified',
        icon: CheckCircle2,
        accentClass: 'text-[#1B5E3A]',
        items: groups.completed,
      },
    ];
  }, [filteredTasks, todayIso]);

  const timelineGroups = useMemo(() => {
    const pastDueList: EstateTask[] = [];
    const upcomingList: EstateTask[] = [];
    const scheduledLaterList: EstateTask[] = [];
    const unscheduledList: EstateTask[] = [];
    const completedList: EstateTask[] = [];

    for (const t of filteredTasks) {
      const s = computeTaskStatus(t, todayIso);
      if (s === 'completed') completedList.push(t);
      else if (s === 'past_due') pastDueList.push(t);
      else if (s === 'upcoming') upcomingList.push(t);
      else if (t.dueDate) scheduledLaterList.push(t);
      else unscheduledList.push(t);
    }

    return [
      { key: 'past_due' as TaskStatusBucket, label: 'Past Due Action Items', items: pastDueList },
      { key: 'upcoming' as TaskStatusBucket, label: 'Upcoming (Within 14 Days)', items: upcomingList },
      { key: 'later' as const, targetStatus: 'outstanding' as TaskStatusBucket, label: 'Scheduled Later', items: scheduledLaterList },
      { key: 'unscheduled' as const, targetStatus: 'outstanding' as TaskStatusBucket, label: 'Ongoing & Unscheduled Planning', items: unscheduledList },
      { key: 'completed' as TaskStatusBucket, label: 'Completed Records', items: completedList },
    ];
  }, [filteredTasks, todayIso]);

  const quickActionTemplates = useMemo(
    () => getQuickActionTemplates(activeCategory),
    [activeCategory]
  );

  const handleQuickAddTemplate = async (template: QuickTaskTemplate) => {
    if (!canEdit || creatingTemplateKey) return;
    setCreatingTemplateKey(template.key);
    try {
      const createdId = await onQuickCreateTask(template.task);
      const notice = { taskId: createdId, title: template.label, isError: false };
      setQuickActionNotice(notice);
      window.setTimeout(() => {
        setQuickActionNotice((prev) => (prev?.taskId === createdId ? null : prev));
      }, 4500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create task';
      setQuickActionNotice({ taskId: '', title: msg, isError: true });
      window.setTimeout(() => {
        setQuickActionNotice((prev) => (prev?.isError ? null : prev));
      }, 4500);
    } finally {
      setCreatingTemplateKey(null);
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-20">
      {showTourBanner && (
        <section
          aria-label="Executor Onboarding Orientation"
          className="bg-[#F4EFE4] border border-[#D7CFC0] rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Compass className="w-5 h-5 text-[#1B4332] shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[#1C2420]">
                New to administering an estate?
              </h2>
              <p className="text-xs text-[#4F5B54] mt-0.5">
                Take a 6-step interactive tour of Estate Ledger and learn how to activate the Executor Action phase.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDismissTourBanner && (
              <button
                type="button"
                onClick={onDismissTourBanner}
                className="px-3 py-1.5 text-xs font-medium text-[#56635C] hover:text-[#1C2420] hover:bg-[#EAE3D4] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Dismiss
              </button>
            )}
            <button
              type="button"
              onClick={onStartTour}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              Start Executor Tour
            </button>
          </div>
        </section>
      )}

      <ProgressOverview
        totalCount={stats.total}
        completedCount={stats.completed}
        pastDueCount={stats.pastDue}
        upcomingCount={stats.upcoming}
        outstandingCount={stats.outstanding}
        activeStatusFilter={statusFilter}
        onSelectStatusFilter={(next) => {
          setQuickFilter('all');
          setStatusFilter(next);
        }}
        isDraggingTask={Boolean(draggingTaskId)}
        canEdit={canEdit}
        onDropStatus={(target) => handleDropToStatus(target)}
      />

      {/* Live Drag-and-Drop Feedback Strip */}
      {(draggingTask || moveNotice) && (
        <div className="px-4 py-2.5 bg-[#F4EFE4] border border-[#D7CFC0] rounded-lg flex items-center justify-between gap-3 text-xs text-[#1C2420]">
          {draggingTask ? (
            <span>
              Dragging <strong className="font-semibold">{draggingTask.title}</strong> — drop onto a category bucket, category tab, or status column to reorganize.
            </span>
          ) : (
            <span className="font-medium text-[#1B4332]">{moveNotice}</span>
          )}
        </div>
      )}

      {/* Global Task Search Bar */}
      <div className="bg-white border border-[#E4DFD3] rounded-xl px-3.5 py-2 flex flex-wrap items-center gap-2.5 focus-within:border-[#1B4332] focus-within:ring-2 focus-within:ring-[#1B4332]/15 transition-all">
        <Search className="w-4 h-4 text-[#56635C] shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && searchQuery) {
              setSearchQuery('');
            }
          }}
          aria-label="Global task search"
          placeholder="Search all tasks by title, description steps, or executor notes..."
          className="flex-1 min-w-[200px] py-1 text-sm text-[#1C2420] placeholder:text-[#78827B] bg-transparent focus:outline-none"
        />
        <div className="flex items-center gap-2 shrink-0">
          {searchQuery.trim() ? (
            <>
              <span className="font-mono text-xs text-[#1B4332] font-medium tabular-nums">
                {filteredTasks.length} {filteredTasks.length === 1 ? 'match' : 'matches'}
              </span>
              {activeCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className="px-2 py-1 text-[11px] font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] border border-[#E4DFD3] rounded-md whitespace-nowrap cursor-pointer"
                >
                  All Categories
                </button>
              )}
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search (Esc)"
                className="p-1 text-[#56635C] hover:text-[#1C2420] hover:bg-[#F4EFE4] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono text-[#78827B] bg-[#FBF9F4] border border-[#E4DFD3] rounded">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Category Tabs (also drop targets when dragging a task) */}
      <div className="border-b border-[#E4DFD3] overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeCategory === 'all'
                ? 'border-[#1B4332] text-[#1B4332]'
                : 'border-transparent text-[#56635C] hover:text-[#1C2420]'
            }`}
          >
            Master List ({tasks.length})
          </button>
          {TASK_CATEGORIES.map((cat) => {
            const count = tasks.filter((t) => t.category === cat).length;
            const active = activeCategory === cat;
            const isTabDropHover =
              Boolean(draggingTaskId) &&
              canEdit &&
              dragOverCategory === cat &&
              draggingTask?.category !== cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                onDragOver={(e) => {
                  if (!canEdit || !draggingTaskId || draggingTask?.category === cat) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverCategory !== cat) setDragOverCategory(cat);
                }}
                onDragLeave={() => {
                  if (dragOverCategory === cat) setDragOverCategory(null);
                }}
                onDrop={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  const tid = e.dataTransfer.getData('text/plain');
                  handleDropToCategory(cat, tid);
                }}
                className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isTabDropHover
                    ? 'border-[#1B4332] bg-[#EAF2EE] text-[#1B4332] rounded-t-md'
                    : active
                    ? 'border-[#1B4332] text-[#1B4332]'
                    : 'border-transparent text-[#56635C] hover:text-[#1C2420]'
                }`}
              >
                {cat}{' '}
                <span className="font-mono text-[11px] opacity-75 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter & View Mode Toolbar */}
      <div
        data-tour="task-toolbar"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="w-3.5 h-3.5 text-[#56635C]" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setQuickFilter('all');
                setStatusFilter(e.target.value as TaskStatusFilter);
              }}
              aria-label="Filter by status"
              className="px-2.5 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
            >
              <option value="all">All Statuses</option>
              <option value="past_due">Past Due</option>
              <option value="upcoming">Upcoming (14d)</option>
              <option value="outstanding">Outstanding</option>
              <option value="completed">Completed</option>
            </select>

            <select
              value={stageFilter}
              onChange={(e) => {
                setQuickFilter('all');
                setStageFilter(e.target.value as StageFilter);
              }}
              aria-label="Filter by stage"
              className="px-2.5 py-2 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
            >
              <option value="all">All Phases</option>
              <option value="Pre-Need Planning">Planning</option>
              <option value="Executor Action">Executor</option>
            </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCashflowModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C2420] bg-white hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Landmark className="w-3.5 h-3.5 text-[#1B4332]" />
            Cashflow Projection
          </button>

          <button
            type="button"
            onClick={() => setAnalyticsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C2420] bg-white hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#1B4332]" />
            Analytics
          </button>

          <button
            type="button"
            onClick={() => setCsvModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C2420] bg-white hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B4332]" />
            Import / Export CSV
          </button>

          {/* View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg border border-[#E4DFD3] shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('buckets')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'buckets'
                  ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                  : 'text-[#56635C] hover:text-[#1C2420]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Bucket View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('status')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'status'
                  ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                  : 'text-[#56635C] hover:text-[#1C2420]'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Status Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                  : 'text-[#56635C] hover:text-[#1C2420]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Timeline View
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Filter Bar above the Task Grid */}
      <div
        role="group"
        aria-label="Quick task filters"
        className="flex items-center gap-2 overflow-x-auto pb-1"
      >
        {(
          [
            { id: 'all', label: 'All Tasks', count: quickCounts.all },
            { id: 'high_priority', label: 'High Priority', count: quickCounts.high_priority },
            { id: 'due_soon', label: 'Due Soon', count: quickCounts.due_soon },
            { id: 'past_due', label: 'Past Due', count: quickCounts.past_due },
            { id: 'executor', label: 'Executor Action', count: quickCounts.executor },
            { id: 'reminders', label: 'With Reminders', count: quickCounts.reminders },
          ] as Array<{ id: QuickFilter; label: string; count: number }>
        ).map((item) => {
          const isActive =
            item.id === 'all'
              ? quickFilter === 'all' && statusFilter === 'all' && stageFilter === 'all'
              : quickFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                if (item.id === 'all') {
                  setQuickFilter('all');
                  setStatusFilter('all');
                  setStageFilter('all');
                } else {
                  setQuickFilter((prev) => (prev === item.id ? 'all' : item.id));
                  setStatusFilter('all');
                  setStageFilter('all');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#1B4332] text-white border-[#1B4332]'
                  : 'bg-white text-[#4F5B54] border-[#E4DFD3] hover:text-[#1C2420] hover:bg-[#F4EFE4]'
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  isActive ? 'text-white/85' : 'text-[#78827B]'
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty State (only when not in Status Board and not currently dragging) */}
      {filteredTasks.length === 0 && viewMode !== 'status' && !draggingTaskId ? (
        <div className="bg-white border border-[#E4DFD3] rounded-xl p-10 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-[#1C2420]">
            No matching tasks in this view
          </p>
          <p className="text-sm text-[#56635C] max-w-md mx-auto">
            Try clearing your search or status filter, or add a custom task to this category.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            {(statusFilter !== 'all' || stageFilter !== 'all' || quickFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setStageFilter('all');
                  setQuickFilter('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 text-xs font-medium text-[#1C2420] border border-[#E4DFD3] rounded-lg hover:bg-[#F4EFE4] cursor-pointer"
              >
                Reset Filters
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  onOpenNewTask(activeCategory === 'all' ? 'Assets' : activeCategory)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'buckets' ? (
        /* Collapsible Category Buckets with Drag & Drop */
        <div className="space-y-6">
          {visibleCategories.map((category) => {
            const bucketTasks = filteredTasks.filter((t) => t.category === category);
            const showEmptyBucketWhileDragging =
              Boolean(draggingTaskId) && canEdit && draggingTask?.category !== category;
            if (bucketTasks.length === 0 && activeCategory === 'all' && !showEmptyBucketWhileDragging) {
              return null;
            }

            const catAll = tasks.filter((t) => t.category === category);
            const catDone = catAll.filter((t) => t.completed).length;
            const catPinnedHigh = bucketTasks.filter((t) => !t.completed && t.priority === 'High').length;
            const isCollapsed = Boolean(collapsedBuckets[category]);
            const isDropTarget =
              Boolean(draggingTaskId) &&
              canEdit &&
              dragOverCategory === category &&
              draggingTask?.category !== category;

            return (
              <section
                key={category}
                onDragOver={(e) => {
                  if (!canEdit || !draggingTaskId || draggingTask?.category === category) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverCategory !== category) setDragOverCategory(category);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    if (dragOverCategory === category) setDragOverCategory(null);
                  }
                }}
                onDrop={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  const tid = e.dataTransfer.getData('text/plain');
                  handleDropToCategory(category, tid);
                }}
                className={`space-y-3 rounded-xl transition-colors ${
                  isDropTarget
                    ? 'p-3 -m-3 bg-[#EAF2EE]/70 border-2 border-dashed border-[#1B4332]'
                    : draggingTaskId && canEdit && draggingTask?.category !== category
                    ? 'p-3 -m-3 border-2 border-dashed border-[#D7CFC0]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-4 border-b border-[#E4DFD3] pb-2">
                  <button
                    type="button"
                    onClick={() => toggleBucket(category)}
                    className="flex items-center flex-wrap gap-2 text-left group cursor-pointer"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-[#56635C]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#56635C]" />
                    )}
                    <h2 className="font-display text-lg font-semibold text-[#1C2420] group-hover:text-[#1B4332] transition-colors">
                      {category}
                    </h2>
                    <span className="font-mono text-xs text-[#56635C] tabular-nums">
                      {catDone} / {catAll.length} complete
                    </span>
                    {catPinnedHigh > 0 && (
                      <>
                        <span aria-hidden="true" className="text-[#9BA39D]">·</span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B42318] tabular-nums">
                          <Pin className="w-3 h-3" />
                          {catPinnedHigh} pinned high priority
                        </span>
                      </>
                    )}
                    {isDropTarget && (
                      <span className="text-xs font-semibold text-[#1B4332]">
                        · Drop to move here
                      </span>
                    )}
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onOpenNewTask(category)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to {category}
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  bucketTasks.length > 0 ? (
                    <div className={gridColsClass}>
                      {bucketTasks.map((task) => renderTaskCard(task))}
                    </div>
                  ) : (
                    <div className="py-5 text-center text-xs text-[#56635C]">
                      Drop a task here to move it into {category}
                    </div>
                  )
                )}
              </section>
            );
          })}
        </div>
      ) : viewMode === 'status' ? (
        /* 4-Column Status Board with Drag & Drop */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {statusColumns.map((col) => {
            const Icon = col.icon;
            const isDropTarget =
              Boolean(draggingTaskId) &&
              canEdit &&
              dragOverStatusCol === col.key &&
              draggingTask &&
              computeTaskStatus(draggingTask, todayIso) !== col.key;

            return (
              <section
                key={col.key}
                onDragOver={(e) => {
                  if (!canEdit || !draggingTaskId) return;
                  if (draggingTask && computeTaskStatus(draggingTask, todayIso) === col.key) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverStatusCol !== col.key) setDragOverStatusCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    if (dragOverStatusCol === col.key) setDragOverStatusCol(null);
                  }
                }}
                onDrop={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  const tid = e.dataTransfer.getData('text/plain');
                  handleDropToStatus(col.key, tid);
                }}
                className={`rounded-xl border p-3.5 space-y-3 min-h-[260px] transition-colors ${
                  isDropTarget
                    ? 'bg-[#EAF2EE]/70 border-2 border-dashed border-[#1B4332]'
                    : 'bg-[#F4EFE4]/60 border-[#E4DFD3]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E4DFD3]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${col.accentClass}`} />
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-[#1C2420] truncate">
                        {col.label}
                      </h2>
                      <p className="text-[11px] text-[#56635C] truncate">{col.subtitle}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#1C2420] tabular-nums shrink-0">
                    {col.items.length}
                  </span>
                </div>

                {col.items.length === 0 ? (
                  <div className="py-10 px-3 text-center text-xs text-[#78827B] border border-dashed border-[#D7CFC0] rounded-lg">
                    {isDropTarget
                      ? `Release to move to ${col.label}`
                      : `No tasks in ${col.label}`}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {col.items.map((task) => renderTaskCard(task, true))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* Timeline View with Drag & Drop */
        <div className="space-y-6">
          {timelineGroups
            .filter((g) => g.items.length > 0 || (Boolean(draggingTaskId) && canEdit))
            .map((group) => {
              const targetStatus: TaskStatusBucket =
                'targetStatus' in group && group.targetStatus ? group.targetStatus : group.key;
              const isDropTarget =
                Boolean(draggingTaskId) &&
                canEdit &&
                dragOverStatusCol === targetStatus &&
                draggingTask &&
                computeTaskStatus(draggingTask, todayIso) !== targetStatus;

              return (
                <section
                  key={group.key}
                  onDragOver={(e) => {
                    if (!canEdit || !draggingTaskId) return;
                    if (draggingTask && computeTaskStatus(draggingTask, todayIso) === targetStatus) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverStatusCol !== targetStatus) setDragOverStatusCol(targetStatus);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      if (dragOverStatusCol === targetStatus) setDragOverStatusCol(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    const tid = e.dataTransfer.getData('text/plain');
                    handleDropToStatus(targetStatus, tid);
                  }}
                  className={`space-y-3 rounded-xl transition-colors ${
                    isDropTarget
                      ? 'p-3 -m-3 bg-[#EAF2EE]/70 border-2 border-dashed border-[#1B4332]'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-[#E4DFD3] pb-2">
                    <h2 className="font-display text-lg font-semibold text-[#1C2420]">
                      {group.label}
                    </h2>
                    <span className="font-mono text-xs text-[#56635C] tabular-nums">
                      {group.items.length} task{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {group.items.length > 0 ? (
                    <div className={gridColsClass}>
                      {group.items.map((task) => renderTaskCard(task))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-[#56635C] border border-dashed border-[#D7CFC0] rounded-lg">
                      Drop task here
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      )}

      {csvModalOpen && (
        <CsvTasksModal
          estateTitle={estateTitle}
          allTasks={tasks}
          filteredTasks={filteredTasks}
          hasActiveFilters={Boolean(
            activeCategory !== 'all' ||
              statusFilter !== 'all' ||
              stageFilter !== 'all' ||
              quickFilter !== 'all' ||
              searchQuery.trim()
          )}
          canEdit={canEdit}
          onImportTasks={onImportTasks}
          onClose={() => setCsvModalOpen(false)}
        />
      )}

      {/* Floating Quick Action Toolbar */}
      {canEdit && (
        <div
          aria-label="Quick Action task toolbar"
          className="sticky bottom-[66px] md:bottom-4 z-20 flex justify-center pointer-events-none pt-2"
        >
          {quickBarMinimized ? (
            <button
              type="button"
              onClick={() => setQuickBarMinimized(false)}
              className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#1C2420] bg-[#FBF9F4]/95 backdrop-blur-sm hover:bg-[#F4EFE4] border border-[#D7CFC0] rounded-xl shadow-[0_8px_24px_-6px_rgba(28,36,32,0.16)] whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#1B4332]" />
              <span>
                Quick Action · {activeCategory === 'all' ? 'Essentials' : activeCategory}
              </span>
              <ChevronUp className="w-3.5 h-3.5 text-[#56635C]" />
            </button>
          ) : (
            <div className="pointer-events-auto max-w-full bg-[#FBF9F4]/95 backdrop-blur-sm border border-[#D7CFC0] rounded-xl shadow-[0_10px_28px_-8px_rgba(28,36,32,0.18)] px-3 py-2 flex items-center gap-2 overflow-x-auto">
              <div className="flex items-center gap-2 shrink-0 pr-1">
                <span className="text-[11px] font-medium text-[#56635C] whitespace-nowrap">
                  Quick Action ·{' '}
                  <strong className="font-semibold text-[#1C2420]">
                    {activeCategory === 'all' ? 'Essentials' : activeCategory}
                  </strong>
                </span>
              </div>

              <span className="h-4 w-px bg-[#E4DFD3] shrink-0" aria-hidden="true" />

              {quickActionTemplates.map((template) => {
                const isCreating = creatingTemplateKey === template.key;
                return (
                  <button
                    key={template.key}
                    type="button"
                    disabled={Boolean(creatingTemplateKey)}
                    onClick={() => handleQuickAddTemplate(template)}
                    title={`Create "${template.task.title}" in ${template.task.category}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1C2420] bg-white hover:bg-[#EAF2EE] hover:text-[#1B4332] hover:border-[#1B4332]/40 border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1B4332]" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-[#1B4332]" />
                    )}
                    <span>{template.label}</span>
                  </button>
                );
              })}

              {quickActionNotice && (
                <>
                  <span className="h-4 w-px bg-[#E4DFD3] shrink-0" aria-hidden="true" />
                  {quickActionNotice.isError ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FEF3F2] border border-[#FECDCA] rounded-lg text-xs text-[#B42318] whitespace-nowrap shrink-0">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{quickActionNotice.title}</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg text-xs text-[#1B5E3A] whitespace-nowrap shrink-0">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Added {quickActionNotice.title}</span>
                      <button
                        type="button"
                        onClick={() => onSelectTask(quickActionNotice.taskId)}
                        className="font-semibold underline underline-offset-2 hover:text-[#144329] cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  )}
                </>
              )}

              <span className="h-4 w-px bg-[#E4DFD3] shrink-0" aria-hidden="true" />

              <button
                type="button"
                onClick={() =>
                  onOpenNewTask(activeCategory === 'all' ? 'Assets' : activeCategory)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Custom
              </button>

              <button
                type="button"
                onClick={() => setQuickBarMinimized(true)}
                aria-label="Minimize Quick Action toolbar"
                title="Minimize Quick Action toolbar"
                className="p-1.5 text-[#56635C] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded-lg transition-colors shrink-0 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {analyticsOpen && (
        <TaskAnalyticsOverlay
          estateTitle={estateTitle}
          allTasks={tasks}
          filteredTasks={filteredTasks}
          hasActiveFilters={Boolean(
            activeCategory !== 'all' ||
              statusFilter !== 'all' ||
              stageFilter !== 'all' ||
              quickFilter !== 'all' ||
              searchQuery.trim()
          )}
          activeCategoryFilter={activeCategory}
          onFilterByCategory={(cat) => setActiveCategory(cat)}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}

      {cashflowModalOpen && (
        <CashflowProjectionModal
          estateTitle={estateTitle}
          principalName={principalName}
          activeStage={activeStage}
          estateNotes={estateNotes}
          tasks={tasks}
          onSelectTask={onSelectTask}
          onClose={() => setCashflowModalOpen(false)}
        />
      )}
    </div>
  );
}

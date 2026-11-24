import { TASK_CATEGORIES, type EstateTask, type TaskCategory } from '../types/estate';
import { computeTaskStatus, getFirestoreTimestampMillis, getTodayIso } from './taskHelpers';

export type TrendWindow = '14d' | '30d' | '90d' | 'all';

export interface CompletionTrendPoint {
  dateIso: string;
  label: string;
  completionRate: number;
  completedCount: number;
  totalCount: number;
}

export interface CategoryDistributionItem {
  category: TaskCategory;
  total: number;
  completed: number;
  open: number;
  pastDue: number;
  highPriorityOpen: number;
  sharePct: number;
  completionPct: number;
  color: string;
}

export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  Assets: '#1B4332',
  Liabilities: '#9C7832',
  Cashflow: '#2D6A4F',
  'Legal & Probate': '#5C4742',
  Insurance: '#3D5A80',
  'Digital & Access': '#6B705C',
  'Final Wishes': '#8D5B4C',
};

function toLocalStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatAxisDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function resolveTaskTimestamps(task: EstateTask, fallbackMs: number): {
  createdMs: number;
  completedMs: number | null;
} {
  const rawCreatedMs = getFirestoreTimestampMillis(task.createdAt);
  const rawUpdatedMs = getFirestoreTimestampMillis(task.updatedAt);

  let completedMs: number | null = null;
  if (task.completed) {
    const parsedCompleted = task.completedAt ? new Date(task.completedAt).getTime() : NaN;
    if (!Number.isNaN(parsedCompleted)) {
      completedMs = parsedCompleted;
    } else {
      completedMs = rawUpdatedMs ?? rawCreatedMs ?? fallbackMs;
    }
  }

  let createdMs = rawCreatedMs ?? completedMs ?? fallbackMs;
  if (completedMs !== null && createdMs > completedMs) {
    createdMs = completedMs;
  }

  return { createdMs, completedMs };
}

export function buildCompletionTrend(
  tasks: EstateTask[],
  window: TrendWindow,
  now = new Date()
): CompletionTrendPoint[] {
  if (tasks.length === 0) return [];

  const todayStart = toLocalStartOfDay(now);
  const todayMs = todayStart.getTime();
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const resolved = tasks.map((t) => resolveTaskTimestamps(t, nowMs));
  const earliestCreatedMs = resolved.reduce(
    (min, item) => (item.createdMs < min ? item.createdMs : min),
    todayMs
  );

  let startDay: Date;
  if (window === '14d') {
    startDay = new Date(todayMs - 13 * dayMs);
  } else if (window === '30d') {
    startDay = new Date(todayMs - 29 * dayMs);
  } else if (window === '90d') {
    startDay = new Date(todayMs - 89 * dayMs);
  } else {
    const earliestDay = toLocalStartOfDay(new Date(earliestCreatedMs));
    const minWindowStart = new Date(todayMs - 6 * dayMs);
    startDay = earliestDay.getTime() < minWindowStart.getTime() ? earliestDay : minWindowStart;
  }

  const startMs = startDay.getTime();
  const spanDays = Math.max(1, Math.round((todayMs - startMs) / dayMs) + 1);

  let stepDays = 1;
  if (window === '90d') {
    stepDays = 3;
  } else if (window === 'all' && spanDays > 45) {
    stepDays = Math.max(2, Math.ceil(spanDays / 24));
  }

  const sampleDays: Date[] = [];
  for (let offset = 0; offset < spanDays; offset += stepDays) {
    sampleDays.push(new Date(startMs + offset * dayMs));
  }
  const lastSample = sampleDays[sampleDays.length - 1];
  if (!lastSample || toIsoDateLocal(lastSample) !== toIsoDateLocal(todayStart)) {
    sampleDays.push(todayStart);
  }

  return sampleDays.map((day) => {
    const endOfDayMs = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    let totalCount = 0;
    let completedCount = 0;
    for (const item of resolved) {
      if (item.createdMs <= endOfDayMs) {
        totalCount += 1;
        if (item.completedMs !== null && item.completedMs <= endOfDayMs) {
          completedCount += 1;
        }
      }
    }

    const completionRate =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 1000) / 10 : 0;

    return {
      dateIso: toIsoDateLocal(day),
      label: formatAxisDate(day),
      completionRate,
      completedCount,
      totalCount,
    };
  });
}

export function buildCategoryDistribution(
  tasks: EstateTask[],
  todayIso = getTodayIso()
): CategoryDistributionItem[] {
  const totalAll = tasks.length;

  return TASK_CATEGORIES.map((category) => {
    const bucket = tasks.filter((t) => t.category === category);
    const total = bucket.length;
    let completed = 0;
    let pastDue = 0;
    let highPriorityOpen = 0;

    for (const t of bucket) {
      if (t.completed) {
        completed += 1;
      } else {
        if (computeTaskStatus(t, todayIso) === 'past_due') {
          pastDue += 1;
        }
        if (t.priority === 'High') {
          highPriorityOpen += 1;
        }
      }
    }

    const open = total - completed;
    const sharePct = totalAll > 0 ? Math.round((total / totalAll) * 1000) / 10 : 0;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      category,
      total,
      completed,
      open,
      pastDue,
      highPriorityOpen,
      sharePct,
      completionPct,
      color: CATEGORY_COLORS[category],
    };
  });
}

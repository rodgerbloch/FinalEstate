import { TASK_CATEGORIES, type EstateTask, type TaskCategory } from '../types/estate';

export interface AggregatedTaskItem {
  task: EstateTask;
  detectedAmountUsd: number | null;
}

export interface AggregatedBucketSummary {
  category: TaskCategory;
  totalCount: number;
  openCount: number;
  executorActionCount: number;
  detectedAmountUsd: number;
  items: AggregatedTaskItem[];
}

export interface EstateFinancialAggregation {
  assetItems: AggregatedTaskItem[];
  liabilityItems: AggregatedTaskItem[];
  buckets: AggregatedBucketSummary[];
  detectedAssetsUsd: number;
  detectedLiabilitiesUsd: number;
}

export interface ProjectionExpenseLineItem {
  label: string;
  linkedBucket: string;
  timeframe: string;
  estimatedAmountUsd: number;
  confidence: string;
  rationale: string;
}

export interface CashflowProjectionResult {
  summary: string;
  estimatedTotalImmediateExpenses: number;
  recommendedLiquidReserve: number;
  expenseLineItems: ProjectionExpenseLineItem[];
  liquidityRisks: string[];
  priorityActions: string[];
  disclaimer: string;
}

export function extractTaskUsdAmount(task: EstateTask): number | null {
  const text = [task.title, task.executorNotes, ...(task.instructions || [])]
    .filter(Boolean)
    .join(' ');
  if (!text) return null;

  const regex = /(?:USD\s*|\$)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*([kKmM])\b)?/g;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const whole = Number(match[1].replace(/,/g, ''));
    const dec = match[2] ? Number(`0.${match[2]}`) : 0;
    if (!Number.isFinite(whole) || !Number.isFinite(dec)) continue;
    let val = whole + dec;
    const suffix = match[3]?.toLowerCase();
    if (suffix === 'k') val *= 1_000;
    else if (suffix === 'm') val *= 1_000_000;
    total += val;
    matched = true;
  }

  return matched ? Math.round(total) : null;
}

export function aggregateEstateBuckets(
  tasks: EstateTask[],
  overrides: Record<string, string> = {}
): EstateFinancialAggregation {
  const buckets: AggregatedBucketSummary[] = TASK_CATEGORIES.map((category) => {
    const catTasks = tasks.filter((t) => t.category === category);
    let openCount = 0;
    let executorActionCount = 0;
    let detectedAmountUsd = 0;

    const items: AggregatedTaskItem[] = catTasks.map((task) => {
      if (!task.completed) openCount += 1;
      if (task.stage === 'Executor Action') executorActionCount += 1;

      const rawOverride = overrides[task.id];
      let amount: number | null = null;
      if (typeof rawOverride === 'string' && rawOverride.trim() !== '') {
        const parsed = Number(rawOverride.replace(/[^0-9.]/g, ''));
        if (Number.isFinite(parsed) && parsed >= 0) {
          amount = Math.round(parsed);
        }
      } else {
        amount = extractTaskUsdAmount(task);
      }

      if (amount !== null) {
        detectedAmountUsd += amount;
      }

      return { task, detectedAmountUsd: amount };
    });

    return {
      category,
      totalCount: catTasks.length,
      openCount,
      executorActionCount,
      detectedAmountUsd,
      items,
    };
  });

  const assetsBucket = buckets.find((b) => b.category === 'Assets');
  const liabilitiesBucket = buckets.find((b) => b.category === 'Liabilities');

  return {
    assetItems: assetsBucket?.items || [],
    liabilityItems: liabilitiesBucket?.items || [],
    buckets,
    detectedAssetsUsd: assetsBucket?.detectedAmountUsd || 0,
    detectedLiabilitiesUsd: liabilitiesBucket?.detectedAmountUsd || 0,
  };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

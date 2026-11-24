import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  FolderLock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  TASK_CATEGORIES,
  type Estate,
  type EstateTask,
  type ExecutiveSummaryPeriodDays,
  type ExecutiveSummaryReport,
  type VaultDocument,
} from '../types/estate';
import {
  computeTaskStatus,
  formatBytes,
  formatFirestoreTimestamp,
  formatShortDate,
  getFirestoreTimestampMillis,
  getTodayIso,
  isTaskBlocked,
} from '../utils/taskHelpers';

interface CachedExecutiveSummary {
  report: ExecutiveSummaryReport;
  generatedAt: string;
}

interface ExecutiveSummaryViewProps {
  estate: Estate;
  tasks: EstateTask[];
  documents: VaultDocument[];
  canEdit: boolean;
  onInspectTask: (taskId: string) => void;
  onNavigateVault: () => void;
  onSaveSummaryToVault: (file: File, notes: string) => Promise<void>;
}

const PERIOD_OPTIONS: Array<{ days: ExecutiveSummaryPeriodDays; shortLabel: string; label: string }> = [
  { days: 7, shortLabel: '7 Days', label: 'Weekly (Last 7 Days)' },
  { days: 30, shortLabel: '30 Days', label: 'Monthly (Last 30 Days)' },
  { days: 90, shortLabel: '90 Days', label: 'Quarterly (Last 90 Days)' },
];

function getStorageKey(estateId: string, periodDays: ExecutiveSummaryPeriodDays): string {
  return `estate_ledger_exec_summary_${estateId}_${periodDays}`;
}

function readCachedSummary(
  estateId: string,
  periodDays: ExecutiveSummaryPeriodDays
): CachedExecutiveSummary | null {
  try {
    const raw = window.localStorage.getItem(getStorageKey(estateId, periodDays));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedExecutiveSummary;
    if (!parsed?.report?.headline || !parsed?.generatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedSummary(
  estateId: string,
  periodDays: ExecutiveSummaryPeriodDays,
  value: CachedExecutiveSummary
): void {
  try {
    window.localStorage.setItem(getStorageKey(estateId, periodDays), JSON.stringify(value));
  } catch {
    // Ignore storage quota or privacy-mode failures
  }
}

function formatSummaryAsText(
  estate: Estate,
  periodLabel: string,
  generatedAt: string,
  report: ExecutiveSummaryReport
): string {
  const lines: string[] = [
    '====================================================================',
    'ESTATE LEDGER — EXECUTIVE SUMMARY BRIEFING',
    '====================================================================',
    `Estate:           ${estate.title}`,
    `Principal:        ${estate.principalName}`,
    `Active Stage:     ${estate.activeStage}`,
    `Reporting Period: ${periodLabel}`,
    `Generated:        ${new Date(generatedAt).toLocaleString('en-US')}`,
    `Health Status:    ${report.healthRating}`,
    '',
    `HEADLINE`,
    report.headline,
    '',
    `ESTATE HEALTH OVERVIEW`,
    report.estateHealthOverview,
    '',
    `OUTSTANDING HIGH-PRIORITY FOCUS`,
  ];

  if (report.highPriorityFocus.length === 0) {
    lines.push('- No outstanding high-priority items flagged.');
  } else {
    report.highPriorityFocus.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.taskTitle} [${item.category}]`);
      lines.push(`   Why Urgent: ${item.urgencyReason}`);
      lines.push(`   Next Step:  ${item.recommendedNextStep}`);
    });
  }

  lines.push('', 'RECENT DOCUMENT VAULT ASSESSMENT', report.documentVaultAssessment, '', 'PERIODIC ACTION PLAN');
  report.periodicActionPlan.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });
  lines.push('', report.disclaimer);

  return lines.join('\n');
}

export function ExecutiveSummaryView({
  estate,
  tasks,
  documents,
  canEdit,
  onInspectTask,
  onNavigateVault,
  onSaveSummaryToVault,
}: ExecutiveSummaryViewProps) {
  const [periodDays, setPeriodDays] = useState<ExecutiveSummaryPeriodDays>(30);
  const [cached, setCached] = useState<CachedExecutiveSummary | null>(() =>
    readCachedSummary(estate.id, 30)
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archivedNotice, setArchivedNotice] = useState(false);

  const autoAttemptedRef = useRef<Set<string>>(new Set());
  const todayIso = getTodayIso();

  const periodOption =
    PERIOD_OPTIONS.find((opt) => opt.days === periodDays) || PERIOD_OPTIONS[1];

  const analytics = useMemo(() => {
    const nowMs = Date.now();
    const cutoffMs = nowMs - periodDays * 24 * 60 * 60 * 1000;

    let completedCount = 0;
    let pastDueCount = 0;
    let upcomingCount = 0;
    let blockedCount = 0;
    let completedInPeriodCount = 0;

    for (const t of tasks) {
      const status = computeTaskStatus(t, todayIso);
      if (status === 'completed') {
        completedCount += 1;
        const completedMs = t.completedAt
          ? new Date(t.completedAt).getTime()
          : getFirestoreTimestampMillis(t.updatedAt);
        if (completedMs !== null && !Number.isNaN(completedMs) && completedMs >= cutoffMs) {
          completedInPeriodCount += 1;
        }
      } else {
        if (status === 'past_due') pastDueCount += 1;
        else if (status === 'upcoming') upcomingCount += 1;
        if (isTaskBlocked(t, tasks)) blockedCount += 1;
      }
    }

    const completionPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    const categoryHealth = TASK_CATEGORIES.map((category) => {
      const catTasks = tasks.filter((t) => t.category === category);
      const done = catTasks.filter((t) => t.completed).length;
      const highPriorityOpen = catTasks.filter(
        (t) => !t.completed && t.priority === 'High'
      ).length;
      const pastDue = catTasks.filter(
        (t) => computeTaskStatus(t, todayIso) === 'past_due'
      ).length;
      const pct = catTasks.length > 0 ? Math.round((done / catTasks.length) * 100) : 0;
      return {
        category,
        completed: done,
        total: catTasks.length,
        pct,
        highPriorityOpen,
        pastDue,
      };
    });

    const outstandingHighPriorityTasks = tasks
      .filter((t) => !t.completed && t.priority === 'High')
      .map((t) => {
        const isPastDue = computeTaskStatus(t, todayIso) === 'past_due';
        const isBlocked = isTaskBlocked(t, tasks);
        return {
          task: t,
          isPastDue,
          isBlocked,
        };
      })
      .sort((a, b) => {
        if (a.isPastDue !== b.isPastDue) return a.isPastDue ? -1 : 1;
        if (a.task.dueDate && b.task.dueDate) {
          return a.task.dueDate.localeCompare(b.task.dueDate);
        }
        if (a.task.dueDate) return -1;
        if (b.task.dueDate) return 1;
        return a.task.title.localeCompare(b.task.title);
      });

    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const sortedDocs = [...documents].sort((a, b) => {
      const msA = getFirestoreTimestampMillis(a.createdAt) ?? 0;
      const msB = getFirestoreTimestampMillis(b.createdAt) ?? 0;
      return msB - msA;
    });

    const docsInPeriod = sortedDocs.filter((d) => {
      const ms = getFirestoreTimestampMillis(d.createdAt);
      return ms !== null && ms >= cutoffMs;
    });

    const recentDocuments = (docsInPeriod.length > 0 ? docsInPeriod : sortedDocs.slice(0, 5)).map(
      (docItem) => {
        const ms = getFirestoreTimestampMillis(docItem.createdAt);
        const withinPeriod = ms !== null && ms >= cutoffMs;
        const linkedTask = docItem.taskId ? taskById.get(docItem.taskId) || null : null;
        return {
          doc: docItem,
          withinPeriod,
          linkedTaskTitle: linkedTask?.title || '',
          uploadedAtLabel: formatFirestoreTimestamp(docItem.createdAt),
        };
      }
    );

    return {
      completedCount,
      pastDueCount,
      upcomingCount,
      blockedCount,
      completedInPeriodCount,
      completionPct,
      categoryHealth,
      outstandingHighPriorityTasks,
      pastDueHighPriorityCount: outstandingHighPriorityTasks.filter((item) => item.isPastDue).length,
      docsInPeriodCount: docsInPeriod.length,
      recentDocuments,
    };
  }, [tasks, documents, periodDays, todayIso]);

  const generateSummary = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Please sign in to generate an Executive Summary.');
      }
      const idToken = await currentUser.getIdToken();

      const res = await fetch('/api/executive-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          estateTitle: estate.title,
          principalName: estate.principalName,
          activeStage: estate.activeStage,
          estateNotes: estate.notes.slice(0, 500),
          periodLabel: periodOption.label,
          periodDays,
          metrics: {
            totalTasks: tasks.length,
            completedCount: analytics.completedCount,
            completionPct: analytics.completionPct,
            pastDueCount: analytics.pastDueCount,
            upcomingCount: analytics.upcomingCount,
            highPriorityOpenCount: analytics.outstandingHighPriorityTasks.length,
            blockedCount: analytics.blockedCount,
            totalDocuments: documents.length,
            recentDocumentsCount: analytics.docsInPeriodCount,
            completedInPeriodCount: analytics.completedInPeriodCount,
          },
          categoryHealth: analytics.categoryHealth.map((c) => ({
            category: c.category,
            completed: c.completed,
            total: c.total,
            highPriorityOpen: c.highPriorityOpen,
            pastDue: c.pastDue,
          })),
          outstandingHighPriorityTasks: analytics.outstandingHighPriorityTasks
            .slice(0, 20)
            .map(({ task, isPastDue, isBlocked }) => ({
              title: task.title,
              category: task.category,
              stage: task.stage,
              dueDate: task.dueDate,
              timingLabel: task.timingLabel,
              isPastDue,
              isBlocked,
              notesPreview: task.executorNotes.slice(0, 240),
            })),
          recentDocuments: analytics.recentDocuments
            .filter((entry) => entry.withinPeriod)
            .slice(0, 20)
            .map((entry) => ({
              name: entry.doc.name,
              category: entry.doc.category,
              uploadedAt: entry.uploadedAtLabel,
              uploadedByName: entry.doc.uploadedByName,
              linkedTaskTitle: entry.linkedTaskTitle,
              notesPreview: entry.doc.notes.slice(0, 200),
            })),
        }),
      });

      const data = (await res.json()) as {
        summary?: ExecutiveSummaryReport;
        error?: string;
      };

      if (!res.ok || !data.summary) {
        throw new Error(data.error || 'Unable to generate Executive Summary.');
      }

      const nextCached: CachedExecutiveSummary = {
        report: data.summary,
        generatedAt: new Date().toISOString(),
      };
      setCached(nextCached);
      writeCachedSummary(estate.id, periodDays, nextCached);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach the AI Estate Consultant.');
    } finally {
      setLoading(false);
    }
  }, [estate, periodDays, periodOption.label, tasks.length, documents.length, analytics]);

  // Sync cached summary when estate or period changes, and auto-generate once if none cached
  useEffect(() => {
    const existing = readCachedSummary(estate.id, periodDays);
    setCached(existing);
    setErrorMsg('');
    setArchivedNotice(false);

    const attemptKey = `${estate.id}_${periodDays}`;
    if (!existing && !autoAttemptedRef.current.has(attemptKey)) {
      autoAttemptedRef.current.add(attemptKey);
      void generateSummary();
    }
  }, [estate.id, periodDays, generateSummary]);

  const handleCopyBriefing = () => {
    if (!cached) return;
    const text = formatSummaryAsText(
      estate,
      periodOption.label,
      cached.generatedAt,
      cached.report
    );
    navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleArchiveToVault = async () => {
    if (!cached || !canEdit || archiving) return;
    setArchiving(true);
    setErrorMsg('');
    try {
      const content = formatSummaryAsText(
        estate,
        periodOption.label,
        cached.generatedAt,
        cached.report
      );
      const safeEstateSlug = estate.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'estate';
      const fileName = `executive-summary-${safeEstateSlug}-${periodDays}d-${todayIso}.txt`;
      const file = new File([content], fileName, { type: 'text/plain' });
      await onSaveSummaryToVault(
        file,
        `AI Estate Consultant Executive Summary (${periodOption.label}) generated ${formatShortDate(todayIso)}.`
      );
      setArchivedNotice(true);
      window.setTimeout(() => setArchivedNotice(false), 3000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save Executive Summary to Document Vault.'
      );
    } finally {
      setArchiving(false);
    }
  };

  const report = cached?.report || null;

  const healthMeta = useMemo(() => {
    const rating = report?.healthRating;
    if (rating === 'On Track') {
      return {
        label: 'On Track',
        textClass: 'text-[#1B5E3A]',
        icon: CheckCircle2,
      };
    }
    if (rating === 'Critical Priorities') {
      return {
        label: 'Critical Priorities',
        textClass: 'text-[#B42318]',
        icon: AlertTriangle,
      };
    }
    return {
      label: rating || 'Needs Attention',
      textClass: 'text-[#9C7832]',
      icon: AlertCircle,
    };
  }, [report?.healthRating]);

  const HealthIcon = healthMeta.icon;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header & Periodic Cadence Controls */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-[#1B4332] shrink-0" />
            <h1 className="font-display text-2xl font-semibold text-[#1C2420] text-balance">
              Executive Summary
            </h1>
          </div>
          <p className="text-sm text-[#56635C] mt-1">
            {estate.title} · {estate.activeStage} ·{' '}
            {cached
              ? `Updated ${new Date(cached.generatedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}`
              : `Period: ${periodOption.label}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Periodic Cadence Selector */}
          <div
            role="group"
            aria-label="Summary reporting period"
            className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg border border-[#E4DFD3]"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = periodDays === opt.days;
              return (
                <button
                  key={opt.days}
                  type="button"
                  disabled={loading}
                  onClick={() => setPeriodDays(opt.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                    active
                      ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                      : 'text-[#56635C] hover:text-[#1C2420]'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void generateSummary()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {loading ? 'Generating...' : report ? 'Refresh Summary' : 'Generate Summary'}
          </button>
        </div>
      </section>

      {/* 4-Column Live Estate Health Strip */}
      <section
        aria-label="Live estate health metrics"
        className="bg-white border border-[#E4DFD3] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#EFE9DC]"
      >
        <div className="p-4 sm:px-5">
          <div className="text-xs font-medium text-[#56635C]">Estate Readiness</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#1B4332] tabular-nums">
            {analytics.completionPct}%
          </div>
          <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
            {analytics.completedCount} of {tasks.length} tasks complete
          </div>
        </div>

        <div className="p-4 sm:px-5">
          <div className="text-xs font-medium text-[#56635C]">Open High-Priority</div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              analytics.outstandingHighPriorityTasks.length > 0
                ? 'text-[#B42318]'
                : 'text-[#1B5E3A]'
            }`}
          >
            {analytics.outstandingHighPriorityTasks.length}
          </div>
          <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
            {analytics.pastDueHighPriorityCount} past due · {analytics.blockedCount} blocked
          </div>
        </div>

        <div className="p-4 sm:px-5">
          <div className="text-xs font-medium text-[#56635C]">Completed in Period</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#1C2420] tabular-nums">
            {analytics.completedInPeriodCount}
          </div>
          <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
            {analytics.upcomingCount} upcoming within 14d
          </div>
        </div>

        <div className="p-4 sm:px-5">
          <div className="text-xs font-medium text-[#56635C]">Recent Vault Additions</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#9C7832] tabular-nums">
            {analytics.docsInPeriodCount}
          </div>
          <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
            Last {periodDays} days · {documents.length} total files
          </div>
        </div>
      </section>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-[#B42318]">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void generateSummary()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B42318] bg-white hover:bg-[#FEE4E2] border border-[#FECDCA] rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Primary Focal Anchor: AI Estate Consultant Executive Briefing */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[#EFE9DC] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bot className="w-4 h-4 text-[#1B4332] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-[#1C2420]">
                AI Estate Consultant Briefing
              </h2>
              <div className="text-xs text-[#56635C] flex flex-wrap items-center gap-2">
                <span>{periodOption.label}</span>
                {report && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className={`inline-flex items-center gap-1 font-medium ${healthMeta.textClass}`}>
                      <HealthIcon className="w-3.5 h-3.5" />
                      {healthMeta.label}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {report && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyBriefing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#1B5E3A]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#56635C]" />
                    Copy Briefing
                  </>
                )}
              </button>

              {canEdit && (
                <button
                  type="button"
                  disabled={archiving}
                  onClick={() => void handleArchiveToVault()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {archiving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : archivedNotice ? (
                    <Check className="w-3.5 h-3.5 text-[#1B5E3A]" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  {archiving
                    ? 'Saving...'
                    : archivedNotice
                    ? 'Saved to Vault'
                    : 'Save to Vault'}
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs text-[#56635C] font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-[#1B4332]" />
              <span>
                Synthesizing estate health, {analytics.outstandingHighPriorityTasks.length} high-priority tasks, and {analytics.docsInPeriodCount} recent vault additions...
              </span>
            </div>
            <div className="space-y-2.5 animate-pulse">
              <div className="h-5 bg-[#EFECE4] rounded w-3/4" />
              <div className="h-4 bg-[#F4EFE4] rounded w-full" />
              <div className="h-4 bg-[#F4EFE4] rounded w-5/6" />
              <div className="h-4 bg-[#F4EFE4] rounded w-2/3" />
            </div>
          </div>
        ) : !report ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-[#4F5B54] max-w-xl mx-auto">
              Generate a periodic briefing from the AI Estate Consultant summarizing estate health across all 7 categories, outstanding high-priority tasks, and recent Document Vault additions.
            </p>
            <button
              type="button"
              onClick={() => void generateSummary()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              Generate Executive Summary
            </button>
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Executive Headline & Estate Health Narrative */}
            <div className="space-y-2">
              <h3 className="font-display text-lg font-semibold text-[#1C2420] text-balance">
                {report.headline}
              </h3>
              <p className="text-sm text-[#3E4943] leading-relaxed">
                {report.estateHealthOverview}
              </p>
            </div>

            {/* AI Priority Focus & Vault Assessment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#EFE9DC]">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#1C2420]">
                  High-Priority Triage Notes
                </h4>
                {report.highPriorityFocus.length === 0 ? (
                  <p className="text-xs text-[#56635C]">
                    No unresolved high-priority tasks require immediate escalation.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EFE9DC] border border-[#E4DFD3] rounded-lg bg-[#FBF9F4]">
                    {report.highPriorityFocus.map((item, idx) => (
                      <div key={`${item.taskTitle}-${idx}`} className="p-3.5 space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-[#1C2420]">
                            {item.taskTitle}
                          </span>
                          <span className="text-[11px] text-[#56635C] whitespace-nowrap">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#B42318]">{item.urgencyReason}</p>
                        <p className="text-xs text-[#4F5B54] leading-relaxed">
                          Next: {item.recommendedNextStep}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#1C2420]">
                    Document Vault Assessment
                  </h4>
                  <p className="text-xs text-[#4F5B54] leading-relaxed">
                    {report.documentVaultAssessment}
                  </p>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#EFE9DC]">
                  <h4 className="text-xs font-semibold text-[#1C2420]">
                    Recommended Plan for Next {periodDays} Days
                  </h4>
                  <ol className="space-y-1.5 text-xs text-[#3E4943] list-decimal pl-4 leading-relaxed">
                    {report.periodicActionPlan.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            <p className="pt-3 border-t border-[#EFE9DC] text-[11px] text-[#56635C] leading-relaxed">
              {report.disclaimer}
            </p>
          </div>
        )}
      </section>

      {/* Live Ledger Grounding: High-Priority Queue & Recent Vault Additions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outstanding High-Priority Tasks */}
        <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#EFE9DC] flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1C2420]">
                Outstanding High-Priority Tasks
              </h2>
              <p className="text-xs text-[#56635C] tabular-nums">
                {analytics.outstandingHighPriorityTasks.length} open · past-due items listed first
              </p>
            </div>
          </div>

          {analytics.outstandingHighPriorityTasks.length === 0 ? (
            <div className="p-6 text-xs text-[#56635C]">
              All High-Priority tasks are currently completed.
            </div>
          ) : (
            <div className="divide-y divide-[#EFE9DC]">
              {analytics.outstandingHighPriorityTasks.map(({ task, isPastDue, isBlocked }) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onInspectTask(task.id)}
                  className="w-full px-5 py-3.5 text-left hover:bg-[#FBF9F4] transition-colors flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium text-[#1C2420] truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-[#56635C] flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span>{task.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{task.stage}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className={isPastDue ? 'text-[#B42318] font-medium' : ''}>
                            {isPastDue ? 'Past due ' : 'Due '}
                            {formatShortDate(task.dueDate)}
                          </span>
                        </>
                      )}
                      {isBlocked && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#9C7832] font-medium">Blocked</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[#56635C] shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Document Additions */}
        <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#EFE9DC] flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#1C2420]">
                Recent Document Additions
              </h2>
              <p className="text-xs text-[#56635C] tabular-nums">
                {analytics.docsInPeriodCount > 0
                  ? `${analytics.docsInPeriodCount} added in the last ${periodDays} days`
                  : `No uploads in last ${periodDays} days · showing latest vault records`}
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateVault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderLock className="w-3.5 h-3.5" />
              Open Vault
            </button>
          </div>

          {analytics.recentDocuments.length === 0 ? (
            <div className="p-6 text-xs text-[#56635C] space-y-3">
              <p>No documents have been uploaded to the vault yet.</p>
              <button
                type="button"
                onClick={onNavigateVault}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
              >
                Upload First Document
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#EFE9DC]">
              {analytics.recentDocuments.map(({ doc, linkedTaskTitle, uploadedAtLabel }) => (
                <div key={doc.id} className="px-5 py-3.5 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[#1C2420] truncate">
                      {doc.name}
                    </span>
                    <span className="font-mono text-[11px] text-[#56635C] tabular-nums shrink-0">
                      {formatBytes(doc.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-xs text-[#56635C] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{doc.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{uploadedAtLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>By {doc.uploadedByName}</span>
                    {linkedTaskTitle && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#1B4332]">Linked: {linkedTaskTitle}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Category Health Table */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFE9DC]">
          <h2 className="font-display text-base font-semibold text-[#1C2420]">
            Category Health Breakdown
          </h2>
          <p className="text-xs text-[#56635C]">
            Completion readiness and open risk items across all 7 archival categories
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F4EFE4] border-b border-[#E4DFD3] text-[11px] font-semibold text-[#4F5B54]">
                <th className="py-2.5 px-5">Category Bucket</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Completed</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Open High-Priority</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Past Due</th>
                <th className="py-2.5 px-5 text-right whitespace-nowrap">Readiness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE9DC] text-xs">
              {analytics.categoryHealth.map((row) => (
                <tr key={row.category} className="hover:bg-[#FBF9F4]">
                  <td className="py-3 px-5 font-medium text-[#1C2420]">{row.category}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#4F5B54] tabular-nums">
                    {row.completed} / {row.total}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums ${
                      row.highPriorityOpen > 0 ? 'text-[#B42318] font-semibold' : 'text-[#56635C]'
                    }`}
                  >
                    {row.highPriorityOpen}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums ${
                      row.pastDue > 0 ? 'text-[#B42318] font-semibold' : 'text-[#56635C]'
                    }`}
                  >
                    {row.pastDue}
                  </td>
                  <td className="py-3 px-5 text-right font-mono font-semibold text-[#1B4332] tabular-nums">
                    {row.pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

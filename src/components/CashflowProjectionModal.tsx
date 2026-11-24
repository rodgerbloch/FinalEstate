import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  Landmark,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import type { EstateTask } from '../types/estate';
import {
  aggregateEstateBuckets,
  formatUsd,
  type CashflowProjectionResult,
} from '../utils/cashflowProjection';

interface CashflowProjectionModalProps {
  estateTitle: string;
  principalName: string;
  activeStage: string;
  estateNotes?: string;
  tasks: EstateTask[];
  onSelectTask: (taskId: string) => void;
  onClose: () => void;
}

export function CashflowProjectionModal({
  estateTitle,
  principalName,
  activeStage,
  estateNotes = '',
  tasks,
  onSelectTask,
  onClose,
}: CashflowProjectionModalProps) {
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [projection, setProjection] = useState<CashflowProjectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const aggregation = useMemo(
    () => aggregateEstateBuckets(tasks, amountOverrides),
    [tasks, amountOverrides]
  );

  const netPosition = aggregation.detectedAssetsUsd - aggregation.detectedLiabilitiesUsd;

  const timeframeTotals = useMemo(() => {
    if (!projection) return null;
    let immediate = 0;
    let shortTerm = 0;
    let admin = 0;
    for (const item of projection.expenseLineItems) {
      const tf = item.timeframe.toLowerCase();
      if (tf.includes('immediate') || tf.includes('1-7') || tf.includes('1–7')) {
        immediate += Number(item.estimatedAmountUsd) || 0;
      } else if (tf.includes('short') || tf.includes('8-30') || tf.includes('8–30')) {
        shortTerm += Number(item.estimatedAmountUsd) || 0;
      } else {
        admin += Number(item.estimatedAmountUsd) || 0;
      }
    }
    return { immediate, shortTerm, admin };
  }, [projection]);

  const handleRunProjection = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Please sign in to run a Cashflow Projection.');
      }
      const idToken = await currentUser.getIdToken();

      const bucketsPayload = aggregation.buckets.map((b) => ({
        category: b.category,
        totalCount: b.totalCount,
        openCount: b.openCount,
        executorActionCount: b.executorActionCount,
        detectedAmountUsd: b.detectedAmountUsd,
        tasks: b.items.slice(0, 20).map((entry) => ({
          title: entry.task.title,
          stage: entry.task.stage,
          priority: entry.task.priority,
          timingLabel: entry.task.timingLabel,
          completed: entry.task.completed,
          estimatedAmountUsd: entry.detectedAmountUsd,
          notesPreview: entry.task.executorNotes.slice(0, 280),
        })),
      }));

      const res = await fetch('/api/cashflow-projection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          estateTitle,
          principalName,
          activeStage,
          estateNotes: estateNotes.slice(0, 600),
          totalAssetsUsd: aggregation.detectedAssetsUsd,
          totalLiabilitiesUsd: aggregation.detectedLiabilitiesUsd,
          buckets: bucketsPayload,
        }),
      });

      const data = (await res.json()) as {
        projection?: CashflowProjectionResult;
        error?: string;
      };
      if (!res.ok || !data.projection) {
        throw new Error(data.error || 'Unable to generate Cashflow Projection.');
      }

      setProjection(data.projection);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach AI Estate Consultant.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!projection) return;
    const lines = [
      `ESTATE LEDGER — IMMEDIATE POST-DEATH CASHFLOW PROJECTION`,
      `Estate: ${estateTitle} (${activeStage})`,
      `Aggregated Assets: ${formatUsd(aggregation.detectedAssetsUsd)} (${aggregation.assetItems.length} tasks)`,
      `Aggregated Liabilities: ${formatUsd(aggregation.detectedLiabilitiesUsd)} (${aggregation.liabilityItems.length} tasks)`,
      `Estimated 90-Day Immediate Expenses: ${formatUsd(projection.estimatedTotalImmediateExpenses)}`,
      `Recommended Liquid Reserve: ${formatUsd(projection.recommendedLiquidReserve)}`,
      '',
      `SUMMARY: ${projection.summary}`,
      '',
      'ITEMIZED EXPENSES:',
      ...projection.expenseLineItems.map(
        (item) =>
          `- ${item.label} [${item.timeframe} · ${item.linkedBucket}]: ${formatUsd(item.estimatedAmountUsd)} (${item.rationale})`
      ),
      '',
      'PRIORITY ACTIONS:',
      ...projection.priorityActions.map((act, i) => `${i + 1}. ${act}`),
      '',
      projection.disclaimer,
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const otherBuckets = aggregation.buckets.filter(
    (b) => b.category !== 'Assets' && b.category !== 'Liabilities'
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cashflow-projection-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#1C2420]/45 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-6xl bg-[#FBF9F4] border border-[#D7CFC0] rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <header className="px-5 sm:px-6 py-4 bg-white border-b border-[#E4DFD3] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Landmark className="w-5 h-5 text-[#1B4332] shrink-0" />
              <h2
                id="cashflow-projection-title"
                className="font-display text-xl font-semibold text-[#1C2420]"
              >
                Immediate Cashflow Projection
              </h2>
            </div>
            <p className="text-xs text-[#56635C] mt-0.5 tabular-nums">
              {estateTitle} · Aggregates {tasks.length} tasks across 7 category buckets &amp; estimates immediate post-death cash needs
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={loading || tasks.length === 0}
              onClick={handleRunProjection}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : projection ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
              {loading
                ? 'Estimating...'
                : projection
                ? 'Refresh AI Estimate'
                : 'Estimate Post-Death Expenses'}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Cashflow Projection"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#EFE9DC] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4 text-[#56635C]" />
              Close
            </button>
          </div>
        </header>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* 4-Column Financial Aggregation Strip */}
          <div className="bg-white border border-[#E4DFD3] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#EFE9DC]">
            <div className="p-4 sm:px-5">
              <div className="text-xs font-medium text-[#56635C]">Aggregated Assets</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-[#1B4332] tabular-nums">
                {formatUsd(aggregation.detectedAssetsUsd)}
              </div>
              <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
                {aggregation.assetItems.length}{' '}
                {aggregation.assetItems.length === 1 ? 'task' : 'tasks'} in Assets bucket
              </div>
            </div>

            <div className="p-4 sm:px-5">
              <div className="text-xs font-medium text-[#56635C]">Aggregated Liabilities</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-[#9C7832] tabular-nums">
                {formatUsd(aggregation.detectedLiabilitiesUsd)}
              </div>
              <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
                {aggregation.liabilityItems.length}{' '}
                {aggregation.liabilityItems.length === 1 ? 'task' : 'tasks'} in Liabilities bucket
              </div>
            </div>

            <div className="p-4 sm:px-5">
              <div className="text-xs font-medium text-[#56635C]">Net Recorded Position</div>
              <div
                className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                  netPosition < 0 ? 'text-[#B42318]' : 'text-[#1C2420]'
                }`}
              >
                {formatUsd(netPosition)}
              </div>
              <div className="mt-0.5 text-xs text-[#56635C]">
                Recorded Assets minus Liabilities
              </div>
            </div>

            <div className="p-4 sm:px-5">
              <div className="text-xs font-medium text-[#56635C]">Est. 90-Day Cash Need</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-[#1C2420] tabular-nums">
                {projection
                  ? formatUsd(projection.estimatedTotalImmediateExpenses)
                  : '—'}
              </div>
              <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
                {projection
                  ? `Target reserve: ${formatUsd(projection.recommendedLiquidReserve)}`
                  : 'Run AI Consultant estimate'}
              </div>
            </div>
          </div>

          {/* Assets & Liabilities Database Aggregation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assets Bucket */}
            <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-[#EFE9DC] flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-[#1C2420]">
                    Assets Bucket Ledger
                  </h3>
                  <p className="text-[11px] text-[#56635C]">
                    Detected balances from task notes/titles · enter or adjust USD estimates below
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#1B4332] tabular-nums shrink-0">
                  {formatUsd(aggregation.detectedAssetsUsd)}
                </span>
              </div>

              {aggregation.assetItems.length === 0 ? (
                <div className="p-6 text-xs text-[#56635C] text-center">
                  No tasks recorded in the Assets bucket yet.
                </div>
              ) : (
                <div className="divide-y divide-[#EFE9DC] max-h-[260px] overflow-y-auto">
                  {aggregation.assetItems.map(({ task, detectedAmountUsd }) => (
                    <div
                      key={task.id}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectTask(task.id);
                          }}
                          className="text-xs font-medium text-[#1C2420] hover:text-[#1B4332] hover:underline text-left truncate block w-full cursor-pointer"
                        >
                          {task.title}
                        </button>
                        <div className="text-[11px] text-[#56635C] mt-0.5">
                          {task.stage} · {task.priority} Priority
                          {task.completed ? ' · Completed' : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-[#56635C] font-mono">$</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          aria-label={`Estimated USD value for ${task.title}`}
                          value={
                            amountOverrides[task.id] !== undefined
                              ? amountOverrides[task.id]
                              : detectedAmountUsd !== null
                              ? String(detectedAmountUsd)
                              : ''
                          }
                          onChange={(e) =>
                            setAmountOverrides((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="0"
                          className="w-28 px-2.5 py-1.5 text-xs font-mono text-right bg-[#FBF9F4] border border-[#E4DFD3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20 tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Liabilities Bucket */}
            <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-[#EFE9DC] flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-[#1C2420]">
                    Liabilities Bucket Ledger
                  </h3>
                  <p className="text-[11px] text-[#56635C]">
                    Mortgages, credit lines, and claims · enter or adjust USD balances below
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-[#9C7832] tabular-nums shrink-0">
                  {formatUsd(aggregation.detectedLiabilitiesUsd)}
                </span>
              </div>

              {aggregation.liabilityItems.length === 0 ? (
                <div className="p-6 text-xs text-[#56635C] text-center">
                  No tasks recorded in the Liabilities bucket yet.
                </div>
              ) : (
                <div className="divide-y divide-[#EFE9DC] max-h-[260px] overflow-y-auto">
                  {aggregation.liabilityItems.map(({ task, detectedAmountUsd }) => (
                    <div
                      key={task.id}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectTask(task.id);
                          }}
                          className="text-xs font-medium text-[#1C2420] hover:text-[#1B4332] hover:underline text-left truncate block w-full cursor-pointer"
                        >
                          {task.title}
                        </button>
                        <div className="text-[11px] text-[#56635C] mt-0.5">
                          {task.stage} · {task.priority} Priority
                          {task.completed ? ' · Completed' : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-[#56635C] font-mono">$</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          aria-label={`Estimated USD balance for ${task.title}`}
                          value={
                            amountOverrides[task.id] !== undefined
                              ? amountOverrides[task.id]
                              : detectedAmountUsd !== null
                              ? String(detectedAmountUsd)
                              : ''
                          }
                          onChange={(e) =>
                            setAmountOverrides((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="0"
                          className="w-28 px-2.5 py-1.5 text-xs font-mono text-right bg-[#FBF9F4] border border-[#E4DFD3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20 tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Supporting Category Buckets Summary Strip */}
          <div className="bg-white border border-[#E4DFD3] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-medium text-[#1C2420]">
              Supporting Expense-Driving Buckets Included in AI Analysis:
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#56635C] tabular-nums">
              {otherBuckets.map((b, idx) => (
                <span key={b.category}>
                  {idx > 0 && <span className="mr-4 text-[#D7CFC0]">|</span>}
                  <span className="text-[#1C2420] font-medium">{b.category}:</span>{' '}
                  {b.openCount} open / {b.totalCount} total
                </span>
              ))}
            </div>
          </div>

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
                onClick={handleRunProjection}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B42318] bg-white hover:bg-[#FEE4E2] border border-[#FECDCA] rounded-lg whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* AI Estate Consultant Projection Section */}
          <section className="bg-white border border-[#E4DFD3] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFE9DC] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bot className="w-4 h-4 text-[#1B4332] shrink-0" />
                <div>
                  <h3 className="font-display text-base font-semibold text-[#1C2420]">
                    AI Estate Consultant — Immediate Post-Death Expense Forecast
                  </h3>
                  <p className="text-xs text-[#56635C]">
                    First 90 days of administration expenses estimated from your category buckets
                  </p>
                </div>
              </div>

              {projection && (
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#1B5E3A]" />
                      Copied Summary
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#56635C]" />
                      Copy Summary
                    </>
                  )}
                </button>
              )}
            </div>

            {!projection && !loading ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[#4F5B54] max-w-xl mx-auto">
                  Optionally enter dollar values above for any Assets or Liabilities tasks, then ask the AI Estate Consultant to estimate immediate Day 1–90 cash needs (funeral/final wishes, death certificates, probate &amp; legal retainers, property carry, and debt servicing).
                </p>
                <button
                  type="button"
                  disabled={tasks.length === 0}
                  onClick={handleRunProjection}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Bot className="w-4 h-4" />
                  Run AI Cashflow Projection
                </button>
              </div>
            ) : loading ? (
              <div className="p-10 flex flex-col items-center justify-center gap-3 text-xs text-[#56635C]">
                <Loader2 className="w-6 h-6 animate-spin text-[#1B4332]" />
                <span>
                  Analyzing Assets, Liabilities, Cashflow, Legal &amp; Probate, Insurance, and Final Wishes tasks...
                </span>
              </div>
            ) : projection ? (
              <div className="p-5 sm:p-6 space-y-6">
                {/* Executive Summary & Timeframe Subtotals */}
                <div className="space-y-4">
                  <p className="text-sm text-[#1C2420] leading-relaxed">
                    {projection.summary}
                  </p>

                  {timeframeTotals && (
                    <div className="bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3]">
                      <div className="p-3.5">
                        <div className="text-[11px] font-medium text-[#56635C]">
                          Immediate (1–7 days)
                        </div>
                        <div className="mt-0.5 font-mono text-lg font-semibold text-[#1C2420] tabular-nums">
                          {formatUsd(timeframeTotals.immediate)}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-medium text-[#56635C]">
                          Short-Term (8–30 days)
                        </div>
                        <div className="mt-0.5 font-mono text-lg font-semibold text-[#1C2420] tabular-nums">
                          {formatUsd(timeframeTotals.shortTerm)}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="text-[11px] font-medium text-[#56635C]">
                          Administration (31–90 days)
                        </div>
                        <div className="mt-0.5 font-mono text-lg font-semibold text-[#1C2420] tabular-nums">
                          {formatUsd(timeframeTotals.admin)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Itemized Expense Table */}
                <div className="overflow-x-auto border border-[#E4DFD3] rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F4EFE4] border-b border-[#E4DFD3] text-[11px] font-semibold text-[#4F5B54]">
                        <th className="py-2.5 px-4">Projected Expense &amp; Basis</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Category Bucket</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Timeframe</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Confidence</th>
                        <th className="py-2.5 px-4 text-right whitespace-nowrap">Est. Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFE9DC] text-xs">
                      {projection.expenseLineItems.map((item, idx) => (
                        <tr key={`${item.label}-${idx}`} className="hover:bg-[#FBF9F4]">
                          <td className="py-3 px-4 align-top">
                            <div className="font-medium text-[#1C2420]">{item.label}</div>
                            <div className="text-[11px] text-[#56635C] mt-0.5 leading-relaxed">
                              {item.rationale}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top text-[#4F5B54] whitespace-nowrap">
                            {item.linkedBucket}
                          </td>
                          <td className="py-3 px-3 align-top text-[#4F5B54] whitespace-nowrap">
                            {item.timeframe}
                          </td>
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <span
                              className={`font-medium ${
                                item.confidence === 'High'
                                  ? 'text-[#1B5E3A]'
                                  : item.confidence === 'Medium'
                                  ? 'text-[#9C7832]'
                                  : 'text-[#56635C]'
                              }`}
                            >
                              {item.confidence}
                            </span>
                          </td>
                          <td className="py-3 px-4 align-top text-right font-mono font-semibold text-[#1C2420] tabular-nums whitespace-nowrap">
                            {formatUsd(item.estimatedAmountUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#FBF9F4] border-t border-[#E4DFD3] text-xs font-semibold">
                        <td colSpan={4} className="py-2.5 px-4 text-[#1C2420]">
                          Total Estimated 90-Day Immediate Expenses
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#1B4332] tabular-nums">
                          {formatUsd(projection.estimatedTotalImmediateExpenses)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Liquidity Risks & Priority Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#1C2420]">
                      Observed Liquidity &amp; Timing Risks
                    </h4>
                    <ul className="space-y-1.5 text-xs text-[#4F5B54] list-disc pl-4 leading-relaxed">
                      {projection.liquidityRisks.map((risk, idx) => (
                        <li key={idx}>{risk}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#1C2420]">
                      Priority Actions to Fund Administration
                    </h4>
                    <ol className="space-y-1.5 text-xs text-[#4F5B54] list-decimal pl-4 leading-relaxed">
                      {projection.priorityActions.map((action, idx) => (
                        <li key={idx}>{action}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="pt-3 border-t border-[#EFE9DC] text-[11px] text-[#56635C] leading-relaxed">
                  {projection.disclaimer}
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

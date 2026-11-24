import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Filter, X } from 'lucide-react';
import type { EstateTask, TaskCategory } from '../types/estate';
import { computeTaskStatus, getTodayIso } from '../utils/taskHelpers';
import {
  buildCategoryDistribution,
  buildCompletionTrend,
  type CategoryDistributionItem,
  type CompletionTrendPoint,
  type TrendWindow,
} from '../utils/taskAnalytics';

interface TaskAnalyticsOverlayProps {
  estateTitle: string;
  allTasks: EstateTask[];
  filteredTasks: EstateTask[];
  hasActiveFilters: boolean;
  activeCategoryFilter: 'all' | TaskCategory;
  onFilterByCategory: (category: TaskCategory) => void;
  onClose: () => void;
}

const WINDOW_OPTIONS: Array<{ id: TrendWindow; label: string }> = [
  { id: '14d', label: '14 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
  { id: 'all', label: 'All Time' },
];

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CompletionTrendPoint }>;
}

function TrendTooltipContent({ active, payload }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="bg-[#FFFFFF] border border-[#D7CFC0] rounded-lg px-3 py-2 text-xs text-[#1C2420] shadow-sm">
      <div className="font-medium text-[#1C2420]">{point.label}</div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-[#56635C]">Completion Rate</span>
        <span className="font-mono font-semibold text-[#1B4332] tabular-nums">
          {point.completionRate.toFixed(1)}%
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-[#56635C]">Completed Tasks</span>
        <span className="font-mono text-[#1C2420] tabular-nums">
          {point.completedCount} / {point.totalCount}
        </span>
      </div>
    </div>
  );
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CategoryDistributionItem }>;
}

function CategoryPieTooltipContent({ active, payload }: PieTooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="bg-[#FFFFFF] border border-[#D7CFC0] rounded-lg px-3 py-2 text-xs text-[#1C2420] shadow-sm">
      <div className="flex items-center gap-2 font-medium text-[#1C2420]">
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: item.color }}
        />
        <span>{item.category}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-[#56635C]">Share of Tasks</span>
        <span className="font-mono font-semibold text-[#1C2420] tabular-nums">
          {item.total} ({item.sharePct.toFixed(1)}%)
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4">
        <span className="text-[#56635C]">Completed</span>
        <span className="font-mono text-[#1B4332] tabular-nums">
          {item.completed} / {item.total} ({item.completionPct}%)
        </span>
      </div>
    </div>
  );
}

export function TaskAnalyticsOverlay({
  estateTitle,
  allTasks,
  filteredTasks,
  hasActiveFilters,
  activeCategoryFilter,
  onFilterByCategory,
  onClose,
}: TaskAnalyticsOverlayProps) {
  const [scope, setScope] = useState<'all' | 'filtered'>(
    hasActiveFilters ? 'filtered' : 'all'
  );
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('30d');
  const [inspectedCategory, setInspectedCategory] = useState<TaskCategory | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const scopedTasks = scope === 'filtered' && hasActiveFilters ? filteredTasks : allTasks;
  const todayIso = getTodayIso();

  const summary = useMemo(() => {
    const total = scopedTasks.length;
    let completed = 0;
    let pastDue = 0;
    let upcoming = 0;
    let highPriorityOpen = 0;
    const activeCategories = new Set<TaskCategory>();

    for (const t of scopedTasks) {
      activeCategories.add(t.category);
      const status = computeTaskStatus(t, todayIso);
      if (status === 'completed') {
        completed += 1;
      } else {
        if (status === 'past_due') pastDue += 1;
        if (status === 'upcoming') upcoming += 1;
        if (t.priority === 'High') highPriorityOpen += 1;
      }
    }

    const open = total - completed;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      open,
      pastDue,
      upcoming,
      highPriorityOpen,
      completionPct,
      coveredCategories: activeCategories.size,
    };
  }, [scopedTasks, todayIso]);

  const trendData = useMemo(
    () => buildCompletionTrend(scopedTasks, trendWindow),
    [scopedTasks, trendWindow]
  );

  const categoryDistribution = useMemo(
    () => buildCategoryDistribution(scopedTasks, todayIso),
    [scopedTasks, todayIso]
  );

  const pieSlices = useMemo(
    () => categoryDistribution.filter((item) => item.total > 0),
    [categoryDistribution]
  );

  const selectedCategoryDetail = useMemo(() => {
    if (!inspectedCategory) return null;
    return categoryDistribution.find((c) => c.category === inspectedCategory) || null;
  }, [categoryDistribution, inspectedCategory]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-overlay-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#1C2420]/45 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-6xl bg-[#FBF9F4] border border-[#D7CFC0] rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Overlay Header */}
        <header className="px-5 sm:px-6 py-4 bg-white border-b border-[#E4DFD3] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-[#1B4332] shrink-0" />
              <h2
                id="analytics-overlay-title"
                className="font-display text-xl font-semibold text-[#1C2420]"
              >
                Estate Task Analytics
              </h2>
            </div>
            <p className="text-xs text-[#56635C] mt-0.5 tabular-nums">
              {estateTitle} · {scopedTasks.length} {scopedTasks.length === 1 ? 'task' : 'tasks'} in scope
              {scope === 'filtered' && hasActiveFilters ? ' · Filtered View' : ' · Complete Estate Ledger'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasActiveFilters && (
              <div
                role="group"
                aria-label="Analytics task scope"
                className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg border border-[#E4DFD3]"
              >
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    scope === 'all'
                      ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                      : 'text-[#56635C] hover:text-[#1C2420]'
                  }`}
                >
                  All Tasks ({allTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('filtered')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    scope === 'filtered'
                      ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                      : 'text-[#56635C] hover:text-[#1C2420]'
                  }`}
                >
                  Filtered ({filteredTasks.length})
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close analytics dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#EFE9DC] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4 text-[#56635C]" />
              Close
            </button>
          </div>
        </header>

        {/* Overlay Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {scopedTasks.length === 0 ? (
            <div className="bg-white border border-[#E4DFD3] rounded-xl p-10 text-center space-y-3">
              <p className="font-display text-lg font-medium text-[#1C2420]">
                No tasks available for analytics
              </p>
              <p className="text-sm text-[#56635C] max-w-md mx-auto">
                {scope === 'filtered' && hasActiveFilters
                  ? 'Your active workspace filters matched zero tasks. Switch to All Tasks to review the full estate distribution and completion trend.'
                  : 'Add tasks to your estate ledger or import a CSV playbook to generate completion trends and category breakdowns.'}
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                {scope === 'filtered' && hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Switch to All Tasks
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#1C2420] bg-[#F4EFE4] hover:bg-[#EAE3D4] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Return to Tasks
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 4-Column KPI Summary Strip */}
              <div className="bg-white border border-[#E4DFD3] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#EFE9DC]">
                <div className="p-4 sm:px-5">
                  <div className="text-xs font-medium text-[#56635C]">Completion Rate</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-[#1B4332] tabular-nums">
                    {summary.completionPct}%
                  </div>
                  <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
                    {summary.completed} of {summary.total} tasks complete
                  </div>
                </div>

                <div className="p-4 sm:px-5">
                  <div className="text-xs font-medium text-[#56635C]">Open Action Items</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-[#1C2420] tabular-nums">
                    {summary.open}
                  </div>
                  <div className="mt-0.5 text-xs text-[#56635C] tabular-nums">
                    {summary.pastDue > 0 ? (
                      <span className="text-[#B42318] font-medium">
                        {summary.pastDue} past due
                      </span>
                    ) : (
                      <span>0 past due</span>
                    )}
                    {' · '}
                    <span>{summary.upcoming} due in 14d</span>
                  </div>
                </div>

                <div className="p-4 sm:px-5">
                  <div className="text-xs font-medium text-[#56635C]">High Priority Open</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-[#9C7832] tabular-nums">
                    {summary.highPriorityOpen}
                  </div>
                  <div className="mt-0.5 text-xs text-[#56635C]">
                    Critical executor & planning items
                  </div>
                </div>

                <div className="p-4 sm:px-5">
                  <div className="text-xs font-medium text-[#56635C]">Category Coverage</div>
                  <div className="mt-1 font-mono text-2xl font-semibold text-[#1C2420] tabular-nums">
                    {summary.coveredCategories} / 7
                  </div>
                  <div className="mt-0.5 text-xs text-[#56635C]">
                    Active archival buckets
                  </div>
                </div>
              </div>

              {/* Primary Charts Row */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
                {/* Completion Rate Trend Line Chart */}
                <section
                  aria-label="Task Completion Rate Over Time"
                  className="xl:col-span-7 bg-white border border-[#E4DFD3] rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-[#1C2420]">
                        Task Completion Rate Over Time
                      </h3>
                      <p className="text-xs text-[#56635C] mt-0.5">
                        Cumulative percentage of scoped tasks completed across the selected period
                      </p>
                    </div>

                    <div
                      role="group"
                      aria-label="Trend time window"
                      className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg border border-[#E4DFD3] shrink-0"
                    >
                      {WINDOW_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTrendWindow(opt.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            trendWindow === opt.id
                              ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                              : 'text-[#56635C] hover:text-[#1C2420]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full h-[290px] pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendData}
                        margin={{ top: 10, right: 14, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid
                          stroke="#EFE9DC"
                          strokeDasharray="3 3"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#56635C' }}
                          tickLine={false}
                          axisLine={{ stroke: '#E4DFD3' }}
                          minTickGap={24}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickFormatter={(value: number) => `${value}%`}
                          tick={{ fontSize: 11, fill: '#56635C' }}
                          tickLine={false}
                          axisLine={false}
                          width={44}
                        />
                        <ReferenceLine
                          y={100}
                          stroke="#D7CFC0"
                          strokeDasharray="4 4"
                        />
                        <Tooltip content={<TrendTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="completionRate"
                          name="Completion Rate"
                          stroke="#1B4332"
                          strokeWidth={2.5}
                          dot={{ r: 2.5, fill: '#1B4332', strokeWidth: 0 }}
                          activeDot={{
                            r: 5,
                            fill: '#9C7832',
                            stroke: '#FFFFFF',
                            strokeWidth: 2,
                          }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="pt-2 border-t border-[#EFE9DC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#56635C] tabular-nums">
                    <span>
                      Period start:{' '}
                      <strong className="font-medium text-[#1C2420]">
                        {trendData[0]?.label || '—'}
                      </strong>{' '}
                      ({trendData[0]?.completionRate.toFixed(1) ?? '0.0'}%)
                    </span>
                    <span>
                      Current rate:{' '}
                      <strong className="font-mono font-semibold text-[#1B4332]">
                        {trendData[trendData.length - 1]?.completionRate.toFixed(1) ?? '0.0'}%
                      </strong>
                    </span>
                  </div>
                </section>

                {/* Category Distribution Pie Chart */}
                <section
                  aria-label="Task Distribution by Category"
                  className="xl:col-span-5 bg-white border border-[#E4DFD3] rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[#1C2420]">
                      Tasks by Category
                    </h3>
                    <p className="text-xs text-[#56635C] mt-0.5">
                      Distribution across the 7 archival estate buckets · click a category to inspect or filter
                    </p>
                  </div>

                  <div className="relative w-full h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieSlices}
                          dataKey="total"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={56}
                          outerRadius={88}
                          paddingAngle={2}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                          isAnimationActive={false}
                          onClick={(_data, index) => {
                            const cat = pieSlices[index]?.category;
                            if (cat) {
                              setInspectedCategory((prev) => (prev === cat ? null : cat));
                            }
                          }}
                        >
                          {pieSlices.map((entry) => {
                            const isSelected = inspectedCategory === entry.category;
                            return (
                              <Cell
                                key={entry.category}
                                fill={entry.color}
                                opacity={
                                  inspectedCategory && !isSelected ? 0.45 : 1
                                }
                                className="cursor-pointer outline-none"
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip content={<CategoryPieTooltipContent />} />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Centered Donut Total */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-xl font-semibold text-[#1C2420] tabular-nums">
                        {summary.total}
                      </span>
                      <span className="text-[11px] text-[#56635C]">
                        {summary.total === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  </div>

                  {/* Selected Category Action Strip */}
                  {selectedCategoryDetail && (
                    <div className="px-3.5 py-2.5 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-[#1C2420] tabular-nums">
                        <span className="font-semibold">{selectedCategoryDetail.category}</span>
                        {' · '}
                        <span className="text-[#56635C]">
                          {selectedCategoryDetail.completed} of {selectedCategoryDetail.total} complete
                          {selectedCategoryDetail.pastDue > 0
                            ? ` · ${selectedCategoryDetail.pastDue} past due`
                            : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onFilterByCategory(selectedCategoryDetail.category);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1B4332] bg-white hover:bg-[#F4EFE4] border border-[#D7CFC0] rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Filter className="w-3 h-3" />
                        Filter Workspace
                      </button>
                    </div>
                  )}

                  {/* Clean Tabular Legend */}
                  <div className="divide-y divide-[#EFE9DC] border-t border-[#EFE9DC]">
                    {categoryDistribution.map((row) => {
                      const isInspected = inspectedCategory === row.category;
                      const isWorkspaceActive = activeCategoryFilter === row.category;
                      return (
                        <button
                          key={row.category}
                          type="button"
                          onClick={() =>
                            setInspectedCategory((prev) =>
                              prev === row.category ? null : row.category
                            )
                          }
                          className={`w-full py-2 px-1.5 flex items-center justify-between gap-3 text-left text-xs transition-colors cursor-pointer ${
                            isInspected ? 'bg-[#F4EFE4]' : 'hover:bg-[#FBF9F4]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: row.color }}
                            />
                            <span className="font-medium text-[#1C2420] truncate">
                              {row.category}
                            </span>
                            {isWorkspaceActive && (
                              <span className="text-[11px] text-[#1B4332] font-medium shrink-0">
                                · Active filter
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                            <span className="text-[#56635C]">
                              {row.completed}/{row.total} done
                            </span>
                            <span className="w-12 text-right font-medium text-[#1C2420]">
                              {row.sharePct.toFixed(0)}%
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

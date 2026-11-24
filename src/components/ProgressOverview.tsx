import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ListTodo } from 'lucide-react';
import type { TaskStatusBucket, TaskStatusFilter } from '../types/estate';

interface ProgressOverviewProps {
  totalCount: number;
  completedCount: number;
  pastDueCount: number;
  upcomingCount: number;
  outstandingCount: number;
  activeStatusFilter: TaskStatusFilter;
  onSelectStatusFilter: (status: TaskStatusFilter) => void;
  isDraggingTask?: boolean;
  canEdit?: boolean;
  onDropStatus?: (status: TaskStatusBucket) => void;
}

export function ProgressOverview({
  totalCount,
  completedCount,
  pastDueCount,
  upcomingCount,
  outstandingCount,
  activeStatusFilter,
  onSelectStatusFilter,
  isDraggingTask = false,
  canEdit = false,
  onDropStatus,
}: ProgressOverviewProps) {
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatusBucket | null>(null);
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const counters: Array<{
    id: TaskStatusBucket;
    label: string;
    count: number;
    icon: typeof AlertCircle;
    activeClass: string;
    textColor: string;
  }> = [
    {
      id: 'past_due',
      label: 'Past Due',
      count: pastDueCount,
      icon: AlertCircle,
      activeClass: 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]',
      textColor: 'text-[#B42318]',
    },
    {
      id: 'upcoming',
      label: 'Upcoming (14d)',
      count: upcomingCount,
      icon: Clock,
      activeClass: 'bg-[#FEF7EC] border-[#F3DFC1] text-[#B45309]',
      textColor: 'text-[#B45309]',
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      count: outstandingCount,
      icon: ListTodo,
      activeClass: 'bg-[#F4EFE4] border-[#D7CFC0] text-[#1C2420]',
      textColor: 'text-[#4F5B54]',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: completedCount,
      icon: CheckCircle2,
      activeClass: 'bg-[#ECFDF3] border-[#ABEFC6] text-[#1B5E3A]',
      textColor: 'text-[#1B5E3A]',
    },
  ];

  return (
    <section
      data-tour="progress-overview"
      aria-label="Global Estate Progress Overview"
      className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-[#1C2420]">
            Estate Readiness Overview
          </h1>
          <p className="text-sm text-[#56635C] tabular-nums">
            <span className="font-semibold text-[#1C2420]">{completedCount}</span> of{' '}
            <span className="font-semibold text-[#1C2420]">{totalCount}</span> tasks complete across all 7 categories
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-2xl font-semibold text-[#1B4332] tabular-nums">
            {pct}%
          </div>
          <div className="text-xs text-[#56635C]">Completion Rate</div>
        </div>
      </div>

      {/* Live Progress Bar */}
      <div className="w-full h-2.5 bg-[#EFE9DC] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1B4332] transition-all duration-300 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Interactive Status Filter & Drop Target Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        {counters.map((item) => {
          const Icon = item.icon;
          const isSelected = activeStatusFilter === item.id;
          const isDragHover = isDraggingTask && canEdit && dragOverStatus === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectStatusFilter(isSelected ? 'all' : item.id)}
              onDragOver={(e) => {
                if (!canEdit || !isDraggingTask) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverStatus !== item.id) setDragOverStatus(item.id);
              }}
              onDragLeave={() => {
                if (dragOverStatus === item.id) setDragOverStatus(null);
              }}
              onDrop={(e) => {
                if (!canEdit || !isDraggingTask) return;
                e.preventDefault();
                setDragOverStatus(null);
                onDropStatus?.(item.id);
              }}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left transition-colors cursor-pointer ${
                isDragHover
                  ? 'border-dashed border-[#1B4332] bg-[#EAF2EE] ring-2 ring-[#1B4332]/20'
                  : isSelected
                  ? item.activeClass
                  : isDraggingTask && canEdit
                  ? 'bg-[#FBF9F4] border-dashed border-[#B9B09E] hover:bg-[#F4EFE4]'
                  : 'bg-[#FBF9F4] border-[#E4DFD3] hover:bg-[#F4EFE4]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${item.textColor}`} />
                <span className="text-xs font-medium text-[#1C2420] truncate">
                  {isDragHover ? `Move to ${item.label}` : item.label}
                </span>
              </div>
              <span className={`font-mono text-base font-semibold tabular-nums ${item.textColor}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

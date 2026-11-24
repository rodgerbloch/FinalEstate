import { BellRing, FileDown, X } from 'lucide-react';
import type { Estate, EstateStage, EstateTask, NavSection } from '../types/estate';
import { formatDateTime } from '../utils/taskHelpers';

interface TopBarProps {
  estate: Estate;
  activeNav: NavSection;
  isOwner: boolean;
  onChangeStage: (stage: EstateStage) => void;
  onOpenExportModal: () => void;
  dueReminders: EstateTask[];
  onInspectTask: (taskId: string) => void;
  onDismissReminder: (taskId: string) => void;
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
}

const SECTION_LABELS: Record<NavSection, string> = {
  tasks: 'Master Task List',
  summary: 'Executive Summary',
  vault: 'Secure Document Vault',
  sharing: 'Shared Access & Collaborators',
  consultant: 'AI Estate Consultant',
};

export function TopBar({
  estate,
  activeNav,
  isOwner,
  onChangeStage,
  onOpenExportModal,
  dueReminders,
  onInspectTask,
  onDismissReminder,
  notificationPermission,
  onRequestNotificationPermission,
}: TopBarProps) {
  return (
    <div className="shrink-0 bg-[#FBF9F4] border-b border-[#E4DFD3]">
      <header className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Context / Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-base sm:text-lg font-semibold text-[#1C2420] truncate max-w-[200px] sm:max-w-[260px]">
            {estate.title}
          </span>
          <span className="text-[#78827B]" aria-hidden="true">/</span>
          <span className="text-sm text-[#4F5B54] whitespace-nowrap truncate">
            {SECTION_LABELS[activeNav]}
          </span>
        </div>

        {/* Zone 2: Active Stage Control */}
        <div
          data-tour="stage-switcher"
          className="flex items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg border border-[#E4DFD3]"
        >
          {(['Pre-Need Planning', 'Executor Action'] as EstateStage[]).map((stage) => {
            const active = estate.activeStage === stage;
            return (
              <button
                key={stage}
                type="button"
                disabled={!isOwner}
                onClick={() => isOwner && onChangeStage(stage)}
                title={isOwner ? `Switch estate stage to ${stage}` : `Active stage: ${estate.activeStage}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                    : 'text-[#56635C] hover:text-[#1C2420]'
                } ${!isOwner ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {stage}
              </button>
            );
          })}
        </div>

        {/* Zone 3: Global Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            data-tour="export-report"
            onClick={onOpenExportModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </header>

      {/* In-App Upcoming Reminder Alert Fallback */}
      {dueReminders.length > 0 && (
        <div className="px-4 sm:px-6 py-2.5 bg-[#FEF7EC] border-t border-[#F3DFC1] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BellRing className="w-4 h-4 text-[#B45309] shrink-0" />
            <div className="text-xs text-[#7C3A06] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">
                {dueReminders.length} Upcoming Reminder{dueReminders.length > 1 ? 's' : ''}:
              </span>
              {dueReminders.slice(0, 2).map((t, idx) => (
                <span key={t.id} className="inline-flex items-center gap-1.5">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => onInspectTask(t.id)}
                    className="underline font-medium hover:text-[#1C2420] cursor-pointer"
                  >
                    {t.title}
                  </button>
                  <span className="font-mono text-[11px] text-[#9C7832]">
                    ({formatDateTime(t.reminderAt)})
                  </span>
                  <button
                    type="button"
                    onClick={() => onDismissReminder(t.id)}
                    aria-label={`Dismiss reminder for ${t.title}`}
                    className="p-0.5 hover:bg-[#F3DFC1] rounded cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {notificationPermission === 'default' && (
            <button
              type="button"
              onClick={onRequestNotificationPermission}
              className="text-xs font-medium text-[#1B4332] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enable Browser Alerts
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  FileDown,
  FolderLock,
  Loader2,
  Play,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { Estate, EstateStage, EstateTask, NavSection } from '../types/estate';
import { computeTaskStatus, getTodayIso } from '../utils/taskHelpers';

interface ExecutorOnboardingTourProps {
  estate: Estate;
  tasks: EstateTask[];
  documentsCount: number;
  isOwner: boolean;
  onSelectNav: (nav: NavSection) => void;
  onChangeStage: (stage: EstateStage) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onOpenExportModal: () => void;
  onCompleteTour: () => void;
  onCloseTour: () => void;
}

interface TourStepDef {
  id: string;
  target: string;
  nav: NavSection;
  kicker: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'stage',
    target: 'stage-switcher',
    nav: 'tasks',
    kicker: 'Step 01 of 06 · Administration Phase',
    title: 'Activate the Executor Action Phase',
    description:
      'Estate Ledger separates advance preparation (Pre-Need Planning) from time-sensitive post-death settlement (Executor Action). Switch the active stage here when administration begins so your workspace highlights immediate executor duties.',
  },
  {
    id: 'readiness',
    target: 'progress-overview',
    nav: 'tasks',
    kicker: 'Step 02 of 06 · Immediate Priorities',
    title: 'Triage Past-Due & Upcoming Deadlines',
    description:
      'Your Readiness Overview tracks overall completion and groups open work into interactive counters. Select Past Due or Upcoming (14d) to isolate court filings, benefit notices, and urgent deadlines right away.',
  },
  {
    id: 'playbook',
    target: 'task-toolbar',
    nav: 'tasks',
    kicker: 'Step 03 of 06 · Guided Playbook',
    title: 'Work the 7-Bucket Estate Playbook',
    description:
      'Organize tasks across all 7 archival categories with global search (/), Quick Actions, Analytics, and CSV bulk tools. Click any task card to open step-by-step instructions, pre-requisite dependency locks, reminders, and collaborator notes.',
  },
  {
    id: 'vault',
    target: 'nav-vault',
    nav: 'vault',
    kicker: 'Step 04 of 06 · Document Vault',
    title: 'Collect Certificates & Records in the Vault',
    description:
      'Store certified death certificates, the Will, Letters Testamentary, deeds, and statements in the Secure Document Vault. Files are fingerprinted with SHA-256 and can be linked straight to any task.',
  },
  {
    id: 'sharing',
    target: 'nav-sharing',
    nav: 'sharing',
    kicker: 'Step 05 of 06 · Advisors & Family',
    title: 'Coordinate Co-Executors & Legal Advisors',
    description:
      'Invite Co-Executors, Legal Advisors, Financial Advisors, or Family Members by email with View & Update or View Only permissions, optionally scoped to specific tasks.',
  },
  {
    id: 'launch',
    target: 'export-report',
    nav: 'tasks',
    kicker: 'Step 06 of 06 · Ready to Administer',
    title: 'Launch Administration & Legal Briefings',
    description:
      'Use Export Report anytime to generate a formatted legal meeting PDF or plain-text summary for probate counsel and financial institutions. Follow this quick launch checklist to get started:',
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findVisibleTargetRect(targetAttr: string): SpotlightRect | null {
  const nodes = document.querySelectorAll(`[data-tour="${targetAttr}"]`);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }
  }
  return null;
}

export function ExecutorOnboardingTour({
  estate,
  tasks,
  documentsCount,
  isOwner,
  onSelectNav,
  onChangeStage,
  onSelectTask,
  onOpenExportModal,
  onCompleteTour,
  onCloseTour,
}: ExecutorOnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [switchingStage, setSwitchingStage] = useState(false);

  const currentStep = TOUR_STEPS[stepIndex];
  const todayIso = getTodayIso();

  const tourStats = useMemo(() => {
    let pastDue = 0;
    let upcoming = 0;
    for (const t of tasks) {
      const s = computeTaskStatus(t, todayIso);
      if (s === 'past_due') pastDue += 1;
      else if (s === 'upcoming') upcoming += 1;
    }

    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    const firstExecutorTask =
      tasks
        .filter((t) => !t.completed && t.stage === 'Executor Action')
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0] ||
      tasks.find((t) => !t.completed) ||
      tasks[0] ||
      null;

    return { pastDue, upcoming, firstExecutorTask };
  }, [tasks, todayIso]);

  // Switch workspace section automatically as the user steps through the tour
  useEffect(() => {
    onSelectNav(currentStep.nav);
  }, [currentStep.nav, onSelectNav]);

  const measureTarget = useCallback(() => {
    const nodes = document.querySelectorAll(`[data-tour="${currentStep.target}"]`);
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        (node as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
        break;
      }
    }
    const nextRect = findVisibleTargetRect(currentStep.target);
    setTargetRect(nextRect);
  }, [currentStep.target]);

  useEffect(() => {
    const raf1 = window.requestAnimationFrame(measureTarget);
    const timer = window.setTimeout(measureTarget, 120);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(timer);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [measureTarget, stepIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseTour();
      } else if (e.key === 'ArrowRight') {
        if (stepIndex < TOUR_STEPS.length - 1) {
          setStepIndex((i) => i + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) {
          setStepIndex((i) => i - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepIndex, onCloseTour]);

  const handleActivateExecutorPhase = async () => {
    if (!isOwner || switchingStage || estate.activeStage === 'Executor Action') return;
    setSwitchingStage(true);
    try {
      await onChangeStage('Executor Action');
    } finally {
      setSwitchingStage(false);
    }
  };

  // Compute safe popover card placement inside viewport
  const cardLayout = useMemo(() => {
    if (typeof window === 'undefined' || !targetRect || window.innerWidth < 640) {
      return null;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(410, vw - 32);
    const estCardH = 340;
    const gap = 16;

    const spaceBelow = vh - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;
    const spaceRight = vw - (targetRect.left + targetRect.width);

    let left = targetRect.left + targetRect.width / 2 - cardW / 2;
    let top = targetRect.top + targetRect.height + gap;

    if (spaceBelow >= estCardH + gap) {
      top = targetRect.top + targetRect.height + gap;
    } else if (spaceAbove >= estCardH + gap) {
      top = targetRect.top - estCardH - gap;
    } else if (spaceRight >= cardW + gap + 16) {
      left = targetRect.left + targetRect.width + gap;
      top = targetRect.top;
    } else {
      top = Math.max(16, (vh - estCardH) / 2);
      left = Math.max(16, (vw - cardW) / 2);
    }

    left = Math.max(16, Math.min(left, vw - cardW - 16));
    top = Math.max(16, Math.min(top, vh - estCardH - 16));

    return { top, left, width: cardW };
  }, [targetRect]);

  const pad = 6;
  const cutout = targetRect
    ? {
        x: Math.max(0, targetRect.left - pad),
        y: Math.max(0, targetRect.top - pad),
        w: targetRect.width + pad * 2,
        h: targetRect.height + pad * 2,
      }
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="executor-tour-title"
      className="fixed inset-0 z-50"
    >
      {/* Dimmed Scrim with SVG Spotlight Cutout */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto"
        onClick={onCloseTour}
        aria-hidden="true"
      >
        <defs>
          <mask id="executor-tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.x}
                y={cutout.y}
                width={cutout.w}
                height={cutout.h}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(28, 36, 32, 0.55)"
          mask="url(#executor-tour-spotlight-mask)"
        />
      </svg>

      {/* Highlight Frame Around Active Element */}
      {cutout && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-[10px] border-2 border-[#9C7832] shadow-[0_0_0_4px_rgba(156,120,50,0.2)] transition-all duration-200"
          style={{
            top: cutout.y,
            left: cutout.x,
            width: cutout.w,
            height: cutout.h,
          }}
        />
      )}

      {/* Guided Tour Popover Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          cardLayout
            ? {
                position: 'fixed',
                top: `${cardLayout.top}px`,
                left: `${cardLayout.left}px`,
                width: `${cardLayout.width}px`,
              }
            : undefined
        }
        className={`${
          cardLayout
            ? ''
            : 'fixed inset-x-3 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[410px]'
        } bg-[#FBF9F4] border border-[#D7CFC0] rounded-xl shadow-[0_20px_48px_-12px_rgba(28,36,32,0.3)] overflow-hidden z-10`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-white border-b border-[#E4DFD3] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-4 h-4 text-[#1B4332] shrink-0" />
            <span className="font-mono text-[11px] font-medium text-[#9C7832] truncate tabular-nums">
              {currentStep.kicker}
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseTour}
            aria-label="Close onboarding tour"
            className="p-1 text-[#56635C] hover:text-[#1C2420] hover:bg-[#F4EFE4] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <h3
              id="executor-tour-title"
              className="font-display text-lg font-semibold text-[#1C2420]"
            >
              {currentStep.title}
            </h3>
            <p className="text-xs leading-relaxed text-[#4F5B54]">
              {currentStep.description}
            </p>
          </div>

          {/* Step-Specific Interactive Guidance */}
          {currentStep.id === 'stage' && (
            <div className="p-3 bg-white border border-[#E4DFD3] rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#56635C]">Current Active Stage</span>
                <span
                  className={`font-medium ${
                    estate.activeStage === 'Executor Action'
                      ? 'text-[#1B4332]'
                      : 'text-[#9C7832]'
                  }`}
                >
                  {estate.activeStage}
                </span>
              </div>
              {isOwner ? (
                estate.activeStage === 'Executor Action' ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#1B5E3A]">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Administration phase is active on this estate.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={switchingStage}
                    onClick={handleActivateExecutorPhase}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {switchingStage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Activate Executor Action Phase
                  </button>
                )
              ) : (
                <p className="text-[11px] text-[#56635C]">
                  The Estate Owner controls the global stage switch; you can filter your task list to the Executor phase anytime.
                </p>
              )}
            </div>
          )}

          {currentStep.id === 'readiness' && (
            <div className="px-3 py-2.5 bg-white border border-[#E4DFD3] rounded-lg flex items-center justify-between text-xs tabular-nums">
              <span className="text-[#56635C]">Current Urgent Queue</span>
              <span className="font-mono font-medium text-[#1C2420]">
                {tourStats.pastDue} past due · {tourStats.upcoming} due in 14d
              </span>
            </div>
          )}

          {currentStep.id === 'playbook' && tourStats.firstExecutorTask && (
            <div className="p-3 bg-white border border-[#E4DFD3] rounded-lg flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-[#56635C]">Recommended Starting Task</div>
                <div className="text-xs font-medium text-[#1C2420] truncate">
                  {tourStats.firstExecutorTask.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onCompleteTour();
                  onSelectTask(tourStats.firstExecutorTask!.id);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] border border-[#D7CFC0] rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Task
              </button>
            </div>
          )}

          {currentStep.id === 'vault' && (
            <div className="px-3 py-2.5 bg-white border border-[#E4DFD3] rounded-lg flex items-center justify-between text-xs tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-[#56635C]">
                <FolderLock className="w-3.5 h-3.5 text-[#1B4332]" />
                Vault Inventory
              </span>
              <span className="font-mono font-medium text-[#1C2420]">
                {documentsCount} {documentsCount === 1 ? 'document' : 'documents'} stored
              </span>
            </div>
          )}

          {currentStep.id === 'sharing' && (
            <div className="px-3 py-2.5 bg-white border border-[#E4DFD3] rounded-lg flex items-center gap-2 text-xs text-[#4F5B54]">
              <Users className="w-3.5 h-3.5 text-[#1B4332] shrink-0" />
              <span>
                Every shared task supports timestamped collaborator notes, questions, and status updates.
              </span>
            </div>
          )}

          {currentStep.id === 'launch' && (
            <div className="bg-white border border-[#E4DFD3] rounded-lg divide-y divide-[#EFE9DC] text-xs">
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck
                    className={`w-3.5 h-3.5 shrink-0 ${
                      estate.activeStage === 'Executor Action'
                        ? 'text-[#1B5E3A]'
                        : 'text-[#9C7832]'
                    }`}
                  />
                  <span className="text-[#1C2420] truncate">
                    1. Set stage to Executor Action
                  </span>
                </div>
                {estate.activeStage === 'Executor Action' ? (
                  <span className="font-mono text-[11px] text-[#1B5E3A] shrink-0">Active</span>
                ) : isOwner ? (
                  <button
                    type="button"
                    disabled={switchingStage}
                    onClick={handleActivateExecutorPhase}
                    className="px-2 py-1 text-[11px] font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] rounded border border-[#D7CFC0] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {switchingStage ? 'Saving...' : 'Activate'}
                  </button>
                ) : null}
              </div>

              {tourStats.firstExecutorTask && (
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[#1C2420] truncate">
                    2. Open: {tourStats.firstExecutorTask.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onCompleteTour();
                      onSelectTask(tourStats.firstExecutorTask!.id);
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] rounded border border-[#D7CFC0] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Task
                  </button>
                </div>
              )}

              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[#1C2420] truncate">
                  3. Review legal meeting briefing
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onCompleteTour();
                    onOpenExportModal();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] rounded border border-[#D7CFC0] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileDown className="w-3 h-3" />
                  Export
                </button>
              </div>
            </div>
          )}

          {/* Step Dots */}
          <div className="flex items-center gap-1.5 pt-1" aria-label="Tour progress">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                aria-label={`Go to step ${idx + 1}: ${s.title}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === stepIndex
                    ? 'w-6 bg-[#1B4332]'
                    : idx < stepIndex
                    ? 'w-3 bg-[#9C7832]'
                    : 'w-3 bg-[#D7CFC0] hover:bg-[#B9B09E]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-3 bg-white border-t border-[#E4DFD3] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCloseTour}
            className="text-xs font-medium text-[#56635C] hover:text-[#1C2420] whitespace-nowrap cursor-pointer"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#EFE9DC] border border-[#E4DFD3] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}

            {stepIndex < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onCompleteTour}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Finish Walkthrough
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

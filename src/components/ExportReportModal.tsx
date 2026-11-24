import { useState } from 'react';
import { Check, Copy, FileSpreadsheet, Printer, X } from 'lucide-react';
import type { Estate, EstateTask, VaultDocument } from '../types/estate';
import { buildPlainTextReport, computeTaskStatus, getTodayIso } from '../utils/taskHelpers';
import { exportTasksToCsv, triggerCsvDownload } from '../utils/csvTasks';

export interface ExportOptions {
  includeCompleted: boolean;
  includeVault: boolean;
  includeInstructions: boolean;
}

interface ExportReportModalProps {
  estate: Estate;
  tasks: EstateTask[];
  documents: VaultDocument[];
  options: ExportOptions;
  onChangeOptions: (next: ExportOptions) => void;
  onClose: () => void;
}

export function ExportReportModal({
  estate,
  tasks,
  documents,
  options,
  onChangeOptions,
  onClose,
}: ExportReportModalProps) {
  const [copied, setCopied] = useState(false);

  const visibleTasksCount = options.includeCompleted
    ? tasks.length
    : tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const pastDueCount = tasks.filter((t) => computeTaskStatus(t) === 'past_due').length;

  const handleCopyPlainText = async () => {
    const text = buildPlainTextReport({
      estate,
      tasks,
      documents,
      ...options,
    });
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleDownloadCsv = () => {
    const list = options.includeCompleted ? tasks : tasks.filter((t) => !t.completed);
    const slug =
      estate.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'estate-ledger';
    triggerCsvDownload(`${slug}-tasks-${getTodayIso()}.csv`, exportTasksToCsv(list));
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#1C2420]">
              Export Legal Meeting Briefing
            </h2>
            <p className="text-xs text-[#56635C] mt-0.5">
              Formatted for US-Letter PDF printing or plain-text attorney summaries
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 text-[#56635C] hover:text-[#1C2420] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Live Item Counts */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg text-center">
            <div>
              <div className="font-mono text-lg font-semibold text-[#1C2420] tabular-nums">
                {visibleTasksCount}
              </div>
              <div className="text-[11px] text-[#56635C]">Tasks in Briefing</div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold text-[#B42318] tabular-nums">
                {pastDueCount}
              </div>
              <div className="text-[11px] text-[#56635C]">Past Due</div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold text-[#1B4332] tabular-nums">
                {options.includeVault ? documents.length : 0}
              </div>
              <div className="text-[11px] text-[#56635C]">Vault Files</div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <label className="flex items-start justify-between gap-3 p-3 border border-[#E4DFD3] rounded-lg cursor-pointer hover:bg-[#FBF9F4]">
              <div>
                <div className="text-sm font-medium text-[#1C2420]">Include completed tasks</div>
                <div className="text-xs text-[#56635C]">
                  Show {completedCount} completed record{completedCount !== 1 ? 's' : ''} for audit trail
                </div>
              </div>
              <input
                type="checkbox"
                checked={options.includeCompleted}
                onChange={(e) =>
                  onChangeOptions({ ...options, includeCompleted: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-[#1B4332]"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3 border border-[#E4DFD3] rounded-lg cursor-pointer hover:bg-[#FBF9F4]">
              <div>
                <div className="text-sm font-medium text-[#1C2420]">Include document vault inventory</div>
                <div className="text-xs text-[#56635C]">
                  List all {documents.length} archived file{documents.length !== 1 ? 's' : ''} with SHA-256 checksums
                </div>
              </div>
              <input
                type="checkbox"
                checked={options.includeVault}
                onChange={(e) =>
                  onChangeOptions({ ...options, includeVault: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-[#1B4332]"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3 border border-[#E4DFD3] rounded-lg cursor-pointer hover:bg-[#FBF9F4]">
              <div>
                <div className="text-sm font-medium text-[#1C2420]">Include step-by-step instructions</div>
                <div className="text-xs text-[#56635C]">
                  Print numbered action steps beneath each estate task
                </div>
              </div>
              <input
                type="checkbox"
                checked={options.includeInstructions}
                onChange={(e) =>
                  onChangeOptions({ ...options, includeInstructions: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-[#1B4332]"
              />
            </label>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E4DFD3]">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B4332]" />
              Download CSV
            </button>

            <button
              type="button"
              onClick={handleCopyPlainText}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#1B5E3A]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied Summary' : 'Copy Plain-Text Summary'}
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

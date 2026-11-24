import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import type { EstateTask } from '../types/estate';
import {
  buildCsvTemplate,
  exportTasksToCsv,
  parseTasksCsv,
  triggerCsvDownload,
  type CsvImportTaskInput,
  type CsvParseResult,
} from '../utils/csvTasks';
import { getTodayIso } from '../utils/taskHelpers';

interface CsvTasksModalProps {
  estateTitle: string;
  allTasks: EstateTask[];
  filteredTasks: EstateTask[];
  hasActiveFilters: boolean;
  canEdit: boolean;
  onImportTasks: (items: CsvImportTaskInput[]) => Promise<number>;
  onClose: () => void;
}

export function CsvTasksModal({
  estateTitle,
  allTasks,
  filteredTasks,
  hasActiveFilters,
  canEdit,
  onImportTasks,
  onClose,
}: CsvTasksModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>(
    hasActiveFilters ? 'filtered' : 'all'
  );
  const [includeCompleted, setIncludeCompleted] = useState(true);

  const [selectedFileName, setSelectedFileName] = useState('');
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const existingTitleSet = useMemo(
    () => new Set(allTasks.map((t) => t.title.trim().toLowerCase())),
    [allTasks]
  );

  const exportCandidates = useMemo(() => {
    const base = exportScope === 'filtered' ? filteredTasks : allTasks;
    return includeCompleted ? base : base.filter((t) => !t.completed);
  }, [exportScope, includeCompleted, filteredTasks, allTasks]);

  const safeFileSlug = useMemo(() => {
    const slug = estateTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return slug || 'estate-ledger';
  }, [estateTitle]);

  const handleDownloadTasksCsv = () => {
    const csv = exportTasksToCsv(exportCandidates);
    triggerCsvDownload(`${safeFileSlug}-tasks-${getTodayIso()}.csv`, csv);
  };

  const handleDownloadTemplate = () => {
    const csv = buildCsvTemplate();
    triggerCsvDownload('estate-ledger-import-template.csv', csv);
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setSelectedFileName(file.name);
    setImportError('');
    setImportedCount(null);
    if (file.size > 2 * 1024 * 1024) {
      setParseResult(null);
      setImportError('CSV file exceeds the 2 MB limit.');
      return;
    }
    const text = await file.text();
    const parsed = parseTasksCsv(text);
    setParseResult(parsed);
  };

  const tasksReadyToImport = useMemo(() => {
    if (!parseResult) return [];
    if (!skipDuplicates) return parseResult.validTasks;
    return parseResult.validTasks.filter(
      (t) => !existingTitleSet.has(t.title.trim().toLowerCase())
    );
  }, [parseResult, skipDuplicates, existingTitleSet]);

  const duplicateCount = useMemo(() => {
    if (!parseResult) return 0;
    return parseResult.validTasks.filter((t) =>
      existingTitleSet.has(t.title.trim().toLowerCase())
    ).length;
  }, [parseResult, existingTitleSet]);

  const handleRunImport = async () => {
    if (!canEdit || tasksReadyToImport.length === 0 || importing) return;
    setImporting(true);
    setImportError('');
    try {
      const count = await onImportTasks(tasksReadyToImport);
      setImportedCount(count);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to import CSV tasks.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E4DFD3] bg-[#FBF9F4] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-[#1B4332] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-[#1C2420]">
                CSV Task Export &amp; Bulk Import
              </h2>
              <p className="text-xs text-[#56635C]">
                Export your estate checklist to spreadsheets or import multiple tasks from a CSV template
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV modal"
            className="p-1.5 text-[#56635C] hover:text-[#1C2420] hover:bg-[#EFE9DC] rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-3 border-b border-[#E4DFD3] flex items-center gap-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'export'
                ? 'border-[#1B4332] text-[#1B4332]'
                : 'border-transparent text-[#56635C] hover:text-[#1C2420]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Export Tasks CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'import'
                ? 'border-[#1B4332] text-[#1B4332]'
                : 'border-transparent text-[#56635C] hover:text-[#1C2420]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Import from CSV Template
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'export' ? (
            <>
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#1C2420]">
                  1. Choose Tasks to Export
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      exportScope === 'all'
                        ? 'bg-[#F4F8F5] border-[#1B4332]'
                        : 'bg-[#FBF9F4] border-[#E4DFD3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1C2420]">All Estate Tasks</span>
                      <input
                        type="radio"
                        name="csvScope"
                        checked={exportScope === 'all'}
                        onChange={() => setExportScope('all')}
                        className="accent-[#1B4332]"
                      />
                    </div>
                    <div className="text-[11px] font-mono text-[#56635C] tabular-nums mt-1">
                      {allTasks.length} total tasks across 7 categories
                    </div>
                  </label>

                  <label
                    className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      exportScope === 'filtered'
                        ? 'bg-[#F4F8F5] border-[#1B4332]'
                        : 'bg-[#FBF9F4] border-[#E4DFD3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1C2420]">
                        Current Filtered View
                      </span>
                      <input
                        type="radio"
                        name="csvScope"
                        checked={exportScope === 'filtered'}
                        onChange={() => setExportScope('filtered')}
                        className="accent-[#1B4332]"
                      />
                    </div>
                    <div className="text-[11px] font-mono text-[#56635C] tabular-nums mt-1">
                      {filteredTasks.length} matching tasks in workspace
                    </div>
                  </label>
                </div>

                <label className="flex items-center justify-between gap-3 p-3 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg cursor-pointer">
                  <div>
                    <div className="text-xs font-medium text-[#1C2420]">
                      Include completed tasks
                    </div>
                    <div className="text-[11px] text-[#56635C]">
                      Exports completion status (`true`/`false`) alongside open action items
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeCompleted}
                    onChange={(e) => setIncludeCompleted(e.target.checked)}
                    className="h-4 w-4 accent-[#1B4332]"
                  />
                </label>
              </div>

              <div className="p-4 bg-[#FBF9F4] border border-[#E4DFD3] rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[#1C2420]">
                    Ready to Export:{' '}
                    <span className="font-mono tabular-nums text-[#1B4332]">
                      {exportCandidates.length}
                    </span>{' '}
                    {exportCandidates.length === 1 ? 'task' : 'tasks'}
                  </div>
                  <div className="text-[11px] text-[#56635C] mt-0.5">
                    Includes title, category, stage, priority, timing, due date, instructions (`|`-separated), notes, and status.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={exportCandidates.length === 0}
                  onClick={handleDownloadTasksCsv}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Tasks CSV
                </button>
              </div>

              <div className="pt-3 border-t border-[#E4DFD3] flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#56635C]">
                  Want a clean spreadsheet starter? Download our pre-formatted CSV template with sample rows.
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-[#F4EFE4] hover:bg-[#EAE3D4] border border-[#E4DFD3] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Template
                </button>
              </div>
            </>
          ) : (
            <>
              {!canEdit && (
                <div className="p-3 text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg">
                  Your collaborator role is View Only. Ask the estate owner for View &amp; Update permission to import tasks.
                </div>
              )}

              {/* Step 1: Template Download */}
              <div className="p-4 bg-[#FBF9F4] border border-[#E4DFD3] rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#1C2420]">
                    Step 1 · Prepare Your CSV File
                  </div>
                  <p className="text-[11px] text-[#56635C]">
                    Required column: <span className="font-mono">title</span>. Optional:{' '}
                    <span className="font-mono">
                      category, stage, priority, timingLabel, dueDate, instructions, executorNotes, completed
                    </span>
                    .
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1B4332] bg-white hover:bg-[#EFE9DC] border border-[#E4DFD3] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>

              {/* Step 2: Upload CSV */}
              <label className="block border-2 border-dashed border-[#D7CFC0] hover:border-[#1B4332] bg-[#FBF9F4] rounded-xl p-6 text-center cursor-pointer transition-colors">
                <Upload className="w-6 h-6 text-[#1B4332] mx-auto mb-2" />
                <div className="text-sm font-medium text-[#1C2420]">
                  {selectedFileName
                    ? `Selected: ${selectedFileName}`
                    : 'Choose a .csv file to preview and import'}
                </div>
                <div className="text-xs text-[#56635C] mt-1">
                  Supports up to 200 tasks per upload · Use <span className="font-mono">|</span> to separate multiple instruction steps
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canEdit}
                  onChange={(e) => {
                    handleFileSelected(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>

              {importError && (
                <div className="p-3 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {importedCount !== null && (
                <div className="p-3.5 text-xs text-[#1B5E3A] bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Imported {importedCount} {importedCount === 1 ? 'task' : 'tasks'} into your estate ledger.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 text-xs font-medium text-white bg-[#1B4332] rounded-md cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}

              {parseResult?.headerError && (
                <div className="p-3 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{parseResult.headerError}</span>
                </div>
              )}

              {/* Step 3: Validation Preview Table */}
              {parseResult && !parseResult.headerError && parseResult.rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold text-[#1B5E3A] font-mono tabular-nums">
                        {parseResult.validTasks.length} valid
                      </span>
                      {parseResult.errorCount > 0 && (
                        <span className="font-semibold text-[#B42318] font-mono tabular-nums">
                          {parseResult.errorCount} with errors
                        </span>
                      )}
                      {duplicateCount > 0 && (
                        <span className="text-[#B45309] font-mono tabular-nums">
                          {duplicateCount} matching existing title(s)
                        </span>
                      )}
                    </div>

                    {duplicateCount > 0 && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-[#4F5B54] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skipDuplicates}
                          onChange={(e) => setSkipDuplicates(e.target.checked)}
                          className="accent-[#1B4332]"
                        />
                        Skip duplicate titles
                      </label>
                    )}
                  </div>

                  <div className="border border-[#E4DFD3] rounded-lg overflow-hidden">
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-[#FBF9F4] border-b border-[#E4DFD3] sticky top-0 text-[#56635C]">
                          <tr>
                            <th className="py-2 px-3 font-medium">Row</th>
                            <th className="py-2 px-3 font-medium">Task Title</th>
                            <th className="py-2 px-3 font-medium">Category / Stage</th>
                            <th className="py-2 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFECE4]">
                          {parseResult.rows.map((row) => {
                            const isDup =
                              row.valid &&
                              row.data &&
                              existingTitleSet.has(row.data.title.trim().toLowerCase());
                            return (
                              <tr
                                key={row.rowNumber}
                                className={row.valid ? 'bg-white' : 'bg-[#FEF3F2]/50'}
                              >
                                <td className="py-2 px-3 font-mono text-[#78827B] tabular-nums">
                                  #{row.rowNumber}
                                </td>
                                <td className="py-2 px-3 font-medium text-[#1C2420] max-w-[220px] truncate">
                                  {row.rawTitle}
                                </td>
                                <td className="py-2 px-3 text-[#56635C]">
                                  {row.data ? (
                                    <span>
                                      {row.data.category} · {row.data.priority}
                                    </span>
                                  ) : (
                                    <span className="text-[#B42318]">
                                      {row.errors.join('; ')}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {!row.valid ? (
                                    <span className="text-[#B42318] font-medium">Invalid</span>
                                  ) : isDup && skipDuplicates ? (
                                    <span className="text-[#B45309]">Skipped (duplicate)</span>
                                  ) : (
                                    <span className="text-[#1B5E3A] font-medium">Ready</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                      type="button"
                      disabled={!canEdit || tasksReadyToImport.length === 0 || importing}
                      onClick={handleRunImport}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {importing
                        ? 'Importing...'
                        : `Import ${tasksReadyToImport.length} ${
                            tasksReadyToImport.length === 1 ? 'Task' : 'Tasks'
                          }`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

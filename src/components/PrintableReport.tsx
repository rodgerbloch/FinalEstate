import {
  TASK_CATEGORIES,
  type Estate,
  type EstateTask,
  type VaultDocument,
} from '../types/estate';
import {
  computeTaskStatus,
  formatBytes,
  formatShortDate,
  getTodayIso,
} from '../utils/taskHelpers';
import type { ExportOptions } from './ExportReportModal';

interface PrintableReportProps {
  estate: Estate;
  tasks: EstateTask[];
  documents: VaultDocument[];
  options: ExportOptions;
}

export function PrintableReport({
  estate,
  tasks,
  documents,
  options,
}: PrintableReportProps) {
  const todayIso = getTodayIso();
  const completedCount = tasks.filter((t) => t.completed).length;
  const pct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const pastDue = tasks.filter((t) => computeTaskStatus(t, todayIso) === 'past_due');
  const upcoming = tasks.filter((t) => computeTaskStatus(t, todayIso) === 'upcoming');
  const highPriorityOpen = tasks.filter((t) => !t.completed && t.priority === 'High');

  const urgentMap = new Map<string, EstateTask>();
  [...pastDue, ...highPriorityOpen].forEach((t) => urgentMap.set(t.id, t));
  const urgentItems = Array.from(urgentMap.values());

  return (
    <div id="printable-legal-briefing" className="text-neutral-900 bg-white">
      {/* Header & Estate Profile Metadata */}
      <header className="border-b-2 border-neutral-900 pb-4 mb-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[9pt] uppercase tracking-widest text-neutral-600 font-semibold">
              Estate Ledger · Legal &amp; Executor Meeting Briefing
            </div>
            <h1 className="font-display text-2xl font-bold text-neutral-900 mt-1">
              {estate.title}
            </h1>
          </div>
          <div className="text-right text-[9.5pt] text-neutral-700 font-mono tabular-nums">
            <div>Prepared: {formatShortDate(todayIso)}</div>
            <div>Stage: {estate.activeStage}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-4 text-[9.5pt] pt-3 border-t border-neutral-300">
          <div>
            <span className="text-neutral-500">Principal:</span>{' '}
            <span className="font-semibold">{estate.principalName}</span>
          </div>
          <div>
            <span className="text-neutral-500">Ledger Owner:</span>{' '}
            <span className="font-semibold">{estate.ownerName}</span>
          </div>
          <div>
            <span className="text-neutral-500">Contact:</span>{' '}
            <span>{estate.ownerEmail}</span>
          </div>
        </div>
        {estate.notes && (
          <p className="mt-2 text-[9.5pt] text-neutral-700">
            <span className="font-semibold text-neutral-900">Estate Notes:</span> {estate.notes}
          </p>
        )}
      </header>

      {/* Readiness Scorecard */}
      <section className="mb-6 print-avoid-break">
        <h2 className="font-display text-base font-bold border-b border-neutral-300 pb-1 mb-3">
          1. Estate Readiness Scorecard
        </h2>
        <div className="grid grid-cols-4 gap-3 text-center border border-neutral-300 rounded p-3">
          <div>
            <div className="font-mono text-lg font-bold tabular-nums">{pct}%</div>
            <div className="text-[8.5pt] text-neutral-600">
              {completedCount} of {tasks.length} complete
            </div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-red-700 tabular-nums">
              {pastDue.length}
            </div>
            <div className="text-[8.5pt] text-neutral-600">Past Due</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-amber-700 tabular-nums">
              {upcoming.length}
            </div>
            <div className="text-[8.5pt] text-neutral-600">Upcoming (14 Days)</div>
          </div>
          <div>
            <div className="font-mono text-lg font-bold tabular-nums">
              {highPriorityOpen.length}
            </div>
            <div className="text-[8.5pt] text-neutral-600">Open High-Priority</div>
          </div>
        </div>
      </section>

      {/* Urgent / Past-Due & High-Priority Action Items */}
      {urgentItems.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-base font-bold border-b border-neutral-300 pb-1 mb-3">
            2. Urgent, Past-Due &amp; High-Priority Action Items
          </h2>
          <table className="w-full text-left border-collapse text-[9.5pt]">
            <thead>
              <tr className="border-b border-neutral-400 text-neutral-600">
                <th className="py-1.5 pr-3">Task</th>
                <th className="py-1.5 px-3">Category</th>
                <th className="py-1.5 px-3">Status / Priority</th>
                <th className="py-1.5 pl-3 text-right">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {urgentItems.map((t) => {
                const isPast = computeTaskStatus(t, todayIso) === 'past_due';
                return (
                  <tr key={t.id} className="print-avoid-break">
                    <td className="py-2 pr-3 font-medium">{t.title}</td>
                    <td className="py-2 px-3 text-neutral-700">{t.category}</td>
                    <td className="py-2 px-3 font-semibold">
                      {isPast ? 'PAST DUE' : `${t.priority} Priority`}
                    </td>
                    <td className="py-2 pl-3 text-right font-mono tabular-nums">
                      {t.dueDate ? formatShortDate(t.dueDate) : t.timingLabel || 'Flexible'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Tasks Grouped by Category Bucket */}
      <section className="mb-6">
        <h2 className="font-display text-base font-bold border-b border-neutral-300 pb-1 mb-3">
          3. Detailed Playbook by Category Bucket
        </h2>
        <div className="space-y-5">
          {TASK_CATEGORIES.map((category) => {
            const catTasks = tasks.filter(
              (t) => t.category === category && (options.includeCompleted || !t.completed)
            );
            if (catTasks.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <h3 className="text-[11pt] font-bold text-neutral-900 border-b border-neutral-200 pb-1">
                  {category} ({catTasks.length})
                </h3>
                <div className="space-y-2.5">
                  {catTasks.map((task) => {
                    const linkedDocs = documents.filter((d) => d.taskId === task.id);
                    return (
                      <div
                        key={task.id}
                        className="print-avoid-break border border-neutral-300 rounded p-2.5 space-y-1"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-semibold text-[10pt]">
                            {task.completed ? '[x] ' : '[ ] '}
                            {task.title}
                          </div>
                          <div className="text-[8.5pt] font-mono text-neutral-600 whitespace-nowrap tabular-nums">
                            {task.priority} · {task.stage}
                            {task.dueDate ? ` · Due ${formatShortDate(task.dueDate)}` : ''}
                          </div>
                        </div>

                        {task.executorNotes && (
                          <p className="text-[9pt] text-neutral-700">
                            <span className="font-semibold">Notes:</span> {task.executorNotes}
                          </p>
                        )}

                        {task.sharedWithEmails.length > 0 && (
                          <p className="text-[8.5pt] text-neutral-600">
                            <span className="font-semibold">Shared With:</span>{' '}
                            {task.sharedWithEmails.join(', ')}
                          </p>
                        )}

                        {linkedDocs.length > 0 && (
                          <p className="text-[8.5pt] text-neutral-600">
                            <span className="font-semibold">Linked Files:</span>{' '}
                            {linkedDocs.map((d) => d.name).join(', ')}
                          </p>
                        )}

                        {options.includeInstructions && task.instructions.length > 0 && (
                          <ol className="list-decimal list-inside text-[8.5pt] text-neutral-700 pt-1 space-y-0.5">
                            {task.instructions.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Document Vault Inventory */}
      {options.includeVault && (
        <section className="print-section-break">
          <h2 className="font-display text-base font-bold border-b border-neutral-300 pb-1 mb-3">
            4. Document Vault Inventory ({documents.length} Files)
          </h2>
          {documents.length === 0 ? (
            <p className="text-[9.5pt] text-neutral-600">No documents currently stored in the vault.</p>
          ) : (
            <table className="w-full text-left border-collapse text-[9pt]">
              <thead>
                <tr className="border-b border-neutral-400 text-neutral-600">
                  <th className="py-1.5 pr-3">Filename</th>
                  <th className="py-1.5 px-3">Category / Linked Task</th>
                  <th className="py-1.5 px-3">Size</th>
                  <th className="py-1.5 pl-3">SHA-256 Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {documents.map((docItem) => {
                  const linked = tasks.find((t) => t.id === docItem.taskId);
                  return (
                    <tr key={docItem.id} className="print-avoid-break">
                      <td className="py-2 pr-3 font-medium">
                        {docItem.name}
                        {docItem.notes && (
                          <div className="text-[8pt] text-neutral-600 font-normal">
                            {docItem.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div>{docItem.category}</div>
                        <div className="text-[8pt] text-neutral-600">
                          {linked ? linked.title : 'Category-level'}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                        {formatBytes(docItem.sizeBytes)}
                      </td>
                      <td className="py-2 pl-3 font-mono text-[8pt] break-all">
                        {docItem.sha256}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AlertOctagon, Bell, Check, CircleDot, Flag, GitBranch, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import {
  TASK_CATEGORIES,
  type EstateStage,
  type EstateTask,
  type TaskCategory,
  type TaskPriority,
} from '../types/estate';
import type { CreateTaskInput } from '../services/estateService';
import { wouldCreatePrerequisiteCycle } from '../utils/taskHelpers';

interface TaskFormModalProps {
  initialTask?: EstateTask | null;
  allTasks: EstateTask[];
  defaultStage: EstateStage;
  defaultCategory?: TaskCategory;
  onClose: () => void;
  onSave: (data: CreateTaskInput) => Promise<void>;
}

export function TaskFormModal({
  initialTask,
  allTasks,
  defaultStage,
  defaultCategory = 'Assets',
  onClose,
  onSave,
}: TaskFormModalProps) {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [category, setCategory] = useState<TaskCategory>(initialTask?.category || defaultCategory);
  const [stage, setStage] = useState<EstateStage>(initialTask?.stage || defaultStage);
  const [priority, setPriority] = useState<TaskPriority>(initialTask?.priority || 'Medium');
  const [timingLabel, setTimingLabel] = useState(initialTask?.timingLabel || 'Within 14 days');
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '');
  const [reminderAt, setReminderAt] = useState(initialTask?.reminderAt || '');
  const [prerequisiteTaskIds, setPrerequisiteTaskIds] = useState<string[]>(
    initialTask?.prerequisiteTaskIds || []
  );
  const [prereqSearch, setPrereqSearch] = useState('');
  const [instructions, setInstructions] = useState<string[]>(
    initialTask?.instructions?.length ? initialTask.instructions : ['']
  );
  const [executorNotes, setExecutorNotes] = useState(initialTask?.executorNotes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const eligiblePrerequisites = useMemo(() => {
    const q = prereqSearch.trim().toLowerCase();
    return allTasks
      .filter((candidate) => {
        if (initialTask && candidate.id === initialTask.id) return false;
        if (initialTask && wouldCreatePrerequisiteCycle(initialTask.id, candidate.id, allTasks)) {
          return false;
        }
        if (q) {
          const hay = `${candidate.title} ${candidate.category}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aSelected = prerequisiteTaskIds.includes(a.id);
        const bSelected = prerequisiteTaskIds.includes(b.id);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.title.localeCompare(b.title);
      });
  }, [allTasks, initialTask, prereqSearch, prerequisiteTaskIds]);

  const togglePrerequisite = (candidateId: string) => {
    setPrerequisiteTaskIds((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : prev.length < 20
        ? [...prev, candidateId]
        : prev
    );
  };

  const handleAddStep = () => {
    if (instructions.length >= 30) return;
    setInstructions((prev) => [...prev, '']);
  };

  const handleUpdateStep = (idx: number, val: string) => {
    setInstructions((prev) => prev.map((step, i) => (i === idx ? val : step)));
  };

  const handleRemoveStep = (idx: number) => {
    setInstructions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [''];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a task title.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      await onSave({
        title: title.trim(),
        category,
        stage,
        priority,
        timingLabel: timingLabel.trim(),
        dueDate,
        reminderAt,
        instructions: instructions.map((s) => s.trim()).filter(Boolean),
        executorNotes: executorNotes.trim(),
        prerequisiteTaskIds,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C2420]/40 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4DFD3] rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E4DFD3] flex items-center justify-between gap-4 bg-[#FBF9F4]">
          <h2 className="font-display text-lg font-semibold text-[#1C2420]">
            {initialTask ? 'Edit Estate Task' : 'New Estate Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#56635C] hover:text-[#1C2420] rounded-lg hover:bg-[#EFE9DC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Notify Primary Mortgage Servicer & Request Estate Assumption Packet"
              className="w-full px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
                Category Bucket
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              >
                {TASK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
                Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as EstateStage)}
                className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              >
                <option value="Pre-Need Planning">Pre-Need Planning</option>
                <option value="Executor Action">Executor Action</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
            <div>
              <span className="block text-xs font-medium text-[#1C2420] mb-1.5">
                Priority Level
              </span>
              <div
                role="group"
                aria-label="Priority level"
                className="grid grid-cols-3 gap-1.5 p-1 bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg"
              >
                {(
                  [
                    { value: 'High', label: 'High', icon: AlertOctagon, activeClass: 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]' },
                    { value: 'Medium', label: 'Medium', icon: Flag, activeClass: 'bg-white text-[#B45309] border-[#E4DFD3]' },
                    { value: 'Low', label: 'Low', icon: CircleDot, activeClass: 'bg-white text-[#1B4332] border-[#E4DFD3]' },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = priority === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPriority(opt.value)}
                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? opt.activeClass
                          : 'border-transparent text-[#56635C] hover:text-[#1C2420]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[#1C2420] mb-1.5">
                High Priority Flag
              </span>
              <button
                type="button"
                aria-pressed={priority === 'High'}
                onClick={() => setPriority((prev) => (prev === 'High' ? 'Medium' : 'High'))}
                className={`w-full px-3 py-2 rounded-lg border text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                  priority === 'High'
                    ? 'bg-[#FEF3F2] border-[#EBC3BE] text-[#B42318]'
                    : 'bg-[#FBF9F4] border-[#E4DFD3] text-[#1C2420] hover:border-[#C6BFAE]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Pin className={`w-4 h-4 shrink-0 ${priority === 'High' ? 'text-[#B42318]' : 'text-[#56635C]'}`} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-tight">
                      {priority === 'High' ? 'Pinned as High Priority' : 'Flag as High Priority'}
                    </span>
                    <span className={`block text-[11px] truncate ${priority === 'High' ? 'text-[#912018]' : 'text-[#56635C]'}`}>
                      Pins task to top of category list
                    </span>
                  </span>
                </span>
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    priority === 'High'
                      ? 'bg-[#B42318] border-[#B42318] text-white'
                      : 'bg-white border-[#C6BFAE]'
                  }`}
                >
                  {priority === 'High' && <Check className="w-3 h-3" />}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
                Timing Label
              </label>
              <input
                type="text"
                maxLength={80}
                value={timingLabel}
                onChange={(e) => setTimingLabel(e.target.value)}
                placeholder="e.g., Within 14 days"
                className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[#1C2420] mb-1.5">
                <Bell className="w-3.5 h-3.5 text-[#9C7832]" />
                Reminder Date &amp; Time
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
                />
                {reminderAt && (
                  <button
                    type="button"
                    onClick={() => setReminderAt('')}
                    title="Clear reminder"
                    className="p-2 text-[#56635C] hover:text-[#B42318] rounded-lg border border-[#E4DFD3] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pre-requisite Tasks */}
          <div className="space-y-2 p-3.5 bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1C2420]">
                <GitBranch className="w-3.5 h-3.5 text-[#1B4332]" />
                Pre-requisite Tasks ({prerequisiteTaskIds.length} selected)
              </label>
              {prerequisiteTaskIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPrerequisiteTaskIds([])}
                  className="text-[11px] font-medium text-[#B42318] hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#56635C]">
              This task cannot be marked complete until all selected pre-requisites are finished.
            </p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#78827B] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={prereqSearch}
                onChange={(e) => setPrereqSearch(e.target.value)}
                placeholder="Filter estate tasks..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              />
            </div>
            <div className="max-h-36 overflow-y-auto bg-white border border-[#E4DFD3] rounded-lg divide-y divide-[#EFECE4]">
              {eligiblePrerequisites.length === 0 ? (
                <p className="p-3 text-center text-xs text-[#78827B]">
                  No eligible pre-requisite tasks found.
                </p>
              ) : (
                eligiblePrerequisites.map((candidate) => {
                  const checked = prerequisiteTaskIds.includes(candidate.id);
                  return (
                    <label
                      key={candidate.id}
                      className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#FBF9F4] cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrerequisite(candidate.id)}
                        className="mt-0.5 rounded border-[#C6BFAE] text-[#1B4332] focus:ring-[#1B4332]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[#1C2420] truncate">
                          {candidate.title}
                        </span>
                        <span className="text-[11px] text-[#56635C]">
                          {candidate.category} · {candidate.completed ? 'Resolved' : 'Pending'}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#1C2420]">
                Step-by-Step Instructions
              </label>
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Step
              </button>
            </div>
            <div className="space-y-2">
              {instructions.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#78827B] w-5 text-right tabular-nums">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    maxLength={600}
                    value={step}
                    onChange={(e) => handleUpdateStep(idx, e.target.value)}
                    placeholder={`Step ${idx + 1} instruction...`}
                    className="flex-1 px-3 py-1.5 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(idx)}
                    aria-label="Remove step"
                    className="p-1.5 text-[#78827B] hover:text-[#B42318] rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2420] mb-1.5">
              Executor &amp; Family Notes
            </label>
            <textarea
              rows={3}
              maxLength={10000}
              value={executorNotes}
              onChange={(e) => setExecutorNotes(e.target.value)}
              placeholder="Account locations, key holders, attorney instructions, or call logs..."
              className="w-full px-3.5 py-2 text-sm bg-[#FBF9F4] border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
            />
          </div>

          <div className="pt-3 border-t border-[#E4DFD3] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4F5B54] hover:text-[#1C2420] border border-[#E4DFD3] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

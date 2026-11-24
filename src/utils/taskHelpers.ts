import type {
  DocumentCategory,
  Estate,
  EstateTask,
  TaskCategory,
  TaskStatusBucket,
  VaultDocument,
} from '../types/estate';
import { TASK_CATEGORIES } from '../types/estate';

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeTaskStatus(task: EstateTask, todayIso = getTodayIso()): TaskStatusBucket {
  if (task.completed) return 'completed';
  if (task.dueDate) {
    if (task.dueDate < todayIso) {
      return 'past_due';
    }
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
    const dueMs = new Date(`${task.dueDate}T00:00:00`).getTime();
    const diffDays = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays <= 14) {
      return 'upcoming';
    }
  }
  return 'outstanding';
}

export function getTaskPrerequisites(task: EstateTask, allTasks: EstateTask[]): EstateTask[] {
  const ids = Array.isArray(task.prerequisiteTaskIds) ? task.prerequisiteTaskIds : [];
  if (ids.length === 0) return [];
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const resolved: EstateTask[] = [];
  for (const id of ids) {
    if (!id || id === task.id || seen.has(id)) continue;
    const match = byId.get(id);
    if (match) {
      seen.add(id);
      resolved.push(match);
    }
  }
  return resolved;
}

export function getBlockingPrerequisites(task: EstateTask, allTasks: EstateTask[]): EstateTask[] {
  return getTaskPrerequisites(task, allTasks).filter((p) => !p.completed);
}

export function getDependentTasks(taskId: string, allTasks: EstateTask[]): EstateTask[] {
  return allTasks.filter(
    (t) => t.id !== taskId && Array.isArray(t.prerequisiteTaskIds) && t.prerequisiteTaskIds.includes(taskId)
  );
}

export function isTaskBlocked(task: EstateTask, allTasks: EstateTask[]): boolean {
  if (task.completed) return false;
  return getBlockingPrerequisites(task, allTasks).length > 0;
}

export function wouldCreatePrerequisiteCycle(
  taskId: string,
  candidatePrereqId: string,
  allTasks: EstateTask[]
): boolean {
  if (!taskId || !candidatePrereqId) return false;
  if (taskId === candidatePrereqId) return true;
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const stack: string[] = [candidatePrereqId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = byId.get(currentId);
    if (current && Array.isArray(current.prerequisiteTaskIds)) {
      for (const nextId of current.prerequisiteTaskIds) {
        if (!visited.has(nextId)) {
          stack.push(nextId);
        }
      }
    }
  }
  return false;
}

export function isReminderActive(task: EstateTask, now = new Date()): boolean {
  if (task.completed || !task.reminderAt || task.reminderDismissed) return false;
  const target = new Date(task.reminderAt);
  if (Number.isNaN(target.getTime())) return false;
  return true;
}

export function isReminderDueSoon(task: EstateTask, now = new Date()): boolean {
  if (!isReminderActive(task, now)) return false;
  const target = new Date(task.reminderAt).getTime();
  // Due now or within the next 24 hours
  return target <= now.getTime() + 24 * 60 * 60 * 1000;
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return 'No date';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateTimeStr: string): string {
  if (!dateTimeStr) return '';
  const parsed = new Date(dateTimeStr);
  if (Number.isNaN(parsed.getTime())) return dateTimeStr;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getFirestoreTimestampMillis(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const ms = (ts as { toDate: () => Date }).toDate().getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
    return (ts as { seconds: number }).seconds * 1000;
  }
  if (ts instanceof Date) {
    const ms = ts.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof ts === 'string') {
    const ms = new Date(ts).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function formatFirestoreTimestamp(ts: unknown): string {
  const ms = getFirestoreTimestampMillis(ts);
  if (ms === null) return 'Just now';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function generateValidId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'item';
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}_${rand}`;
}

export async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BASE64_CHUNK_SIZE = 450_000;

export function arrayBufferToBase64Chunks(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  const binParts: string[] = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    binParts.push(String.fromCharCode(...slice));
  }
  const base64 = btoa(binParts.join(''));
  if (!base64) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += BASE64_CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + BASE64_CHUNK_SIZE));
  }
  return chunks;
}

export function base64ChunksToBlob(chunks: string[], mimeType: string): Blob {
  const fullBase64 = chunks.join('');
  const binaryString = atob(fullBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export function clampString(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export function buildPlainTextReport(options: {
  estate: Estate;
  tasks: EstateTask[];
  documents: VaultDocument[];
  includeCompleted: boolean;
  includeVault: boolean;
  includeInstructions: boolean;
}): string {
  const { estate, tasks, documents, includeCompleted, includeVault, includeInstructions } = options;
  const todayIso = getTodayIso();
  const completedTasks = tasks.filter((t) => t.completed);
  const pct = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  const pastDue = tasks.filter((t) => computeTaskStatus(t, todayIso) === 'past_due');
  const upcoming = tasks.filter((t) => computeTaskStatus(t, todayIso) === 'upcoming');
  const highPriority = tasks.filter((t) => !t.completed && t.priority === 'High');

  const lines: string[] = [];
  lines.push('====================================================================');
  lines.push(`ESTATE LEDGER — LEGAL & EXECUTOR MEETING BRIEFING`);
  lines.push('====================================================================');
  lines.push(`Estate Title:     ${estate.title}`);
  lines.push(`Principal:        ${estate.principalName}`);
  lines.push(`Active Stage:     ${estate.activeStage}`);
  lines.push(`Generated Date:   ${formatShortDate(todayIso)}`);
  lines.push(`Readiness Score:  ${completedTasks.length} of ${tasks.length} tasks complete (${pct}%)`);
  lines.push(`Status Summary:   ${pastDue.length} Past Due | ${upcoming.length} Upcoming (14d) | ${highPriority.length} Open High-Priority`);
  lines.push('');

  if (pastDue.length > 0 || highPriority.length > 0) {
    lines.push('--------------------------------------------------------------------');
    lines.push('URGENT & HIGH-PRIORITY ACTION ITEMS');
    lines.push('--------------------------------------------------------------------');
    const urgentSet = new Map<string, EstateTask>();
    [...pastDue, ...highPriority].forEach((t) => urgentSet.set(t.id, t));
    Array.from(urgentSet.values()).forEach((t, idx) => {
      const status = computeTaskStatus(t, todayIso) === 'past_due' ? 'PAST DUE' : t.priority.toUpperCase();
      lines.push(`${idx + 1}. [${status}] ${t.title}`);
      lines.push(`   Category: ${t.category} | Stage: ${t.stage} | Due: ${t.dueDate ? formatShortDate(t.dueDate) : 'Unscheduled'} (${t.timingLabel || 'Flexible'})`);
    });
    lines.push('');
  }

  lines.push('--------------------------------------------------------------------');
  lines.push('TASKS BY CATEGORY BUCKET');
  lines.push('--------------------------------------------------------------------');
  TASK_CATEGORIES.forEach((category: TaskCategory) => {
    const catTasks = tasks.filter((t) => t.category === category && (includeCompleted || !t.completed));
    if (catTasks.length === 0) return;
    lines.push(`\n## ${category.toUpperCase()} (${catTasks.length} shown)`);
    catTasks.forEach((t) => {
      const check = t.completed ? '[x]' : '[ ]';
      const linkedDocs = documents.filter((d) => d.taskId === t.id);
      const prereqs = getTaskPrerequisites(t, tasks);
      lines.push(`${check} ${t.title} (${t.priority} Priority · ${t.stage}${t.dueDate ? ` · Due ${formatShortDate(t.dueDate)}` : ''})`);
      if (prereqs.length > 0) {
        lines.push(
          `    Pre-requisites: ${prereqs
            .map((p) => `${p.title} [${p.completed ? 'Resolved' : 'Blocking'}]`)
            .join('; ')}`
        );
      }
      if (t.executorNotes) {
        lines.push(`    Notes: ${t.executorNotes}`);
      }
      if (t.sharedWithEmails.length > 0) {
        lines.push(`    Shared With: ${t.sharedWithEmails.join(', ')}`);
      }
      if (linkedDocs.length > 0) {
        lines.push(`    Linked Documents: ${linkedDocs.map((d) => d.name).join(', ')}`);
      }
      if (includeInstructions && t.instructions.length > 0) {
        lines.push('    Step-by-Step Instructions:');
        t.instructions.forEach((step, idx) => {
          lines.push(`      ${idx + 1}. ${step}`);
        });
      }
    });
  });

  if (includeVault) {
    lines.push('\n--------------------------------------------------------------------');
    lines.push(`DOCUMENT VAULT INVENTORY (${documents.length} files)`);
    lines.push('--------------------------------------------------------------------');
    if (documents.length === 0) {
      lines.push('No documents uploaded to the vault.');
    } else {
      documents.forEach((docItem, idx) => {
        const linkedTask = tasks.find((t) => t.id === docItem.taskId);
        lines.push(`${idx + 1}. ${docItem.name} [${docItem.category as DocumentCategory}]`);
        lines.push(`   Size: ${formatBytes(docItem.sizeBytes)} | SHA-256: ${docItem.sha256.slice(0, 16)}...`);
        if (linkedTask) {
          lines.push(`   Linked Task: ${linkedTask.title}`);
        }
        if (docItem.notes) {
          lines.push(`   Notes: ${docItem.notes}`);
        }
      });
    }
  }

  return lines.join('\n');
}

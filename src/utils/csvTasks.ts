import {
  TASK_CATEGORIES,
  type EstateStage,
  type EstateTask,
  type TaskCategory,
  type TaskPriority,
} from '../types/estate';
import { clampString } from './taskHelpers';

export interface CsvImportTaskInput {
  title: string;
  category: TaskCategory;
  stage: EstateStage;
  priority: TaskPriority;
  timingLabel: string;
  dueDate: string;
  instructions: string[];
  executorNotes: string;
  completed: boolean;
}

export interface CsvParsedRow {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  rawTitle: string;
  data: CsvImportTaskInput | null;
}

export interface CsvParseResult {
  rows: CsvParsedRow[];
  validTasks: CsvImportTaskInput[];
  errorCount: number;
  headerError?: string;
}

const CSV_HEADERS = [
  'title',
  'category',
  'stage',
  'priority',
  'timingLabel',
  'dueDate',
  'instructions',
  'executorNotes',
  'completed',
] as const;

function escapeCsvCell(value: string): string {
  // Guard against spreadsheet formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function exportTasksToCsv(tasks: EstateTask[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const t of tasks) {
    const row = [
      t.title,
      t.category,
      t.stage,
      t.priority,
      t.timingLabel || '',
      t.dueDate || '',
      (t.instructions || []).join(' | '),
      t.executorNotes || '',
      t.completed ? 'true' : 'false',
    ].map((cell) => escapeCsvCell(String(cell)));
    lines.push(row.join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildCsvTemplate(): string {
  const sampleRows: Array<Array<string>> = [
    [
      'Locate Original Safe Deposit Box Keys & Inventory Contents',
      'Assets',
      'Pre-Need Planning',
      'High',
      'Before incapacitation',
      '',
      'Confirm bank branch address and box number | Verify authorized co-signer on bank signature card | Store spare key location in sealed home folder',
      'First National Bank, Main St branch — ask for branch manager.',
      'false',
    ],
    [
      'Notify Pension Administrator & Request Survivor Benefit Forms',
      'Cashflow',
      'Executor Action',
      'Medium',
      'Within 30 days',
      '2026-12-31',
      'Call HR pension desk with date of death and SSN | Submit certified death certificate | Confirm spousal survivor annuity election',
      '',
      'false',
    ],
    [
      'Transfer Auto Insurance Policy & Title Registration',
      'Insurance',
      'Executor Action',
      'Medium',
      'Within 30 days',
      '',
      'Provide Letters Testamentary to DMV and auto carrier | Confirm interim coverage while vehicle remains parked',
      '',
      'false',
    ],
  ];

  const lines = [
    CSV_HEADERS.join(','),
    ...sampleRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * RFC-4180 compliant CSV matrix parser supporting quoted fields,
 * escaped double quotes (""), and embedded newlines.
 */
function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    matrix.push(row);
  }

  return matrix.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveCategory(raw: string): TaskCategory | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return 'Assets';
  const match = TASK_CATEGORIES.find((c) => c.toLowerCase() === clean);
  if (match) return match;
  if (clean.includes('legal') || clean.includes('probate')) return 'Legal & Probate';
  if (clean.includes('digital')) return 'Digital & Access';
  if (clean.includes('wish') || clean.includes('funeral')) return 'Final Wishes';
  if (clean.includes('liab') || clean.includes('debt')) return 'Liabilities';
  if (clean.includes('cash')) return 'Cashflow';
  if (clean.includes('insur')) return 'Insurance';
  if (clean.includes('asset')) return 'Assets';
  return null;
}

function resolveStage(raw: string): EstateStage | null {
  const clean = raw.trim().toLowerCase();
  if (!clean || clean === 'planning' || clean === 'pre-need' || clean === 'pre-need planning') {
    return 'Pre-Need Planning';
  }
  if (clean === 'executor' || clean === 'executor action' || clean === 'post-death') {
    return 'Executor Action';
  }
  return null;
}

function resolvePriority(raw: string): TaskPriority | null {
  const clean = raw.trim().toLowerCase();
  if (!clean || clean === 'medium' || clean === 'med') return 'Medium';
  if (clean === 'high') return 'High';
  if (clean === 'low') return 'Low';
  return null;
}

function resolveDueDate(raw: string): { value: string; valid: boolean } {
  const clean = raw.trim();
  if (!clean) return { value: '', valid: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parsed = new Date(`${clean}T00:00:00`);
    return { value: clean, valid: !Number.isNaN(parsed.getTime()) };
  }
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const parsed = new Date(`${iso}T00:00:00`);
    return { value: iso, valid: !Number.isNaN(parsed.getTime()) };
  }
  return { value: clean, valid: false };
}

function unguardCsvExportPrefix(val: string): string {
  // Only strip a single leading apostrophe if it was guarding a formula character
  if (val.startsWith("'") && /^[=+\-@\t\r]/.test(val.slice(1))) {
    return val.slice(1);
  }
  return val;
}

export function parseTasksCsv(rawText: string): CsvParseResult {
  const matrix = parseCsvMatrix(rawText);
  if (matrix.length === 0) {
    return {
      rows: [],
      validTasks: [],
      errorCount: 0,
      headerError: 'The CSV file appears to be empty.',
    };
  }

  const headerRow = matrix[0].map(normalizeHeaderKey);
  const findCol = (aliases: string[]): number =>
    headerRow.findIndex((h) => aliases.includes(h));

  const colIndex = {
    title: findCol(['title', 'tasktitle', 'task', 'name']),
    category: findCol(['category', 'categorybucket', 'bucket']),
    stage: findCol(['stage', 'phase', 'estatestage']),
    priority: findCol(['priority', 'prioritylevel']),
    timingLabel: findCol(['timinglabel', 'timing', 'timingguidance', 'timeline']),
    dueDate: findCol(['duedate', 'due']),
    instructions: findCol(['instructions', 'steps', 'stepbystepinstructions', 'description']),
    executorNotes: findCol(['executornotes', 'notes', 'familynotes']),
    completed: findCol(['completed', 'done', 'status']),
  };

  if (colIndex.title === -1) {
    return {
      rows: [],
      validTasks: [],
      errorCount: 0,
      headerError:
        'Missing required "title" column header. Download the CSV template to see the expected format.',
    };
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length === 0) {
    return {
      rows: [],
      validTasks: [],
      errorCount: 0,
      headerError: 'Header found, but there are no task rows below it.',
    };
  }

  if (dataRows.length > 200) {
    return {
      rows: [],
      validTasks: [],
      errorCount: 0,
      headerError: `CSV contains ${dataRows.length} rows. Please split imports into batches of 200 tasks or fewer.`,
    };
  }

  const rows: CsvParsedRow[] = [];
  const validTasks: CsvImportTaskInput[] = [];
  let errorCount = 0;

  dataRows.forEach((cells, idx) => {
    const rowNumber = idx + 2;
    const getCell = (i: number): string =>
      i >= 0 && i < cells.length ? unguardCsvExportPrefix(cells[i]).trim() : '';

    const rawTitle = getCell(colIndex.title);
    const rawCategory = getCell(colIndex.category);
    const rawStage = getCell(colIndex.stage);
    const rawPriority = getCell(colIndex.priority);
    const rawTiming = getCell(colIndex.timingLabel);
    const rawDue = getCell(colIndex.dueDate);
    const rawInstructions = getCell(colIndex.instructions);
    const rawNotes = getCell(colIndex.executorNotes);
    const rawCompleted = getCell(colIndex.completed).toLowerCase();

    const errors: string[] = [];
    const title = clampString(rawTitle, 200);
    if (!title) {
      errors.push('Missing required task title');
    }

    const category = resolveCategory(rawCategory);
    if (!category) {
      errors.push(`Invalid category "${rawCategory}"`);
    }

    const stage = resolveStage(rawStage);
    if (!stage) {
      errors.push(`Invalid stage "${rawStage}" (use Pre-Need Planning or Executor Action)`);
    }

    const priority = resolvePriority(rawPriority);
    if (!priority) {
      errors.push(`Invalid priority "${rawPriority}" (use High, Medium, or Low)`);
    }

    const dueCheck = resolveDueDate(rawDue);
    if (!dueCheck.valid) {
      errors.push(`Invalid dueDate "${rawDue}" (use YYYY-MM-DD)`);
    }

    const instructions = rawInstructions
      ? rawInstructions
          .split(/\s*\|\s*|\r?\n/)
          .map((s) => clampString(s, 600))
          .filter(Boolean)
          .slice(0, 30)
      : [];

    const completed =
      rawCompleted === 'true' || rawCompleted === 'yes' || rawCompleted === '1' || rawCompleted === 'completed';

    if (errors.length === 0 && category && stage && priority) {
      const parsed: CsvImportTaskInput = {
        title,
        category,
        stage,
        priority,
        timingLabel: clampString(rawTiming, 80),
        dueDate: clampString(dueCheck.value, 32),
        instructions,
        executorNotes: clampString(rawNotes, 10000),
        completed,
      };
      validTasks.push(parsed);
      rows.push({
        rowNumber,
        valid: true,
        errors: [],
        rawTitle: title,
        data: parsed,
      });
    } else {
      errorCount += 1;
      rows.push({
        rowNumber,
        valid: false,
        errors,
        rawTitle: rawTitle || '(Untitled row)',
        data: null,
      });
    }
  });

  return { rows, validTasks, errorCount };
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseClientConfig {
  apiKey: string;
  projectId: string;
}

function loadFirebaseConfig(): FirebaseClientConfig | null {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as FirebaseClientConfig;
  } catch {
    return null;
  }
}

async function verifyFirebaseIdToken(idToken: string, apiKey: string): Promise<{ uid: string; email?: string } | null> {
  if (!idToken || !apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: Array<{ localId?: string; email?: string }> };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

interface ConsultantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface EstateConsultantContext {
  estateTitle: string;
  principalName: string;
  activeStage: string;
  totalTasks: number;
  completedCount: number;
  pastDueCount: number;
  upcomingCount: number;
  outstandingCount: number;
  documentCount: number;
  categoryBreakdown: Array<{ category: string; completed: number; total: number }>;
  urgentTasks: Array<{ title: string; category: string; priority: string; dueDate: string; stage: string; timingLabel: string }>;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

const firebaseConfig = loadFirebaseConfig();

const PRIMARY_TEXT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ParsedApiError {
  httpStatus: number;
  message: string;
}

function parseGeminiApiError(err: unknown): ParsedApiError {
  const raw = err instanceof Error ? err.message : String(err || '');
  let code = 0;
  let apiStatus = '';
  let apiMessage = '';

  const errObj = err as { status?: number; code?: number; message?: string } | null;
  if (errObj && typeof errObj.status === 'number') {
    code = errObj.status;
  }

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') code = parsed.error.code;
        if (typeof parsed.error.status === 'string') apiStatus = parsed.error.status;
        if (typeof parsed.error.message === 'string') apiMessage = parsed.error.message;
      }
    } catch {
      // Ignore non-JSON error payloads
    }
  }

  const lower = `${apiMessage} ${raw}`.toLowerCase();

  if (code === 503 || apiStatus === 'UNAVAILABLE' || lower.includes('high demand')) {
    return {
      httpStatus: 503,
      message:
        'The AI model is temporarily experiencing high demand. Please wait a few seconds and try again.',
    };
  }
  if (code === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return {
      httpStatus: 429,
      message:
        'AI request quota is temporarily exhausted. Please wait a moment and try again, or check your API key tier in Settings > Secrets.',
    };
  }
  if (
    code === 403 ||
    apiStatus === 'PERMISSION_DENIED' ||
    apiStatus === 'API_KEY_INVALID' ||
    lower.includes('api key')
  ) {
    return {
      httpStatus: 403,
      message:
        'Unable to authenticate with the AI service. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  return {
    httpStatus: code >= 400 && code < 600 ? code : 502,
    message: apiMessage || raw || 'Unable to reach the AI Estate Consultant right now.',
  };
}

function isTransientGeminiError(err: unknown): boolean {
  const parsed = parseGeminiApiError(err);
  return parsed.httpStatus === 503 || parsed.httpStatus === 429 || parsed.httpStatus >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetryAndFallback(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const delaysMs = [600, 1400];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: PRIMARY_TEXT_MODEL,
      });
    } catch (err) {
      lastError = err;
      if (!isTransientGeminiError(err)) {
        throw err;
      }
      if (attempt < delaysMs.length) {
        const jitter = Math.floor(Math.random() * 250);
        await sleep(delaysMs[attempt] + jitter);
      }
    }
  }

  try {
    return await ai.models.generateContent({
      ...params,
      model: FALLBACK_TEXT_MODEL,
    });
  } catch {
    throw lastError;
  }
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.post('/api/consultant', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in to use the AI Estate Consultant.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!firebaseConfig?.apiKey) {
    res.status(500).json({ error: 'Server authentication configuration is unavailable.' });
    return;
  }

  const verifiedUser = await verifyFirebaseIdToken(token, firebaseConfig.apiKey);
  if (!verifiedUser) {
    res.status(401).json({ error: 'Invalid or expired sign-in session. Please refresh or sign in again.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured in server secrets.' });
    return;
  }

  const body = req.body as {
    messages?: ConsultantMessage[];
    estateContext?: EstateConsultantContext;
  };

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'Please provide a message for the consultant.' });
    return;
  }

  const sanitizedMessages = body.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content.slice(0, 4000) }],
    }));

  if (sanitizedMessages.length === 0) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }

  const ctx = body.estateContext;
  const contextSummary = ctx
    ? [
        `Estate Title: ${String(ctx.estateTitle || 'Estate Ledger').slice(0, 140)}`,
        `Principal: ${String(ctx.principalName || 'Estate Principal').slice(0, 120)}`,
        `Active Stage: ${String(ctx.activeStage || 'Pre-Need Planning')}`,
        `Readiness Summary: ${Number(ctx.completedCount) || 0} of ${Number(ctx.totalTasks) || 0} tasks completed`,
        `Past Due: ${Number(ctx.pastDueCount) || 0} | Upcoming (14 days): ${Number(ctx.upcomingCount) || 0} | Outstanding: ${Number(ctx.outstandingCount) || 0} | Vault Documents: ${Number(ctx.documentCount) || 0}`,
        ctx.categoryBreakdown?.length
          ? `Category Progress: ${ctx.categoryBreakdown.map((c) => `${c.category} (${c.completed}/${c.total})`).join(', ')}`
          : '',
        ctx.urgentTasks?.length
          ? `Top Open/Urgent Tasks:\n${ctx.urgentTasks
              .slice(0, 10)
              .map((t) => `- [${t.priority}] ${t.title} (${t.category} · ${t.stage}${t.dueDate ? ` · Due ${t.dueDate}` : ''}${t.timingLabel ? ` · ${t.timingLabel}` : ''})`)
              .join('\n')}`
          : 'No urgent tasks currently flagged.',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No estate context provided.';

  const systemInstruction = [
    'You are the Estate Ledger Consultant, a calm, meticulous, archival-minded specialist assisting individuals with pre-need estate organization and guiding executors through post-death estate administration.',
    'Always ground your recommendations in the live estate readiness snapshot provided below. Prioritize past-due and high-priority items first, sequence actions logically by timeframe (immediate 1-3 days, within 14 days, within 30 days, probate/tax milestones), and provide clear, formal, ready-to-adapt drafts when asked for institution notices (banks, insurers, Social Security, pension administrators, utilities, probate counsel).',
    'Keep formatting structured with concise headings and numbered steps. End legal/tax-adjacent guidance with a brief, calm reminder that you provide organizational and drafting assistance rather than formal legal or tax counsel.',
    '',
    '--- CURRENT ESTATE SNAPSHOT ---',
    contextSummary,
  ].join('\n');

  try {
    const ai = createGeminiClient(apiKey);

    const response = await generateWithRetryAndFallback(ai, {
      contents: sanitizedMessages,
      config: {
        systemInstruction,
      },
    });

    const reply = response.text?.trim();
    if (!reply) {
      res.status(502).json({ error: 'The consultant returned an empty response. Please try again.' });
      return;
    }

    res.json({ reply });
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
  }
});

interface ProjectionTaskSummary {
  title: string;
  stage: string;
  priority: string;
  timingLabel: string;
  completed: boolean;
  estimatedAmountUsd: number | null;
  notesPreview: string;
}

interface ProjectionBucketPayload {
  category: string;
  totalCount: number;
  openCount: number;
  executorActionCount: number;
  detectedAmountUsd: number;
  tasks: ProjectionTaskSummary[];
}

interface CashflowProjectionRequest {
  estateTitle?: string;
  principalName?: string;
  activeStage?: string;
  totalAssetsUsd?: number;
  totalLiabilitiesUsd?: number;
  buckets?: ProjectionBucketPayload[];
  estateNotes?: string;
}

app.post('/api/cashflow-projection', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to run a Cashflow Projection.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!firebaseConfig?.apiKey) {
    res.status(500).json({ error: 'Server authentication configuration is unavailable.' });
    return;
  }

  const verifiedUser = await verifyFirebaseIdToken(token, firebaseConfig.apiKey);
  if (!verifiedUser) {
    res.status(401).json({
      error: 'Invalid or expired sign-in session. Please refresh or sign in again.',
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured in server secrets.' });
    return;
  }

  const body = req.body as CashflowProjectionRequest;
  if (!Array.isArray(body.buckets) || body.buckets.length === 0) {
    res.status(400).json({ error: 'Category bucket task data is required to generate a projection.' });
    return;
  }

  const safeBuckets = body.buckets.slice(0, 10).map((b) => ({
    category: String(b.category || '').slice(0, 60),
    totalCount: Number(b.totalCount) || 0,
    openCount: Number(b.openCount) || 0,
    executorActionCount: Number(b.executorActionCount) || 0,
    detectedAmountUsd: Number(b.detectedAmountUsd) || 0,
    tasks: Array.isArray(b.tasks)
      ? b.tasks.slice(0, 20).map((t) => ({
          title: String(t.title || '').slice(0, 160),
          stage: String(t.stage || '').slice(0, 40),
          priority: String(t.priority || '').slice(0, 20),
          timingLabel: String(t.timingLabel || '').slice(0, 60),
          completed: Boolean(t.completed),
          estimatedAmountUsd:
            typeof t.estimatedAmountUsd === 'number' && Number.isFinite(t.estimatedAmountUsd)
              ? t.estimatedAmountUsd
              : null,
          notesPreview: String(t.notesPreview || '').slice(0, 280),
        }))
      : [],
  }));

  const totalAssetsUsd = Number(body.totalAssetsUsd) || 0;
  const totalLiabilitiesUsd = Number(body.totalLiabilitiesUsd) || 0;

  const bucketPromptText = safeBuckets
    .map((b) => {
      const taskLines = b.tasks
        .map(
          (t) =>
            `  * ${t.title} [${t.stage} | ${t.priority}${t.completed ? ' | Completed' : ''}${t.timingLabel ? ` | ${t.timingLabel}` : ''}${t.estimatedAmountUsd !== null ? ` | Amount: $${t.estimatedAmountUsd.toLocaleString('en-US')}` : ''}]${t.notesPreview ? ` — Notes: ${t.notesPreview}` : ''}`
        )
        .join('\n');
      return `Category: ${b.category} (${b.totalCount} total, ${b.openCount} open, ${b.executorActionCount} Executor Action, recorded USD sum: $${b.detectedAmountUsd.toLocaleString('en-US')})\n${taskLines || '  * (No tasks recorded)'}`;
    })
    .join('\n\n');

  const userPrompt = [
    `Estate Title: ${String(body.estateTitle || 'Estate Ledger').slice(0, 140)}`,
    `Principal: ${String(body.principalName || 'Estate Principal').slice(0, 120)}`,
    `Active Stage: ${String(body.activeStage || 'Pre-Need Planning').slice(0, 40)}`,
    `Aggregated Recorded Assets (from Assets tasks): $${totalAssetsUsd.toLocaleString('en-US')}`,
    `Aggregated Recorded Liabilities (from Liabilities tasks): $${totalLiabilitiesUsd.toLocaleString('en-US')}`,
    body.estateNotes ? `Estate Notes: ${String(body.estateNotes).slice(0, 600)}` : '',
    '',
    '--- CATEGORY BUCKET TASK DATABASE SNAPSHOT ---',
    bucketPromptText,
    '',
    'Estimate the immediate post-death expenses (first 90 days of estate administration) based on the tasks and category buckets above. Include realistic itemized estimates for immediate needs implied by these buckets (e.g., funeral/memorial & final wishes, certified death certificates, probate filing & legal counsel retainer, real property carry/utilities/vacancy insurance, debt/credit servicing, asset valuation/appraisal). When specific dollar balances are not recorded in task notes, provide practical US benchmark estimates and note what drives each estimate.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const ai = createGeminiClient(apiKey);

    const response = await generateWithRetryAndFallback(ai, {
      contents: userPrompt,
      config: {
        systemInstruction:
          'You are the Estate Ledger AI Estate Consultant specializing in post-death estate liquidity and immediate administration cashflow forecasting. Produce realistic, conservative, well-structured US dollar estimates grounded strictly in the provided category bucket task snapshot. Do not invent fake account numbers. Always keep recommendations practical for an executor.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description:
                '2-3 sentence executive summary of immediate post-death cash needs relative to recorded assets and liabilities.',
            },
            estimatedTotalImmediateExpenses: {
              type: Type.NUMBER,
              description:
                'Sum of all estimated immediate post-death expenses over the first 90 days in USD.',
            },
            recommendedLiquidReserve: {
              type: Type.NUMBER,
              description:
                'Recommended accessible cash reserve (including contingency buffer) in USD.',
            },
            expenseLineItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: {
                    type: Type.STRING,
                    description: 'Concise expense item name.',
                  },
                  linkedBucket: {
                    type: Type.STRING,
                    description:
                      'Relevant Estate Ledger category bucket (Assets, Liabilities, Cashflow, Legal & Probate, Insurance, Digital & Access, or Final Wishes).',
                  },
                  timeframe: {
                    type: Type.STRING,
                    description:
                      'One of: Immediate (1-7 days), Short-Term (8-30 days), or Administration (31-90 days).',
                  },
                  estimatedAmountUsd: {
                    type: Type.NUMBER,
                    description: 'Estimated expense in whole US dollars.',
                  },
                  confidence: {
                    type: Type.STRING,
                    description: 'High, Medium, or Low depending on whether task data specified values.',
                  },
                  rationale: {
                    type: Type.STRING,
                    description: 'Brief explanation referencing the relevant bucket tasks.',
                  },
                },
                required: [
                  'label',
                  'linkedBucket',
                  'timeframe',
                  'estimatedAmountUsd',
                  'confidence',
                  'rationale',
                ],
              },
            },
            liquidityRisks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-4 specific cashflow or timing risks observed from the bucket data.',
            },
            priorityActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-5 actionable steps the executor or principal should take next.',
            },
            disclaimer: {
              type: Type.STRING,
              description:
                'Brief reminder that estimates are planning approximations and not formal legal, tax, or fiduciary financial advice.',
            },
          },
          required: [
            'summary',
            'estimatedTotalImmediateExpenses',
            'recommendedLiquidReserve',
            'expenseLineItems',
            'liquidityRisks',
            'priorityActions',
            'disclaimer',
          ],
        },
      },
    });

    const rawText = (response.text ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!rawText) {
      res.status(502).json({ error: 'AI Estate Consultant returned an empty projection.' });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.json({ projection: parsed });
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
  }
});

interface ExecutiveSummaryCategoryHealth {
  category: string;
  completed: number;
  total: number;
  highPriorityOpen: number;
  pastDue: number;
}

interface ExecutiveSummaryHighPriorityTask {
  title: string;
  category: string;
  stage: string;
  dueDate: string;
  timingLabel: string;
  isPastDue: boolean;
  isBlocked: boolean;
  notesPreview: string;
}

interface ExecutiveSummaryRecentDoc {
  name: string;
  category: string;
  uploadedAt: string;
  uploadedByName: string;
  linkedTaskTitle: string;
  notesPreview: string;
}

interface ExecutiveSummaryRequest {
  estateTitle?: string;
  principalName?: string;
  activeStage?: string;
  estateNotes?: string;
  periodLabel?: string;
  periodDays?: number;
  metrics?: {
    totalTasks?: number;
    completedCount?: number;
    completionPct?: number;
    pastDueCount?: number;
    upcomingCount?: number;
    highPriorityOpenCount?: number;
    blockedCount?: number;
    totalDocuments?: number;
    recentDocumentsCount?: number;
    completedInPeriodCount?: number;
  };
  categoryHealth?: ExecutiveSummaryCategoryHealth[];
  outstandingHighPriorityTasks?: ExecutiveSummaryHighPriorityTask[];
  recentDocuments?: ExecutiveSummaryRecentDoc[];
}

app.post('/api/executive-summary', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to generate an Executive Summary.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!firebaseConfig?.apiKey) {
    res.status(500).json({ error: 'Server authentication configuration is unavailable.' });
    return;
  }

  const verifiedUser = await verifyFirebaseIdToken(token, firebaseConfig.apiKey);
  if (!verifiedUser) {
    res.status(401).json({
      error: 'Invalid or expired sign-in session. Please refresh or sign in again.',
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured in server secrets.' });
    return;
  }

  const body = req.body as ExecutiveSummaryRequest;
  const metrics = body.metrics || {};
  const periodDays = Number(body.periodDays) || 30;
  const periodLabel = String(body.periodLabel || `Last ${periodDays} Days`).slice(0, 80);

  const safeCategories = Array.isArray(body.categoryHealth)
    ? body.categoryHealth.slice(0, 10).map((c) => ({
        category: String(c.category || '').slice(0, 60),
        completed: Number(c.completed) || 0,
        total: Number(c.total) || 0,
        highPriorityOpen: Number(c.highPriorityOpen) || 0,
        pastDue: Number(c.pastDue) || 0,
      }))
    : [];

  const safeHighPriority = Array.isArray(body.outstandingHighPriorityTasks)
    ? body.outstandingHighPriorityTasks.slice(0, 20).map((t) => ({
        title: String(t.title || '').slice(0, 180),
        category: String(t.category || '').slice(0, 60),
        stage: String(t.stage || '').slice(0, 40),
        dueDate: String(t.dueDate || '').slice(0, 32),
        timingLabel: String(t.timingLabel || '').slice(0, 60),
        isPastDue: Boolean(t.isPastDue),
        isBlocked: Boolean(t.isBlocked),
        notesPreview: String(t.notesPreview || '').slice(0, 240),
      }))
    : [];

  const safeDocs = Array.isArray(body.recentDocuments)
    ? body.recentDocuments.slice(0, 20).map((d) => ({
        name: String(d.name || '').slice(0, 200),
        category: String(d.category || '').slice(0, 60),
        uploadedAt: String(d.uploadedAt || '').slice(0, 60),
        uploadedByName: String(d.uploadedByName || '').slice(0, 100),
        linkedTaskTitle: String(d.linkedTaskTitle || '').slice(0, 160),
        notesPreview: String(d.notesPreview || '').slice(0, 200),
      }))
    : [];

  const promptSections = [
    `Estate Title: ${String(body.estateTitle || 'Estate Ledger').slice(0, 140)}`,
    `Principal: ${String(body.principalName || 'Estate Principal').slice(0, 120)}`,
    `Active Stage: ${String(body.activeStage || 'Pre-Need Planning').slice(0, 40)}`,
    `Reporting Period: ${periodLabel} (${periodDays} days)`,
    body.estateNotes ? `Estate Profile Notes: ${String(body.estateNotes).slice(0, 500)}` : '',
    '',
    '--- ESTATE HEALTH METRICS ---',
    `Overall Readiness: ${Number(metrics.completedCount) || 0} of ${Number(metrics.totalTasks) || 0} tasks complete (${Number(metrics.completionPct) || 0}%)`,
    `Past Due Tasks: ${Number(metrics.pastDueCount) || 0} | Upcoming (14d): ${Number(metrics.upcomingCount) || 0} | Open High-Priority: ${Number(metrics.highPriorityOpenCount) || 0} | Dependency-Blocked: ${Number(metrics.blockedCount) || 0}`,
    `Tasks Completed During Reporting Period: ${Number(metrics.completedInPeriodCount) || 0}`,
    `Document Vault Total: ${Number(metrics.totalDocuments) || 0} files | Added During Reporting Period: ${Number(metrics.recentDocumentsCount) || 0}`,
    '',
    '--- CATEGORY HEALTH BREAKDOWN ---',
    safeCategories.length > 0
      ? safeCategories
          .map(
            (c) =>
              `- ${c.category}: ${c.completed}/${c.total} completed (${c.highPriorityOpen} open High-Priority, ${c.pastDue} past due)`
          )
          .join('\n')
      : 'No category breakdown provided.',
    '',
    '--- OUTSTANDING HIGH-PRIORITY TASKS ---',
    safeHighPriority.length > 0
      ? safeHighPriority
          .map(
            (t) =>
              `- ${t.title} [${t.category} · ${t.stage}${t.isPastDue ? ' · PAST DUE' : ''}${t.isBlocked ? ' · BLOCKED BY PREREQUISITE' : ''}${t.dueDate ? ` · Due ${t.dueDate}` : ''}${t.timingLabel ? ` · ${t.timingLabel}` : ''}]${t.notesPreview ? ` — Notes: ${t.notesPreview}` : ''}`
          )
          .join('\n')
      : 'All High-Priority tasks are currently completed.',
    '',
    `--- RECENT DOCUMENT ADDITIONS (${periodLabel}) ---`,
    safeDocs.length > 0
      ? safeDocs
          .map(
            (d) =>
              `- ${d.name} [${d.category}] · Uploaded ${d.uploadedAt} by ${d.uploadedByName}${d.linkedTaskTitle ? ` · Linked to task: ${d.linkedTaskTitle}` : ''}${d.notesPreview ? ` — Notes: ${d.notesPreview}` : ''}`
          )
          .join('\n')
      : 'No new documents uploaded during this reporting period.',
    '',
    'Generate a calm, authoritative periodic Executive Summary for the estate owner, co-executors, and advisors covering: (1) overall estate health and completion momentum across the 7 archival categories, (2) triage and next steps for the outstanding High-Priority tasks, and (3) an assessment of recent Document Vault additions plus any documentation gaps suggested by open high-priority work.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const ai = createGeminiClient(apiKey);

    const response = await generateWithRetryAndFallback(ai, {
      contents: promptSections,
      config: {
        systemInstruction:
          'You are the Estate Ledger AI Estate Consultant delivering a periodic Executive Summary briefing for an estate principal, executor, or legal/financial advisor. Be precise, grounded strictly in the provided tasks, categories, and document vault records, and write in crisp archival prose without inventing unrecorded facts or account numbers.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            healthRating: {
              type: Type.STRING,
              description:
                'Overall estate health status: must be one of "On Track", "Needs Attention", or "Critical Priorities".',
            },
            headline: {
              type: Type.STRING,
              description:
                'One concise executive headline summarizing the estate health and immediate priority.',
            },
            estateHealthOverview: {
              type: Type.STRING,
              description:
                '2-4 sentences evaluating overall completion readiness, momentum in the current reporting period, category balance, and stage alignment.',
            },
            highPriorityFocus: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  taskTitle: {
                    type: Type.STRING,
                    description: 'Exact title of an outstanding high-priority task (or general high-priority status if none remain).',
                  },
                  category: {
                    type: Type.STRING,
                    description: 'Category bucket of the task.',
                  },
                  urgencyReason: {
                    type: Type.STRING,
                    description: 'Why this task warrants immediate attention (e.g., past-due date, dependency blocker, estate stage).',
                  },
                  recommendedNextStep: {
                    type: Type.STRING,
                    description: 'Concrete next step for the executor or principal.',
                  },
                },
                required: ['taskTitle', 'category', 'urgencyReason', 'recommendedNextStep'],
              },
              description: 'Up to 5 prioritized focus items drawn from outstanding high-priority tasks.',
            },
            documentVaultAssessment: {
              type: Type.STRING,
              description:
                '2-3 sentences summarizing recent document vault additions in this period and identifying any critical supporting records still needed for open high-priority tasks.',
            },
            periodicActionPlan: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-5 concrete action steps for the upcoming reporting period.',
            },
            disclaimer: {
              type: Type.STRING,
              description:
                'Brief reminder that this executive summary provides organizational guidance rather than formal legal, tax, or fiduciary advice.',
            },
          },
          required: [
            'healthRating',
            'headline',
            'estateHealthOverview',
            'highPriorityFocus',
            'documentVaultAssessment',
            'periodicActionPlan',
            'disclaimer',
          ],
        },
      },
    });

    const rawText = (response.text ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!rawText) {
      res.status(502).json({ error: 'AI Estate Consultant returned an empty executive summary.' });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.json({ summary: parsed });
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    res.status(parsedErr.httpStatus).json({ error: parsedErr.message });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Estate Ledger server listening on http://0.0.0.0:${port}`);
  });
}

startServer();

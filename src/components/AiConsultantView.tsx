import { useMemo, useState } from 'react';
import { Bot, Check, Copy, RefreshCw, Send } from 'lucide-react';
import { auth } from '../firebase';
import {
  TASK_CATEGORIES,
  type Estate,
  type EstateTask,
  type VaultDocument,
} from '../types/estate';
import { computeTaskStatus, getTodayIso } from '../utils/taskHelpers';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiConsultantViewProps {
  estate: Estate;
  tasks: EstateTask[];
  documents: VaultDocument[];
}

export function AiConsultantView({
  estate,
  tasks,
  documents,
}: AiConsultantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const todayIso = getTodayIso();

  const readiness = useMemo(() => {
    let completedCount = 0;
    let pastDueCount = 0;
    let upcomingCount = 0;
    let outstandingCount = 0;
    for (const t of tasks) {
      const s = computeTaskStatus(t, todayIso);
      if (s === 'completed') completedCount += 1;
      else if (s === 'past_due') pastDueCount += 1;
      else if (s === 'upcoming') upcomingCount += 1;
      else outstandingCount += 1;
    }

    const categoryBreakdown = TASK_CATEGORIES.map((category) => {
      const catTasks = tasks.filter((t) => t.category === category);
      const done = catTasks.filter((t) => t.completed).length;
      return { category, completed: done, total: catTasks.length };
    });

    const urgentTasks = tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const sa = computeTaskStatus(a, todayIso) === 'past_due' ? 0 : 1;
        const sb = computeTaskStatus(b, todayIso) === 'past_due' ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const pOrder = { High: 0, Medium: 1, Low: 2 };
        return pOrder[a.priority] - pOrder[b.priority];
      })
      .slice(0, 10)
      .map((t) => ({
        title: t.title,
        category: t.category,
        priority: t.priority,
        dueDate: t.dueDate,
        stage: t.stage,
        timingLabel: t.timingLabel,
      }));

    return {
      estateTitle: estate.title,
      principalName: estate.principalName,
      activeStage: estate.activeStage,
      totalTasks: tasks.length,
      completedCount,
      pastDueCount,
      upcomingCount,
      outstandingCount,
      documentCount: documents.length,
      categoryBreakdown,
      urgentTasks,
    };
  }, [estate, tasks, documents, todayIso]);

  const quickPrompts = [
    'Sequence our past-due and next 14-day tasks into an actionable weekly plan.',
    'Draft a formal bank notification letter requesting date-of-death balances and estate account setup.',
    'Audit which pre-need records and vault documents we should prioritize completing next.',
    'Draft a life insurance death benefit claim cover letter for the executor to send.',
  ];

  const submitMessages = async (conversation: ChatMessage[]) => {
    if (conversation.length === 0 || loading) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Please sign in to consult the Estate AI.');
      }
      const idToken = await currentUser.getIdToken();

      const res = await fetch('/api/consultant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          messages: conversation,
          estateContext: readiness,
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Unable to reach the Estate Consultant.');
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply! }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Consultant request failed.');
    } finally {
      setLoading(false);
    }
  };

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    await submitMessages(nextMessages);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8 flex flex-col h-full">
      {/* Context Snapshot Header */}
      <section className="bg-white border border-[#E4DFD3] rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg text-[#1B4332] shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#1C2420]">
                Estate AI Consultant
              </h1>
              <p className="text-sm text-[#56635C] mt-0.5">
                Grounded in your live ledger readiness to sequence tasks, prepare legal meetings, and draft institution notices.
              </p>
            </div>
          </div>
        </div>

        {/* Live Context Metrics */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-[#EFECE4] text-xs text-[#4F5B54] tabular-nums">
          <span>
            Stage: <strong className="text-[#1C2420]">{readiness.activeStage}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Past Due: <strong className="text-[#B42318]">{readiness.pastDueCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Upcoming (14d): <strong className="text-[#B45309]">{readiness.upcomingCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Open: <strong className="text-[#1C2420]">{readiness.outstandingCount}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Completed: <strong className="text-[#1B5E3A]">{readiness.completedCount}/{readiness.totalTasks}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Vault Files: <strong className="text-[#1C2420]">{readiness.documentCount}</strong>
          </span>
        </div>
      </section>

      {/* Conversation Area */}
      <section className="flex-1 bg-white border border-[#E4DFD3] rounded-xl flex flex-col overflow-hidden min-h-[420px]">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-5 py-4">
              <div className="text-sm text-[#4F5B54] max-w-2xl">
                Ask for sequencing guidance based on your current{' '}
                <strong className="text-[#1C2420]">{readiness.pastDueCount} past-due</strong> and{' '}
                <strong className="text-[#1C2420]">{readiness.upcomingCount} upcoming</strong> items, or choose a prompt below to begin:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendPrompt(prompt)}
                    className="p-4 text-left text-xs font-medium text-[#1C2420] bg-[#FBF9F4] hover:bg-[#F4EFE4] border border-[#E4DFD3] rounded-lg transition-colors cursor-pointer leading-relaxed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#1B4332] text-white'
                      : 'bg-[#FBF9F4] border border-[#E4DFD3] text-[#1C2420]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5">
                    <span
                      className={`text-[11px] font-semibold ${
                        msg.role === 'user' ? 'text-white/80' : 'text-[#1B4332]'
                      }`}
                    >
                      {msg.role === 'user' ? 'You' : 'Estate AI Consultant'}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(msg.content);
                          setCopiedIdx(idx);
                          setTimeout(() => setCopiedIdx(null), 1500);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-[#56635C] hover:text-[#1C2420] cursor-pointer"
                      >
                        {copiedIdx === idx ? (
                          <>
                            <Check className="w-3 h-3 text-[#1B5E3A]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="text-xs text-[#56635C] font-medium">
              Reviewing estate readiness &amp; preparing guidance...
            </div>
          )}

          {errorMsg && (
            <div className="p-3 text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg flex flex-wrap items-center justify-between gap-3">
              <span>{errorMsg}</span>
              {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => submitMessages(messages)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#B42318] bg-white hover:bg-[#FEE4E2] border border-[#FECDCA] rounded-md whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-4 border-t border-[#E4DFD3] bg-[#FBF9F4] flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how to sequence tasks, prepare for probate, or draft an institution notice..."
            className="flex-1 px-4 py-2.5 text-sm bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Ask Consultant
          </button>
        </form>
      </section>
    </div>
  );
}

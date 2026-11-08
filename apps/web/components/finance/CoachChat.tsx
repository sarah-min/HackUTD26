'use client';

import { useState } from 'react';
import type { RecoveryPlan } from '@hack/contracts/finance';
import { coachReplyFromPlan } from '@hack/finance';
import { FinanceDisclaimer } from './FinanceDisclaimer';

type Msg = { role: 'user' | 'assistant'; text: string };

/**
 * Coach grounded in the current plan. Uses local reply when the worker coach job
 * isn't registered yet; still calls askCoach when provided so live replies can land.
 */
export function CoachChat({
  plan,
  remote,
  onAsk,
}: {
  plan: RecoveryPlan;
  remote: Array<{ role: string; text: string }>;
  onAsk?: (text: string) => Promise<void>;
}) {
  const [local, setLocal] = useState<Msg[]>(
    plan.coachSummary
      ? [{ role: 'assistant', text: plan.coachSummary }]
      : [{ role: 'assistant', text: coachReplyFromPlan(plan, 'summary') }],
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const messages: Msg[] = [
    ...local,
    ...remote.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      text: m.text,
    })),
  ];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText('');
    setLocal((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      if (onAsk) {
        await onAsk(q);
        // Also show an immediate grounded reply so the UI isn't empty if the worker isn't registered.
        setLocal((m) => [...m, { role: 'assistant', text: coachReplyFromPlan(plan, q) }]);
      } else {
        setLocal((m) => [...m, { role: 'assistant', text: coachReplyFromPlan(plan, q) }]);
      }
    } catch {
      setLocal((m) => [...m, { role: 'assistant', text: coachReplyFromPlan(plan, q) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Coach</p>
      <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Ask about this plan</h2>
      <FinanceDisclaimer />
      <p className="mt-1 text-[11px] text-slate-500">Answers use plan figures only.</p>
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {messages.map((m, i) => (
          <li
            key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
            className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
              m.role === 'user' ? 'bg-blue-50 text-blue-950' : 'bg-slate-50 text-slate-800'
            }`}
          >
            {m.text}
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => void send(e)}>
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. What is my gap?"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-xl bg-slate-900 px-3 py-2.5 text-[12px] font-bold text-white disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </section>
  );
}

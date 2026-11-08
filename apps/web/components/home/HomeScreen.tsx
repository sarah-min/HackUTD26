'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/chrome/AppShell';

function Icon({
  children,
  size = 20,
  className = '',
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

/** Landing CTAs into the Next app. */
export function HomeScreen() {
  return (
    <AppShell>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
          Choose your path
        </p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          How are you using Aftermath today?
        </h1>
      </header>

      <aside className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950">
        <span className="mt-0.5 shrink-0 text-red-700">
          <Icon size={17}>
            <path
              d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </Icon>
        </span>
        <p className="text-[12px] leading-relaxed">
          <strong>Immediate danger?</strong> Aftermath does not replace emergency services. Call{' '}
          <a className="font-extrabold underline underline-offset-2" href="tel:911">
            911
          </a>{' '}
          for active life-safety threats.
        </p>
      </aside>

      <div className="grid gap-3">
        <Link
          className="group relative overflow-hidden rounded-2xl bg-[#0f172a] p-5 text-left text-white shadow-[0_12px_30px_rgba(15,23,42,.14)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          href="/report/new"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-950/20">
              <Icon size={25}>
                <path
                  d="M4 8.5h3l1.2-2h7.6l1.2 2h3v10H4v-10Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
              </Icon>
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-white/10 text-slate-300 transition group-hover:bg-white group-hover:text-slate-950">
              <Icon size={18}>
                <path
                  d="m9 6 6 6-6 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </Icon>
            </span>
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.13em] text-blue-300">
            Reporter view
          </p>
          <h2 className="mt-1 text-[21px] font-bold tracking-[-0.025em]">
            I&apos;m documenting damage
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Capture field evidence, flag urgent hazards, and manage properties you have filmed.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {['Field capture', 'Safety flags', 'My submissions'].map((item) => (
              <span
                className="rounded-lg bg-white/7 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 ring-1 ring-inset ring-white/10"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </Link>

        <Link
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_12px_30px_rgba(15,23,42,.07)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(15,23,42,.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          href="/affected/start"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100">
              <Icon size={25}>
                <path
                  d="M4 11.5 12 5l8 6.5V20H4v-8.5Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="m17 7 1.5-2H21"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </Icon>
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-blue-700 group-hover:text-white">
              <Icon size={18}>
                <path
                  d="m9 6 6 6-6 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </Icon>
            </span>
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.13em] text-blue-700">
            Affected person view
          </p>
          <h2 className="mt-1 text-[21px] font-bold tracking-[-0.025em] text-slate-950">
            My home may be affected
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            Verify your residence, understand nearby risks, and build a personalized recovery plan.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {['Private verification', 'Area conditions', 'Recovery plan'].map((item) => (
              <span
                className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </Link>
      </div>
    </AppShell>
  );
}

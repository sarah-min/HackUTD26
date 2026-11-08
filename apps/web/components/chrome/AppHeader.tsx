'use client';

import Link from 'next/link';
import { brand } from '@/lib/brand';
import { ConnectionChip } from './ConnectionChip';

export function AppHeader({
  dense = false,
  trailing,
}: {
  dense?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <header
      className={`${dense ? 'app-safe-header-sm' : 'app-safe-header'} border-b border-white/10 bg-[#0f172a] px-4 py-2.5 text-white`}
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 sm:max-w-[520px]">
        <Link className="flex min-w-0 items-center gap-2.5" href="/" aria-label={`${brand.name} home`}>
          <span className="grid size-8 place-items-center rounded-lg bg-white text-[#0f172a]">
            <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24">
              <path
                d="M4 18 9.1 6.8a1 1 0 0 1 1.82 0L16 18M6.3 13h7.4M17.8 7.5 20 12h-4.4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.3"
              />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold tracking-[-0.03em]">{brand.name}</span>
            {!dense ? (
              <span className="block text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {brand.tagline}
              </span>
            ) : null}
          </span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-bold">
          <ConnectionChip />
          <Link className="rounded-lg px-2 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white" href="/report/new">
            Report
          </Link>
          <Link className="rounded-lg px-2 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white" href="/reporter">
            My submissions
          </Link>
          <Link className="rounded-lg px-2 py-1.5 text-blue-300 hover:bg-white/10 hover:text-white" href="/affected/start">
            I&apos;ve been affected
          </Link>
          {trailing}
        </nav>
      </div>
    </header>
  );
}

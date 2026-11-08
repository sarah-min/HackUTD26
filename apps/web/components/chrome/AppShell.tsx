'use client';

import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

/** Shared phone-shell layout used by every app screen. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-lg bg-[#f5f7fa] shadow-[0_0_45px_rgba(15,23,42,0.12)] sm:max-w-[520px]">
        <AppHeader dense />
        <main className="space-y-3 px-4 py-3 pb-7">{children}</main>
      </div>
    </div>
  );
}

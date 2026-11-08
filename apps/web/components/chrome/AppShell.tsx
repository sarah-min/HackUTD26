'use client';

import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

/** Shared phone-shell layout (Updatedfront 480px frame) for every app screen. */
export function AppShell({
  children,
  hideHeader = false,
}: {
  children: ReactNode;
  hideHeader?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f5f7fa] shadow-[0_0_45px_rgba(15,23,42,0.12)]">
        {hideHeader ? null : <AppHeader dense />}
        <main className="space-y-3 px-3.5 py-3.5 pb-8">{children}</main>
      </div>
    </div>
  );
}

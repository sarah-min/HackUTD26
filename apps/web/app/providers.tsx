'use client';

import type { ReactNode } from 'react';
import { StdbProvider } from '@/lib/stdb';

/** Client boundary so the root layout can stay a server component. */
export function Providers({ children }: { children: ReactNode }) {
  return <StdbProvider>{children}</StdbProvider>;
}

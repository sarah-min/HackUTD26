'use client';
// Small chip linking to /affected/account. Shown only when this device has an account.
import Link from 'next/link';
import { useAccount, useAuthStatus } from '@/lib/stdb';

export function AccountLink() {
  const { mode, ready } = useAuthStatus();
  const { account } = useAccount();
  if (!ready || mode === 'off' || !account) return null;
  return (
    <Link
      href="/affected/account"
      className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-800"
    >
      Account
    </Link>
  );
}

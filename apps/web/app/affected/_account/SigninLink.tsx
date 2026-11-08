'use client';
// Discreet entry point for a new device. Hidden when accounts are off or this device is signed in.
import Link from 'next/link';
import { useAccount, useAuthStatus } from '@/lib/stdb';

export function SigninLink() {
  const { mode, ready } = useAuthStatus();
  const { account } = useAccount();
  if (!ready || mode === 'off' || account) return null;
  return (
    <p className="text-center text-[12px] text-slate-500">
      Already verified?{' '}
      <Link href="/affected/signin" className="font-bold text-blue-700 underline">
        Sign in on this device
      </Link>
    </p>
  );
}

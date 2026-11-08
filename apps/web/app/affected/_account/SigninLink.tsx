'use client';
// Discreet entry point for a new device. Hidden when accounts are off or this device is signed in.
import Link from 'next/link';
import { useAccount, useAccountStatus } from '@/lib/stdb';

export function SigninLink() {
  const { enabled, ready } = useAccountStatus();
  const { account } = useAccount();
  if (!ready || !enabled || account) return null;
  return (
    <p className="text-center text-[12px] text-slate-500">
      Already verified?{' '}
      <Link href="/affected/signin" className="font-bold text-blue-700 underline">
        Sign in with your recovery code
      </Link>
    </p>
  );
}

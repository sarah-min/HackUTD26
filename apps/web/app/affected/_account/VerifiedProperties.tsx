'use client';
// Lists the verified properties on this device or account (my_verifications is account-aware).
// With `autoOpen`, a single property opens straight away; none shows the empty state after a short wait
// so the views have time to refresh after a fresh sign-in.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { idToString, useMyVerifications, useVerifiedPropertyPrivate } from '@/lib/stdb';
import { formatAddress } from '@/components/affected/helpers';
import { card } from './ui';

const SETTLE_MS = 4000;

function PropertyItem({ propertyId }: { propertyId: bigint }) {
  const { propertyPrivate } = useVerifiedPropertyPrivate(propertyId);
  return (
    <li>
      <Link
        href={`/affected/property/${idToString(propertyId)}`}
        className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-[13px] text-slate-800 hover:border-blue-300 hover:bg-blue-50"
      >
        {propertyPrivate ? formatAddress(propertyPrivate) : `Your home (${idToString(propertyId)})`}
      </Link>
    </li>
  );
}

export function VerifiedProperties({ autoOpen = false }: { autoOpen?: boolean }) {
  const router = useRouter();
  const [rows, ready] = useMyVerifications();
  const [settled, setSettled] = useState(false);

  const propertyIds = useMemo(() => {
    const seen = new Map<string, bigint>();
    for (const v of rows)
      if (v.state === 'verified') seen.set(idToString(v.propertyId), v.propertyId);
    return [...seen.values()];
  }, [rows]);

  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  const onlyId = propertyIds.length === 1 ? propertyIds[0] : undefined;
  useEffect(() => {
    if (autoOpen && onlyId !== undefined)
      router.replace(`/affected/property/${idToString(onlyId)}`);
  }, [autoOpen, onlyId, router]);

  if (propertyIds.length === 0) {
    if (!ready || !settled) {
      return (
        <p role="status" className="text-[13px] text-slate-600">
          Finding your properties…
        </p>
      );
    }
    return (
      <section className={card}>
        <p className="text-[13px] font-bold text-slate-900">No properties found yet.</p>
        <p className="text-[12px] text-slate-500">
          No verified home is linked to this account. Verify your home to see reports for it.
        </p>
        <Link
          href="/affected/start"
          className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
        >
          I&apos;ve been affected
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-2" aria-label="Your properties">
      <h2 className="text-[12px] font-semibold text-slate-700">
        {propertyIds.length === 1 ? 'Opening your home…' : 'Choose a home'}
      </h2>
      <ul className="space-y-2">
        {propertyIds.map((id) => (
          <PropertyItem key={idToString(id)} propertyId={id} />
        ))}
      </ul>
    </section>
  );
}

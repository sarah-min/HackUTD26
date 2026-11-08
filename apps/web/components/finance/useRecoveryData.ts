'use client';

import { useMemo } from 'react';
import { useTable } from 'spacetimedb/react';
import {
  RecoveryPlanSchema,
  AffectedIntakeSchema,
  type RecoveryPlan,
  type AffectedIntake,
} from '@hack/contracts/finance';
import { T } from '@/lib/stdb';

/** Live recovery rows for this verified identity (views already scoped). */
export function useRecoveryData(propertyId: bigint | null) {
  const enabled = propertyId !== null;
  const [profiles, pReady] = useTable(T.myAffectedProfiles, { enabled });
  const [plans, planReady] = useTable(T.myRecoveryPlans, { enabled });
  const [messages, mReady] = useTable(T.myCoachMessages, { enabled });

  return useMemo(() => {
    if (propertyId === null) {
      return {
        profile: null as AffectedIntake | null,
        plans: [] as Array<{ reportId: bigint; plan: RecoveryPlan; createdAt: unknown }>,
        messages: [] as Array<{ reportId: bigint; role: string; text: string; at: unknown }>,
        ready: false,
      };
    }

    const row = profiles.find((p) => p.propertyId === propertyId);
    let intake: AffectedIntake | null = null;
    if (row?.intakeJson) {
      try {
        const parsed = AffectedIntakeSchema.safeParse(JSON.parse(row.intakeJson));
        if (parsed.success) intake = parsed.data;
      } catch {
        intake = null;
      }
    }

    const planRows: Array<{ reportId: bigint; plan: RecoveryPlan; createdAt: unknown }> = [];
    for (const p of plans) {
      if (p.propertyId !== propertyId) continue;
      try {
        const parsed = RecoveryPlanSchema.safeParse(JSON.parse(p.json));
        if (parsed.success) {
          planRows.push({ reportId: p.reportId, plan: parsed.data, createdAt: p.createdAt });
        }
      } catch {
        // skip bad rows
      }
    }

    const msgs = messages
      .filter((m) => m.propertyId === propertyId)
      .map((m) => ({ reportId: m.reportId, role: m.role, text: m.text, at: m.at }));

    return {
      profile: intake,
      plans: planRows,
      messages: msgs,
      ready: pReady && planReady && mReady,
    };
  }, [propertyId, profiles, plans, messages, pReady, planReady, mReady]);
}

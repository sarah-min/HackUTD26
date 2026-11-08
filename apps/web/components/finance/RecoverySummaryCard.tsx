'use client';

import type { RecoverySummaryCardProps } from '@/components/affected/placeholders/types';

/**
 * Compact plan teaser for the affected report page (P2 shell).
 * Full Navigator lives at /affected/property/[propertyId]/recovery.
 * Until recovery_plan rows stream in, shows a neutral empty state.
 */
export function RecoverySummaryCard({ propertyId }: RecoverySummaryCardProps) {
  return (
    <section aria-label="Recovery summary" data-source="synthetic">
      <h2>Recovery Navigator</h2>
      <p>
        Educational estimate using a synthetic demo profile. Not financial advice. Complete intake on the recovery
        page to see coverage gap, indicators, and next steps.
      </p>
      <p>
        <a href={`/affected/property/${propertyId}/recovery`}>Open Recovery Navigator</a>
      </p>
    </section>
  );
}

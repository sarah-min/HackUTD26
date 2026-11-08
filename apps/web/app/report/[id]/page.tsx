import { Suspense } from 'react';
import { ReportStatus } from '@/components/report/ReportStatus';

export default async function ReportStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<main className="p-6 text-sm text-slate-600">Loading report…</main>}>
      <ReportStatus reportIdParam={id} />
    </Suspense>
  );
}

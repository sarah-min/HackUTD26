import { Suspense } from 'react';
import { ReportCapture } from '@/components/report/ReportCapture';

export default function ReportNewPage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-slate-600">Loading capture…</main>}>
      <ReportCapture />
    </Suspense>
  );
}

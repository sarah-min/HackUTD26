'use client';

// Local dev only: opens the resident report filled with sample data, skipping verification.
// NODE_ENV is fixed at build time, so production builds render nothing here.
export const DEV_PREVIEW = process.env.NODE_ENV === 'development';

export function DevPreviewButton({ id = '7' }: { id?: string }) {
  if (!DEV_PREVIEW) return null;
  return (
    <a
      href={`/affected/report/${id}?preview=sample`}
      className="block rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-center text-[13px] font-bold text-amber-900"
    >
      Skip verification: preview with sample data (dev only)
    </a>
  );
}

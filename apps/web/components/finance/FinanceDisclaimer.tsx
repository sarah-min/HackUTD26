/** Subtitle shown under Recovery Navigator / finance headings. */
export const FINANCE_DISCLAIMER =
  'The information provided on this website is for general informational and educational purposes only. It should not be construed as professional financial, investment, legal, or tax advice.';

export function FinanceDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`mt-1 text-[11px] leading-relaxed text-slate-500 ${className}`.trim()}>
      {FINANCE_DISCLAIMER}
    </p>
  );
}

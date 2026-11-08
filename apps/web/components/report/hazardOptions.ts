import type { Hazard } from '@hack/contracts/common';

/** UI labels → contract Hazard enum (CONTRACTS §2.1). */
export const HAZARD_OPTIONS: { value: Hazard; label: string }[] = [
  { value: 'hurricane_wind', label: 'Hurricane' },
  { value: 'flood', label: 'Flood' },
  { value: 'tornado', label: 'Tornado' },
  { value: 'wildfire', label: 'Wildfire' },
  { value: 'other', label: 'Other' },
];

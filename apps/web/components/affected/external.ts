// SWAP POINT for components owned by other parts. Part 2's pages import them ONLY from here.
// When a real component lands, change its one line to the commented path; nothing else changes.
// The props each must accept are in ./placeholders/types.ts.

export { CellMap } from './placeholders'; //            → export { CellMap } from '@/components/map';
export { Banner911, HazardList } from './placeholders'; // → export { Banner911, HazardList } from '@/components/safety';
export { DamageReport } from './placeholders'; //        → export { DamageReport } from '@/components/damage-report';
export { AgentTrace } from './placeholders'; //          → export { AgentTrace } from '@/components/agent-trace';
export { RecoverySummaryCard } from './placeholders'; // → export { RecoverySummaryCard } from '@/components/finance';

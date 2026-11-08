import { z } from 'zod';
import { aggregateFindings } from '@hack/damage';
import { defineTool } from './types';
import { loadFindings } from './shared';

const Output = z.object({
  usableFrameCount: z.number(),
  totalFrameCount: z.number(),
  codeComputed: z.object({
    overallLevel: z.string(),
    damagedComponents: z.record(z.string(), z.string()),
    lifeSafety: z.array(z.string()),
    confidence: z.number(),
  }),
  frames: z.array(
    z.object({
      frameIndex: z.number(),
      tSec: z.number(),
      usable: z.boolean(),
      caption: z.string(),
      waterDepth: z.string(),
      components: z.array(z.object({ component: z.string(), level: z.string(), evidence: z.string(), confidence: z.number() })),
      lifeSafety: z.array(z.object({ flag: z.string(), confidence: z.number() })),
    }),
  ),
});

export const getFrameFindingsTool = defineTool({
  name: 'get_frame_findings',
  description:
    'All validated per-frame damage findings for this report, plus the code-computed overall level, damaged components and life-safety flags. Use these levels as the facts.',
  input: z.object({}),
  output: Output,
  visibility: 'affected',
  async run(_input, ctx) {
    const findings = await loadFindings(ctx);
    const agg = aggregateFindings(findings);
    return {
      usableFrameCount: agg.usableFrameCount,
      totalFrameCount: agg.totalFrameCount,
      codeComputed: {
        overallLevel: agg.overallLevel,
        damagedComponents: Object.fromEntries(Object.entries(agg.componentLevels).filter(([, l]) => l !== 'none')),
        lifeSafety: agg.lifeSafety,
        confidence: agg.confidence,
      },
      frames: findings.map((f) => ({
        frameIndex: f.frameIndex,
        tSec: f.tSec,
        usable: f.usable,
        caption: f.caption,
        waterDepth: f.waterDepth,
        components: f.components.map((c) => ({ ...c, evidence: c.evidence.slice(0, 120) })),
        lifeSafety: f.lifeSafety.map((s) => ({ flag: s.flag, confidence: s.confidence })),
      })),
    };
  },
  summarize: (o) => {
    const parts = Object.entries(o.codeComputed.damagedComponents).map(([c, l]) => `${c} ${l}`);
    return `${o.usableFrameCount}/${o.totalFrameCount} usable frames; overall ${o.codeComputed.overallLevel}${parts.length ? ` (${parts.join(', ')})` : ''}`.slice(0, 400);
  },
});

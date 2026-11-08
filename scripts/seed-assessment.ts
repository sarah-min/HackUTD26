// Fixture damage profile shared by seed-demo, dev-fake-worker and live-row patches.
// Mirrors CONTRACTS.md section 6 (cost-v1) so analyze-side cost and the plan handler's recompute agree.
export type Level = 'none' | 'affected' | 'minor' | 'major' | 'destroyed';

const ORDER: Level[] = ['none', 'affected', 'minor', 'major', 'destroyed'];
const SHARE: Record<string, number> = {
  roof: 0.15,
  exterior_walls: 0.15,
  windows_doors: 0.07,
  foundation: 0.12,
  interior: 0.3,
  utilities: 0.11,
  yard_debris: 0.02,
};
const FRACTION: Record<Level, number> = { none: 0, affected: 0.05, minor: 0.15, major: 0.5, destroyed: 1 };
const CONTENTS: Record<Level, number> = { none: 0, affected: 50000, minor: 300000, major: 1500000, destroyed: 4000000 };
const VEHICLE: Record<Level, number> = { none: 0, affected: 50000, minor: 250000, major: 1200000, destroyed: 2500000 };

function down(l: Level, steps = 1): Level {
  return ORDER[Math.max(0, ORDER.indexOf(l) - steps)]!;
}

/** All 9 contract components, scaled from the overall level (foundation and utilities one step lower, vehicle two lower). */
export function componentLevelsFor(overall: Level): Record<string, Level> {
  return {
    roof: overall,
    exterior_walls: overall,
    windows_doors: overall,
    foundation: down(overall),
    interior: overall,
    utilities: down(overall),
    contents: overall,
    vehicle: down(overall, 2),
    yard_debris: overall,
  };
}

/** cost-v1 for the assumed home (1800 sqft, 1 story, own). */
export function costFor(overall: Level, homeSqft = 1800) {
  const levels = componentLevelsFor(overall);
  const structureValue = homeSqft * 15000;
  const lineItems: { component: string; level: Level; basis: string; likelyCents: number }[] = [];
  for (const [c, share] of Object.entries(SHARE)) {
    const level = levels[c]!;
    lineItems.push({
      component: c,
      level,
      basis: `[FIXTURE] ${homeSqft} sqft x $150/sqft x ${Math.round(share * 100)}% ${c} share x ${FRACTION[level] * 100}%`,
      likelyCents: Math.round(structureValue * share * FRACTION[level]),
    });
  }
  lineItems.push({ component: 'contents', level: levels.contents!, basis: '[FIXTURE] fixed contents table', likelyCents: CONTENTS[levels.contents!] });
  lineItems.push({ component: 'vehicle', level: levels.vehicle!, basis: '[FIXTURE] fixed vehicle table', likelyCents: VEHICLE[levels.vehicle!] });
  const structure = Math.min(
    structureValue,
    lineItems.filter(l => l.component in SHARE).reduce((a, l) => a + l.likelyCents, 0)
  );
  const likely = structure + CONTENTS[levels.contents!] + VEHICLE[levels.vehicle!];
  return {
    levels,
    cost: {
      lowCents: Math.round(likely * 0.7),
      likelyCents: likely,
      highCents: Math.round(likely * 1.4),
      lineItems: lineItems.filter(l => l.likelyCents > 0),
      inputs: { homeSqft, stories: 1, tenure: 'own', assumed: true },
      costModelVersion: 'cost-v1',
      disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
    },
  };
}

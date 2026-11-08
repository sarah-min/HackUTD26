import type { Component, DamageLevel, Hazard } from '@hack/contracts/common';
import type { DisasterDeclaration } from '@hack/contracts/assessment';

// Plain-language repair and recovery guidance for the verified resident's report.
// Static and deterministic: general guidance, not a contractor's or insurer's advice.

export type RepairTier = 'light' | 'moderate' | 'severe';

export function repairTier(level: DamageLevel): RepairTier | null {
  if (level === 'none') return null;
  if (level === 'affected') return 'light';
  if (level === 'minor') return 'moderate';
  return 'severe';
}

export interface RepairAdvice {
  /** What to do right now to stay safe or limit further damage. */
  now: string;
  /** What fixing it usually involves. */
  fix: string;
  /** Who typically does the work. */
  who: string;
}

export const REPAIR_GUIDE: Record<Component, Record<RepairTier, RepairAdvice>> = {
  roof: {
    light: {
      now: 'Check the attic and top-floor ceilings for drips after the next rain.',
      fix: 'Replace loose or missing shingles and reseal the flashing.',
      who: 'Roofer',
    },
    moderate: {
      now: 'Cover damaged areas with a tarp if it’s safe, or have a roofer do it.',
      fix: 'Replace damaged shingles and any soft decking underneath, and check the flashing and gutters.',
      who: 'Licensed roofer',
    },
    severe: {
      now: 'Get the opening tarped quickly to keep rain out. Don’t go up on the roof yourself.',
      fix: 'Large sections likely need new decking and roofing, sometimes a full replacement. Have the structure checked before work starts.',
      who: 'Licensed roofer, plus a structural engineer if beams are damaged',
    },
  },
  exterior_walls: {
    light: {
      now: 'Photograph any cracks or loose siding.',
      fix: 'Patch or replace small sections of siding or trim.',
      who: 'Handyman or siding contractor',
    },
    moderate: {
      now: 'Cover holes in the walls so rain and animals stay out.',
      fix: 'Replace damaged siding and the sheathing and insulation behind it, and check for hidden water damage.',
      who: 'Siding or general contractor',
    },
    severe: {
      now: 'Stay away from walls that lean or bow.',
      fix: 'Walls may need rebuilding. An engineer should confirm the frame is sound first.',
      who: 'Structural engineer, then a general contractor',
    },
  },
  windows_doors: {
    light: {
      now: 'Seal small cracks with clear tape to keep water out.',
      fix: 'Replace cracked panes, weatherstripping or hardware.',
      who: 'Glass or window repair service',
    },
    moderate: {
      now: 'Board up broken windows and sweep glass off the floors.',
      fix: 'Replace broken windows and damaged doors, and check the frames for water damage.',
      who: 'Window and door installer',
    },
    severe: {
      now: 'Board up every opening so the home is secure.',
      fix: 'Replace windows, doors and damaged frames. Some openings may need reframing.',
      who: 'General contractor',
    },
  },
  foundation: {
    light: {
      now: 'Watch for new cracks or doors that start sticking.',
      fix: 'Seal hairline cracks and make sure water drains away from the house.',
      who: 'Foundation repair contractor',
    },
    moderate: {
      now: 'Keep water draining away from the house.',
      fix: 'Cracks or settling may need repair, such as piers or wall anchors.',
      who: 'Structural engineer and foundation contractor',
    },
    severe: {
      now: 'Don’t stay in the home until an engineer says it’s safe.',
      fix: 'Major foundation repair or rebuilding, after an engineer’s assessment.',
      who: 'Structural engineer',
    },
  },
  interior: {
    light: {
      now: 'Dry wet areas with fans and open windows.',
      fix: 'Patch and repaint stained drywall and clean the affected floors.',
      who: 'Handyman or painter',
    },
    moderate: {
      now: 'Pull up wet carpet and padding and start drying within 48 hours to limit mold.',
      fix: 'Cut out and replace wet drywall and insulation, and replace damaged flooring.',
      who: 'Water damage restoration company, then a contractor',
    },
    severe: {
      now: 'Stay out of rooms with sagging ceilings, and turn off power to wet areas.',
      fix: 'Damaged rooms will need to be gutted and rebuilt: drywall, insulation, flooring and cabinets.',
      who: 'Water damage restoration company and a general contractor',
    },
  },
  utilities: {
    light: {
      now: 'Test outlets, lights and appliances. Stop using anything that sparks or smells hot.',
      fix: 'Repair damaged fixtures, outlets or the AC unit.',
      who: 'Electrician or HVAC technician',
    },
    moderate: {
      now: 'Turn off power at the breaker if anything got wet, and turn off gas if you smell it.',
      fix: 'Repair or replace water-damaged wiring, the electrical panel, water heater or HVAC.',
      who: 'Licensed electrician, plumber or HVAC technician',
    },
    severe: {
      now: 'Keep utilities off until a licensed pro inspects them. If you smell gas, call the gas company from outside.',
      fix: 'Electrical, plumbing and HVAC systems likely need replacing. Most cities require a permit and inspection before power comes back on.',
      who: 'Licensed electrician, plumber and HVAC contractor',
    },
  },
  contents: {
    light: {
      now: 'Dry and clean belongings that got wet.',
      fix: 'Clean or replace damaged items.',
      who: 'You, or a cleaning service',
    },
    moderate: {
      now: 'Photograph damaged belongings before throwing anything away, and keep receipts.',
      fix: 'Replace or professionally clean damaged furniture, electronics and clothing.',
      who: 'Content restoration service; your insurer for replacements',
    },
    severe: {
      now: 'List what was lost room by room, with photos. Keep a sample of damaged carpet or fabric.',
      fix: 'Most belongings in the damaged rooms will need replacing.',
      who: 'Your insurer (contents coverage)',
    },
  },
  vehicle: {
    light: {
      now: 'Photograph the damage.',
      fix: 'Dent repair or glass replacement.',
      who: 'Body shop',
    },
    moderate: {
      now: 'Don’t start a car that sat in floodwater.',
      fix: 'Body and glass repair, plus a mechanical check if water got inside.',
      who: 'Your auto insurer and a body shop',
    },
    severe: {
      now: 'Don’t drive it or start it. Have it towed.',
      fix: 'Likely a total loss; your auto insurer decides.',
      who: 'Your auto insurer (comprehensive coverage)',
    },
  },
  yard_debris: {
    light: {
      now: 'Clear small branches and debris from walkways.',
      fix: 'Clean up and bag the debris.',
      who: 'You, or a yard service',
    },
    moderate: {
      now: 'Stay clear of tangled debris that could hide power lines or nails.',
      fix: 'Debris removal, and a check of fences, sheds and trees.',
      who: 'Tree service or debris removal company',
    },
    severe: {
      now: 'Keep away from large fallen trees, especially near power lines.',
      fix: 'Professional tree and debris removal. Many cities run free curbside debris pickup after a disaster.',
      who: 'Licensed tree service; check your city’s debris pickup',
    },
  },
};

const FLOOD_SENSITIVE: readonly Component[] = ['interior', 'utilities', 'foundation', 'contents'];

/** Extra caution for floodwater, which can carry sewage and chemicals. */
export function floodNote(component: Component, hazard: Hazard): string | null {
  if (hazard !== 'flood' || !FLOOD_SENSITIVE.includes(component)) return null;
  return 'Floodwater can carry sewage. Wear gloves and boots, and throw out soft items that soaked in it.';
}

export const HAZARD_LABEL: Record<Hazard, string> = {
  flood: 'Flood',
  hurricane_wind: 'Hurricane or wind',
  tornado: 'Tornado',
  wildfire: 'Wildfire',
  earthquake: 'Earthquake',
  hail: 'Hail',
  other: 'Disaster',
};

export type AvenueStatus = 'open' | 'check' | 'later';

export interface RecoveryAvenue {
  id: string;
  title: string;
  status: AvenueStatus;
  body: string;
  link?: { href: string; label: string };
}

export const AVENUE_STATUS_LABEL: Record<AvenueStatus, string> = {
  open: 'Available now',
  check: 'Check eligibility',
  later: 'Not available yet',
};

const FEMA_URL = 'https://www.disasterassistance.gov/';
const SBA_URL = 'https://www.sba.gov/funding-programs/disaster-assistance';

/** Ways the resident can pay for or get help with repairs, ordered by what to do first. */
export function recoveryAvenues(args: {
  tenure: 'own' | 'rent';
  hazard: Hazard;
  declarations: readonly DisasterDeclaration[];
  countyName?: string;
}): RecoveryAvenue[] {
  const { tenure, hazard, declarations } = args;
  const county = args.countyName ?? 'your county';
  const out: RecoveryAvenue[] = [];
  const floodLine =
    hazard === 'flood'
      ? ' Standard policies don’t cover flooding, so if you have flood insurance (NFIP or private), file with that insurer too.'
      : '';

  if (tenure === 'rent') {
    out.push({
      id: 'landlord',
      title: 'Your landlord',
      status: 'open',
      body: 'Tell your landlord about the damage in writing and keep a copy. Repairs to the building, roof, plumbing and wiring are their responsibility.',
    });
    out.push({
      id: 'insurance',
      title: 'Your renters insurance',
      status: 'open',
      body: `Renters insurance covers your belongings and extra living costs if you can’t stay home.${floodLine}`,
    });
  } else {
    out.push({
      id: 'insurance',
      title: 'Your homeowners insurance',
      status: 'open',
      body:
        hazard === 'flood'
          ? 'Standard homeowners policies don’t cover flooding. If you have flood insurance (NFIP or private), file with that insurer as soon as you can; your homeowners policy may still cover other damage.'
          : 'Homeowners policies usually cover wind, hail, fire and fallen-tree damage. Call your insurer to open a claim, and keep receipts for tarps and temporary repairs; those are often reimbursed.',
    });
  }

  const withAid = declarations.find((d) => d.ihProgramDeclared);
  const anyDeclared = declarations[0];
  if (withAid) {
    out.push({
      id: 'fema',
      title: 'FEMA disaster assistance',
      status: 'open',
      body: `Federal aid is open in ${county} (${withAid.femaDeclarationString}). It can help with repairs, temporary housing and belongings that insurance doesn’t cover. File your insurance claim first, then apply.`,
      link: { href: FEMA_URL, label: 'Apply at DisasterAssistance.gov' },
    });
  } else if (anyDeclared) {
    out.push({
      id: 'fema',
      title: 'FEMA disaster assistance',
      status: 'check',
      body: `A federal disaster (${anyDeclared.femaDeclarationString}) was declared for ${county}, but aid for individuals isn’t open yet. It can be added later.`,
      link: { href: FEMA_URL, label: 'Check DisasterAssistance.gov' },
    });
  } else {
    out.push({
      id: 'fema',
      title: 'FEMA disaster assistance',
      status: 'later',
      body: `There’s no federal disaster declaration for ${county} right now. If one is declared, you can apply for help with repairs and housing.`,
    });
  }

  out.push({
    id: 'sba',
    title: 'SBA disaster loan',
    status: anyDeclared ? 'check' : 'later',
    body: anyDeclared
      ? `Low-interest loans for ${tenure === 'rent' ? 'replacing belongings' : 'repairing your home and replacing belongings'}, available after a federal declaration.`
      : 'Low-interest repair loans become an option if a federal disaster is declared.',
    link: anyDeclared ? { href: SBA_URL, label: 'See SBA disaster loans' } : undefined,
  });

  return out;
}

export const HIRING_TIP =
  'Get two or three written bids from licensed, insured contractors. Don’t pay the full amount upfront, and be careful with door-to-door offers after a storm.';

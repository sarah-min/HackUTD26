// Part 4 — CONTRACTS.md §4. Additive changes only.
import { z } from 'zod';
import { HazardSchema, SourceSchema, VulnerabilitySchema } from './common';
import { CostEstimateSchema } from './assessment';

export const HouseholdSchema = z.object({
  peopleCount: z.number().int().min(1).max(20),
  vulnerabilities: z.array(VulnerabilitySchema),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  type: z.enum([
    'checking',
    'savings',
    'cd',
    'ira',
    'mortgage',
    'auto_loan',
    'personal_loan',
    'credit_card',
  ]),
  name: z.string(),
  balanceCents: z.number().int().nonnegative(),
  aprBps: z.number().int().optional(),
  creditLimitCents: z.number().int().optional(),
  monthlyPaymentCents: z.number().int().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  earlyWithdrawalPenaltyBps: z.number().int().optional(),
  maturityAt: z.number().int().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const FinancialProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  accounts: z.array(AccountSchema),
  monthlyNetIncomeCents: z.number().int(),
  monthlyGrossIncomeCents: z.number().int(),
  monthlyEssentialExpensesCents: z.number().int(),
  payDays: z.array(z.number().int().min(1).max(28)),
  personalLoanOfferAprBps: z.number().int().optional(),
  source: z.literal('synthetic'),
});
export type FinancialProfile = z.infer<typeof FinancialProfileSchema>;

export const InsuranceInfoSchema = z.object({
  policyType: z.enum(['homeowners', 'renters', 'none', 'unknown']),
  carrier: z.string().max(60).optional(),
  dwellingCoverageCents: z.number().int().nonnegative().default(0),
  contentsCoverageCents: z.number().int().nonnegative().default(0),
  deductibleCents: z.number().int().nonnegative().optional(),
  deductibleBps: z.number().int().nonnegative().optional(),
  floodCovered: z.boolean().default(false),
});
export type InsuranceInfo = z.infer<typeof InsuranceInfoSchema>;

export const AffectedIntakeSchema = z.object({
  household: HouseholdSchema,
  tenure: z.enum(['own', 'rent']),
  homeSqft: z.number().int().min(200).max(10000).default(1800),
  stories: z.number().int().min(1).max(4).default(1),
  insurance: InsuranceInfoSchema,
  personaId: z.string(),
});
export type AffectedIntake = z.infer<typeof AffectedIntakeSchema>;

export const ScenarioSchema = z.object({
  repairCase: z.enum(['low', 'likely', 'high']).default('likely'),
  payoutDelayDays: z.number().int().min(0).max(180).default(30),
  deductibleOverrideCents: z.number().int().nonnegative().optional(),
  incomeLossMonths: z.number().min(0).max(6).default(0),
  repairStartDay: z.number().int().min(0).max(60).default(7),
  fundingMix: z
    .array(z.object({ optionId: z.string(), amountCents: z.number().int().nonnegative() }))
    .optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const IndicatorSchema = z.object({
  id: z.enum([
    'liquidity_runway_months',
    'emergency_fund_coverage',
    'debt_to_income',
    'credit_utilization',
    'insurance_gap_ratio',
  ]),
  label: z.string(),
  value: z.number(),
  unit: z.enum(['months', 'ratio']),
  status: z.enum(['good', 'watch', 'risk']),
  explanation: z.string(),
});
export type Indicator = z.infer<typeof IndicatorSchema>;

export const FundingOptionSchema = z.object({
  id: z.enum([
    'savings',
    'credit_card',
    'personal_loan',
    'cd_early_withdrawal',
    'ira_withdrawal',
    'sba_disaster_loan',
    'fema_ihp',
  ]),
  label: z.string(),
  availableCents: z.number().int().nonnegative().nullable(),
  costOfFundsCents: z.number().int().nonnegative().nullable(),
  daysToFunds: z.number().int().nullable(),
  eligibilityNote: z.string().optional(),
  link: z.string().url().optional(),
});
export type FundingOption = z.infer<typeof FundingOptionSchema>;

export const ForecastPointSchema = z.object({
  day: z.number().int().min(0).max(90),
  at: z.number().int(),
  liquidCents: z.number().int(),
  events: z.array(z.string()),
});
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

export const RECOVERY_PLAN_DISCLAIMER =
  'Educational estimate using a synthetic demo profile. Not financial advice.' as const;

export const RecoveryPlanSchema = z.object({
  propertyId: z.string(),
  reportId: z.string(),
  profileId: z.string(),
  cost: CostEstimateSchema,
  repairCostCents: z.object({
    low: z.number().int(),
    likely: z.number().int(),
    high: z.number().int(),
  }),
  expectedPayoutCents: z.object({
    low: z.number().int(),
    likely: z.number().int(),
    high: z.number().int(),
  }),
  gapCents: z.object({
    low: z.number().int(),
    likely: z.number().int(),
    high: z.number().int(),
  }),
  payoutNotes: z.array(z.string()),
  indicators: z.array(IndicatorSchema).min(3),
  options: z.array(FundingOptionSchema),
  recommendedMix: z.array(z.object({ optionId: z.string(), amountCents: z.number().int() })),
  forecast: z.array(ForecastPointSchema),
  firstShortfallDay: z.number().int().nullable(),
  nextSteps: z.array(z.string()).max(6),
  coachSummary: z.string().max(800).optional(),
  disclaimer: z.literal(RECOVERY_PLAN_DISCLAIMER),
  source: SourceSchema,
  createdAt: z.number().int(),
});
export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;

export const CoachMessageSchema = z.object({
  propertyId: z.string(),
  reportId: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(2000),
  at: z.number().int(),
});
export type CoachMessage = z.infer<typeof CoachMessageSchema>;

export const SimulationResultSchema = z.object({
  forecast: z.array(ForecastPointSchema),
  indicators: z.array(IndicatorSchema).min(3),
  gapCents: z.object({
    low: z.number().int(),
    likely: z.number().int(),
    high: z.number().int(),
  }),
  firstShortfallDay: z.number().int().nullable(),
  totalCostOfFundsCents: z.number().int().nonnegative(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

/** Re-export for call sites that already import Hazard from finance flows. */
export { HazardSchema };
export type { Hazard } from './common';

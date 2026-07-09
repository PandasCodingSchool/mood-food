// Canonical budget tiers — single source of truth for every game and the
// AI request builder. Ranges are INR.
export type BudgetTier = "budget" | "moderate" | "splurge";

export interface BudgetTierConfig {
  value: BudgetTier;
  label: string;
  emoji: string;
  subtitle: string;
  min: number;
  max: number;
}

export const BUDGET_TIERS: BudgetTierConfig[] = [
  { value: "budget", label: "Budget", emoji: "💰", subtitle: "Under ₹300", min: 0, max: 300 },
  { value: "moderate", label: "Moderate", emoji: "💰💰", subtitle: "₹300–₹800", min: 300, max: 800 },
  { value: "splurge", label: "Splurge", emoji: "💰💰💰", subtitle: "Above ₹800", min: 800, max: 2000 },
];

export const BUDGET_TIER_BY_VALUE: Record<BudgetTier, BudgetTierConfig> =
  Object.fromEntries(BUDGET_TIERS.map((t) => [t.value, t])) as Record<
    BudgetTier,
    BudgetTierConfig
  >;

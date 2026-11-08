/** Building highlight categories shown on the 3D Mapbox views. */
export type DamageStatus = "none" | "minor" | "moderate" | "severe" | "verified";

export const DAMAGE_COLORS: Record<DamageStatus, string> = {
  none: "#22c55e", // Green  – no visible damage
  minor: "#eab308", // Yellow – minor damage
  moderate: "#f97316", // Orange – moderate damage
  severe: "#ef4444", // Red    – severe damage
  verified: "#0047AB", // Cobalt – verified residence
};

export const DAMAGE_LABELS: Record<DamageStatus, string> = {
  none: "No visible damage",
  minor: "Minor damage",
  moderate: "Moderate damage",
  severe: "Severe damage",
  verified: "Verified residence",
};

export const DAMAGE_ORDER: DamageStatus[] = ["none", "minor", "moderate", "severe", "verified"];

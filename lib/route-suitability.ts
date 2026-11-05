export type RouteStrollerStatus = "verified" | "not_recommended" | "unknown";
export type RoutePreschoolStatus = "suitable" | "with_adult" | "not_recommended" | "unknown";
export type RouteTimeCategory = "under_1h" | "under_2h" | "over_2h";
export type RouteSuitabilityTone = "positive" | "caution" | "negative";

export type RouteSuitabilityBadge = {
  key: "stroller" | "preschool" | "time";
  icon: string;
  label: string;
  tone: RouteSuitabilityTone;
};

export function normalizeStrollerStatus(value: unknown): RouteStrollerStatus {
  return value === "verified" || value === "not_recommended" ? value : "unknown";
}

export function normalizePreschoolStatus(value: unknown): RoutePreschoolStatus {
  return value === "suitable" || value === "with_adult" || value === "not_recommended"
    ? value
    : "unknown";
}

export function routeTimeCategory(durationMaxMinutes: number): RouteTimeCategory {
  if (durationMaxMinutes <= 60) return "under_1h";
  if (durationMaxMinutes <= 120) return "under_2h";
  return "over_2h";
}

export function routeSuitabilityBadges(input: {
  strollerStatus: RouteStrollerStatus;
  preschoolStatus: RoutePreschoolStatus;
  durationMaxMinutes: number;
}): RouteSuitabilityBadge[] {
  const stroller: RouteSuitabilityBadge = input.strollerStatus === "verified"
    ? { key: "stroller", icon: "🛞", label: "Kočárek: ano", tone: "positive" }
    : input.strollerStatus === "not_recommended"
      ? { key: "stroller", icon: "×", label: "Bez kočárku", tone: "negative" }
      : { key: "stroller", icon: "?", label: "Kočárek: ověřujeme", tone: "caution" };

  const preschool: RouteSuitabilityBadge = input.preschoolStatus === "suitable"
    ? { key: "preschool", icon: "●", label: "Předškoláci: ano", tone: "positive" }
    : input.preschoolStatus === "with_adult"
      ? { key: "preschool", icon: "+", label: "Předškoláci: s doprovodem", tone: "caution" }
      : input.preschoolStatus === "not_recommended"
        ? { key: "preschool", icon: "×", label: "Pro předškoláky ne", tone: "negative" }
        : { key: "preschool", icon: "?", label: "Předškoláci: ověřujeme", tone: "caution" };

  const timeCategory = routeTimeCategory(input.durationMaxMinutes);
  const time: RouteSuitabilityBadge = timeCategory === "under_1h"
    ? { key: "time", icon: "◷", label: "Do 1 h", tone: "positive" }
    : timeCategory === "under_2h"
      ? { key: "time", icon: "◷", label: "Do 2 h", tone: "positive" }
      : { key: "time", icon: "◷", label: "2 h+", tone: "caution" };

  return [stroller, preschool, time];
}

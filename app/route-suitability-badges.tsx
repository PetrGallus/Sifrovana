import {
  routeSuitabilityBadges,
  type RoutePreschoolStatus,
  type RouteStrollerStatus,
} from "../lib/route-suitability";

export function RouteSuitabilityBadges({
  strollerStatus,
  preschoolStatus,
  durationMaxMinutes,
  compact = false,
}: {
  strollerStatus: RouteStrollerStatus;
  preschoolStatus: RoutePreschoolStatus;
  durationMaxMinutes: number;
  compact?: boolean;
}) {
  return (
    <div className={`route-suitability${compact ? " compact" : ""}`} aria-label="Vhodnost a čas trasy">
      {routeSuitabilityBadges({ strollerStatus, preschoolStatus, durationMaxMinutes }).map((badge) => (
        <span key={badge.key} className={badge.tone}>
          <i aria-hidden="true">{badge.icon}</i>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

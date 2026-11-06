type RouteIdentity = {
  id: string;
  status: "active" | "coming" | "seasonal";
  availableFrom?: string;
  availableTo?: string;
};

function pragueIsoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Only a route that has a published, server-verified game may enter game mode.
 * The release manifest currently contains one route; extending it is an
 * explicit release step when another route is published and checkout-tested.
 */
export function canStartPublishedGame(route: RouteIdentity | null | undefined, releasedRouteIds: readonly string[], today = pragueIsoDate()): boolean {
  return canPurchasePublishedRoute(route, releasedRouteIds, today);
}

/**
 * `active` is an editorial catalogue state, not proof that checkout and the
 * immutable game version are ready. Keep the commercial release gate explicit
 * until publishing exposes a server-backed `released_at`/version identifier.
 */
export function canPurchasePublishedRoute(route: RouteIdentity | null | undefined, releasedRouteIds: readonly string[], today = pragueIsoDate()): boolean {
  if (!route || !releasedRouteIds.includes(route.id)) return false;
  if (route.status === "active") return true;
  const availableFrom = route.availableFrom;
  const availableTo = route.availableTo;
  if (route.status !== "seasonal" || !availableFrom || !availableTo) return false;
  return availableFrom <= today && availableTo >= today;
}

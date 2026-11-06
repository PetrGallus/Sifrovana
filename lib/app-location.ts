export const appViews = [
  "discover",
  "detail",
  "library",
  "game",
  "finish",
  "activity",
  "profile",
  "admin",
  "partners",
  "contact",
] as const;

export type AppView = (typeof appViews)[number];

const viewSet = new Set<string>(appViews);

export function parseAppLocation(search: string, routeIds: readonly string[], fallbackRouteId: string): { view: AppView; routeId: string } {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const view = requestedView && viewSet.has(requestedView) ? requestedView as AppView : "discover";
  const requestedRouteId = params.get("route");
  const routeId = requestedRouteId && routeIds.includes(requestedRouteId) ? requestedRouteId : fallbackRouteId;
  return { view, routeId };
}

export function buildAppSearch(view: AppView, routeId: string, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  params.delete("auth");
  if (view === "discover") params.delete("view");
  else params.set("view", view);
  if (view === "detail" || view === "game" || view === "finish") params.set("route", routeId);
  else params.delete("route");
  const search = params.toString();
  return search ? `?${search}` : "";
}

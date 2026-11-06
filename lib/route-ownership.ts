export type RouteOwnershipStatus = "loading" | "verified" | "unavailable";

export type RouteOwnershipState = {
  userId: string | null;
  status: RouteOwnershipStatus;
  routeIds: string[];
};

export type CurrentRouteOwnership = {
  status: RouteOwnershipStatus;
  routeIds: string[];
  checkRequired: boolean;
};

export function resolveCurrentRouteOwnership(
  state: RouteOwnershipState,
  currentUserId: string | null,
  isSuperadmin: boolean,
): CurrentRouteOwnership {
  if (isSuperadmin) return { status: "verified", routeIds: [], checkRequired: false };
  if (!currentUserId) return { status: "unavailable", routeIds: [], checkRequired: false };
  if (state.userId !== currentUserId) return { status: "loading", routeIds: [], checkRequired: true };
  if (state.status !== "verified") return { status: state.status, routeIds: [], checkRequired: true };
  return { status: "verified", routeIds: state.routeIds, checkRequired: true };
}

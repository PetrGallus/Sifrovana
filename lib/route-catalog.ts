import {
  normalizePreschoolStatus,
  normalizeStrollerStatus,
  type RoutePreschoolStatus,
  type RouteStrollerStatus,
} from "./route-suitability";

export type PublicRouteStatus = "active" | "coming" | "seasonal";
export type CommerceCatalogStatus = "loading" | "verified" | "unavailable";

export type PublicRouteSummary = {
  id: string;
  district: string;
  /** Stable municipality used by the map even when marketing copy changes. */
  mapDistrict?: string;
  title: string;
  tagline: string;
  price: number;
  distance: number;
  duration: string;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  strollerStatus: RouteStrollerStatus;
  preschoolStatus: RoutePreschoolStatus;
  difficulty: string;
  checkpoints: number;
  status: PublicRouteStatus;
  accent: string;
  available?: string;
  availableFrom?: string;
  availableTo?: string;
  mapX: number;
  mapY: number;
};

export const PUBLIC_ROUTE_CATALOG_SELECT = "id,district,title,tagline,price_czk,distance_km,duration_minutes,duration_min_minutes,duration_max_minutes,stroller_status,preschool_status,difficulty,checkpoint_count,status,accent,map_x,map_y,available_text,available_from,available_to";

const routeStatuses = new Set<PublicRouteStatus>(["active", "coming", "seasonal"]);
const routeAccents = new Set(["orange", "teal", "blue", "red"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A static catalogue is useful as a readable offline preview, but it must not
 * authorize checkout. Before commerce is enabled, every released route must
 * be present in the live catalogue with an explicit server-owned price and a
 * valid editorial state.
 */
export function isCommerceCatalogVerified(rows: unknown, releasedRouteIds: readonly string[]): boolean {
  if (!Array.isArray(rows) || releasedRouteIds.length === 0) return false;

  const rowsById = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || !row.id.trim()) continue;
    rowsById.set(row.id, row);
  }

  return releasedRouteIds.every((routeId) => {
    const row = rowsById.get(routeId);
    if (!row || typeof row.price_czk !== "number" || !Number.isInteger(row.price_czk)) return false;
    if (row.price_czk <= 0 || row.price_czk > 100_000) return false;
    return typeof row.status === "string" && routeStatuses.has(row.status as PublicRouteStatus);
  });
}

function nonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number, options: { min?: number; max?: number; integer?: boolean } = {}) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return fallback;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  if (options.integer && !Number.isInteger(parsed)) return fallback;
  if (options.min !== undefined && parsed < options.min) return fallback;
  if (options.max !== undefined && parsed > options.max) return fallback;
  return parsed;
}

function routeStatus(value: unknown, fallback: PublicRouteStatus) {
  return typeof value === "string" && routeStatuses.has(value as PublicRouteStatus)
    ? value as PublicRouteStatus
    : fallback;
}

function routeAccent(value: unknown, fallback: string) {
  return typeof value === "string" && routeAccents.has(value) ? value : fallback;
}

function optionalIsoDate(value: unknown, fallback?: string) {
  if (value === null || value === "") return undefined;
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? fallback : value;
}

function strollerStatus(value: unknown, fallback: RouteStrollerStatus) {
  const normalized = normalizeStrollerStatus(value);
  return normalized !== "unknown" || value === "unknown" ? normalized : fallback;
}

function preschoolStatus(value: unknown, fallback: RoutePreschoolStatus) {
  const normalized = normalizePreschoolStatus(value);
  return normalized !== "unknown" || value === "unknown" ? normalized : fallback;
}

function mergeRoute<T extends PublicRouteSummary>(fallback: T, row: Record<string, unknown>): T {
  const legacyDuration = finiteNumber(row.duration_minutes, Number.NaN, { min: 1, max: 1440, integer: true });
  const durationFallback = Number.isFinite(legacyDuration) ? legacyDuration : fallback.durationMinMinutes;
  let durationMinMinutes = finiteNumber(row.duration_min_minutes, durationFallback, { min: 1, max: 1440, integer: true });
  let durationMaxMinutes = finiteNumber(
    row.duration_max_minutes,
    Number.isFinite(legacyDuration) ? legacyDuration : fallback.durationMaxMinutes,
    { min: 1, max: 1440, integer: true },
  );

  if (durationMinMinutes > durationMaxMinutes) {
    durationMinMinutes = fallback.durationMinMinutes;
    durationMaxMinutes = fallback.durationMaxMinutes;
  }
  const durationChanged = durationMinMinutes !== fallback.durationMinMinutes || durationMaxMinutes !== fallback.durationMaxMinutes;

  return {
    ...fallback,
    district: nonEmptyString(row.district, fallback.district),
    mapDistrict: fallback.mapDistrict ?? fallback.district,
    title: nonEmptyString(row.title, fallback.title),
    tagline: nonEmptyString(row.tagline, fallback.tagline),
    price: finiteNumber(row.price_czk, fallback.price, { min: 0, max: 100_000, integer: true }),
    distance: finiteNumber(row.distance_km, fallback.distance, { min: 0.1, max: 200 }),
    duration: durationChanged
      ? `${durationMinMinutes === durationMaxMinutes ? durationMinMinutes : `${durationMinMinutes}–${durationMaxMinutes}`} min`
      : fallback.duration,
    durationMinMinutes,
    durationMaxMinutes,
    strollerStatus: strollerStatus(row.stroller_status, fallback.strollerStatus),
    preschoolStatus: preschoolStatus(row.preschool_status, fallback.preschoolStatus),
    difficulty: nonEmptyString(row.difficulty, fallback.difficulty),
    checkpoints: finiteNumber(row.checkpoint_count, fallback.checkpoints, { min: 1, max: 100, integer: true }),
    status: routeStatus(row.status, fallback.status),
    accent: routeAccent(row.accent, fallback.accent),
    mapX: finiteNumber(row.map_x, fallback.mapX, { min: 0, max: 100 }),
    mapY: finiteNumber(row.map_y, fallback.mapY, { min: 0, max: 100 }),
    available: row.available_text === undefined
      ? fallback.available
      : nonEmptyString(row.available_text, fallback.available ?? "") || undefined,
    availableFrom: optionalIsoDate(row.available_from, fallback.availableFrom),
    availableTo: optionalIsoDate(row.available_to, fallback.availableTo),
  } as T;
}

/**
 * Merges untrusted catalogue rows into the versioned static catalogue.
 * Unknown routes are ignored and every invalid field falls back independently,
 * so one incomplete CMS record cannot corrupt the whole public marketplace.
 */
export function mergePublicCatalogRoutes<T extends PublicRouteSummary>(fallbackRoutes: readonly T[], rows: unknown): T[] {
  if (!Array.isArray(rows)) return [...fallbackRoutes];

  const rowsById = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || !row.id.trim()) continue;
    rowsById.set(row.id, row);
  }

  return fallbackRoutes.map((fallback) => {
    const row = rowsById.get(fallback.id);
    return row ? mergeRoute(fallback, row) : fallback;
  });
}

import type { RoutePreschoolStatus, RouteStrollerStatus } from "./route-suitability";
import { northernAndSeasonalRoutes } from "./route-portfolio";

export type RouteAvailability = "active" | "coming" | "seasonal";
export type RouteLifecycle = "draft" | "testing" | "active" | "maintenance" | "retired";
export type PuzzleType = "online" | "physical" | "hybrid";
export type RouteAudience = "adults" | "couples" | "friends" | "families";

export type SourceRef = {
  title: string;
  url: string;
};

export type City = {
  id: string;
  name: string;
  active: boolean;
  routes: number;
};

export type RouteProduct = {
  id: string;
  cityId: string;
  district: string;
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
  status: RouteAvailability;
  lifecycle: RouteLifecycle;
  version: string;
  teamSize: { min: number; max: number };
  audience: RouteAudience[];
  language: "cs";
  seasonality: "year-round" | "seasonal";
  accessibilityNote: string;
  safetyNote: string;
  lastFieldCheck: string | null;
  sourceRefs: SourceRef[];
  accent: string;
  available?: string;
  availableFrom?: string;
  availableTo?: string;
  mapX: number;
  mapY: number;
};

export type RouteBundle = {
  id: string;
  title: string;
  routeIds: string[];
  price: number;
};

export const pilotRouteId = "brno-kralovo-pole-stopy";
/** Versioned release manifest; add an ID only with a published game and tested checkout. */
export const commerciallyReleasedRouteIds = [pilotRouteId] as const;
/** Bundle checkout is not implemented yet; keep every bundle disabled until its own flow is released. */
export const commerciallyReleasedBundleIds: readonly string[] = [];
const defaultTeamSize = { min: 1, max: 5 } as const;

export const routes: RouteProduct[] = [
  {
    id: pilotRouteId,
    cityId: "brno",
    district: "Královo Pole",
    title: "Stopy proměny",
    tagline: "Od koňky po tovární komíny. Poskládej ztracenou kroniku čtvrti.",
    price: 449,
    distance: 4.1,
    duration: "90–120 min",
    durationMinMinutes: 90,
    durationMaxMinutes: 120,
    strollerStatus: "unknown",
    preschoolStatus: "unknown",
    difficulty: "Střední",
    checkpoints: 5,
    status: "active",
    lifecycle: "testing",
    version: "1.0.0",
    teamSize: defaultTeamSize,
    audience: ["adults", "couples", "friends"],
    language: "cs",
    seasonality: "year-round",
    accessibilityNote: "Městská pěší trasa; bezbariérovost musí potvrdit terénní kontrola.",
    safetyNote: "Před ostrým prodejem ověřit přechody, stav chodníků a přístup ke všem stopám.",
    lastFieldCheck: null,
    sourceRefs: [
      { title: "MČ Brno-Královo Pole: Historie", url: "https://kralovopole.brno.cz/historie" },
      { title: "Encyklopedie dějin Brna", url: "https://encyklopedie.brna.cz/home-mmb/?acc=profil-domu&load=424" },
    ],
    accent: "orange",
    mapX: 47,
    mapY: 18,
  },
  {
    id: "brno-stred-pod-povrchem",
    cityId: "brno",
    district: "Brno-střed",
    title: "Pod povrchem",
    tagline: "Legendy, průchody a příběhy, které centrum schovává pod dlažbou.",
    price: 449,
    distance: 3.6,
    duration: "80–100 min",
    durationMinMinutes: 80,
    durationMaxMinutes: 100,
    strollerStatus: "unknown",
    preschoolStatus: "unknown",
    difficulty: "Lehká",
    checkpoints: 0,
    status: "coming",
    lifecycle: "draft",
    version: "0.1.0",
    teamSize: defaultTeamSize,
    audience: ["adults", "couples", "friends"],
    language: "cs",
    seasonality: "year-round",
    accessibilityNote: "Bude doplněno po terénním průzkumu.",
    safetyNote: "Bude doplněno po terénním průzkumu.",
    lastFieldCheck: null,
    sourceRefs: [],
    accent: "teal",
    available: "v přípravě",
    mapX: 51,
    mapY: 50,
  },
  {
    id: "brno-zabovresky-vily",
    cityId: "brno",
    district: "Žabovřesky",
    title: "Vily vyprávějí",
    tagline: "Architektura, zahrady a osudy lidí za zdmi známé čtvrti.",
    price: 449,
    distance: 4.8,
    duration: "100–130 min",
    durationMinMinutes: 100,
    durationMaxMinutes: 130,
    strollerStatus: "unknown",
    preschoolStatus: "unknown",
    difficulty: "Střední",
    checkpoints: 0,
    status: "coming",
    lifecycle: "draft",
    version: "0.1.0",
    teamSize: defaultTeamSize,
    audience: ["adults", "couples", "friends"],
    language: "cs",
    seasonality: "year-round",
    accessibilityNote: "Bude doplněno po terénním průzkumu.",
    safetyNote: "Bude doplněno po terénním průzkumu.",
    lastFieldCheck: null,
    sourceRefs: [],
    accent: "blue",
    available: "v přípravě",
    mapX: 35,
    mapY: 39,
  },
  ...northernAndSeasonalRoutes,
];

export const cities: City[] = [
  { id: "brno", name: "Brno", active: true, routes: routes.filter((route) => route.cityId === "brno").length },
  { id: "praha", name: "Praha", active: false, routes: routes.filter((route) => route.cityId === "praha").length },
  { id: "ostrava", name: "Ostrava", active: false, routes: routes.filter((route) => route.cityId === "ostrava").length },
  { id: "olomouc", name: "Olomouc", active: false, routes: routes.filter((route) => route.cityId === "olomouc").length },
];

export const bundle: RouteBundle = {
  id: "brno-trio",
  title: "Brněnská trilogie",
  routeIds: [pilotRouteId, "brno-stred-pod-povrchem", "brno-zabovresky-vily"],
  price: 999,
};

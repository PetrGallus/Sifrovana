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
  mapX: number;
  mapY: number;
};

export type RouteBundle = {
  id: string;
  title: string;
  routeIds: string[];
  price: number;
};

export type Puzzle = {
  prompt: string;
  answers: string[];
  hints: [string, string];
};

export type Checkpoint = {
  id: string;
  routeId: string;
  order: number;
  title: string;
  short: string;
  coordinates: { lat: number; lng: number };
  type: PuzzleType;
  distanceFromPrevious: string;
  story: string;
  puzzle: Puzzle;
  fallback: { prompt: string; answers: string[] };
  sourceRefs: SourceRef[];
  fact: string;
  nextClue: string;
  map: { x: number; y: number };
};

export const pilotRouteId = "brno-kralovo-pole-stopy";
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

const kralovoPoleSources = routes.find((route) => route.id === pilotRouteId)?.sourceRefs ?? [];

export const checkpoints: Checkpoint[] = [
  {
    id: "semilasso",
    routeId: pilotRouteId,
    order: 1,
    title: "Semilasso",
    short: "Kulturní dům",
    coordinates: { lat: 49.22688, lng: 16.59488 },
    type: "online",
    distanceFromPrevious: "Start",
    story: "První list kroniky se ztratil v rachotu kol. Právě tudy kdysi vedla cesta, která Královo Pole přiblížila Brnu.",
    puzzle: {
      prompt: "Seřaď dvojice 18–76, 19–00 a 20–26 podle dopravního vývoje. Který rok patří první slavnostní jízdě koňky do Králova Pole?",
      answers: ["1876", "1 8 7 6"],
      hints: ["Koňka přijela ještě před elektrickou tramvají.", "Spoj první dvojici století s druhou dvojicí roku: 18 + 76."],
    },
    fallback: { prompt: "Jak se říkalo tramvaji tažené koňmi?", answers: ["koňka", "konka", "koňská tramvaj", "konska tramvaj"] },
    sourceRefs: kralovoPoleSources,
    fact: "Slavnostní jízda druhé brněnské koněspřežné tramvaje do Králova Pole proběhla 4. června 1876.",
    nextClue: "Najdi místo, kde se zrcadlí dva nárožní domy a nad podloubím bdí práce i úspory.",
    map: { x: 14, y: 78 },
  },
  {
    id: "radnice",
    routeId: pilotRouteId,
    order: 2,
    title: "Královopolská radnice",
    short: "Palackého třída",
    coordinates: { lat: 49.22423, lng: 16.59651 },
    type: "physical",
    distanceFromPrevious: "0,5 km",
    story: "Nové město chtělo novou tvář. Architekt Jindřich Kumpošt ji ve dvacátých letech vepsal do dvou zrcadlových nároží.",
    puzzle: {
      prompt: "Na fasádě se ukrývá věta „Úsporami k vlastnímu …“. Doplň poslední slovo.",
      answers: ["domovu", "domov"],
      hints: ["Hledej reliéf na budově Palackého třída 59.", "Je to místo, kam se člověk vrací a kde bydlí."],
    },
    fallback: { prompt: "Ve kterém roce byla dokončena budova dnešní radnice?", answers: ["1925", "1 925"] },
    sourceRefs: kralovoPoleSources,
    fact: "Budova dnešní radnice byla dokončena roku 1925. Spolu s protějším domem vytvořila nové velkoměstské centrum čtvrti.",
    nextClue: "Pokračuj na náměstí, které tvoří zelený ovál. Hledej strom vysazený těsně před vznikem republiky.",
    map: { x: 32, y: 63 },
  },
  {
    id: "slovanske-namesti",
    routeId: pilotRouteId,
    order: 3,
    title: "Lípa svobody",
    short: "Slovanské náměstí",
    coordinates: { lat: 49.22948, lng: 16.59083 },
    type: "hybrid",
    distanceFromPrevious: "1,0 km",
    story: "Třetí list kroniky chrání strom, který byl zasazen v čase, kdy válka ještě neskončila, ale svoboda už byla cítit ve vzduchu.",
    puzzle: {
      prompt: "Rozlušti posun o tři písmena zpět: VYŘERGD. Piš bez diakritiky.",
      answers: ["svoboda"],
      hints: ["Jde o Caesarovu šifru. Každé písmeno posuň v abecedě o tři místa zpět.", "V → S, Y → V, Ř ber jako O. Výsledek začíná „SVO…“."],
    },
    fallback: { prompt: "Ve kterém roce byla Lípa svobody vysazena?", answers: ["1918", "1 918"] },
    sourceRefs: kralovoPoleSources,
    fact: "Husova lípa, později zvaná také Lípa svobody, byla na dnešním Slovanském náměstí slavnostně vysazena 6. října 1918.",
    nextClue: "Čtvrtý list čeká u místa ticha a studia. Z klášterních cel se dnes ozývají klávesnice.",
    map: { x: 52, y: 46 },
  },
  {
    id: "kartouza",
    routeId: pilotRouteId,
    order: 4,
    title: "Bývalá kartouza",
    short: "FIT VUT",
    coordinates: { lat: 49.22625, lng: 16.59819 },
    type: "online",
    distanceFromPrevious: "0,8 km",
    story: "Za zdmi kartuziánského kláštera se po staletí střídalo rozjímání, kasárna i technické vzdělávání. Kronika tu mluví v římských číslicích.",
    puzzle: {
      prompt: "Převeď M·CCC·LXX·V na rok založení královopolské kartouzy.",
      answers: ["1375", "1 375"],
      hints: ["M = 1000, CCC = 300, LXX = 70 a V = 5.", "Sečti 1000 + 300 + 70 + 5."],
    },
    fallback: { prompt: "Kdo založil královopolskou kartouzu?", answers: ["Jan Jindřich", "jan jindrich"] },
    sourceRefs: kralovoPoleSources,
    fact: "Kartuziánský klášter založil moravský markrabě Jan Jindřich roku 1375. Dnes areál využívá Fakulta informačních technologií VUT.",
    nextClue: "Poslední stopu zanechaly stroje. Vydej se tam, kde na konci 19. století začala růst průmyslová čtvrť.",
    map: { x: 70, y: 31 },
  },
  {
    id: "strojirna",
    routeId: pilotRouteId,
    order: 5,
    title: "Průmyslová stopa",
    short: "Královopolská strojírna",
    coordinates: { lat: 49.23782, lng: 16.60822 },
    type: "hybrid",
    distanceFromPrevious: "1,8 km",
    story: "Továrna přitáhla dělníky, úředníky i obchody. Z vesnického okolí se stalo sebevědomé město. Zbývá doplnit poslední rok.",
    puzzle: {
      prompt: "Vezmi rok povýšení na město 1905 a odečti 15 let. Výsledek je rok založení strojírny.",
      answers: ["1890", "1 890"],
      hints: ["Počítej 1905 − 10 − 5.", "1905 − 15 = 1890."],
    },
    fallback: { prompt: "Kolik let před povýšením Králova Pole na město vznikla strojírna?", answers: ["15", "patnáct", "patnact"] },
    sourceRefs: kralovoPoleSources,
    fact: "Královopolská strojírna byla založena roku 1890 a zásadně urychlila proměnu i růst celé čtvrti.",
    nextClue: "Kronika je kompletní. Seřadil/a jsi pět stop proměny Králova Pole.",
    map: { x: 88, y: 14 },
  },
];

export function getRouteCheckpoints(routeId: string) {
  return checkpoints
    .filter((checkpoint) => checkpoint.routeId === routeId)
    .sort((a, b) => a.order - b.order);
}

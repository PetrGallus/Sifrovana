"use client";

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";

type View = "discover" | "detail" | "library" | "game" | "finish" | "activity" | "profile";
type Modal = "login" | "checkout" | null;
type RouteStatus = "active" | "coming" | "seasonal";
type PuzzleType = "online" | "physical" | "hybrid";

type City = { id: string; name: string; active: boolean; routes: number };
type RouteProduct = {
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
  status: RouteStatus;
  accent: string;
  available?: string;
};
type RouteBundle = { id: string; title: string; routeIds: string[]; price: number };
type Puzzle = { prompt: string; answers: string[]; hints: [string, string] };
type Checkpoint = {
  id: string;
  order: number;
  title: string;
  short: string;
  coordinates: { lat: number; lng: number };
  type: PuzzleType;
  distanceFromPrevious: string;
  story: string;
  puzzle: Puzzle;
  fact: string;
  nextClue: string;
  map: { x: number; y: number };
};
type RouteProgress = { current: number; solved: string[]; hintsUsed: number; completed: boolean };
type Activity = { id: string; title: string; date: string; distance: string; time: string; xp: number };
type Badge = { id: string; name: string; detail: string; icon: string; earned: boolean };
type LeaderboardEntry = { rank: number; name: string; xp: number; avatar: string; you?: boolean };
type StoredState = {
  loggedIn: boolean;
  owned: boolean;
  progress: RouteProgress;
  activityAdded: boolean;
};

const cities: City[] = [
  { id: "brno", name: "Brno", active: true, routes: 4 },
  { id: "praha", name: "Praha", active: false, routes: 0 },
  { id: "ostrava", name: "Ostrava", active: false, routes: 0 },
  { id: "olomouc", name: "Olomouc", active: false, routes: 0 },
];

const routes: RouteProduct[] = [
  {
    id: "brno-kralovo-pole-stopy",
    cityId: "brno",
    district: "Královo Pole",
    title: "Stopy proměny",
    tagline: "Od koňky po tovární komíny. Poskládej ztracenou kroniku čtvrti.",
    price: 249,
    distance: 4.1,
    duration: "90–120 min",
    difficulty: "Střední",
    checkpoints: 5,
    status: "active",
    accent: "orange",
  },
  {
    id: "brno-stred-pod-povrchem",
    cityId: "brno",
    district: "Brno-střed",
    title: "Pod povrchem",
    tagline: "Legendy, průchody a příběhy, které centrum schovává pod dlažbou.",
    price: 249,
    distance: 3.6,
    duration: "80–100 min",
    difficulty: "Lehká",
    checkpoints: 6,
    status: "coming",
    accent: "teal",
    available: "říjen 2026",
  },
  {
    id: "brno-zabovresky-vily",
    cityId: "brno",
    district: "Žabovřesky",
    title: "Vily vyprávějí",
    tagline: "Architektura, zahrady a osudy lidí za zdmi známé čtvrti.",
    price: 229,
    distance: 4.8,
    duration: "100–130 min",
    difficulty: "Střední",
    checkpoints: 5,
    status: "coming",
    accent: "blue",
    available: "listopad 2026",
  },
  {
    id: "brno-adventni-sifra",
    cityId: "brno",
    district: "Brno-střed",
    title: "Adventní šifra",
    tagline: "Světla, vůně a zapomenuté vánoční zvyky v srdci Brna.",
    price: 199,
    distance: 2.9,
    duration: "60–80 min",
    difficulty: "Lehká",
    checkpoints: 5,
    status: "seasonal",
    accent: "red",
    available: "28. 11. – 23. 12.",
  },
];

const bundle: RouteBundle = {
  id: "brno-trio",
  title: "Brněnská trilogie",
  routeIds: routes.slice(0, 3).map((route) => route.id),
  price: 599,
};

const checkpoints: Checkpoint[] = [
  {
    id: "semilasso",
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
    fact: "Slavnostní jízda druhé brněnské koněspřežné tramvaje do Králova Pole proběhla 4. června 1876.",
    nextClue: "Najdi místo, kde se zrcadlí dva nárožní domy a nad podloubím bdí práce i úspory.",
    map: { x: 14, y: 78 },
  },
  {
    id: "radnice",
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
    fact: "Budova dnešní radnice byla dokončena roku 1925. Spolu s protějším domem vytvořila nové velkoměstské centrum čtvrti.",
    nextClue: "Pokračuj na náměstí, které tvoří zelený ovál. Hledej strom vysazený těsně před vznikem republiky.",
    map: { x: 32, y: 63 },
  },
  {
    id: "slovanske-namesti",
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
    fact: "Husova lípa, později zvaná také Lípa svobody, byla na dnešním Slovanském náměstí slavnostně vysazena 6. října 1918.",
    nextClue: "Čtvrtý list čeká u místa ticha a studia. Z klášterních cel se dnes ozývají klávesnice.",
    map: { x: 52, y: 46 },
  },
  {
    id: "kartouza",
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
    fact: "Kartuziánský klášter založil moravský markrabě Jan Jindřich roku 1375. Dnes areál využívá Fakulta informačních technologií VUT.",
    nextClue: "Poslední stopu zanechaly stroje. Vydej se tam, kde na konci 19. století začala růst průmyslová čtvrť.",
    map: { x: 70, y: 31 },
  },
  {
    id: "strojirna",
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
    fact: "Královopolská strojírna byla založena roku 1890 a zásadně urychlila proměnu i růst celé čtvrti.",
    nextClue: "Kronika je kompletní. Seřadil/a jsi pět stop proměny Králova Pole.",
    map: { x: 88, y: 14 },
  },
];

const baseActivities: Activity[] = [
  { id: "a1", title: "Veveří: Za oponou", date: "2. srpna", distance: "5,2 km", time: "1:42", xp: 420 },
  { id: "a2", title: "Lužánky: Zelené stopy", date: "24. července", distance: "3,8 km", time: "1:08", xp: 310 },
  { id: "a3", title: "Brněnské vyhlídky", date: "11. července", distance: "7,1 km", time: "2:14", xp: 580 },
];

const badges: Badge[] = [
  { id: "king", name: "Král KrPole", detail: "Dokonči trasu Stopy proměny", icon: "♛", earned: false },
  { id: "first", name: "První stopa", detail: "Dokončena první městská hra", icon: "◇", earned: true },
  { id: "walker", name: "Městský chodec", detail: "Ujdi ve hrách 25 kilometrů", icon: "↗", earned: true },
  { id: "cipher", name: "Šifrant", detail: "Vyřeš 20 šifer bez druhé nápovědy", icon: "#", earned: true },
  { id: "early", name: "Ranní ptáče", detail: "Vyraz na trasu před osmou", icon: "☼", earned: false },
  { id: "season", name: "Lovec sezón", detail: "Dokonči časově omezenou trasu", icon: "✦", earned: false },
];

const leaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "Matěj K.", xp: 2840, avatar: "MK" },
  { rank: 2, name: "Tereza P.", xp: 2610, avatar: "TP" },
  { rank: 3, name: "David N.", xp: 2380, avatar: "DN" },
  { rank: 18, name: "Klára Novotná", xp: 1340, avatar: "KN", you: true },
];

const initialState: StoredState = {
  loggedIn: false,
  owned: false,
  progress: { current: 0, solved: [], hintsUsed: 0, completed: false },
  activityAdded: false,
};

const storageKey = "sifrovana-demo-v1";

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase("cs").normalize("NFD").replace(/[\u0300-\u036f\s]/g, "");
}

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [modal, setModal] = useState<Modal>(null);
  const [state, setState] = useState<StoredState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerStatus, setAnswerStatus] = useState<"idle" | "wrong" | "correct">("idle");
  const [shownHints, setShownHints] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [proofMode, setProofMode] = useState<"photo" | "signature" | "skip">("photo");
  const [checkoutItem, setCheckoutItem] = useState<"route" | "bundle">("route");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setState(JSON.parse(saved) as StoredState);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    setArrived(false);
    setAnswer("");
    setAnswerStatus("idle");
    setShownHints(0);
  }, [state.progress.current]);

  const activeCheckpoint = checkpoints[Math.min(state.progress.current, checkpoints.length - 1)];
  const completed = state.progress.completed;
  const earnedBadges = badges.map((badge) => (badge.id === "king" && completed ? { ...badge, earned: true } : badge));
  const activities = state.activityAdded
    ? [{ id: "pilot", title: "Královo Pole: Stopy proměny", date: "Dnes", distance: "4,1 km", time: "1:34", xp: 520 }, ...baseActivities]
    : baseActivities;

  function navigate(next: View) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPurchase(item: "route" | "bundle" = "route") {
    setCheckoutItem(item);
    if (!state.loggedIn) setModal("login");
    else setModal("checkout");
  }

  function login() {
    setState((current) => ({ ...current, loggedIn: true }));
    setModal("checkout");
  }

  function buy() {
    setState((current) => ({ ...current, loggedIn: true, owned: true }));
    setModal(null);
    navigate("library");
  }

  function startGame() {
    if (!state.owned) {
      openPurchase("route");
      return;
    }
    if (state.progress.completed) {
      setState((current) => ({ ...current, progress: initialState.progress, activityAdded: current.activityAdded }));
    }
    navigate("game");
  }

  function revealHint() {
    if (shownHints >= 2) return;
    setShownHints((count) => count + 1);
    setState((current) => ({
      ...current,
      progress: { ...current.progress, hintsUsed: current.progress.hintsUsed + 1 },
    }));
  }

  function checkAnswer() {
    const normalized = normalizeAnswer(answer);
    const valid = activeCheckpoint.puzzle.answers.some((item) => normalizeAnswer(item) === normalized);
    setAnswerStatus(valid ? "correct" : "wrong");
  }

  function nextCheckpoint() {
    const solved = Array.from(new Set([...state.progress.solved, activeCheckpoint.id]));
    if (activeCheckpoint.order === checkpoints.length) {
      setState((current) => ({
        ...current,
        progress: { ...current.progress, solved, completed: true },
      }));
      navigate("finish");
      return;
    }
    setState((current) => ({
      ...current,
      progress: { ...current.progress, current: current.progress.current + 1, solved },
    }));
  }

  function finishRoute() {
    setState((current) => ({ ...current, activityAdded: true }));
    navigate("profile");
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
  }

  function pointerPosition(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }

  function beginDraw(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = pointerPosition(event);
    if (!canvas || !point) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const point = pointerPosition(event);
    if (!canvas || !point) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#0e3b3a";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function resetDemo() {
    window.localStorage.removeItem(storageKey);
    setState(initialState);
    setPhoto(null);
    navigate("discover");
  }

  if (!hydrated) return <div className="loading-shell"><span className="loader-mark">Š</span><p>Rozkládáme mapu…</p></div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate("discover")} aria-label="Šifrovaná – domů">
          <span className="brand-mark">Š</span>
          <span className="brand-name">Šifrovaná<span className="brand-dot">.</span></span>
        </button>
        <nav className="desktop-nav" aria-label="Hlavní navigace">
          <NavButton active={view === "discover" || view === "detail"} onClick={() => navigate("discover")}>Objevuj</NavButton>
          <NavButton active={view === "library" || view === "game" || view === "finish"} onClick={() => navigate("library")}>Moje hry</NavButton>
          <NavButton active={view === "activity"} onClick={() => navigate("activity")}>Aktivita</NavButton>
          <NavButton active={view === "profile"} onClick={() => navigate("profile")}>Profil</NavButton>
        </nav>
        <button className="account-chip" onClick={() => state.loggedIn ? navigate("profile") : setModal("login")}>
          <span>{state.loggedIn ? "KN" : "?"}</span>
          <b>{state.loggedIn ? "Klára" : "Přihlásit"}</b>
        </button>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Otevřít menu" aria-expanded={menuOpen}>☰</button>
      </header>

      {menuOpen && (
        <div className="mobile-menu">
          <button onClick={() => navigate("discover")}>Objevuj trasy</button>
          <button onClick={() => navigate("library")}>Moje hry</button>
          <button onClick={() => navigate("activity")}>Aktivita</button>
          <button onClick={() => navigate("profile")}>Profil</button>
        </div>
      )}

      <main>
        {view === "discover" && <Discover onDetail={() => navigate("detail")} onBuy={openPurchase} />}
        {view === "detail" && <RouteDetail owned={state.owned} onBack={() => navigate("discover")} onBuy={() => openPurchase("route")} onStart={startGame} />}
        {view === "library" && <Library owned={state.owned} progress={state.progress} onDiscover={() => navigate("discover")} onStart={startGame} onDetail={() => navigate("detail")} />}
        {view === "game" && (
          <Game
            checkpoint={activeCheckpoint}
            progress={state.progress}
            arrived={arrived}
            setArrived={setArrived}
            answer={answer}
            setAnswer={setAnswer}
            answerStatus={answerStatus}
            setAnswerStatus={setAnswerStatus}
            shownHints={shownHints}
            onHint={revealHint}
            onCheck={checkAnswer}
            onNext={nextCheckpoint}
            onExit={() => navigate("library")}
          />
        )}
        {view === "finish" && (
          <Finish
            hintsUsed={state.progress.hintsUsed}
            proofMode={proofMode}
            setProofMode={setProofMode}
            photo={photo}
            onPhoto={handlePhoto}
            canvasRef={canvasRef}
            onPointerDown={beginDraw}
            onPointerMove={draw}
            onPointerUp={() => { drawing.current = false; }}
            onClear={clearSignature}
            onFinish={finishRoute}
          />
        )}
        {view === "activity" && <ActivityView activities={activities} />}
        {view === "profile" && <Profile completed={completed} activities={activities} badges={earnedBadges} onReset={resetDemo} />}
      </main>

      <nav className="bottom-nav" aria-label="Mobilní navigace">
        <BottomButton icon="⌖" label="Objevuj" active={view === "discover" || view === "detail"} onClick={() => navigate("discover")} />
        <BottomButton icon="◇" label="Moje hry" active={view === "library" || view === "game" || view === "finish"} onClick={() => navigate("library")} />
        <BottomButton icon="↗" label="Aktivita" active={view === "activity"} onClick={() => navigate("activity")} />
        <BottomButton icon="◉" label="Profil" active={view === "profile"} onClick={() => navigate("profile")} />
      </nav>

      {modal && <ModalLayer modal={modal} item={checkoutItem} onClose={() => setModal(null)} onLogin={login} onBuy={buy} />}
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? "nav-active" : ""} onClick={onClick}>{children}</button>;
}

function BottomButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span><b>{label}</b></button>;
}

function Discover({ onDetail, onBuy }: { onDetail: () => void; onBuy: (item: "route" | "bundle") => void }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow light"><span /> Brno je plné stop</div>
          <h1>Město není kulisa.<br /><em>Je to šifra.</em></h1>
          <p>Vyraz pěšky, rozlušti příběhy ukryté v ulicích a objev Brno tak, jak ho neznají ani místní.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={onDetail}>Vybrat první trasu <span>→</span></button>
            <button className="text-button" onClick={() => document.getElementById("jak-to-funguje")?.scrollIntoView({ behavior: "smooth" })}>Jak to funguje <span>↓</span></button>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack"><span>MK</span><span>TP</span><span>DN</span></div>
            <div><b>1 284 průzkumníků</b><small>už vyrazilo do ulic</small></div>
          </div>
        </div>
        <div className="hero-map" aria-label="Stylizovaná mapa Králova Pole">
          <div className="contour contour-a" /><div className="contour contour-b" /><div className="contour contour-c" />
          <div className="street street-a" /><div className="street street-b" /><div className="street street-c" /><div className="street street-d" />
          <span className="map-label label-one">PALACKÉHO TŘÍDA</span><span className="map-label label-two">KRÁLOVO POLE</span>
          <div className="route-line route-line-a" /><div className="route-line route-line-b" /><div className="route-line route-line-c" />
          <span className="map-pin pin-one">1</span><span className="map-pin pin-two">2</span><span className="map-pin pin-three">?</span>
          <div className="route-ticket">
            <span className="ticket-kicker">TRASA 01 · BRNO</span>
            <b>Stopy<br />proměny</b>
            <div><span>4,1 km</span><span>5 stop</span></div>
          </div>
          <div className="compass"><b>N</b><span>✦</span></div>
        </div>
      </section>

      <section className="city-bar section-wrap">
        <div><span className="section-label">Vyber město</span><h2>Kde budeš pátrat?</h2></div>
        <div className="city-pills">
          {cities.map((city) => <button key={city.id} className={city.active ? "active" : ""} disabled={!city.active}><span>{city.name}</span><small>{city.active ? `${city.routes} trasy` : "brzy"}</small></button>)}
        </div>
      </section>

      <section className="routes-section section-wrap">
        <div className="section-heading">
          <div><span className="section-label">Brno · aktuálně</span><h2>Vyber si svou výpravu</h2></div>
          <span className="route-count">04 / trasy</span>
        </div>
        <div className="route-grid">
          {routes.map((route, index) => <RouteCard key={route.id} route={route} index={index + 1} onDetail={onDetail} />)}
        </div>
      </section>

      <section className="bundle section-wrap">
        <div className="bundle-stamp"><span>3×</span><small>VÍCE STOP<br />MÉNĚ KORUN</small></div>
        <div className="bundle-copy"><span className="section-label light">Výhodný balíček</span><h2>{bundle.title}</h2><p>Tři městské části, tři různé příběhy a jedno celé Brno k prozkoumání.</p></div>
        <div className="bundle-routes"><span>Královo Pole</span><span>Brno-střed</span><span>Žabovřesky</span></div>
        <div className="bundle-buy"><small>Ušetříš 128 Kč</small><strong>{bundle.price} Kč</strong><button className="button cream" onClick={() => onBuy("bundle")}>Chci celý balíček →</button></div>
      </section>

      <section className="how section-wrap" id="jak-to-funguje">
        <div className="section-heading"><div><span className="section-label">Jednoduchý princip</span><h2>Jak se hraje Šifrovaná?</h2></div></div>
        <div className="steps">
          <article><span className="step-no">01</span><div className="step-icon">⌖</div><h3>Vyber trasu</h3><p>Podle města, délky, času a obtížnosti. Každá čtvrť ukrývá jiný příběh.</p></article>
          <article><span className="step-no">02</span><div className="step-icon">↗</div><h3>Vyraz do ulic</h3><p>Mapa tě dovede k první stopě. Další místo se odhalí až po rozluštění.</p></article>
          <article><span className="step-no">03</span><div className="step-icon">#</div><h3>Lušti a objevuj</h3><p>Hledej detaily, lámej šifry a odemykej skutečné příběhy míst kolem tebe.</p></article>
          <article><span className="step-no">04</span><div className="step-icon">♛</div><h3>Sbírej odznaky</h3><p>Zapisuj kilometry, buduj sérii a staň se nejlepším městským stopařem.</p></article>
        </div>
      </section>
    </>
  );
}

function RouteCard({ route, index, onDetail }: { route: RouteProduct; index: number; onDetail: () => void }) {
  const active = route.status === "active";
  return (
    <article className={`route-card ${route.accent} ${!active ? "muted" : ""}`}>
      <div className="route-visual">
        <span className="route-number">0{index}</span>
        {route.status === "seasonal" && <span className="season-tag">✦ ČASOVĚ OMEZENO</span>}
        {route.status === "coming" && <span className="coming-tag">PŘIPRAVUJEME · {route.available}</span>}
        <div className="mini-streets"><i /><i /><i /><i /></div>
        <span className="mini-pin">{active ? "⌖" : "?"}</span>
      </div>
      <div className="route-card-body">
        <span className="district">BRNO · {route.district.toUpperCase()}</span>
        <h3>{route.title}</h3>
        <p>{route.tagline}</p>
        <div className="route-stats"><span><small>Vzdálenost</small><b>{route.distance} km</b></span><span><small>Čas</small><b>{route.duration}</b></span><span><small>Obtížnost</small><b>{route.difficulty}</b></span></div>
        <div className="route-card-footer"><strong>{active ? `${route.price} Kč` : route.status === "seasonal" ? route.available : "Již brzy"}</strong><button disabled={!active} onClick={onDetail} aria-label={`Detail trasy ${route.title}`}>{active ? "Prozkoumat →" : "Upozornit mě"}</button></div>
      </div>
    </article>
  );
}

function RouteDetail({ owned, onBack, onBuy, onStart }: { owned: boolean; onBack: () => void; onBuy: () => void; onStart: () => void }) {
  return (
    <section className="detail-page">
      <div className="detail-hero">
        <button className="back-button" onClick={onBack}>← Zpět na trasy</button>
        <div className="detail-hero-grid section-wrap">
          <div className="detail-copy">
            <span className="eyebrow light"><span /> BRNO · KRÁLOVO POLE</span>
            <h1>Stopy<br /><em>proměny</em></h1>
            <p>Poskládej pět ztracených listů kroniky a odhal, jak se z vesnice za hradbami stala sebevědomá městská čtvrť.</p>
            <div className="detail-tags"><span>4,1 km</span><span>90–120 min</span><span>5 checkpointů</span><span>Střední</span></div>
          </div>
          <div className="detail-map"><div className="map-path" />{checkpoints.map((cp) => <span key={cp.id} style={{ left: `${cp.map.x}%`, top: `${cp.map.y}%` }}>{cp.order}</span>)}<b>KRÁLOVO<br />POLE</b></div>
        </div>
      </div>
      <div className="detail-content section-wrap">
        <div className="story-column">
          <span className="section-label">Tvůj úkol</span><h2>Kronika má pět prázdných stran</h2>
          <p className="lead">Někdo z ní vytrhl klíčové okamžiky. Zůstaly jen šifry rozeseté od Semilassa až ke staré strojírně. Najdi je dřív, než stopy zmizí.</p>
          <div className="checkpoint-preview">{checkpoints.map((cp, index) => <div key={cp.id}><span>{index === 0 ? "⌖" : "?"}</span><div><b>{index === 0 ? cp.title : `Stopa ${index + 1} je skrytá`}</b><small>{index === 0 ? "Start výpravy" : "Odemkne se během hry"}</small></div></div>)}</div>
        </div>
        <aside className="purchase-card">
          <div className="purchase-top"><span>TRASA PRO 1–5 HRÁČŮ</span><strong>{owned ? "Zakoupeno" : "249 Kč"}</strong><small>Jednorázově · bez předplatného</small></div>
          <button className="button primary full" onClick={owned ? onStart : onBuy}>{owned ? "Vyrazit na trasu →" : "Koupit trasu →"}</button>
          <ul><li>✓ Hraješ vlastním tempem</li><li>✓ 2 úrovně nápovědy</li><li>✓ Přístup bez časového omezení</li><li>✓ Odznak Král KrPole</li></ul>
          <div className="gear"><b>Co s sebou?</b><p>Nabitý telefon, pohodlné boty, tužku a chuť dívat se kolem sebe.</p></div>
        </aside>
      </div>
    </section>
  );
}

function Library({ owned, progress, onDiscover, onStart, onDetail }: { owned: boolean; progress: RouteProgress; onDiscover: () => void; onStart: () => void; onDetail: () => void }) {
  const percent = progress.completed ? 100 : Math.round((progress.current / checkpoints.length) * 100);
  return (
    <section className="page section-wrap">
      <div className="page-heading"><span className="section-label">Tvoje sbírka</span><h1>Moje hry</h1><p>Zakoupené a rozehrané výpravy máš vždy po ruce.</p></div>
      {!owned ? (
        <div className="empty-state"><span>◇</span><h2>Batoh je zatím prázdný</h2><p>Vyber si první trasu a začni sbírat městské stopy.</p><button className="button primary" onClick={onDiscover}>Objevit trasy →</button></div>
      ) : (
        <div className="owned-card">
          <div className="owned-visual"><span>01</span><div className="owned-pin">⌖</div></div>
          <div className="owned-copy"><span className="district">BRNO · KRÁLOVO POLE</span><h2>Stopy proměny</h2><p>{progress.completed ? "Výprava dokončena. Kronika je kompletní." : progress.current > 0 ? `Čeká na tebe stopa ${progress.current + 1} z 5.` : "Vše je připraveno. První stopa čeká u Semilassa."}</p>
            <div className="progress-row"><div><i style={{ width: `${percent}%` }} /></div><span>{percent} %</span></div>
            <div className="owned-actions"><button className="button primary" onClick={onStart}>{progress.completed ? "Projít znovu" : progress.current > 0 ? "Pokračovat ve hře →" : "Zahájit výpravu →"}</button><button className="text-button dark" onClick={onDetail}>Detail trasy</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Game({ checkpoint, progress, arrived, setArrived, answer, setAnswer, answerStatus, setAnswerStatus, shownHints, onHint, onCheck, onNext, onExit }: {
  checkpoint: Checkpoint; progress: RouteProgress; arrived: boolean; setArrived: (value: boolean) => void; answer: string; setAnswer: (value: string) => void; answerStatus: "idle" | "wrong" | "correct"; setAnswerStatus: (value: "idle" | "wrong" | "correct") => void; shownHints: number; onHint: () => void; onCheck: () => void; onNext: () => void; onExit: () => void;
}) {
  return (
    <section className="game-page">
      <div className="game-topbar"><button onClick={onExit}>×</button><div><span>STOPY PROMĚNY</span><div><i style={{ width: `${((progress.current + (answerStatus === "correct" ? 1 : 0)) / checkpoints.length) * 100}%` }} /></div></div><b>{checkpoint.order}/5</b></div>
      <div className="game-layout">
        <div className="game-map-panel">
          <div className="live-map">
            <span className="map-north">N<br />✦</span><div className="live-road r1" /><div className="live-road r2" /><div className="live-road r3" /><div className="live-road r4" />
            <div className="live-path" />
            {checkpoints.map((cp, index) => {
              const status = index < checkpoint.order - 1 ? "done" : index === checkpoint.order - 1 ? "current" : "locked";
              return <span key={cp.id} className={`live-pin ${status}`} style={{ left: `${cp.map.x}%`, top: `${cp.map.y}%` }}>{status === "done" ? "✓" : status === "locked" ? "?" : cp.order}</span>;
            })}
            <div className="map-location"><i /> Tvoje poloha <small>demo</small></div>
          </div>
          <div className="map-meta"><span><small>K dalšímu bodu</small><b>{checkpoint.distanceFromPrevious}</b></span><span><small>Nasbírané XP</small><b>{(checkpoint.order - 1) * 100 + Math.max(0, 50 - progress.hintsUsed * 10)}</b></span><span><small>GPS</small><b className="ready">Připraveno</b></span></div>
        </div>
        <div className="puzzle-panel">
          <div className="checkpoint-title"><span className="checkpoint-badge">STOPA {String(checkpoint.order).padStart(2, "0")}</span><small>{checkpoint.type === "online" ? "ONLINE ŠIFRA" : checkpoint.type === "physical" ? "FYZICKÁ STOPA" : "HYBRIDNÍ STOPA"}</small><h1>{checkpoint.title}</h1><p>{checkpoint.short} · {checkpoint.coordinates.lat.toFixed(4)}, {checkpoint.coordinates.lng.toFixed(4)}</p></div>
          {!arrived ? (
            <div className="arrival-card"><div className="radar"><i /><span>⌖</span></div><h2>Jsi na místě?</h2><p>V ostré hře checkpoint ověří GPS. V pilotu můžeš pokračovat odkudkoli.</p><button className="button primary full" onClick={() => setArrived(true)}>Jsem na místě – demo →</button><small>Simulace polohy · žádná data se neodesílají</small></div>
          ) : (
            <>
              <div className="story-card"><span>LIST Z KRONIKY</span><p>{checkpoint.story}</p></div>
              <div className="cipher-card"><div className="cipher-title"><span>#</span><div><small>ŠIFRA {checkpoint.order}/5</small><h2>Rozlušti stopu</h2></div></div><p>{checkpoint.puzzle.prompt}</p>
                <label htmlFor="answer">Tvoje odpověď</label><div className={`answer-row ${answerStatus}`}><input id="answer" value={answer} onChange={(event) => { setAnswer(event.target.value); setAnswerStatus("idle"); }} onKeyDown={(event) => event.key === "Enter" && onCheck()} placeholder="Napiš řešení…" autoComplete="off" /><button onClick={onCheck} disabled={!answer.trim()}>Ověřit</button></div>
                {answerStatus === "wrong" && <div className="answer-note wrong">To zatím nesedí. Rozhlédni se znovu nebo použij nápovědu.</div>}
                {shownHints > 0 && <div className="hint"><b>Nápověda {shownHints}</b><p>{checkpoint.puzzle.hints[shownHints - 1]}</p></div>}
                {answerStatus !== "correct" && <button className="hint-button" onClick={onHint} disabled={shownHints >= 2}>◎ {shownHints >= 2 ? "Všechny nápovědy použity" : `Chci nápovědu ${shownHints + 1}`} <small>−{shownHints === 0 ? 10 : 20} XP</small></button>}
              </div>
              {answerStatus === "correct" && <div className="success-card"><span className="success-mark">✓</span><div><small>STOPA ROZLUŠTĚNA · +{Math.max(50, 100 - shownHints * 20)} XP</small><h2>{checkpoint.order === 5 ? "Kronika je kompletní!" : "Máš další list kroniky"}</h2><p>{checkpoint.fact}</p><div className="next-clue"><small>{checkpoint.order === 5 ? "ZÁVĚR" : "DALŠÍ STOPA"}</small><b>{checkpoint.nextClue}</b></div><button className="button primary full" onClick={onNext}>{checkpoint.order === 5 ? "Dokončit výpravu →" : "Odhalit další checkpoint →"}</button></div></div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Finish({ hintsUsed, proofMode, setProofMode, photo, onPhoto, canvasRef, onPointerDown, onPointerMove, onPointerUp, onClear, onFinish }: {
  hintsUsed: number; proofMode: "photo" | "signature" | "skip"; setProofMode: (mode: "photo" | "signature" | "skip") => void; photo: string | null; onPhoto: (event: ChangeEvent<HTMLInputElement>) => void; canvasRef: React.RefObject<HTMLCanvasElement | null>; onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void; onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void; onPointerUp: () => void; onClear: () => void; onFinish: () => void;
}) {
  const score = Math.max(300, 520 - hintsUsed * 15);
  return (
    <section className="finish-page">
      <div className="confetti"><i /><i /><i /><i /><i /><i /></div>
      <div className="finish-intro"><span className="finish-crown">♛</span><span className="eyebrow light"><span /> VÝPRAVA DOKONČENA</span><h1>Královo Pole<br /><em>už před tebou nic neskryje.</em></h1><p>Pět stop, čtyři kilometry a jedna zachráněná kronika. Dobrá práce, Kláro.</p></div>
      <div className="finish-stats"><div><small>Čas</small><b>1:34:12</b></div><div><small>Vzdálenost</small><b>4,1 km</b></div><div><small>Kroky</small><b>5 842</b></div><div><small>Skóre</small><b>{score} XP</b></div></div>
      <div className="badge-award"><div className="big-badge"><span>♛</span><i>KRÁL<br />KRPOLE</i></div><div><span className="section-label">Nový odznak</span><h2>Král KrPole</h2><p>Za kompletní rozluštění pěti stop proměny Králova Pole.</p></div></div>
      <div className="proof-card">
        <div className="proof-heading"><div><span className="section-label">Zanech stopu</span><h2>Jak si výpravu zapamatuješ?</h2></div><p>Volitelné · zůstává jen v tomto zařízení</p></div>
        <div className="proof-tabs"><button className={proofMode === "photo" ? "active" : ""} onClick={() => setProofMode("photo")}>▣ Selfie</button><button className={proofMode === "signature" ? "active" : ""} onClick={() => setProofMode("signature")}>〽 Podpis</button><button className={proofMode === "skip" ? "active" : ""} onClick={() => setProofMode("skip")}>Přeskočit</button></div>
        {proofMode === "photo" && <label className="photo-drop">{photo ? <img src={photo} alt="Lokální náhled selfie" /> : <><span>＋</span><b>Přidat vítěznou selfie</b><small>Fotka se nikam neodesílá</small></>}<input type="file" accept="image/*" capture="user" onChange={onPhoto} /></label>}
        {proofMode === "signature" && <div className="signature-wrap"><canvas ref={canvasRef} width="600" height="220" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Plocha pro digitální podpis" /><button onClick={onClear}>Smazat podpis</button></div>}
        {proofMode === "skip" && <div className="skip-proof"><span>✓</span><p>Žádný problém. Výsledek a odznak se uloží i bez fotografie nebo podpisu.</p></div>}
        <div className="privacy-note">◎ V pilotu zůstává vše jen ve tvém prohlížeči. Nic neodesíláme ani nepoužíváme pro marketing.</div>
      </div>
      <button className="button cream finish-button" onClick={onFinish}>Uložit výpravu do profilu →</button>
    </section>
  );
}

function ActivityView({ activities }: { activities: Activity[] }) {
  return (
    <section className="page section-wrap activity-page">
      <div className="page-heading"><span className="section-label">Tvůj pohyb městem</span><h1>Aktivita</h1><p>Každý krok má příběh. Tady jsou ty tvoje.</p></div>
      <div className="activity-summary"><div><small>Srpen</small><b>16,2 km</b><span>↗ 12 % oproti červenci</span></div><div className="bar-chart">{[35, 62, 46, 80, 52, 95, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div>
      <div className="activity-list"><h2>Poslední výpravy</h2>{activities.map((activity) => <article key={activity.id}><span className="activity-icon">↗</span><div><b>{activity.title}</b><small>{activity.date}</small></div><div className="activity-numbers"><span>{activity.distance}</span><span>{activity.time}</span><strong>+{activity.xp} XP</strong></div></article>)}</div>
    </section>
  );
}

function Profile({ completed, activities, badges: profileBadges, onReset }: { completed: boolean; activities: Activity[]; badges: Badge[]; onReset: () => void }) {
  const xp = completed ? 1860 : 1340;
  return (
    <section className="profile-page">
      <div className="profile-hero"><div className="section-wrap profile-head"><div className="profile-avatar">KN<span>7</span></div><div><span className="eyebrow light"><span /> MĚSTSKÝ STOPAŘ</span><h1>Klára Novotná</h1><p>Brno · členka od června 2026</p></div><div className="level-card"><span>LEVEL 7</span><div><i style={{ width: `${completed ? 72 : 46}%` }} /></div><small>{xp} / 2 000 XP do další úrovně</small></div></div></div>
      <div className="section-wrap profile-content">
        <div className="stat-strip"><div><small>Celkem kilometrů</small><b>{completed ? "46,7" : "42,6"}<i> km</i></b></div><div><small>Kroků ve hrách</small><b>{completed ? "64 272" : "58 430"}</b></div><div><small>Dokončené trasy</small><b>{completed ? "8" : "7"}</b></div><div><small>Aktuální série</small><b>3<i> týdny</i></b></div></div>
        <div className="profile-grid">
          <div className="profile-main">
            <section className="panel badges-panel"><div className="panel-heading"><div><span className="section-label">Sbírka</span><h2>Odznaky</h2></div><span>{profileBadges.filter((badge) => badge.earned).length} / {profileBadges.length}</span></div><div className="badges-grid">{profileBadges.map((badge) => <article key={badge.id} className={badge.earned ? "earned" : "locked"}><span>{badge.icon}</span><b>{badge.name}</b><small>{badge.detail}</small></article>)}</div></section>
            <section className="panel recent-panel"><div className="panel-heading"><div><span className="section-label">Deník</span><h2>Poslední výpravy</h2></div></div>{activities.slice(0, 3).map((activity) => <article key={activity.id}><span>↗</span><div><b>{activity.title}</b><small>{activity.date} · {activity.distance}</small></div><strong>+{activity.xp} XP</strong></article>)}</section>
          </div>
          <aside className="panel leaderboard"><div className="panel-heading"><div><span className="section-label">Tento týden</span><h2>Brno žebříček</h2></div></div><div className="podium"><div><span>2</span><b>TP</b><small>2 610</small></div><div><span>1</span><b>MK</b><small>2 840</small></div><div><span>3</span><b>DN</b><small>2 380</small></div></div><div className="rank-list">{leaderboard.map((entry) => <div key={entry.rank} className={entry.you ? "you" : ""}><span>{entry.rank}.</span><i>{entry.avatar}</i><b>{entry.name}{entry.you && <small> TY</small>}</b><strong>{entry.you && completed ? entry.xp + 520 : entry.xp} XP</strong></div>)}</div></aside>
        </div>
        <button className="reset-button" onClick={onReset}>Resetovat demo data</button>
      </div>
    </section>
  );
}

function ModalLayer({ modal, item, onClose, onLogin, onBuy }: { modal: Exclude<Modal, null>; item: "route" | "bundle"; onClose: () => void; onLogin: () => void; onBuy: () => void }) {
  const price = item === "route" ? 249 : 599;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="Zavřít">×</button>
        {modal === "login" ? <><span className="modal-symbol">Š</span><span className="section-label">Demo účet</span><h2 id="modal-title">Nejdřív si tě zapíšeme do kroniky</h2><p>V pilotu nic neověřujeme. Jedním kliknutím vstoupíš jako Klára a postup zůstane jen v tomto prohlížeči.</p><label>E-mail<input value="klara@sifrovana.cz" readOnly /></label><button className="button primary full" onClick={onLogin}>Vstoupit jako Klára →</button><small className="modal-note">Bez hesla · bez odesílání dat · pouze demo</small></> : <><span className="section-label">Rekapitulace</span><h2 id="modal-title">Ještě jeden krok a vyrážíš</h2><div className="checkout-item"><span>01</span><div><small>{item === "route" ? "TRASA" : "BALÍČEK"}</small><b>{item === "route" ? "Královo Pole: Stopy proměny" : "Brněnská trilogie"}</b><p>{item === "route" ? "4,1 km · 5 checkpointů" : "3 městské části · 3 trasy"}</p></div><strong>{price} Kč</strong></div><div className="demo-payment"><span>DEMO</span><p>Toto je simulace nákupu. Platební karta ani skutečná platba nejsou potřeba.</p></div><div className="checkout-total"><span>Celkem</span><strong>{price} Kč</strong></div><button className="button primary full" onClick={onBuy}>Potvrdit demo nákup →</button><small className="modal-note">Potvrzením nevzniká žádná platba ani závazek.</small></>}
      </div>
    </div>
  );
}

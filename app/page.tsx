"use client";

/* eslint-disable @next/next/no-img-element -- Selfie uses a local object URL and is never uploaded. */

import { ChangeEvent, lazy, PointerEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  AuthModal,
  CheckoutModal,
  CityRouteMap,
  ContactSection,
  PartnerSection,
  ProfileExperience,
  type RouteSummary,
  useSifrovanaAuth,
} from "./product-sections";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { CheckpointMap } from "./checkpoint-map";
import { usePublishedGame } from "./use-published-game";
import type { PublishedGameCheckpoint, PublishedGameSession } from "../lib/supabase/published-game";
import {
  bundle,
  cities,
  commerciallyReleasedBundleIds,
  commerciallyReleasedRouteIds,
  pilotRouteId,
  routes,
} from "../lib/route-content";
import { mergePublicCatalogRoutes, PUBLIC_ROUTE_CATALOG_SELECT } from "../lib/route-catalog";
import { RouteSuitabilityBadges } from "./route-suitability-badges";
import { BrnoIllustratedMap } from "./brno-illustrated-map";
import { canPurchasePublishedRoute, canStartPublishedGame } from "../lib/route-playability";
import { buildAppSearch, parseAppLocation, type AppView } from "../lib/app-location";

const AdminCenter = lazy(() => import("./admin-center").then((module) => ({ default: module.AdminCenter })));

type Modal = "login" | "checkout" | null;
type RouteProgress = { current: number; solved: string[]; hintsUsed: number; completed: boolean };
type Activity = { id: string; title: string; date: string; distance: string; time: string };
type Badge = { id: string; name: string; detail: string; icon: string; earned: boolean };
type StoredState = {
  progress: RouteProgress;
  activityAdded: boolean;
};

type PublishedResult = {
  checkpoint: PublishedGameCheckpoint;
  fact: string;
  nextClue: string;
  metaToken: string | null;
  completed: boolean;
};

type GameCheckpoint = {
  id: string;
  routeId: string;
  order: number;
  title: string;
  short: string;
  coordinates: { lat: number; lng: number };
  type: "online" | "physical" | "hybrid";
  distanceFromPrevious: string;
  story: string;
  puzzle: { prompt: string; hints: [string, string] };
  fallback: { prompt: string };
  fact: string;
  nextClue: string;
  metaToken: string | null;
  map: { x: number; y: number };
};

const routePreviewStops = [
  { id: "start", order: 1, title: "Semilasso", map: { x: 14, y: 78 } },
  { id: "hidden-2", order: 2, title: "Skrytá stopa", map: { x: 32, y: 63 } },
  { id: "hidden-3", order: 3, title: "Skrytá stopa", map: { x: 52, y: 46 } },
  { id: "hidden-4", order: 4, title: "Skrytá stopa", map: { x: 70, y: 31 } },
  { id: "hidden-5", order: 5, title: "Skrytá stopa", map: { x: 88, y: 14 } },
];

const demoRoute = routes.find((route) => route.id === pilotRouteId) ?? routes[0];

const staticRouteSummaries: RouteSummary[] = routes.map((route) => ({
  id: route.id,
  district: route.district,
  title: route.title,
  tagline: route.tagline,
  price: route.price,
  distance: route.distance,
  duration: route.duration,
  durationMinMinutes: route.durationMinMinutes,
  durationMaxMinutes: route.durationMaxMinutes,
  strollerStatus: route.strollerStatus,
  preschoolStatus: route.preschoolStatus,
  difficulty: route.difficulty,
  checkpoints: route.checkpoints,
  status: route.status,
  accent: route.accent,
  available: route.available,
  availableFrom: route.availableFrom,
  availableTo: route.availableTo,
  mapX: route.mapX,
  mapY: route.mapY,
}));
const staticRouteIds = staticRouteSummaries.map((route) => route.id);

const baseActivities: Activity[] = [];

const badges: Badge[] = [
  { id: "king", name: "Král KrPole", detail: "Stopy proměny · Královo Pole", icon: "♛", earned: false },
  { id: "center", name: "Brno-střed", detail: "Pod povrchem · připravujeme", icon: "◇", earned: false },
  { id: "zabovresky", name: "Žabovřesky", detail: "Vily vyprávějí · připravujeme", icon: "⌂", earned: false },
];

const initialState: StoredState = {
  progress: { current: 0, solved: [], hintsUsed: 0, completed: false },
  activityAdded: false,
};

const storageKey = "sifrovana-demo-v1";

function publishedCheckpointToView(checkpoint: PublishedGameCheckpoint, result: PublishedResult | null): GameCheckpoint {
  const hint = (level: 1 | 2) => checkpoint.revealedHints.find((item) => item.level === level)?.hint ?? "";
  const distance = checkpoint.distanceFromPreviousKm;
  return {
    id: checkpoint.id,
    routeId: checkpoint.routeId,
    order: checkpoint.position,
    title: checkpoint.title,
    short: checkpoint.shortTitle,
    coordinates: checkpoint.coordinates,
    type: checkpoint.type,
    distanceFromPrevious: distance === null || distance === 0 ? "Start" : `${distance.toLocaleString("cs-CZ")} km`,
    story: checkpoint.story,
    puzzle: { prompt: checkpoint.puzzlePrompt, hints: [hint(1), hint(2)] },
    fallback: { prompt: checkpoint.fallbackPrompt },
    fact: result?.fact ?? checkpoint.fact ?? "",
    nextClue: result?.nextClue ?? checkpoint.nextClue ?? "",
    metaToken: result?.metaToken ?? checkpoint.metaToken,
    map: checkpoint.map,
  };
}

export default function Home() {
  const auth = useSifrovanaAuth();
  const publishedGame = usePublishedGame(auth.user?.id ?? null);
  const [view, setView] = useState<AppView>("discover");
  const [modal, setModal] = useState<Modal>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [state, setState] = useState<StoredState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerStatus, setAnswerStatus] = useState<"idle" | "wrong" | "correct">("idle");
  const [shownHints, setShownHints] = useState(0);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [proofMode, setProofMode] = useState<"photo" | "signature" | "skip">("photo");
  const [checkoutItem, setCheckoutItem] = useState<"route" | "bundle">("route");
  const [catalogRoutes, setCatalogRoutes] = useState<RouteSummary[]>(staticRouteSummaries);
  const [selectedRouteId, setSelectedRouteId] = useState(pilotRouteId);
  const [resumeCheckout, setResumeCheckout] = useState(false);
  const [routeOwnership, setRouteOwnership] = useState<{ userId: string; routeIds: string[] } | null>(null);
  const [publishedResult, setPublishedResult] = useState<PublishedResult | null>(null);
  const [gameMessage, setGameMessage] = useState("");
  const [resumeCheckedKey, setResumeCheckedKey] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const drawing = useRef(false);
  const photoUrlRef = useRef<string | null>(null);
  const resumeAttemptedUser = useRef<string | null>(null);
  const currentUserId = auth.user?.id ?? null;
  const ownedRouteIds = routeOwnership?.userId === currentUserId ? routeOwnership.routeIds : [];

  useEffect(() => {
    const applyLocation = (moveFocus = false) => {
      const location = parseAppLocation(window.location.search, staticRouteIds, pilotRouteId);
      setSelectedRouteId(location.routeId);
      setView(location.view);
      setMenuOpen(false);
      setModal(null);
      if (moveFocus) window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    };
    applyLocation();
    const handlePopState = () => applyLocation(true);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    mobileMenuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  const applyPublishedSession = useCallback((session: PublishedGameSession) => {
    const currentCheckpoint = session.checkpoints.find(
      (checkpoint) => checkpoint.position === session.progress.currentPosition,
    );
    setShownHints(currentCheckpoint?.revealedHints.length ?? 0);
    setState((current) => ({
      ...current,
      progress: {
        current: Math.max(0, session.progress.currentPosition - 1),
        solved: session.progress.solvedCheckpointIds,
        hintsUsed: session.progress.hintsUsed,
        completed: Boolean(session.progress.completedAt),
      },
    }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        try {
          const savedState = JSON.parse(saved) as Partial<StoredState>;
          setState((current) => ({
            ...current,
            activityAdded: savedState.activityAdded === true,
          }));
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ activityAdded: state.activityAdded }),
      );
    }
  }, [state.activityAdded, hydrated]);

  useEffect(() => () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    supabase.from("routes").select(PUBLIC_ROUTE_CATALOG_SELECT).then(({ data }) => {
      if (!active || !data) return;
      const nextRoutes = mergePublicCatalogRoutes(staticRouteSummaries, data);
      setCatalogRoutes(nextRoutes);
      setSelectedRouteId((current) => nextRoutes.some((route) => route.id === current) ? current : (nextRoutes[0]?.id ?? pilotRouteId));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !auth.user) return;
    const userId = auth.user.id;
    let active = true;
    supabase.from("user_route_access").select("route_id").eq("user_id", userId).then(({ data }) => {
      if (active) setRouteOwnership({ userId, routeIds: (data ?? []).map((item) => item.route_id as string) });
    });
    return () => { active = false; };
  }, [auth.user]);

  const resumeLastPublishedGame = publishedGame.resumeLast;
  const clearPublishedGameError = publishedGame.clearError;

  useEffect(() => {
    if (auth.loading) return;
    const userId = auth.user?.id;
    if (!userId) {
      resumeAttemptedUser.current = null;
      return;
    }
    const resumeKey = `${userId}:${selectedRouteId}`;
    if (
      !publishedGame.backendConfigured
      || publishedGame.session
      || resumeAttemptedUser.current === resumeKey
    ) return;

    resumeAttemptedUser.current = resumeKey;
    let active = true;
    void resumeLastPublishedGame(selectedRouteId)
      .then((session) => {
        if (!active || !session) return;
        setArrived(false);
        setAnswer("");
        setAnswerStatus("idle");
        setFallbackMode(false);
        setPublishedResult(null);
        setGameMessage("");
        setSelectedRouteId(session.routeId);
        applyPublishedSession(session);
        const requestedView = parseAppLocation(window.location.search, staticRouteIds, pilotRouteId).view;
        if (requestedView === "game" || requestedView === "finish") {
          const nextView = session.progress.completedAt ? "finish" : "game";
          setView(nextView);
          const search = buildAppSearch(nextView, session.routeId, window.location.search);
          window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
          window.scrollTo({ top: 0, behavior: "auto" });
          window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
        }
      })
      .catch(() => {
        if (active) clearPublishedGameError();
      })
      .finally(() => {
        if (active) setResumeCheckedKey(resumeKey);
      });
    return () => { active = false; };
  }, [
    applyPublishedSession,
    auth.loading,
    auth.user?.id,
    clearPublishedGameError,
    publishedGame.backendConfigured,
    publishedGame.session,
    resumeLastPublishedGame,
    selectedRouteId,
  ]);

  const publishedCheckpoint = publishedResult?.checkpoint ?? publishedGame.currentCheckpoint;
  const activeCheckpoint = publishedCheckpoint ? publishedCheckpointToView(publishedCheckpoint, publishedResult) : null;
  const totalCheckpoints = publishedGame.session?.progress.checkpointCount
    ?? catalogRoutes.find((route) => route.id === demoRoute.id)?.checkpoints
    ?? routePreviewStops.length;
  const solvedCount = publishedGame.session?.progress.solvedCheckpointIds.length ?? state.progress.solved.length;
  const earnedMetaTokens = (publishedGame.session?.checkpoints ?? [])
    .filter((checkpoint) => checkpoint.metaToken)
    .map((checkpoint) => ({ position: checkpoint.position, token: checkpoint.metaToken as string }))
    .sort((left, right) => left.position - right.position);
  const completed = Boolean(publishedGame.session?.progress.completedAt)
    || state.progress.completed
    || state.activityAdded;
  const currentGameCompleted = Boolean(publishedGame.session?.progress.completedAt)
    || state.progress.completed;
  const displayProgress: RouteProgress = publishedGame.session
    ? {
        current: Math.min(
          publishedGame.session.progress.solvedCheckpointIds.length,
          totalCheckpoints,
        ),
        solved: publishedGame.session.progress.solvedCheckpointIds,
        hintsUsed: publishedGame.session.progress.hintsUsed,
        completed,
      }
    : { ...state.progress, completed };
  const ownedPlayableRoutes = catalogRoutes.filter((route) => (
    canStartPublishedGame(route, commerciallyReleasedRouteIds)
    && (auth.profile?.role === "superadmin" || ownedRouteIds.includes(route.id))
  ));
  const earnedBadges = badges.map((badge) => (badge.id === "king" && completed ? { ...badge, earned: true } : badge));
  const activities = state.activityAdded
    ? [{ id: "pilot", title: "Královo Pole: Stopy proměny", date: "Dnes", distance: "4,1 km", time: "1:34" }, ...baseActivities]
    : baseActivities;
  const accountName = auth.profile?.username || auth.profile?.display_name || auth.user?.email?.split("@")[0] || "Přihlásit";
  const accountInitials = accountName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const pilotRouteSummary = catalogRoutes.find((route) => route.id === demoRoute.id) ?? staticRouteSummaries[0];
  const selectedRoute = catalogRoutes.find((route) => route.id === selectedRouteId) ?? pilotRouteSummary;
  const expectedResumeKey = currentUserId ? `${currentUserId}:${selectedRouteId}` : null;
  const resumeCheckComplete = !currentUserId
    || !publishedGame.backendConfigured
    || Boolean(publishedGame.session)
    || resumeCheckedKey === expectedResumeKey;
  const protectedViewReady = hydrated && !auth.loading && resumeCheckComplete;
  const protectedViewPending = (view === "game" || view === "finish") && (
    !protectedViewReady
    || (view === "game" && !publishedGame.session)
    || (view === "finish" && !currentGameCompleted)
  );

  useEffect(() => {
    if (!hydrated || auth.loading || !resumeCheckComplete) return;
    const invalidFinish = view === "finish" && !currentGameCompleted;
    const invalidGame = view === "game" && !publishedGame.session && !publishedGame.busy;
    if (!invalidFinish && !invalidGame) return;
    const timer = window.setTimeout(() => {
      setView("library");
      const search = buildAppSearch("library", selectedRouteId, window.location.search);
      window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [auth.loading, currentGameCompleted, hydrated, publishedGame.busy, publishedGame.session, resumeCheckComplete, selectedRouteId, view]);

  function navigate(next: AppView, routeId = selectedRouteId) {
    setView(next);
    setMenuOpen(false);
    const search = buildAppSearch(next, routeId, window.location.search);
    window.history.pushState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }

  function openRouteDetail(route: RouteSummary) {
    setSelectedRouteId(route.id);
    navigate("detail", route.id);
  }

  function openPurchase(item: "route" | "bundle" = "route", requestedRoute?: RouteSummary) {
    const route = requestedRoute ?? catalogRoutes.find((candidate) => canPurchasePublishedRoute(candidate, commerciallyReleasedRouteIds));
    const bundleReady = commerciallyReleasedBundleIds.includes(bundle.id)
      && bundle.routeIds.every((routeId) => canPurchasePublishedRoute(catalogRoutes.find((candidate) => candidate.id === routeId), commerciallyReleasedRouteIds));
    if (!route || (item === "route" && !canPurchasePublishedRoute(route, commerciallyReleasedRouteIds)) || (item === "bundle" && !bundleReady)) return;
    setCheckoutItem(item);
    setSelectedRouteId(route.id);
    setResumeCheckout(true);
    if (!auth.user) {
      setAuthMode("signin");
      setModal("login");
    } else setModal("checkout");
  }

  function login() {
    setModal(resumeCheckout ? "checkout" : null);
    if (!resumeCheckout) navigate("profile");
  }

  function buy() {
    void auth.refreshProfile();
  }

  async function startGame(requestedRouteId = selectedRouteId) {
    resetCheckpointUi();
    setGameMessage("");
    const requestedRoute = catalogRoutes.find((route) => route.id === requestedRouteId);
    if (!requestedRoute || !canStartPublishedGame(requestedRoute, commerciallyReleasedRouteIds)) {
      setGameMessage("Tato trasa je zatím pracovní koncept. Spustit ji půjde až po terénním ověření a publikaci.");
      if (requestedRoute) openRouteDetail(requestedRoute);
      return;
    }
    const ownsRequestedRoute = auth.profile?.role === "superadmin" || ownedRouteIds.includes(requestedRoute.id);
    if (!ownsRequestedRoute) {
      openPurchase("route", requestedRoute);
      return;
    }
    if (!publishedGame.backendConfigured) {
      setGameMessage("Herní server není nakonfigurovaný. Ostrou výpravu nelze spustit v offline režimu.");
      navigate("library");
      return;
    }
    try {
      const session = await publishedGame.start(requestedRoute.id);
      setPublishedResult(null);
      applyPublishedSession(session);
      navigate(session.progress.completedAt ? "finish" : "game");
    } catch (reason) {
      setGameMessage(reason instanceof Error ? reason.message : "Publikovanou hru se nepodařilo spustit.");
      navigate("library");
    }
  }

  function resetCheckpointUi() {
    setArrived(false);
    setAnswer("");
    setAnswerStatus("idle");
    setShownHints(0);
    setFallbackMode(false);
    setPublishedResult(null);
  }

  async function revealHint() {
    if (shownHints >= 2) return;
    setGameMessage("");
    try {
      const result = await publishedGame.revealHint((shownHints + 1) as 1 | 2);
      setShownHints((count) => Math.max(count, result.level));
      setState((current) => ({ ...current, progress: { ...current.progress, hintsUsed: result.hintsUsed } }));
    } catch (reason) {
      setGameMessage(reason instanceof Error ? reason.message : "Nápovědu se nepodařilo načíst.");
    }
  }

  async function checkAnswer() {
    const checkpoint = publishedGame.currentCheckpoint;
    if (!checkpoint) return;
    setGameMessage("");
    try {
      const result = await publishedGame.submitAnswer({ checkpointId: checkpoint.id, answer, useFallback: fallbackMode });
      if (!result.correct) {
        setAnswerStatus("wrong");
        return;
      }
      setPublishedResult({ checkpoint, fact: result.fact, nextClue: result.nextClue, metaToken: result.metaToken, completed: result.completed });
      setAnswerStatus("correct");
      setState((current) => ({
        ...current,
        progress: {
          current: Math.max(0, result.session.progress.currentPosition - 1),
          solved: result.session.progress.solvedCheckpointIds,
          hintsUsed: result.session.progress.hintsUsed,
          completed: false,
        },
      }));
    } catch (reason) {
      setGameMessage(reason instanceof Error ? reason.message : "Odpověď se nepodařilo ověřit.");
    }
  }

  function toggleFallback() {
    if (answerStatus === "correct") return;
    setFallbackMode((current) => !current);
    setAnswer("");
    setAnswerStatus("idle");
    setShownHints(publishedGame.currentCheckpoint?.revealedHints.length ?? 0);
  }

  function nextCheckpoint() {
    if (!publishedResult) return;
    if (publishedResult.completed) {
      setState((current) => ({ ...current, progress: { ...current.progress, completed: true } }));
      setPublishedResult(null);
      navigate("finish");
      return;
    }
    resetCheckpointUi();
  }

  function finishRoute() {
    publishedGame.clear();
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhoto(null);
    setState((current) => ({ ...current, activityAdded: true }));
    navigate("profile");
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    photoUrlRef.current = nextUrl;
    setPhoto(nextUrl);
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
          {(auth.profile?.role === "route_manager" || auth.profile?.role === "superadmin") && <NavButton active={view === "admin"} onClick={() => navigate("admin")}>Správa</NavButton>}
        </nav>
        <button className="account-chip" onClick={() => { if (auth.user) navigate("profile"); else { setResumeCheckout(false); setAuthMode("signin"); setModal("login"); } }}>
          <span>{auth.user ? accountInitials : "?"}</span>
          <b>{auth.user ? accountName : "Přihlásit"}</b>
        </button>
        <button ref={menuButtonRef} className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Zavřít menu" : "Otevřít menu"} aria-expanded={menuOpen} aria-controls="mobile-menu">☰</button>
      </header>

      {menuOpen && (
        <nav ref={mobileMenuRef} id="mobile-menu" className="mobile-menu" aria-label="Mobilní rozšířená navigace">
          <button onClick={() => navigate("discover")}>Objevuj trasy</button>
          <button onClick={() => navigate("library")}>Moje hry</button>
          <button onClick={() => navigate("activity")}>Aktivita</button>
          <button onClick={() => navigate("profile")}>Profil</button>
          {(auth.profile?.role === "route_manager" || auth.profile?.role === "superadmin") && <button onClick={() => navigate("admin")}>Správa</button>}
          <button onClick={() => navigate("partners")}>Pro partnery</button>
          <button onClick={() => navigate("contact")}>Kontakt</button>
        </nav>
      )}

      <main ref={mainRef} id="main-content" tabIndex={-1}>
        {view === "discover" && <Discover routesForSale={catalogRoutes} onDetail={openRouteDetail} onBuy={openPurchase} />}
        {view === "detail" && <RouteDetail route={selectedRoute} owned={auth.profile?.role === "superadmin" || ownedRouteIds.includes(selectedRoute.id)} onBack={() => navigate("discover")} onBuy={() => openPurchase("route", selectedRoute)} onStart={() => startGame(selectedRoute.id)} />}
        {view === "library" && <Library routes={ownedPlayableRoutes} progress={displayProgress} progressRouteId={publishedGame.session?.routeId ?? pilotRouteId} notice={gameMessage} onDiscover={() => navigate("discover")} onStart={startGame} onDetail={openRouteDetail} />}
        {protectedViewPending && <section className="page section-wrap" aria-live="polite"><div className="loading-shell"><span className="loader-mark">Š</span><p>Ověřujeme rozehranou výpravu…</p></div></section>}
        {view === "game" && protectedViewReady && activeCheckpoint && (
          <Game
            checkpoint={activeCheckpoint}
            totalCheckpoints={totalCheckpoints}
            solvedCount={solvedCount}
            earnedMetaTokens={earnedMetaTokens}
            message={gameMessage}
            busy={publishedGame.busy}
            arrived={arrived}
            setArrived={setArrived}
            answer={answer}
            setAnswer={setAnswer}
            answerStatus={answerStatus}
            setAnswerStatus={setAnswerStatus}
            shownHints={shownHints}
            fallbackMode={fallbackMode}
            onHint={revealHint}
            onToggleFallback={toggleFallback}
            onCheck={checkAnswer}
            onNext={nextCheckpoint}
            onExit={() => navigate("library")}
          />
        )}
        {view === "game" && protectedViewReady && publishedGame.session && !activeCheckpoint && <section className="page section-wrap"><div className="empty-state"><span>!</span><h2>Checkpoint se nepodařilo načíst</h2><p>{gameMessage || "Vrať se do knihovny a spusť publikovanou trasu znovu."}</p><button className="button primary" onClick={() => navigate("library")}>Zpět do knihovny</button></div></section>}
        {view === "finish" && protectedViewReady && currentGameCompleted && (
          <Finish
            hintsUsed={state.progress.hintsUsed}
            totalCheckpoints={totalCheckpoints}
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
        {view === "profile" && <ProfileExperience auth={auth} completed={completed} activities={activities} badges={earnedBadges} onLogin={() => { setResumeCheckout(false); setAuthMode("signin"); setModal("login"); }} onRegister={() => { setResumeCheckout(false); setAuthMode("signup"); setModal("login"); }} />}
        {view === "admin" && <Suspense fallback={<section className="page section-wrap"><div className="loading-shell"><span className="loader-mark">Š</span><p>Otevíráme správu…</p></div></section>}><AdminCenter auth={auth} /></Suspense>}
        {view === "partners" && <PartnerSection />}
        {view === "contact" && <ContactSection auth={auth} />}
      </main>

      <footer className="site-footer"><div className="section-wrap"><div><span className="brand-name">Šifrovaná<span className="brand-dot">.</span></span><small>Město není kulisa. Je to šifra.</small></div><nav><button onClick={() => navigate("partners")}>Pro podniky a provozovatele</button><button onClick={() => navigate("contact")}>Nahlásit chybu nebo nápad</button></nav></div></footer>

      {view !== "admin" && <nav className="bottom-nav" aria-label="Mobilní navigace">
        <BottomButton icon="⌖" label="Objevuj" active={view === "discover" || view === "detail"} onClick={() => navigate("discover")} />
        <BottomButton icon="◇" label="Moje hry" active={view === "library" || view === "game" || view === "finish"} onClick={() => navigate("library")} />
        <BottomButton icon="↗" label="Aktivita" active={view === "activity"} onClick={() => navigate("activity")} />
        <BottomButton icon="◉" label="Profil" active={view === "profile"} onClick={() => navigate("profile")} />
      </nav>}

      {modal === "login" && <AuthModal auth={auth} initialMode={authMode} onClose={() => setModal(null)} onAuthenticated={login} />}
      {modal === "checkout" && <CheckoutModal auth={auth} kind={checkoutItem} route={selectedRoute} routes={catalogRoutes} onClose={() => { setModal(null); setResumeCheckout(false); }} onCreated={buy} />}
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? "nav-active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}>{children}</button>;
}

function BottomButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><b>{label}</b></button>;
}

function Discover({ routesForSale, onDetail, onBuy }: { routesForSale: RouteSummary[]; onDetail: (route: RouteSummary) => void; onBuy: (item: "route" | "bundle", route?: RouteSummary) => void }) {
  const [routeFilter, setRouteFilter] = useState("all");
  const bundleListPrice = bundle.routeIds.reduce(
    (total, routeId) => total + (routesForSale.find((route) => route.id === routeId)?.price ?? 0),
    0,
  );
  const bundleSavings = bundleListPrice - bundle.price;
  const bundleReady = commerciallyReleasedBundleIds.includes(bundle.id)
    && bundle.routeIds.every((routeId) => canPurchasePublishedRoute(routesForSale.find((route) => route.id === routeId), commerciallyReleasedRouteIds));
  const activeRouteCount = routesForSale.filter((route) => canPurchasePublishedRoute(route, commerciallyReleasedRouteIds)).length;
  const upcomingRouteCount = routesForSale.filter((route) => route.status === "coming").length;
  const seasonalRouteCount = routesForSale.filter((route) => route.status === "seasonal").length;
  const districtFilters = Array.from(new Set(routesForSale.filter((route) => route.status !== "seasonal").map((route) => route.district)));
  const filteredRoutes = routeFilter === "all"
    ? routesForSale
    : routeFilter === "seasonal"
      ? routesForSale.filter((route) => route.status === "seasonal")
      : routesForSale.filter((route) => route.district === routeFilter);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow light"><span /> Brno je plné stop</div>
          <h1>Město není kulisa.<br /><em>Je to šifra.</em></h1>
          <p>Vyraz pěšky, rozlušti příběhy ukryté v ulicích a objev Brno tak, jak ho neznají ani místní.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => { const firstRoute = routesForSale.find((route) => route.id === pilotRouteId) ?? routesForSale[0]; if (firstRoute) onDetail(firstRoute); }}>Vybrat první trasu <span>→</span></button>
            <button className="text-button" onClick={() => document.getElementById("jak-to-funguje")?.scrollIntoView({ behavior: "smooth" })}>Jak to funguje <span>↓</span></button>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack"><span>01</span><span>BR</span><span>KP</span></div>
            <div><b>Pilotní výprava v Králově Poli</b><small>první trasa připravená k ověření</small></div>
          </div>
        </div>
        <div className="hero-map" aria-label="Geograficky věrná ilustrovaná mapa Brna s oblastí pilotní trasy">
          <BrnoIllustratedMap routes={[{ district: "Královo Pole", routeCount: 1, hasActive: true, isSeasonal: false }]} selectedDistrict="Královo Pole" variant="hero" />
          <div className="route-ticket">
            <span className="ticket-kicker">TRASA 01 · BRNO</span>
            <b>Stopy<br />proměny</b>
            <div><span>4,1 km</span><span>5 stop</span></div>
          </div>
        </div>
      </section>

      <section className="city-bar section-wrap">
        <div><span className="section-label">Vyber město</span><h2>Kde budeš pátrat?</h2></div>
        <div className="city-pills">
          {cities.map((city) => <button key={city.id} className={city.active ? "active" : ""} disabled={!city.active}><span>{city.name}</span><small>{city.active ? `${routesForSale.length} tras · ${activeRouteCount} aktivní` : "později"}</small></button>)}
        </div>
      </section>

      <div className="route-filters section-wrap" aria-label="Filtrovat trasy">
        <button className={routeFilter === "all" ? "active" : ""} aria-pressed={routeFilter === "all"} onClick={() => setRouteFilter("all")}>Všechny</button>
        {districtFilters.map((district) => <button key={district} className={routeFilter === district ? "active" : ""} aria-pressed={routeFilter === district} onClick={() => setRouteFilter(district)}>{district}</button>)}
        <button className={routeFilter === "seasonal" ? "active" : ""} aria-pressed={routeFilter === "seasonal"} onClick={() => setRouteFilter("seasonal")}>Vánoční a sezónní</button>
      </div>

      <CityRouteMap routes={filteredRoutes} releasedRouteIds={commerciallyReleasedRouteIds} onBuy={(route) => onBuy("route", route)} onDetail={onDetail} />

      <section className="routes-section section-wrap">
        <div className="section-heading">
          <div><span className="section-label">Brno · aktuálně</span><h2>Vyber si svou výpravu</h2></div>
          <span className="route-count">{activeRouteCount} aktivní · {upcomingRouteCount} připravujeme · {seasonalRouteCount} sezónní</span>
        </div>
        <div className="route-grid">
          {filteredRoutes.map((route, index) => <RouteCard key={route.id} route={route} index={index + 1} onDetail={() => onDetail(route)} />)}
        </div>
      </section>

      <section className="bundle section-wrap">
        <div className="bundle-stamp"><span>3×</span><small>VÍCE STOP<br />MÉNĚ KORUN</small></div>
        <div className="bundle-copy"><span className="section-label light">{bundleReady ? "Výhodný balíček" : "Připravujeme"}</span><h2>{bundle.title}</h2><p>{bundleReady ? "Tři městské části, tři různé příběhy a jedno celé Brno k prozkoumání." : "Balíček zpřístupníme, až budou všechny tři trasy hotové a ověřené v terénu."}</p></div>
        <div className="bundle-routes"><span>Královo Pole</span><span>Brno-střed</span><span>Žabovřesky</span></div>
        <div className="bundle-buy"><small>{bundleReady ? `Ušetříš ${bundleSavings} Kč` : "Cena po vydání"}</small><strong>{bundle.price} Kč</strong><button className="button cream" onClick={() => onBuy("bundle")} disabled={!bundleReady}>{bundleReady ? "Chci balíček 3 tras →" : "Dostupné po vydání 3 tras"}</button></div>
      </section>

      <section className="how section-wrap" id="jak-to-funguje">
        <div className="section-heading"><div><span className="section-label">Jednoduchý princip</span><h2>Jak se hraje Šifrovaná?</h2></div></div>
        <div className="steps">
          <article><span className="step-no">01</span><div className="step-icon">⌖</div><h3>Vyber trasu</h3><p>Podle města, délky, času a obtížnosti. Každá čtvrť ukrývá jiný příběh.</p></article>
          <article><span className="step-no">02</span><div className="step-icon">↗</div><h3>Vyraz do ulic</h3><p>Mapa tě dovede k první stopě. Další místo se odhalí až po rozluštění.</p></article>
          <article><span className="step-no">03</span><div className="step-icon">#</div><h3>Lušti a objevuj</h3><p>Hledej detaily, lámej šifry a odemykej skutečné příběhy míst kolem tebe.</p></article>
          <article><span className="step-no">04</span><div className="step-icon">♛</div><h3>Ulož si výpravu</h3><p>Na konci získáš památeční odznak a přehled míst, která jsi objevil/a.</p></article>
        </div>
      </section>
    </>
  );
}

function RouteCard({ route, index, onDetail }: { route: RouteSummary; index: number; onDetail: () => void }) {
  const active = canPurchasePublishedRoute(route, commerciallyReleasedRouteIds);
  return (
    <article className={`route-card ${route.accent} ${!active ? "muted" : ""}`}>
      <div className="route-visual">
        <span className="route-number">{String(index).padStart(2, "0")}</span>
        {route.status === "seasonal" && <span className="season-tag">✦ ČASOVĚ OMEZENO</span>}
        {route.status === "coming" && <span className="coming-tag">PŘIPRAVUJEME · {route.available}</span>}
        <div className="mini-streets"><i /><i /><i /><i /></div>
        <span className="mini-pin">{active ? "⌖" : "?"}</span>
      </div>
      <div className="route-card-body">
        <span className="district">BRNO · {route.district.toUpperCase()}</span>
        <h3>{route.title}</h3>
        <p>{route.tagline}</p>
        <RouteSuitabilityBadges strollerStatus={route.strollerStatus} preschoolStatus={route.preschoolStatus} durationMaxMinutes={route.durationMaxMinutes} />
        <div className="route-stats"><span><small>Vzdálenost</small><b>{route.distance} km</b></span><span><small>Čas</small><b>{route.duration}</b></span><span><small>Obtížnost</small><b>{route.difficulty}</b></span></div>
        <div className="route-card-footer"><strong>{active ? `${route.price} Kč` : route.status === "seasonal" ? route.available : "Již brzy"}</strong><button onClick={onDetail} aria-label={`Detail trasy ${route.title}`}>{active ? "Prozkoumat →" : "Prohlédnout koncept →"}</button></div>
      </div>
    </article>
  );
}

function RouteDetail({ route, owned, onBack, onBuy, onStart }: { route: RouteSummary; owned: boolean; onBack: () => void; onBuy: () => void; onStart: () => void | Promise<void> }) {
  const playable = canStartPublishedGame(route, commerciallyReleasedRouteIds);
  const isPilot = route.id === pilotRouteId;
  const previewCount = Math.min(route.checkpoints, 3);
  return (
    <section className="detail-page">
      <div className="detail-hero">
        <button className="back-button" onClick={onBack}>← Zpět na trasy</button>
        <div className="detail-hero-grid section-wrap">
          <div className="detail-copy">
            <span className="eyebrow light"><span /> BRNO · {route.district.toUpperCase()}</span>
            <h1>{route.title}</h1>
            <p>{isPilot ? "Poskládej pět ztracených listů kroniky a odhal, jak se z vesnice za hradbami stala sebevědomá městská čtvrť." : route.tagline}</p>
            <div className="detail-tags"><span>{route.distance} km</span><span>{route.duration}</span><span>{route.checkpoints} checkpointů</span><span>{route.difficulty}</span></div>
            <RouteSuitabilityBadges strollerStatus={route.strollerStatus} preschoolStatus={route.preschoolStatus} durationMaxMinutes={route.durationMaxMinutes} />
          </div>
          <div className="detail-map"><BrnoIllustratedMap routes={[{ district: route.mapDistrict ?? route.district, routeCount: 1, hasActive: playable, isSeasonal: route.status === "seasonal" }]} selectedDistrict={route.mapDistrict ?? route.district} variant="detail" /></div>
        </div>
      </div>
      <div className="detail-content section-wrap">
        <div className="story-column">
          <span className="section-label">{playable ? "Tvůj úkol" : "Pracovní koncept"}</span><h2>{isPilot ? "Kronika má pět prázdných stran" : `Příběh čtvrti ${route.district} právě ověřujeme`}</h2>
          <p className="lead">{isPilot ? "Někdo z ní vytrhl klíčové okamžiky. Zůstaly jen šifry rozeseté od Semilassa až ke staré strojírně. Najdi je dřív, než stopy zmizí." : "Trasu zveřejníme teprve po ověření všech míst, přístupnosti, bezpečnosti a řešitelnosti úkolů přímo v terénu. Do té doby si můžeš prohlédnout její plánované parametry."}</p>
          <div className="checkpoint-preview">{isPilot ? routePreviewStops.map((cp, index) => <div key={cp.id}><span>{index === 0 ? "⌖" : "?"}</span><div><b>{index === 0 ? cp.title : `Stopa ${index + 1} je skrytá`}</b><small>{index === 0 ? "Start výpravy" : "Odemkne se během hry"}</small></div></div>) : Array.from({ length: previewCount }, (_, index) => <div key={`${route.id}-preview-${index}`}><span>?</span><div><b>{`Plánovaná stopa ${index + 1}`}</b><small>Přesné místo zveřejníme až po terénním ověření</small></div></div>)}</div>
        </div>
        <aside className="purchase-card">
          <div className="purchase-top"><span>TRASA PRO {demoRoute.teamSize.min}–{demoRoute.teamSize.max} HRÁČŮ</span><strong>{playable && owned ? "Zakoupeno" : `${route.price} Kč`}</strong><small>{playable ? "Jednorázově · bez předplatného" : "Plánovaná cena · zatím bez prodeje"}</small></div>
          <button className="button primary full" onClick={playable ? (owned ? onStart : onBuy) : undefined} disabled={!playable}>{playable ? (owned ? "Vyrazit na trasu →" : "Koupit trasu →") : "Čeká na terénní ověření"}</button>
          <ul><li>✓ Hraješ vlastním tempem</li><li>✓ Nápovědy přímo v aplikaci</li><li>✓ Postupné odkrývání míst</li><li>✓ Památeční odznak po dokončení</li></ul>
          <div className="gear"><b>Co s sebou?</b><p>Nabitý telefon, pohodlné boty, tužku a chuť dívat se kolem sebe.</p></div>
        </aside>
      </div>
    </section>
  );
}

function Library({ routes: ownedRoutes, progress, progressRouteId, notice, onDiscover, onStart, onDetail }: { routes: RouteSummary[]; progress: RouteProgress; progressRouteId: string; notice: string; onDiscover: () => void; onStart: (routeId: string) => void | Promise<void>; onDetail: (route: RouteSummary) => void }) {
  return (
    <section className="page section-wrap">
      <div className="page-heading"><span className="section-label">Tvoje sbírka</span><h1>Moje hry</h1><p>Zakoupené a rozehrané výpravy máš vždy po ruce.</p></div>
      {notice && <p className="form-message error" role="alert">{notice}</p>}
      {ownedRoutes.length === 0 ? (
        <div className="empty-state"><span>◇</span><h2>Batoh je zatím prázdný</h2><p>Vyber si první trasu a začni sbírat městské stopy.</p><button className="button primary" onClick={onDiscover}>Objevit trasy →</button></div>
      ) : (
        <div className="owned-routes">{ownedRoutes.map((route, index) => {
          const routeProgress = route.id === progressRouteId ? progress : { current: 0, solved: [], hintsUsed: 0, completed: false };
          const percent = routeProgress.completed ? 100 : Math.round((routeProgress.current / Math.max(route.checkpoints, 1)) * 100);
          return <article className="owned-card" key={route.id}>
            <div className="owned-visual"><span>{String(index + 1).padStart(2, "0")}</span><div className="owned-pin">⌖</div></div>
            <div className="owned-copy"><span className="district">BRNO · {route.district.toUpperCase()}</span><h2>{route.title}</h2><p>{routeProgress.completed ? "Výprava dokončena. Zápis je uložený v městském pasu." : routeProgress.current > 0 ? `Čeká na tebe stopa ${routeProgress.current + 1} z ${route.checkpoints}.` : "Vše je připraveno. První stopa čeká na odhalení."}</p>
              <div className="progress-row"><div><i style={{ width: `${percent}%` }} /></div><span>{percent} %</span></div>
              <div className="owned-actions"><button className="button primary" onClick={() => void onStart(route.id)}>{routeProgress.completed ? "Projít znovu" : routeProgress.current > 0 ? "Pokračovat ve hře →" : "Zahájit výpravu →"}</button><button className="text-button dark" onClick={() => onDetail(route)}>Detail trasy</button></div>
            </div>
          </article>;
        })}</div>
      )}
    </section>
  );
}

function Game({ checkpoint, totalCheckpoints, solvedCount, earnedMetaTokens, message, busy, arrived, setArrived, answer, setAnswer, answerStatus, setAnswerStatus, shownHints, fallbackMode, onHint, onToggleFallback, onCheck, onNext, onExit }: {
  checkpoint: GameCheckpoint; totalCheckpoints: number; solvedCount: number; earnedMetaTokens: { position: number; token: string }[]; message: string; busy: boolean; arrived: boolean; setArrived: (value: boolean) => void; answer: string; setAnswer: (value: string) => void; answerStatus: "idle" | "wrong" | "correct"; setAnswerStatus: (value: "idle" | "wrong" | "correct") => void; shownHints: number; fallbackMode: boolean; onHint: () => void | Promise<void>; onToggleFallback: () => void; onCheck: () => void | Promise<void>; onNext: () => void; onExit: () => void;
}) {
  return (
    <section className="game-page">
      <div className="game-topbar"><button onClick={onExit} aria-label="Ukončit herní režim a vrátit se do knihovny">×</button><div><span>STOPY PROMĚNY</span><div><i style={{ width: `${(solvedCount / Math.max(totalCheckpoints, 1)) * 100}%` }} /></div></div><b>{checkpoint.order}/{totalCheckpoints}</b></div>
      <div className="game-layout">
        <div className="game-map-panel">
          <CheckpointMap title={checkpoint.title} coordinates={checkpoint.coordinates} />
          <div className="map-meta"><span><small>K dalšímu bodu</small><b>{checkpoint.distanceFromPrevious}</b></span><span><small>Vyřešené stopy</small><b>{solvedCount} / {totalCheckpoints}</b></span><span><small>GPS</small><b className="ready">Připraveno</b></span></div>
        </div>
        <div className="puzzle-panel">
          {message && <p className="form-message error" role="alert">{message}</p>}
          <div className="checkpoint-title"><span className="checkpoint-badge">STOPA {String(checkpoint.order).padStart(2, "0")}</span><small>{checkpoint.type === "online" ? "ONLINE ŠIFRA" : checkpoint.type === "physical" ? "FYZICKÁ STOPA" : "HYBRIDNÍ STOPA"}</small><h1>{checkpoint.title}</h1><p>{checkpoint.short} · {checkpoint.coordinates.lat.toFixed(4)}, {checkpoint.coordinates.lng.toFixed(4)}</p></div>
          {earnedMetaTokens.length > 0 && <div className="story-card"><span>ZÍSKANÉ FRAGMENTY DO METAŠIFRY</span><p>{earnedMetaTokens.map((item) => `${item.position}. ${item.token}`).join(" · ")}</p></div>}
          {!arrived ? (
            <div className="arrival-card"><div className="radar"><i /><span>⌖</span></div><h2>Jsi na místě?</h2><p>V ostré hře checkpoint ověří GPS. V pilotu můžeš pokračovat odkudkoli.</p><button className="button primary full" onClick={() => setArrived(true)}>Jsem na místě – demo →</button><small>Simulace polohy · žádná data se neodesílají</small></div>
          ) : (
            <>
              <div className="story-card"><span>LIST Z KRONIKY</span><p>{checkpoint.story}</p></div>
              <div className="cipher-card"><div className="cipher-title"><span>{fallbackMode ? "↺" : "#"}</span><div><small>{fallbackMode ? "ZÁLOŽNÍ ZADÁNÍ" : `ŠIFRA ${checkpoint.order}/${totalCheckpoints}`}</small><h2>{fallbackMode ? "Pokračuj bez překážky" : "Rozlušti stopu"}</h2></div></div><p>{fallbackMode ? checkpoint.fallback.prompt : checkpoint.puzzle.prompt}</p>
                <button className="fallback-button" type="button" onClick={onToggleFallback}>{fallbackMode ? "← Zpět k původní šifře" : "Místo nejde přečíst? Použít záložní otázku"}</button>
                <label htmlFor="answer">Tvoje odpověď</label><div className={`answer-row ${answerStatus}`}><input id="answer" value={answer} onChange={(event) => { setAnswer(event.target.value); setAnswerStatus("idle"); }} onKeyDown={(event) => { if (event.key === "Enter" && !busy) void onCheck(); }} placeholder="Napiš řešení…" autoComplete="off" /><button onClick={() => void onCheck()} disabled={!answer.trim() || busy}>{busy ? "Ověřuji…" : "Ověřit"}</button></div>
                {answerStatus === "wrong" && <div className="answer-note wrong">{fallbackMode ? "To zatím nesedí. Zkus odpověď zapsat jinými slovy." : "To zatím nesedí. Rozhlédni se znovu nebo použij nápovědu."}</div>}
                {!fallbackMode && shownHints > 0 && <div className="hint"><b>Nápověda {shownHints}</b><p>{checkpoint.puzzle.hints[shownHints - 1]}</p></div>}
                {!fallbackMode && answerStatus !== "correct" && <button className="hint-button" onClick={() => void onHint()} disabled={shownHints >= 2 || busy}>◎ {shownHints >= 2 ? "Všechny nápovědy použity" : `Chci nápovědu ${shownHints + 1}`}</button>}
              </div>
              {answerStatus === "correct" && <div className="success-card"><span className="success-mark">✓</span><div><small>STOPA ROZLUŠTĚNA</small><h2>{checkpoint.order === totalCheckpoints ? "Kronika je kompletní!" : "Máš další list kroniky"}</h2><p>{checkpoint.fact}</p>{checkpoint.metaToken && <div className="next-clue"><small>FRAGMENT DO METAŠIFRY</small><b>{checkpoint.metaToken}</b></div>}<div className="next-clue"><small>{checkpoint.order === totalCheckpoints ? "ZÁVĚR" : "DALŠÍ STOPA"}</small><b>{checkpoint.nextClue}</b></div><button className="button primary full" onClick={onNext}>{checkpoint.order === totalCheckpoints ? "Dokončit výpravu →" : "Odhalit další checkpoint →"}</button></div></div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Finish({ hintsUsed, totalCheckpoints, proofMode, setProofMode, photo, onPhoto, canvasRef, onPointerDown, onPointerMove, onPointerUp, onClear, onFinish }: {
  hintsUsed: number; totalCheckpoints: number; proofMode: "photo" | "signature" | "skip"; setProofMode: (mode: "photo" | "signature" | "skip") => void; photo: string | null; onPhoto: (event: ChangeEvent<HTMLInputElement>) => void; canvasRef: React.RefObject<HTMLCanvasElement | null>; onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void; onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void; onPointerUp: () => void; onClear: () => void; onFinish: () => void;
}) {
  return (
    <section className="finish-page">
      <div className="confetti"><i /><i /><i /><i /><i /><i /></div>
      <div className="finish-intro"><span className="finish-crown">♛</span><span className="eyebrow light"><span /> VÝPRAVA DOKONČENA</span><h1>Královo Pole<br /><em>už před tebou nic neskryje.</em></h1><p>Pět stop, čtyři kilometry a jedna zachráněná kronika. Dobrá práce, Kláro.</p></div>
      <div className="finish-stats"><div><small>Čas</small><b>1:34:12</b></div><div><small>Vzdálenost</small><b>4,1 km</b></div><div><small>Stopy</small><b>{totalCheckpoints} / {totalCheckpoints}</b></div><div><small>Nápovědy</small><b>{hintsUsed}</b></div></div>
      <div className="badge-award"><div className="big-badge"><span>♛</span><i>KRÁL<br />KRPOLE</i></div><div><span className="section-label">Nový odznak</span><h2>Král KrPole</h2><p>Za kompletní rozluštění pěti stop proměny Králova Pole.</p></div></div>
      <div className="proof-card">
        <div className="proof-heading"><div><span className="section-label">Zanech stopu</span><h2>Jak si výpravu zapamatuješ?</h2></div><p>Volitelné · zůstává jen v tomto zařízení</p></div>
        <div className="proof-tabs" role="group" aria-label="Forma památky z výpravy"><button aria-pressed={proofMode === "photo"} className={proofMode === "photo" ? "active" : ""} onClick={() => setProofMode("photo")}>▣ Selfie</button><button aria-pressed={proofMode === "signature"} className={proofMode === "signature" ? "active" : ""} onClick={() => setProofMode("signature")}>〽 Podpis</button><button aria-pressed={proofMode === "skip"} className={proofMode === "skip" ? "active" : ""} onClick={() => setProofMode("skip")}>Bez potvrzení</button></div>
        {proofMode === "photo" && <label className="photo-drop">{photo ? <img src={photo} alt="Lokální náhled selfie" /> : <><span>＋</span><b>Přidat vítěznou selfie</b><small>Fotka se nikam neodesílá</small></>}<input type="file" accept="image/*" capture="user" onChange={onPhoto} aria-label="Vybrat vítěznou selfie" /></label>}
        {proofMode === "signature" && <div className="signature-wrap"><p>Podpis je volitelný. Pokud kreslení nepoužíváš, zvol „Bez potvrzení“.</p><canvas ref={canvasRef} width="600" height="220" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="img" aria-label="Plocha pro volitelný digitální podpis kreslený prstem" /><button onClick={onClear}>Smazat podpis</button></div>}
        {proofMode === "skip" && <div className="skip-proof"><span>✓</span><p>Žádný problém. Výsledek a odznak se uloží i bez fotografie nebo podpisu.</p></div>}
        <div className="privacy-note">◎ V pilotu zůstává vše jen ve tvém prohlížeči. Nic neodesíláme ani nepoužíváme pro marketing.</div>
      </div>
      <button className="button cream finish-button" onClick={onFinish}>Uložit výpravu do profilu →</button>
    </section>
  );
}

function ActivityView({ activities }: { activities: Activity[] }) {
  const hasActivities = activities.length > 0;

  return (
    <section className="page section-wrap activity-page">
      <div className="page-heading"><span className="section-label">Tvůj pohyb městem</span><h1>Aktivita</h1><p>Každý krok má příběh. Tady jsou ty tvoje.</p></div>
      <div className="activity-summary"><div><small>Dokončené výpravy</small><b>{hasActivities ? "4,1 km" : "0 km"}</b><span>{hasActivities ? "První čtvrť je v městském pasu" : "První příběh na tebe teprve čeká"}</span></div><div className={`bar-chart ${hasActivities ? "" : "empty"}`}>{hasActivities ? [28, 46, 35, 64, 52, 88, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />) : <p>Po dokončení trasy tu uvidíš svůj přehled.</p>}</div></div>
      <div className="activity-list"><h2>Poslední výpravy</h2>{hasActivities ? activities.map((activity) => <article key={activity.id}><span className="activity-icon">↗</span><div><b>{activity.title}</b><small>{activity.date}</small></div><div className="activity-numbers"><span>{activity.distance}</span><span>{activity.time}</span><strong>Dokončeno</strong></div></article>) : <p className="empty-journal">Deník je zatím prázdný. Po první dokončené trase se sem uloží její vzdálenost a čas.</p>}</div>
    </section>
  );
}

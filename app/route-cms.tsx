"use client";

/* eslint-disable @next/next/no-img-element -- CMS previews user-managed Supabase images. */

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { googlePointUrl, mapyPointUrl } from "../lib/map-links";
import type { RoutePreschoolStatus, RouteStrollerStatus } from "../lib/route-suitability";
import type { AuthController } from "./product-sections";
import { RouteSuitabilityBadges } from "./route-suitability-badges";

type RouteLifecycle = "draft" | "review" | "testing" | "active" | "maintenance" | "retired";
type RouteAvailability = "active" | "coming" | "seasonal";
type CheckpointType = "online" | "physical" | "hybrid";
type MediaRole = "cover" | "public" | "field";

type CmsRoute = {
  id: string;
  city_id: string;
  city_name: string;
  district: string;
  title: string;
  tagline: string;
  description: string;
  price_czk: number;
  distance_km: number;
  duration_min: number;
  duration_max: number;
  stroller_status: RouteStrollerStatus;
  preschool_status: RoutePreschoolStatus;
  difficulty: string;
  availability: RouteAvailability;
  lifecycle: RouteLifecycle;
  version: string;
  team_min: number;
  team_max: number;
  audiences: string[];
  language: string;
  seasonality: string;
  available_from: string | null;
  available_to: string | null;
  accessibility_note: string;
  safety_note: string;
  field_notes: string;
  last_field_check: string | null;
  equipment: string[];
  hero_image_url: string | null;
  hero_image_alt: string | null;
  accent: string;
  map_x: number;
  map_y: number;
  assigned_to: string | null;
  updated_at: string;
};

type CmsCheckpoint = {
  id: string;
  route_id: string;
  position: number;
  title: string;
  short_title: string;
  latitude: number;
  longitude: number;
  checkpoint_type: CheckpointType;
  distance_from_previous_km: number;
  story: string;
  puzzle_prompt: string;
  accepted_answers: string[];
  hint_1: string;
  hint_2: string;
  fallback_prompt: string;
  fallback_answers: string[];
  fact: string;
  next_clue: string;
  map_x: number;
  map_y: number;
  internal_notes: string;
  updated_at: string;
};

type CmsSource = {
  id: string;
  route_id: string;
  checkpoint_id: string | null;
  title: string;
  url: string;
  verified_at: string | null;
  internal_note: string;
  sort_order: number;
};

type CmsMedia = {
  id: string;
  route_id: string;
  checkpoint_id: string | null;
  storage_path: string;
  public_url: string;
  media_role: MediaRole;
  alt_text: string;
  author_credit: string;
  license: string;
  sort_order: number;
  archived_at: string | null;
};

type MediaForm = {
  role: MediaRole;
  alt: string;
  author: string;
  license: string;
};

const emptyRoute: CmsRoute = {
  id: "",
  city_id: "brno",
  city_name: "Brno",
  district: "",
  title: "",
  tagline: "",
  description: "",
  price_czk: 449,
  distance_km: 0,
  duration_min: 60,
  duration_max: 90,
  stroller_status: "unknown",
  preschool_status: "unknown",
  difficulty: "Střední",
  availability: "coming",
  lifecycle: "draft",
  version: "0.1.0",
  team_min: 1,
  team_max: 5,
  audiences: ["adults", "couples", "friends"],
  language: "cs",
  seasonality: "year-round",
  available_from: null,
  available_to: null,
  accessibility_note: "",
  safety_note: "",
  field_notes: "",
  last_field_check: null,
  equipment: ["Nabitý telefon", "Pohodlné boty"],
  hero_image_url: null,
  hero_image_alt: null,
  accent: "orange",
  map_x: 50,
  map_y: 50,
  assigned_to: null,
  updated_at: "",
};

const lifecycleLabels: Record<RouteLifecycle, string> = {
  draft: "Koncept",
  review: "Ke kontrole",
  testing: "Testování",
  active: "Publikováno",
  maintenance: "Údržba",
  retired: "Vyřazeno",
};

const availabilityLabels: Record<RouteAvailability, string> = {
  active: "V prodeji",
  coming: "Připravujeme",
  seasonal: "Sezónní",
};

function slugify(value: string) {
  return value
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\s.,;:!?-]/g, "");
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function routeValidation(route: CmsRoute, checkpoints: CmsCheckpoint[], sources: CmsSource[], media: CmsMedia[]) {
  const issues: string[] = [];
  if (!route.id || !route.city_id || !route.district || !route.title || !route.tagline) issues.push("Doplň základní údaje a slug trasy.");
  if (!route.description) issues.push("Doplň prodejní a příběhový popis.");
  if (route.distance_km <= 0 || route.duration_min <= 0 || route.duration_max < route.duration_min) issues.push("Zkontroluj délku a časovou dotaci.");
  if (route.stroller_status === "unknown") issues.push("Ověř v terénu vhodnost trasy pro kočárek.");
  if (route.preschool_status === "unknown") issues.push("Rozhodni, zda je trasa vhodná pro předškolní děti.");
  if (route.team_min < 1 || route.team_max < route.team_min) issues.push("Zkontroluj velikost týmu.");
  if (!route.accessibility_note || !route.safety_note) issues.push("Doplň přístupnost a bezpečnost.");
  if (sources.filter((source) => source.checkpoint_id === null).length === 0) issues.push("Přidej alespoň jeden zdroj celé trasy.");
  if (checkpoints.length === 0) issues.push("Trasa zatím nemá žádný checkpoint.");
  checkpoints.forEach((checkpoint, index) => {
    const label = `Stopa ${index + 1}`;
    if (!checkpoint.title || !checkpoint.story || !checkpoint.puzzle_prompt) issues.push(`${label}: chybí název, příběh nebo zadání.`);
    if (checkpoint.accepted_answers.length === 0) issues.push(`${label}: chybí přijímaná odpověď.`);
    if (!checkpoint.hint_1 || !checkpoint.hint_2) issues.push(`${label}: musí mít dvě nápovědy.`);
    if (!checkpoint.fallback_prompt || checkpoint.fallback_answers.length === 0) issues.push(`${label}: chybí záložní zadání nebo odpověď.`);
    if (!checkpoint.fact || (index < checkpoints.length - 1 && !checkpoint.next_clue)) issues.push(`${label}: doplň odhalený fakt a další indicii.`);
    if (checkpoint.latitude < -90 || checkpoint.latitude > 90 || checkpoint.longitude < -180 || checkpoint.longitude > 180) issues.push(`${label}: souřadnice nejsou platné.`);
    if (!sources.some((source) => source.checkpoint_id === checkpoint.id)) issues.push(`${label}: historické tvrzení nemá přiřazený zdroj.`);
  });
  media.filter((item) => !item.archived_at && item.media_role !== "field").forEach((item) => {
    if (!item.alt_text.trim()) issues.push("Veřejná fotografie nemá alternativní text.");
  });
  return issues;
}

function dateValue(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

export function RouteCms({ auth, onMessage }: { auth: Pick<AuthController, "user" | "profile">; onMessage?: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [routes, setRoutes] = useState<CmsRoute[]>([]);
  const [route, setRoute] = useState<CmsRoute | null>(null);
  const [checkpoints, setCheckpoints] = useState<CmsCheckpoint[]>([]);
  const [checkpoint, setCheckpoint] = useState<CmsCheckpoint | null>(null);
  const [sources, setSources] = useState<CmsSource[]>([]);
  const [media, setMedia] = useState<CmsMedia[]>([]);
  const [screen, setScreen] = useState<"list" | "route" | "checkpoint">("list");
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<"all" | RouteLifecycle>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [answerTest, setAnswerTest] = useState("");
  const [mediaForm, setMediaForm] = useState<MediaForm>({ role: "public", alt: "", author: "", license: "" });

  const isSuperadmin = auth.profile?.role === "superadmin";

  const notify = useCallback((next: string) => {
    setMessage(next);
    onMessage?.(next);
  }, [onMessage]);

  const loadRoutes = useCallback(async () => {
    if (!supabase || !auth.user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("cms_routes").select("*").order("updated_at", { ascending: false });
    if (error) notify(`Trasy se nepodařilo načíst: ${error.message}`);
    setRoutes((data as CmsRoute[] | null) ?? []);
    setLoading(false);
  }, [auth.user, notify, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoutes(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRoutes]);

  async function loadRouteContent(routeId: string) {
    if (!supabase) return;
    const [{ data: checkpointData, error: checkpointError }, { data: sourceData, error: sourceError }, { data: mediaData, error: mediaError }] = await Promise.all([
      supabase.from("cms_checkpoints").select("*").eq("route_id", routeId).order("position"),
      supabase.from("cms_sources").select("*").eq("route_id", routeId).order("sort_order"),
      supabase.from("cms_media").select("*").eq("route_id", routeId).order("sort_order"),
    ]);
    const error = checkpointError ?? sourceError ?? mediaError;
    if (error) notify(`Obsah trasy se nepodařilo načíst: ${error.message}`);
    setCheckpoints((checkpointData as CmsCheckpoint[] | null) ?? []);
    setSources((sourceData as CmsSource[] | null) ?? []);
    const storedMedia = (mediaData as CmsMedia[] | null) ?? [];
    const signedMedia = await Promise.all(storedMedia.map(async (item) => {
      const { data: signed } = await supabase.storage.from("route-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, public_url: signed?.signedUrl ?? "" };
    }));
    setMedia(signedMedia);
  }

  async function openRoute(item: CmsRoute) {
    setRoute({ ...item });
    setCheckpoint(null);
    setScreen("route");
    setMessage("");
    await loadRouteContent(item.id);
  }

  function beginNewRoute() {
    const draft = { ...emptyRoute, assigned_to: auth.user?.id ?? null };
    setRoute(draft);
    setCheckpoints([]);
    setSources([]);
    setMedia([]);
    setCheckpoint(null);
    setScreen("route");
  }

  async function saveRoute(nextLifecycle?: RouteLifecycle) {
    if (!supabase || !route || !auth.user) return false;
    const id = route.id || slugify(`${route.city_id}-${route.district}-${route.title}`);
    if (!id) {
      notify("Nejdřív doplň město, městskou část a název trasy.");
      return false;
    }
    setBusy(true);
    const payload = { ...route, id, lifecycle: nextLifecycle ?? route.lifecycle, updated_at: new Date().toISOString() };
    const existing = routes.some((item) => item.id === id);
    const query = existing
      ? supabase.from("cms_routes").update(payload).eq("id", id)
      : supabase.from("cms_routes").insert(payload);
    const { data, error } = await query.select().single();
    setBusy(false);
    if (error) {
      notify(`Trasu se nepodařilo uložit: ${error.message}`);
      return false;
    }
    setRoute(data as CmsRoute);
    notify(nextLifecycle === "active" ? "Trasa byla publikována." : nextLifecycle === "review" ? "Trasa byla předána ke kontrole." : "Koncept trasy je uložený.");
    await loadRoutes();
    return true;
  }

  async function publishRoute() {
    if (!supabase || !route) return;
    if (!(await saveRoute())) return;
    setBusy(true);
    const { error } = await supabase.rpc("publish_cms_route", { p_route_id: route.id });
    setBusy(false);
    if (error) return notify(`Trasu se nepodařilo publikovat: ${error.message}`);
    notify("Trasa byla publikována jako neměnná verze a katalog je aktualizovaný.");
    await loadRoutes();
    const { data } = await supabase.from("cms_routes").select("*").eq("id", route.id).single();
    if (data) setRoute(data as CmsRoute);
  }

  function beginCheckpoint() {
    if (!route) return;
    const position = checkpoints.length + 1;
    setCheckpoint({
      id: `${route.id || "nova-trasa"}-stopa-${position}`,
      route_id: route.id,
      position,
      title: "",
      short_title: "",
      latitude: 49.2,
      longitude: 16.6,
      checkpoint_type: "hybrid",
      distance_from_previous_km: position === 1 ? 0 : 0.5,
      story: "",
      puzzle_prompt: "",
      accepted_answers: [],
      hint_1: "",
      hint_2: "",
      fallback_prompt: "",
      fallback_answers: [],
      fact: "",
      next_clue: "",
      map_x: 50,
      map_y: 50,
      internal_notes: "",
      updated_at: "",
    });
    setAnswerTest("");
    setScreen("checkpoint");
  }

  function openCheckpoint(item: CmsCheckpoint) {
    setCheckpoint({ ...item });
    setAnswerTest("");
    setScreen("checkpoint");
  }

  async function saveCheckpoint() {
    if (!supabase || !checkpoint || !route) return;
    if (!checkpoint.id.trim() || !checkpoint.title.trim()) return notify("Checkpoint potřebuje ID a název.");
    setBusy(true);
    const payload = { ...checkpoint, route_id: route.id, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("cms_checkpoints").upsert(payload).select().single();
    setBusy(false);
    if (error) return notify(`Checkpoint se nepodařilo uložit: ${error.message}`);
    setCheckpoint(data as CmsCheckpoint);
    notify("Checkpoint je uložený.");
    await loadRouteContent(route.id);
  }

  async function moveCheckpoint(item: CmsCheckpoint, direction: -1 | 1) {
    if (!supabase || !route) return;
    const ordered = [...checkpoints].sort((a, b) => a.position - b.position);
    const currentIndex = ordered.findIndex((candidate) => candidate.id === item.id);
    const other = ordered[currentIndex + direction];
    if (!other) return;
    setBusy(true);
    const { error } = await supabase.rpc("reorder_cms_checkpoint", {
      p_route_id: route.id,
      p_checkpoint_id: item.id,
      p_new_position: other.position,
    });
    setBusy(false);
    if (error) return notify(`Pořadí se nepodařilo změnit: ${error.message}`);
    await loadRouteContent(route.id);
  }

  async function removeCheckpoint(item: CmsCheckpoint) {
    if (!supabase || !route || route.lifecycle !== "draft") return;
    if (!window.confirm(`Opravdu odstranit checkpoint „${item.title}“ z konceptu?`)) return;
    const { error } = await supabase.from("cms_checkpoints").delete().eq("id", item.id).eq("route_id", route.id);
    if (error) return notify(`Checkpoint se nepodařilo odstranit: ${error.message}`);
    notify("Checkpoint byl odstraněn z konceptu.");
    await loadRouteContent(route.id);
  }

  async function addSource(checkpointId: string | null) {
    if (!supabase || !route) return;
    const draft: Omit<CmsSource, "id"> = {
      route_id: route.id,
      checkpoint_id: checkpointId,
      title: "Nový zdroj",
      url: "https://",
      verified_at: null,
      internal_note: "",
      sort_order: sources.filter((item) => item.checkpoint_id === checkpointId).length,
    };
    const { data, error } = await supabase.from("cms_sources").insert(draft).select().single();
    if (error) return notify(`Zdroj se nepodařilo přidat: ${error.message}`);
    setSources((current) => [...current, data as CmsSource]);
  }

  async function saveSource(item: CmsSource) {
    if (!supabase) return;
    const { error } = await supabase.from("cms_sources").update({ title: item.title, url: item.url, verified_at: item.verified_at || null, internal_note: item.internal_note, sort_order: item.sort_order }).eq("id", item.id);
    notify(error ? `Zdroj se nepodařilo uložit: ${error.message}` : "Zdroj je uložený.");
  }

  async function removeSource(item: CmsSource) {
    if (!supabase || !route || route.lifecycle !== "draft") return;
    if (!window.confirm(`Odstranit zdroj „${item.title}“?`)) return;
    const { error } = await supabase.from("cms_sources").delete().eq("id", item.id);
    if (error) return notify(`Zdroj se nepodařilo odstranit: ${error.message}`);
    setSources((current) => current.filter((source) => source.id !== item.id));
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>, checkpointId: string | null) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !supabase || !route || !auth.user) return;
    if (file.size > 8 * 1024 * 1024) return notify("Fotografie může mít nejvýše 8 MB.");
    if (!file.type.startsWith("image/")) return notify("Nahraj prosím obrázek.");
    if (mediaForm.role !== "field" && !mediaForm.alt.trim()) return notify("Veřejná fotografie potřebuje alternativní text.");
    const safeName = file.name.toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const path = `${route.id}/${checkpointId ?? "route"}/${crypto.randomUUID()}-${safeName}`;
    setBusy(true);
    const { error: uploadError } = await supabase.storage.from("route-media").upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) {
      setBusy(false);
      return notify(`Fotografii se nepodařilo nahrát: ${uploadError.message}`);
    }
    const { data: previewData } = await supabase.storage.from("route-media").createSignedUrl(path, 3600);
    const { data, error } = await supabase.from("cms_media").insert({
      route_id: route.id,
      checkpoint_id: checkpointId,
      storage_path: path,
      public_url: "",
      media_role: mediaForm.role,
      alt_text: mediaForm.alt,
      author_credit: mediaForm.author,
      license: mediaForm.license,
      sort_order: media.filter((item) => item.checkpoint_id === checkpointId && !item.archived_at).length,
      created_by: auth.user.id,
    }).select().single();
    setBusy(false);
    if (error) {
      await supabase.storage.from("route-media").remove([path]);
      return notify(`Metadata fotografie se nepodařilo uložit: ${error.message}`);
    }
    setMedia((current) => [...current, { ...(data as CmsMedia), public_url: previewData?.signedUrl ?? "" }]);
    setMediaForm({ role: "public", alt: "", author: "", license: "" });
    notify("Fotografie je nahraná.");
  }

  async function archiveMedia(item: CmsMedia) {
    if (!supabase) return;
    const archivedAt = new Date().toISOString();
    const { error } = await supabase.from("cms_media").update({ archived_at: archivedAt }).eq("id", item.id);
    if (error) return notify(`Fotografii se nepodařilo archivovat: ${error.message}`);
    setMedia((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, archived_at: archivedAt } : candidate));
    notify("Fotografie je archivovaná; soubor nebyl fyzicky smazán.");
  }

  const filteredRoutes = routes.filter((item) => {
    const haystack = `${item.city_name} ${item.district} ${item.title}`.toLocaleLowerCase("cs");
    return haystack.includes(search.toLocaleLowerCase("cs")) && (lifecycleFilter === "all" || item.lifecycle === lifecycleFilter);
  });

  if (!auth.user || (auth.profile?.role !== "route_manager" && auth.profile?.role !== "superadmin")) {
    return <section className="cms-empty"><h2>Správa tras</h2><p>Pro vstup potřebuješ roli správce trasy.</p></section>;
  }

  if (screen === "list") {
    return (
      <section className="cms-workspace cms-route-list">
        <header className="cms-heading">
          <div><span className="section-label">Obsah tras</span><h2>Trasy a městské části</h2><p>Koncepty, terénní kontrola a publikace na jednom místě.</p></div>
          {isSuperadmin && <button className="button primary" onClick={beginNewRoute}>＋ Nová trasa</button>}
        </header>
        {message && <p className="cms-message" role="status">{message}</p>}
        <div className="cms-toolbar">
          <label><span>Hledat</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Název, město nebo čtvrť" /></label>
          <label><span>Publikační stav</span><select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value as "all" | RouteLifecycle)}><option value="all">Všechny stavy</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {loading ? <p>Načítám trasy…</p> : filteredRoutes.length === 0 ? <div className="cms-empty"><h3>Žádná trasa neodpovídá filtru</h3><p>Změň hledání nebo založ první koncept.</p></div> : <div className="cms-route-cards">{filteredRoutes.map((item) => <article key={item.id} className="cms-route-card"><div><span className={`cms-status cms-${item.lifecycle}`}>{lifecycleLabels[item.lifecycle]}</span><span className="cms-availability">{availabilityLabels[item.availability]}</span></div><small>{item.city_name} · {item.district}</small><h3>{item.title}</h3><p>{item.tagline}</p><RouteSuitabilityBadges strollerStatus={item.stroller_status} preschoolStatus={item.preschool_status} durationMaxMinutes={item.duration_max} compact /><dl><div><dt>Verze</dt><dd>{item.version}</dd></div><div><dt>Poslední změna</dt><dd>{item.updated_at ? new Date(item.updated_at).toLocaleDateString("cs-CZ") : "—"}</dd></div></dl><button className="button secondary" onClick={() => void openRoute(item)}>Otevřít editor →</button></article>)}</div>}
      </section>
    );
  }

  if (!route) return null;
  const validation = routeValidation(route, checkpoints, sources, media);

  if (screen === "checkpoint" && checkpoint) {
    const checkpointSources = sources.filter((source) => source.checkpoint_id === checkpoint.id);
    const checkpointMedia = media.filter((item) => item.checkpoint_id === checkpoint.id && !item.archived_at);
    const answerMatches = answerTest.trim().length > 0 && checkpoint.accepted_answers.some((accepted) => normalizeAnswer(accepted) === normalizeAnswer(answerTest));
    return (
      <section className="cms-workspace cms-editor">
        <header className="cms-editor-heading"><button className="cms-back" onClick={() => setScreen("route")}>← {route.title || "Trasa"}</button><div><span className="section-label">Checkpoint {checkpoint.position} z {Math.max(checkpoints.length, checkpoint.position)}</span><h2>{checkpoint.title || "Nový checkpoint"}</h2></div><button className="button primary" onClick={() => void saveCheckpoint()} disabled={busy}>{busy ? "Ukládám…" : "Uložit checkpoint"}</button></header>
        {message && <p className="cms-message" role="status">{message}</p>}
        <div className="cms-editor-grid"><div className="cms-form-stack">
          <details open className="cms-form-section"><summary>Místo a poloha</summary><div className="cms-fields"><label>ID checkpointu<input value={checkpoint.id} onChange={(event) => setCheckpoint({ ...checkpoint, id: slugify(event.target.value) })} disabled={checkpoints.some((item) => item.id === checkpoint.id)} /></label><label>Název<input value={checkpoint.title} onChange={(event) => setCheckpoint({ ...checkpoint, title: event.target.value })} /></label><label>Krátký název místa<input value={checkpoint.short_title} onChange={(event) => setCheckpoint({ ...checkpoint, short_title: event.target.value })} /></label><label>Typ stopy<select value={checkpoint.checkpoint_type} onChange={(event) => setCheckpoint({ ...checkpoint, checkpoint_type: event.target.value as CheckpointType })}><option value="online">Online</option><option value="physical">Fyzická</option><option value="hybrid">Hybridní</option></select></label><label>Zeměpisná šířka<input type="number" step="0.000001" value={checkpoint.latitude} onChange={(event) => setCheckpoint({ ...checkpoint, latitude: Number(event.target.value) })} /></label><label>Zeměpisná délka<input type="number" step="0.000001" value={checkpoint.longitude} onChange={(event) => setCheckpoint({ ...checkpoint, longitude: Number(event.target.value) })} /></label><label>Km od předchozího bodu<input type="number" min="0" step="0.1" value={checkpoint.distance_from_previous_km} onChange={(event) => setCheckpoint({ ...checkpoint, distance_from_previous_km: Number(event.target.value) })} /></label></div><div className="cms-map-links"><a className="cms-map-link" href={mapyPointUrl({ lat: checkpoint.latitude, lng: checkpoint.longitude })} target="_blank" rel="noreferrer">Zkontrolovat v Mapy.com ↗</a><a className="cms-map-link" href={googlePointUrl({ lat: checkpoint.latitude, lng: checkpoint.longitude })} target="_blank" rel="noreferrer">Zkontrolovat v Google Maps ↗</a></div></details>
          <details open className="cms-form-section"><summary>Příběh a šifra</summary><label>Úvod příběhu<textarea rows={5} value={checkpoint.story} onChange={(event) => setCheckpoint({ ...checkpoint, story: event.target.value })} /></label><label>Zadání šifry<textarea rows={5} value={checkpoint.puzzle_prompt} onChange={(event) => setCheckpoint({ ...checkpoint, puzzle_prompt: event.target.value })} /></label><label>Přijímané odpovědi <small>oddělené čárkou</small><input value={checkpoint.accepted_answers.join(", ")} onChange={(event) => setCheckpoint({ ...checkpoint, accepted_answers: csv(event.target.value) })} /></label><div className="cms-answer-test"><label>Tester odpovědi<input value={answerTest} onChange={(event) => setAnswerTest(event.target.value)} placeholder="Zkus odpověď jako hráč" /></label>{answerTest && <span className={answerMatches ? "valid" : "invalid"}>{answerMatches ? "✓ Odpověď projde" : "× Odpověď neprojde"}</span>}</div><label>Nápověda 1<textarea rows={3} value={checkpoint.hint_1} onChange={(event) => setCheckpoint({ ...checkpoint, hint_1: event.target.value })} /></label><label>Nápověda 2<textarea rows={3} value={checkpoint.hint_2} onChange={(event) => setCheckpoint({ ...checkpoint, hint_2: event.target.value })} /></label></details>
          <details open className="cms-form-section"><summary>Záložní zadání</summary><label>Otázka při nedostupném místě<textarea rows={4} value={checkpoint.fallback_prompt} onChange={(event) => setCheckpoint({ ...checkpoint, fallback_prompt: event.target.value })} /></label><label>Přijímané odpovědi <small>oddělené čárkou</small><input value={checkpoint.fallback_answers.join(", ")} onChange={(event) => setCheckpoint({ ...checkpoint, fallback_answers: csv(event.target.value) })} /></label></details>
          <details open className="cms-form-section"><summary>Odhalení a další stopa</summary><label>Odhalená zajímavost<textarea rows={5} value={checkpoint.fact} onChange={(event) => setCheckpoint({ ...checkpoint, fact: event.target.value })} /></label><label>Indicie k dalšímu bodu<textarea rows={4} value={checkpoint.next_clue} onChange={(event) => setCheckpoint({ ...checkpoint, next_clue: event.target.value })} /></label><label>Interní terénní poznámky<textarea rows={4} value={checkpoint.internal_notes} onChange={(event) => setCheckpoint({ ...checkpoint, internal_notes: event.target.value })} /></label></details>
          <SourceEditor sources={checkpointSources} onChange={(next) => setSources((current) => current.map((item) => item.id === next.id ? next : item))} onAdd={() => void addSource(checkpoint.id)} onSave={(item) => void saveSource(item)} onRemove={(item) => void removeSource(item)} canRemove={route.lifecycle === "draft"} />
          <MediaEditor items={checkpointMedia} form={mediaForm} onForm={setMediaForm} onUpload={(event) => void uploadMedia(event, checkpoint.id)} onArchive={(item) => void archiveMedia(item)} busy={busy} />
        </div><aside className="cms-side-panel"><span className="section-label">Rychlá kontrola</span><h3>{checkpoint.title || "Nová stopa"}</h3><ul><li className={checkpoint.story ? "done" : ""}>Příběh</li><li className={checkpoint.puzzle_prompt && checkpoint.accepted_answers.length > 0 ? "done" : ""}>Šifra a odpověď</li><li className={checkpoint.hint_1 && checkpoint.hint_2 ? "done" : ""}>Dvě nápovědy</li><li className={checkpoint.fallback_prompt && checkpoint.fallback_answers.length > 0 ? "done" : ""}>Záložní varianta</li><li className={checkpoint.fact ? "done" : ""}>Odhalená zajímavost</li><li className={checkpointSources.length > 0 ? "done" : ""}>Zdroj tvrzení</li></ul></aside></div>
      </section>
    );
  }

  const routeSources = sources.filter((source) => source.checkpoint_id === null);
  const routeMedia = media.filter((item) => item.checkpoint_id === null && !item.archived_at);
  return (
    <section className="cms-workspace cms-editor">
      <header className="cms-editor-heading"><button className="cms-back" onClick={() => { setScreen("list"); void loadRoutes(); }}>← Všechny trasy</button><div><span className={`cms-status cms-${route.lifecycle}`}>{lifecycleLabels[route.lifecycle]}</span><h2>{route.title || "Nová trasa"}</h2><p>{route.city_name} · {route.district || "bez městské části"}</p></div><button className="button primary" onClick={() => void saveRoute()} disabled={busy}>{busy ? "Ukládám…" : "Uložit koncept"}</button></header>
      {message && <p className="cms-message" role="status">{message}</p>}
      <div className="cms-editor-grid"><div className="cms-form-stack">
        <details open className="cms-form-section"><summary>Základ trasy</summary><div className="cms-fields"><label>Slug / ID<input value={route.id} onChange={(event) => setRoute({ ...route, id: slugify(event.target.value) })} placeholder="brno-kralovo-pole-stopy" disabled={routes.some((item) => item.id === route.id)} /></label><label>Město<input value={route.city_name} onChange={(event) => setRoute({ ...route, city_name: event.target.value, city_id: slugify(event.target.value) })} /></label><label>Městská část / lokalita<input value={route.district} onChange={(event) => setRoute({ ...route, district: event.target.value })} /></label><label>Název<input value={route.title} onChange={(event) => setRoute({ ...route, title: event.target.value })} /></label><label className="cms-wide">Podtitulek<input value={route.tagline} onChange={(event) => setRoute({ ...route, tagline: event.target.value })} /></label><label className="cms-wide">Příběh a popis<textarea rows={6} value={route.description} onChange={(event) => setRoute({ ...route, description: event.target.value })} /></label></div></details>
        <details open className="cms-form-section"><summary>Parametry výpravy</summary><div className="cms-fields"><label>Délka (km)<input type="number" min="0" step="0.1" value={route.distance_km} onChange={(event) => setRoute({ ...route, distance_km: Number(event.target.value) })} /></label><label>Čas od (min)<input type="number" min="1" value={route.duration_min} onChange={(event) => setRoute({ ...route, duration_min: Number(event.target.value) })} /></label><label>Čas do (min)<input type="number" min="1" value={route.duration_max} onChange={(event) => setRoute({ ...route, duration_max: Number(event.target.value) })} /></label><label>Obtížnost<select value={route.difficulty} onChange={(event) => setRoute({ ...route, difficulty: event.target.value })}><option>Lehká</option><option>Střední</option><option>Těžká</option></select></label><label>Hráčů od<input type="number" min="1" value={route.team_min} onChange={(event) => setRoute({ ...route, team_min: Number(event.target.value) })} /></label><label>Hráčů do<input type="number" min="1" value={route.team_max} onChange={(event) => setRoute({ ...route, team_max: Number(event.target.value) })} /></label><label>Vybavení <small>oddělené čárkou</small><input value={route.equipment.join(", ")} onChange={(event) => setRoute({ ...route, equipment: csv(event.target.value) })} /></label><label>Publikum <small>oddělené čárkou</small><input value={route.audiences.join(", ")} onChange={(event) => setRoute({ ...route, audiences: csv(event.target.value) })} /></label></div></details>
        <details open className="cms-form-section"><summary>Prodej a dostupnost</summary><div className="cms-fields"><label>Cena za tým (Kč)<input type="number" min="0" value={route.price_czk} onChange={(event) => setRoute({ ...route, price_czk: Number(event.target.value) })} disabled={!isSuperadmin} /></label><label>Dostupnost<select value={route.availability} onChange={(event) => setRoute({ ...route, availability: event.target.value as RouteAvailability })} disabled={!isSuperadmin}><option value="active">V prodeji</option><option value="coming">Připravujeme</option><option value="seasonal">Sezónní</option></select></label><label>Dostupné od<input type="date" value={dateValue(route.available_from)} onChange={(event) => setRoute({ ...route, available_from: event.target.value || null })} /></label><label>Dostupné do<input type="date" value={dateValue(route.available_to)} onChange={(event) => setRoute({ ...route, available_to: event.target.value || null })} /></label><label>Verze<input value={route.version} onChange={(event) => setRoute({ ...route, version: event.target.value })} /></label><label>Sezónnost<select value={route.seasonality} onChange={(event) => setRoute({ ...route, seasonality: event.target.value })}><option value="year-round">Celoročně</option><option value="seasonal">Sezónní</option></select></label></div>{!isSuperadmin && <p className="cms-help">Cenu a prodejní dostupnost může změnit pouze superadmin.</p>}</details>
        <details open className="cms-form-section"><summary>Bezpečnost a terén</summary><div className="cms-fields"><label>Kočárek<select value={route.stroller_status} onChange={(event) => setRoute({ ...route, stroller_status: event.target.value as RouteStrollerStatus })}><option value="unknown">Nutno ověřit</option><option value="verified">Ano, terénně ověřeno</option><option value="not_recommended">Nedoporučeno</option></select></label><label>Předškolní děti<select value={route.preschool_status} onChange={(event) => setRoute({ ...route, preschool_status: event.target.value as RoutePreschoolStatus })}><option value="unknown">Nutno ověřit</option><option value="suitable">Vhodné</option><option value="with_adult">Vhodné s aktivním doprovodem</option><option value="not_recommended">Nedoporučeno</option></select></label><label>Poslední fyzická kontrola<input type="date" value={dateValue(route.last_field_check)} onChange={(event) => setRoute({ ...route, last_field_check: event.target.value || null })} /></label></div><RouteSuitabilityBadges strollerStatus={route.stroller_status} preschoolStatus={route.preschool_status} durationMaxMinutes={route.duration_max} /><label>Přístupnost<textarea rows={4} value={route.accessibility_note} onChange={(event) => setRoute({ ...route, accessibility_note: event.target.value })} /></label><label>Bezpečnostní poznámka<textarea rows={4} value={route.safety_note} onChange={(event) => setRoute({ ...route, safety_note: event.target.value })} /></label><label>Interní terénní poznámky<textarea rows={4} value={route.field_notes} onChange={(event) => setRoute({ ...route, field_notes: event.target.value })} /></label></details>
        <section className="cms-form-section cms-checkpoint-list"><header><div><span className="section-label">Průběh výpravy</span><h3>Checkpointy</h3></div><button className="button secondary" onClick={beginCheckpoint} disabled={!route.id}>＋ Přidat checkpoint</button></header>{!route.id && <p className="cms-help">Nejdřív ulož novou trasu; potom můžeš přidat její checkpointy.</p>}{checkpoints.length === 0 ? <p>Trasa zatím nemá žádné checkpointy.</p> : checkpoints.map((item, index) => <article key={item.id}><span>{String(item.position).padStart(2, "0")}</span><div><b>{item.title}</b><small>{item.short_title} · {item.checkpoint_type}</small></div><div className="cms-order-actions"><button aria-label="Posunout nahoru" disabled={index === 0 || busy} onClick={() => void moveCheckpoint(item, -1)}>↑</button><button aria-label="Posunout dolů" disabled={index === checkpoints.length - 1 || busy} onClick={() => void moveCheckpoint(item, 1)}>↓</button></div><button onClick={() => openCheckpoint(item)}>Upravit</button><button className="cms-danger-link" disabled={route.lifecycle !== "draft"} onClick={() => void removeCheckpoint(item)}>Odstranit</button></article>)}</section>
        <SourceEditor sources={routeSources} onChange={(next) => setSources((current) => current.map((item) => item.id === next.id ? next : item))} onAdd={() => void addSource(null)} onSave={(item) => void saveSource(item)} onRemove={(item) => void removeSource(item)} canRemove={route.lifecycle === "draft"} />
        <MediaEditor items={routeMedia} form={mediaForm} onForm={setMediaForm} onUpload={(event) => void uploadMedia(event, null)} onArchive={(item) => void archiveMedia(item)} busy={busy} />
      </div><aside className="cms-side-panel"><span className="section-label">Kontrola a publikace</span><h3>{validation.length === 0 ? "Připraveno ke kontrole" : `${validation.length} bodů k doplnění`}</h3>{validation.length === 0 ? <p className="cms-valid">✓ Automatická kontrola je v pořádku. Před publikací ještě trasu projdi v terénu.</p> : <ul className="cms-validation-list">{validation.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}<div className="cms-publish-actions">{isSuperadmin ? <button className="button primary full" disabled={validation.length > 0 || busy} onClick={() => void publishRoute()}>Publikovat trasu</button> : <button className="button primary full" disabled={validation.length > 0 || busy} onClick={() => void saveRoute("review")}>Předat ke kontrole</button>}<small>Publikace vytvoří neměnný snapshot verze, takže rozehrané výpravy nezmění rozpracovaný koncept.</small></div></aside></div>
    </section>
  );
}

function SourceEditor({ sources, onChange, onAdd, onSave, onRemove, canRemove }: { sources: CmsSource[]; onChange: (source: CmsSource) => void; onAdd: () => void; onSave: (source: CmsSource) => void; onRemove: (source: CmsSource) => void; canRemove: boolean }) {
  return <section className="cms-form-section cms-source-editor"><header><div><span className="section-label">Ověřitelnost</span><h3>Zdroje</h3></div><button className="button secondary" onClick={onAdd}>＋ Přidat zdroj</button></header>{sources.length === 0 ? <p>Žádný zdroj zatím není přiřazený.</p> : sources.map((source) => <article key={source.id}><label>Název<input value={source.title} onChange={(event) => onChange({ ...source, title: event.target.value })} /></label><label>URL<input type="url" value={source.url} onChange={(event) => onChange({ ...source, url: event.target.value })} /></label><label>Ověřeno<input type="date" value={dateValue(source.verified_at)} onChange={(event) => onChange({ ...source, verified_at: event.target.value || null })} /></label><label>Interní poznámka<input value={source.internal_note} onChange={(event) => onChange({ ...source, internal_note: event.target.value })} /></label><div><button onClick={() => onSave(source)}>Uložit zdroj</button><button className="cms-danger-link" disabled={!canRemove} onClick={() => onRemove(source)}>Odstranit</button></div></article>)}</section>;
}

function MediaEditor({ items, form, onForm, onUpload, onArchive, busy }: { items: CmsMedia[]; form: MediaForm; onForm: (form: MediaForm) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onArchive: (item: CmsMedia) => void; busy: boolean }) {
  return <section className="cms-form-section cms-media-editor"><header><div><span className="section-label">Fotografie</span><h3>Média</h3></div></header><div className="cms-media-upload"><label>Účel<select value={form.role} onChange={(event) => onForm({ ...form, role: event.target.value as MediaRole })}><option value="cover">Titulní</option><option value="public">Veřejná ve hře</option><option value="field">Interní terénní</option></select></label><label>Alternativní text<input value={form.alt} onChange={(event) => onForm({ ...form, alt: event.target.value })} required={form.role !== "field"} /></label><label>Autor / zdroj<input value={form.author} onChange={(event) => onForm({ ...form, author: event.target.value })} /></label><label>Licence<input value={form.license} onChange={(event) => onForm({ ...form, license: event.target.value })} /></label><label className="button secondary cms-file-button">{busy ? "Nahrávám…" : "Vybrat a nahrát obrázek"}<input type="file" accept="image/*" onChange={onUpload} disabled={busy} /></label><small>JPEG, PNG nebo WebP · nejvýše 8 MB. Interní fotografie se hráčům nezobrazí.</small></div>{items.length > 0 && <div className="cms-media-grid">{items.map((item) => <article key={item.id}><img src={item.public_url} alt={item.alt_text || "Interní terénní fotografie"} /><div><span>{item.media_role === "cover" ? "Titulní" : item.media_role === "field" ? "Interní" : "Veřejná"}</span><b>{item.alt_text || "Bez veřejného popisu"}</b><small>{[item.author_credit, item.license].filter(Boolean).join(" · ") || "Autor a licence neuvedeny"}</small><button onClick={() => onArchive(item)}>Archivovat</button></div></article>)}</div>}</section>;
}

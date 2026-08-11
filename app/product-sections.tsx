"use client";

import QRCode from "qrcode";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase/client";

export type UserRole = "user" | "route_manager" | "superadmin";

export type AppProfile = {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  home_city: string | null;
  bio: string | null;
  role: UserRole;
  xp: number;
  created_at: string;
};

export type RouteSummary = {
  id: string;
  district: string;
  title: string;
  tagline: string;
  price: number;
  distance: number;
  duration: string;
  difficulty: string;
  checkpoints: number;
  status: "active" | "coming" | "seasonal";
  accent: string;
  available?: string;
  xpReward: number;
  mapX: number;
  mapY: number;
};

export type AuthController = {
  session: Session | null;
  user: User | null;
  profile: AppProfile | null;
  loading: boolean;
  recoveryMode: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const LEVELS = [
  { level: 1, name: "Nováček", minXp: 0, icon: "·", unlock: "Profil a první trasa" },
  { level: 2, name: "Stopař", minXp: 350, icon: "⌖", unlock: "Osobní statistiky" },
  { level: 3, name: "Luštitel", minXp: 900, icon: "◇", unlock: "První profilový odznak" },
  { level: 4, name: "Průzkumník", minXp: 1700, icon: "↗", unlock: "Žebříček městské části" },
  { level: 5, name: "Kronikář", minXp: 2800, icon: "#", unlock: "Bonusová historická stopa" },
  { level: 6, name: "Městochodec", minXp: 4300, icon: "◎", unlock: "Pokročilé výzvy" },
  { level: 7, name: "Šifrant", minXp: 6200, icon: "△", unlock: "Speciální sezónní trasy" },
  { level: 8, name: "Lovec příběhů", minXp: 8600, icon: "✦", unlock: "Prémiový profilový rámeček" },
  { level: 9, name: "Mistr stop", minXp: 11500, icon: "♜", unlock: "Přednostní přístup k novinkám" },
  { level: 10, name: "Legenda města", minXp: 15000, icon: "★", unlock: "Legendární odznak a titul" },
] as const;

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "Hráč";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function currentLevel(xp: number) {
  return [...LEVELS].reverse().find((item) => xp >= item.minXp) ?? LEVELS[0];
}

export function useSifrovanaAuth(): AuthController {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(() => isSupabaseConfigured());
  const [recoveryMode, setRecoveryMode] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const loadProfile = useCallback(async (user: User | null) => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile((data as AppProfile | null) ?? null);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setRecoveryMode(event === "PASSWORD_RECOVERY");
      window.setTimeout(() => void loadProfile(nextSession?.user ?? null), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, supabase]);

  return {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    recoveryMode,
    refreshProfile: () => loadProfile(session?.user ?? null),
    signOut: async () => {
      if (supabase) await supabase.auth.signOut();
      setProfile(null);
    },
  };
}

type AuthMode = "signin" | "signup" | "reset" | "update";

export function AuthModal({ auth, initialMode = "signin", onClose, onAuthenticated }: { auth: AuthController; initialMode?: "signin" | "signup"; onClose: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>(auth.recoveryMode ? "update" : initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return setMessage("Přihlášení ještě není nakonfigurované.");
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthenticated();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) onAuthenticated();
        else setMessage("Účet je založený. Potvrď prosím odkaz, který jsme poslali e-mailem.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?auth=reset` });
        if (error) throw error;
        setMessage("Odkaz pro nastavení nového hesla jsme poslali e-mailem.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Heslo bylo změněno.");
        setMode("signin");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Akci se nepodařilo dokončit.");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(`${provider === "google" ? "Google" : "Apple"} přihlášení čeká na doplnění OAuth klíčů.`);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Zavřít">×</button>
        <span className="modal-symbol">Š</span>
        <span className="section-label">Skutečný účet</span>
        <h2 id="auth-title">{mode === "signin" ? "Vítej zpátky ve hře" : mode === "signup" ? "Zapiš se do kroniky" : mode === "reset" ? "Obnov si přístup" : "Nastav nové heslo"}</h2>
        <p>{mode === "signup" ? "Účet uloží postup, XP, zakoupené trasy i odznaky." : "Přihlášení je zabezpečené a heslo aplikace nikdy neukládá."}</p>
        {!isSupabaseConfigured() && <p className="form-message error">Chybí připojení autentizační služby.</p>}
        <form onSubmit={submit}>
          {mode === "signup" && <label>Jméno<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}
          {mode !== "update" && <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>}
          {mode !== "reset" && <label>Heslo<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required /></label>}
          {message && <p className="form-message">{message}</p>}
          <button className="button primary full" disabled={busy}>{busy ? "Pracuji…" : mode === "signin" ? "Přihlásit se →" : mode === "signup" ? "Vytvořit účet →" : mode === "reset" ? "Poslat obnovu →" : "Uložit nové heslo →"}</button>
        </form>
        {(mode === "signin" || mode === "signup") && <>
          <div className="auth-divider"><span>nebo</span></div>
          <div className="social-login"><button onClick={() => oauth("google")} disabled={busy}>G&nbsp; Pokračovat přes Google</button><button onClick={() => oauth("apple")} disabled={busy}>●&nbsp; Pokračovat přes Apple</button></div>
        </>}
        <div className="auth-switches">
          {mode === "signin" ? <><button onClick={() => setMode("signup")}>Nemám účet</button><button onClick={() => setMode("reset")}>Zapomenuté heslo</button></> : <button onClick={() => setMode("signin")}>Zpět k přihlášení</button>}
        </div>
      </div>
    </div>
  );
}

export function CheckoutModal({ auth, kind, route, routes, onClose, onCreated }: {
  auth: AuthController;
  kind: "route" | "bundle" | "full";
  route: RouteSummary;
  routes: RouteSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<{ variableSymbol: string; qr: string | null } | null>(null);
  const price = kind === "route" ? 250 : kind === "bundle" ? 500 : Math.round(routes.length * 250 * 0.5);
  const selectedRoutes = kind === "route" ? [route.id] : kind === "bundle" ? routes.slice(0, 3).map((item) => item.id) : routes.map((item) => item.id);
  const title = kind === "route" ? `${route.district}: ${route.title}` : kind === "bundle" ? "Balíček 3 tras" : `Celé Brno · ${routes.length} tras`;

  async function createOrder() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !auth.user) return;
    setBusy(true);
    setError("");
    const variableSymbol = `${Date.now()}`.slice(-8) + Math.floor(Math.random() * 90 + 10);
    const { error: insertError } = await supabase.from("orders").insert({
      user_id: auth.user.id,
      package_type: kind === "route" ? "single" : kind === "bundle" ? "trio" : "full_city",
      route_ids: selectedRoutes,
      amount_czk: price,
      variable_symbol: variableSymbol,
      status: "pending",
    });
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }

    const iban = process.env.NEXT_PUBLIC_PAYMENT_IBAN?.replace(/\s/g, "");
    let qr: string | null = null;
    if (iban) {
      const spd = `SPD*1.0*ACC:${iban}*AM:${price.toFixed(2)}*CC:CZK*X-VS:${variableSymbol}*MSG:SIFROVANA`;
      qr = await QRCode.toDataURL(spd, { margin: 1, width: 280, color: { dark: "#0e3b3a", light: "#fffdf7" } });
    }
    setOrder({ variableSymbol, qr });
    setBusy(false);
    onCreated();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <button className="modal-close" onClick={onClose} aria-label="Zavřít">×</button>
        <span className="section-label">QR platba</span><h2 id="checkout-title">{order ? "Objednávka čeká na platbu" : "Ještě jeden krok a vyrážíš"}</h2>
        {!order ? <>
          <div className="checkout-item"><span>{kind === "route" ? "01" : kind === "bundle" ? "3×" : `${routes.length}×`}</span><div><small>{kind === "route" ? "TRASA" : "BALÍČEK"}</small><b>{title}</b><p>{selectedRoutes.length} {selectedRoutes.length === 1 ? "trasa" : selectedRoutes.length < 5 ? "trasy" : "tras"}</p></div><strong>{price} Kč</strong></div>
          <div className="checkout-total"><span>Celkem</span><strong>{price} Kč</strong></div>
          {error && <p className="form-message error">{error}</p>}
          <button className="button primary full" onClick={createOrder} disabled={busy}>{busy ? "Vytvářím objednávku…" : "Vygenerovat QR platbu →"}</button>
        </> : <div className="qr-payment">
          {order.qr ? <img src={order.qr} alt={`QR platba ${price} Kč, variabilní symbol ${order.variableSymbol}`} /> : <div className="qr-placeholder"><b>QR bude aktivní po doplnění účtu</b><small>V administraci hostingu chybí veřejný IBAN příjemce.</small></div>}
          <div><small>Částka</small><b>{price} Kč</b><small>Variabilní symbol</small><b>{order.variableSymbol}</b></div>
          <p>Po odeslání platby ji superadmin zkontroluje a odemkne zakoupené trasy.</p>
          <button className="button primary full" onClick={onClose}>Hotovo</button>
        </div>}
      </div>
    </div>
  );
}

export function CityRouteMap({ routes, onBuy }: { routes: RouteSummary[]; onBuy: (route: RouteSummary) => void }) {
  const [selectedId, setSelectedId] = useState(routes[0]?.id ?? "");
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];
  if (!selected) return null;

  return (
    <section className="city-route-map section-wrap" aria-label="Interaktivní mapa tras v Brně">
      <div className="city-map-canvas">
        <span className="map-river river-one" /><span className="map-river river-two" />
        <b className="city-map-title">BRNO</b>
        {routes.map((route) => <button key={route.id} className={`district-pin ${selected.id === route.id ? "selected" : ""}`} style={{ left: `${route.mapX}%`, top: `${route.mapY}%` }} onClick={() => setSelectedId(route.id)} aria-label={`${route.district}: ${route.title}`}><span>{route.status === "active" ? "⌖" : route.status === "seasonal" ? "✦" : "·"}</span><small>{route.district.replace(" · Prygl", "")}</small></button>)}
      </div>
      <aside className="map-route-detail">
        <span className="section-label">BRNO · {selected.district}</span>
        <h2>{selected.title}</h2><p>{selected.tagline}</p>
        <div className="map-route-stats"><span><small>Délka</small><b>{selected.distance} km</b></span><span><small>Čas</small><b>{selected.duration}</b></span><span><small>XP</small><b>{selected.xpReward}</b></span></div>
        <div className="map-price"><div><small>Jedna trasa</small><strong>250 Kč</strong></div><button className="button primary" onClick={() => onBuy(selected)}>Koupit trasu →</button></div>
        <p className="map-availability">{selected.status === "active" ? "Připraveno ke hraní" : `Předprodej · ${selected.available ?? "připravujeme"}`}</p>
      </aside>
    </section>
  );
}

export function ProfileExperience({ auth, completed, activities, badges, onLogin, onRegister }: {
  auth: AuthController;
  completed: boolean;
  activities: Array<{ id: string; title: string; date: string; distance: string; time: string; xp: number }>;
  badges: Array<{ id: string; name: string; detail: string; icon: string; earned: boolean }>;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const xp = (auth.profile?.xp ?? 0) + (completed ? 520 : 0);
  const level = currentLevel(xp);
  const next = LEVELS[level.level] ?? level;
  const progress = level.level === 10 ? 100 : Math.max(0, Math.min(100, ((xp - level.minXp) / (next.minXp - level.minXp)) * 100));
  const name = auth.profile?.username || auth.profile?.display_name || auth.user?.email?.split("@")[0] || "Městský hráč";

  if (!auth.loading && !auth.user) return <section className="page section-wrap signed-out-profile"><span className="section-label">Profil hráče</span><h1>Tvoje město. Tvůj příběh.</h1><p>Vytvoř si účet a ukládej XP, úrovně, zakoupené trasy i dokončené výpravy napříč zařízeními.</p><div className="profile-auth-actions"><button className="button primary" onClick={onRegister}>Vytvořit účet →</button><button className="text-button" onClick={onLogin}>Už mám účet</button></div></section>;

  return (
    <section className="profile-page">
      <div className="profile-hero"><div className="section-wrap profile-head"><div className="profile-avatar">{initials(name, auth.user?.email)}<span>{level.level}</span></div><div><span className="eyebrow light"><span /> {level.name.toUpperCase()}</span><h1>{name}</h1><p>{auth.profile?.home_city ?? "Brno"} · {auth.profile?.role === "superadmin" ? "Superadmin" : auth.profile?.role === "route_manager" ? "Správce trasy" : "Uživatel"}</p></div><div className="level-card"><span>LEVEL {level.level} · {level.name}</span><div><i style={{ width: `${progress}%` }} /></div><small>{level.level === 10 ? `${xp} XP · nejvyšší úroveň` : `${xp} / ${next.minXp} XP · zbývá ${next.minXp - xp} XP`}</small><p>Další odemčení: <b>{next.unlock}</b> <i>{next.icon}</i></p></div></div></div>
      <div className="section-wrap profile-content">
        <div className="stat-strip"><div><small>Celkem XP</small><b>{xp}</b></div><div><small>Úroveň</small><b>{level.level}<i> / 10</i></b></div><div><small>Dokončené trasy</small><b>{completed ? "1" : "0"}</b></div><div><small>Role</small><b className="role-stat">{auth.profile?.role === "superadmin" ? "Superadmin" : auth.profile?.role === "route_manager" ? "Správce" : "Hráč"}</b></div></div>
        <section className="panel level-roadmap"><div className="panel-heading"><div><span className="section-label">Cesta městem</span><h2>10 úrovní průzkumníka</h2></div><span>{xp} XP</span></div><div className="level-grid">{LEVELS.map((item) => <article key={item.level} className={xp >= item.minXp ? "unlocked" : item.level === next.level ? "next" : "locked"}><span>{item.icon}<b>{item.level}</b></span><div><strong>{item.name}</strong><small>{item.minXp.toLocaleString("cs-CZ")} XP · {item.unlock}</small></div></article>)}</div></section>
        <div className="profile-grid"><div className="profile-main"><section className="panel badges-panel"><div className="panel-heading"><div><span className="section-label">Sbírka</span><h2>Odznaky</h2></div><span>{badges.filter((badge) => badge.earned).length} / {badges.length}</span></div><div className="badges-grid">{badges.map((badge) => <article key={badge.id} className={badge.earned ? "earned" : "locked"}><span>{badge.icon}</span><b>{badge.name}</b><small>{badge.detail}</small></article>)}</div></section><section className="panel recent-panel"><div className="panel-heading"><div><span className="section-label">Deník</span><h2>Poslední výpravy</h2></div></div>{activities.slice(0, 3).map((activity) => <article key={activity.id}><span>↗</span><div><b>{activity.title}</b><small>{activity.date} · {activity.distance}</small></div><strong>+{activity.xp} XP</strong></article>)}</section></div><aside className="panel xp-system"><span className="section-label">Jak získáš XP</span><h2>Každá trasa má svou váhu</h2><p>Odměna vychází z délky, času a obtížnosti. Orientačně počítáme:</p><ul><li><b>40 XP</b> za každý kilometr</li><li><b>1 XP</b> za každé 2 minuty</li><li><b>× 1,0 / 1,25 / 1,5</b> podle obtížnosti</li></ul><p>Nápovědy mohou výslednou odměnu mírně snížit.</p></aside></div>
        <button className="reset-button" onClick={() => void auth.signOut()}>Odhlásit se</button>
      </div>
    </section>
  );
}

type OrderRow = { id: string; user_id: string; package_type: string; route_ids: string[]; amount_czk: number; variable_symbol: string; status: string; created_at: string };
type EmailTemplate = { id: string; name: string; subject: string; body_html: string; variables: string[] };

export function AdminCenter({ auth }: { auth: AuthController }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const load = useCallback(async () => {
    if (!supabase || auth.profile?.role !== "superadmin") return;
    const [{ data: orderData }, { data: templateData }] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("email_templates").select("*").order("name"),
    ]);
    setOrders((orderData as OrderRow[]) ?? []);
    setTemplates((templateData as EmailTemplate[]) ?? []);
    setSelectedTemplate((current) => current ?? ((templateData?.[0] as EmailTemplate | undefined) ?? null));
  }, [auth.profile?.role, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function approve(order: OrderRow) {
    if (!supabase || !auth.user) return;
    setMessage("");
    const accessRows = order.route_ids.map((routeId) => ({ user_id: order.user_id, route_id: routeId, order_id: order.id }));
    const { error: accessError } = await supabase.from("user_route_access").upsert(accessRows);
    if (accessError) return setMessage(accessError.message);
    const { error } = await supabase.from("orders").update({ status: "paid", approved_by: auth.user.id, approved_at: new Date().toISOString() }).eq("id", order.id);
    if (error) return setMessage(error.message);
    setMessage(`Platba ${order.variable_symbol} je schválená a trasy odemčené.`);
    await load();
  }

  async function saveTemplate() {
    if (!supabase || !selectedTemplate || !auth.user) return;
    const { error } = await supabase.from("email_templates").update({ subject: selectedTemplate.subject, body_html: selectedTemplate.body_html, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", selectedTemplate.id);
    setMessage(error ? error.message : "E-mailová šablona byla uložena.");
    if (!error) await load();
  }

  if (!auth.user) return <section className="page section-wrap"><h1>Správa aplikace</h1><p>Pro vstup se přihlas.</p></section>;
  if (auth.profile?.role === "route_manager") return <section className="page section-wrap"><span className="section-label">Správce trasy</span><h1>Správa obsahu tras</h1><p>Tady uvidíš svěřené trasy, checkpointy a hlášení. Přiřazení konkrétní trasy provádí superadmin.</p></section>;
  if (auth.profile?.role !== "superadmin") return <section className="page section-wrap"><h1>Přístup jen pro správce</h1><p>Tvůj účet má roli uživatele.</p></section>;

  return <section className="page section-wrap admin-page"><div className="page-heading"><span className="section-label">Superadmin</span><h1>Řídicí centrum</h1><p>QR platby, přístupy k trasám a komunikace na jednom místě.</p></div>{message && <p className="admin-message">{message}</p>}<div className="admin-grid"><section className="panel admin-orders"><div className="panel-heading"><div><span className="section-label">Čeká na kontrolu</span><h2>QR platby</h2></div><span>{orders.filter((order) => order.status === "pending").length}</span></div>{orders.length === 0 ? <p>Zatím žádné objednávky.</p> : orders.map((order) => <article key={order.id}><div><b>{order.amount_czk} Kč · VS {order.variable_symbol}</b><small>{order.package_type} · {order.route_ids.length} tras · {new Date(order.created_at).toLocaleDateString("cs-CZ")}</small></div><span className={`order-status ${order.status}`}>{order.status}</span>{order.status === "pending" && <button onClick={() => approve(order)}>Označit zaplaceno</button>}</article>)}</section><section className="panel email-editor"><div className="panel-heading"><div><span className="section-label">Komunikace</span><h2>E-mailové šablony</h2></div></div><div className="template-tabs">{templates.map((template) => <button key={template.id} className={selectedTemplate?.id === template.id ? "active" : ""} onClick={() => setSelectedTemplate(template)}>{template.name}</button>)}</div>{selectedTemplate && <><label>Předmět<input value={selectedTemplate.subject} onChange={(event) => setSelectedTemplate({ ...selectedTemplate, subject: event.target.value })} /></label><label>HTML tělo<textarea rows={10} value={selectedTemplate.body_html} onChange={(event) => setSelectedTemplate({ ...selectedTemplate, body_html: event.target.value })} /></label><small>Proměnné: {selectedTemplate.variables.map((item) => `{{${item}}}`).join(", ")}</small><button className="button primary" onClick={saveTemplate}>Uložit šablonu</button></>}</section></div></section>;
}

export function PartnerSection() {
  const [form, setForm] = useState({ business_name: "", contact_name: "", email: "", phone: "", venue_type: "kavárna", district: "", message: "" });
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setStatus("Formulář není připojený.");
    const { error } = await supabase.from("partner_leads").insert(form);
    setStatus(error ? error.message : "Děkujeme. Ozveme se a probereme možnosti zapojení podniku do trasy.");
    if (!error) setForm({ business_name: "", contact_name: "", email: "", phone: "", venue_type: "kavárna", district: "", message: "" });
  }

  return <section className="page section-wrap partner-page"><div className="partner-intro"><span className="section-label">Pro podniky a provozovatele</span><h1>Staňte se součástí příběhu města.</h1><p>Propojujeme městské trasy s kavárnami, hospodami, galeriemi a dalšími místy, kde si hráči mohou odpočinout, objevit lokální podnik a využít partnerskou výhodu.</p><div className="partner-benefits"><article><span>01</span><b>Noví hosté</b><p>Přivedeme k vám lidi, kteří právě objevují vaši čtvrť.</p></article><article><span>02</span><b>Smysluplná zastávka</b><p>Podnik může být odměnou, nápovědou nebo součástí příběhu.</p></article><article><span>03</span><b>Výhodná nabídka</b><p>Třeba levnější káva nebo malé občerstvení pro hráče.</p></article></div></div><form className="panel public-form" onSubmit={submit}><h2>Mám zájem o spolupráci</h2><div className="form-columns"><label>Název podniku<input required value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} /></label><label>Kontaktní osoba<input required value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} /></label><label>E-mail<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Telefon<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Typ podniku<select value={form.venue_type} onChange={(event) => setForm({ ...form, venue_type: event.target.value })}><option>kavárna</option><option>hospoda</option><option>restaurace</option><option>galerie</option><option>jiné</option></select></label><label>Lokalita<input placeholder="např. Bystrc" value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></label></div><label>Jak si spolupráci představujete?<textarea rows={5} required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>{status && <p className="form-message">{status}</p>}<button className="button primary">Odeslat nezávaznou poptávku →</button></form></section>;
}

export function ContactSection({ auth }: { auth: AuthController }) {
  const [form, setForm] = useState({ name: auth.profile?.display_name ?? "", email: auth.user?.email ?? "", category: "bug", message: "" });
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setStatus("Formulář není připojený.");
    const { error } = await supabase.from("contact_messages").insert({ ...form, user_id: auth.user?.id ?? null });
    setStatus(error ? error.message : "Díky. Podnět jsme přijali a zařadili ke zpracování.");
    if (!error) setForm((current) => ({ ...current, message: "" }));
  }

  return <section className="page section-wrap contact-page"><div className="page-heading"><span className="section-label">Napiš nám</span><h1>Chyba, nápad nebo stopa?</h1><p>Pomoz nám Šifrovanou zlepšovat. U chyby prosím popiš, na jaké trase a místě nastala.</p></div><form className="panel public-form narrow" onSubmit={submit}><div className="form-columns"><label>Jméno<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label></div><label>Typ zprávy<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="bug">Nahlásit chybu</option><option value="idea">Nápad na zlepšení</option><option value="other">Jiný dotaz</option></select></label><label>Zpráva<textarea rows={8} required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>{status && <p className="form-message">{status}</p>}<button className="button primary">Odeslat zprávu →</button></form></section>;
}

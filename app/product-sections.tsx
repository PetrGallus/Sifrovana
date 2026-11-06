"use client";

/* eslint-disable @next/next/no-img-element -- The payment QR is generated as an in-memory data URL. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase/client";
import type { RoutePreschoolStatus, RouteStrollerStatus } from "../lib/route-suitability";
import { canPurchasePublishedRoute } from "../lib/route-playability";
import { BrnoIllustratedMap } from "./brno-illustrated-map";
import { RouteSuitabilityBadges } from "./route-suitability-badges";
import { useAccessibleModal } from "./use-accessible-modal";

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
  created_at: string;
};

export type RouteSummary = {
  id: string;
  district: string;
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
  status: "active" | "coming" | "seasonal";
  accent: string;
  available?: string;
  availableFrom?: string;
  availableTo?: string;
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

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "Hráč";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
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

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user ?? null);
      } catch {
        if (active) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setRecoveryMode(event === "PASSWORD_RECOVERY");
      window.setTimeout(() => void loadProfile(nextSession?.user ?? null), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
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
  const dialogRef = useAccessibleModal(onClose);

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
      <div ref={dialogRef} className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
        <button className="modal-close" onClick={onClose} aria-label="Zavřít">×</button>
        <span className="modal-symbol">Š</span>
        <span className="section-label">Skutečný účet</span>
        <h2 id="auth-title" tabIndex={-1} data-modal-autofocus>{mode === "signin" ? "Vítej zpátky ve hře" : mode === "signup" ? "Zapiš se do kroniky" : mode === "reset" ? "Obnov si přístup" : "Nastav nové heslo"}</h2>
        <p>{mode === "signup" ? "Účet uloží zakoupené trasy, rozehraný postup i razítka v městském pasu." : "Přihlášení je zabezpečené a heslo aplikace nikdy neukládá."}</p>
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
  kind: "route" | "bundle";
  route: RouteSummary;
  routes: RouteSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [order, setOrder] = useState<{ id: string; variableSymbol: string; qr: string | null; amount: number; gross: number; discount: number } | null>(null);
  const price = kind === "route" ? route.price : 999;
  const routeCount = kind === "route" ? 1 : Math.min(3, routes.length);
  const title = kind === "route" ? `${route.district}: ${route.title}` : "Balíček 3 tras";
  const paymentIban = process.env.NEXT_PUBLIC_PAYMENT_IBAN?.replace(/\s/g, "") || null;
  const dialogRef = useAccessibleModal(onClose);

  async function createOrder() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !auth.user) return;
    if (!paymentIban) {
      setError("Platební účet není nakonfigurovaný. Objednávku proto zatím nelze vytvořit.");
      return;
    }
    if (kind !== "route") {
      setError("Balíček bude možné koupit po publikaci všech zahrnutých tras.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: orderError } = await supabase.rpc("create_route_checkout_order", {
        p_route_id: route.id,
        p_discount_code: couponCode.trim() || null,
      });
      if (orderError || !data) {
        setError(orderError?.message ?? "Objednávku se nepodařilo vytvořit.");
        return;
      }
      const created = data as { order_id: string; variable_symbol: string; amount_czk: number; gross_amount_czk: number; discount_amount_czk: number };

      let qr: string | null = null;
      if (paymentIban) {
        try {
          const { default: QRCode } = await import("qrcode");
          const spd = `SPD*1.0*ACC:${paymentIban}*AM:${created.amount_czk.toFixed(2)}*CC:CZK*X-VS:${created.variable_symbol}*MSG:SIFROVANA`;
          qr = await QRCode.toDataURL(spd, { margin: 1, width: 280, color: { dark: "#0e3b3a", light: "#fffdf7" } });
        } catch {
          setError("Objednávka vznikla, ale platební QR se nepodařilo vykreslit. Použij údaje pro ruční převod.");
        }
      }
      setOrder({ id: created.order_id, variableSymbol: created.variable_symbol, qr, amount: created.amount_czk, gross: created.gross_amount_czk, discount: created.discount_amount_czk });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Objednávku se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !order || busy) return;
    setBusy(true);
    const { error: cancelError } = await supabase.rpc("cancel_checkout_order", { p_order_id: order.id });
    setBusy(false);
    if (cancelError) return setError(cancelError.message);
    setOrder(null);
    setError("");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabIndex={-1}>
        <button className="modal-close" onClick={onClose} aria-label="Zavřít">×</button>
        <span className="section-label">Jedna licence pro celý tým</span><h2 id="checkout-title" tabIndex={-1} data-modal-autofocus>{order ? "Objednávka čeká na platbu" : "Ještě jeden krok a vyrážíte"}</h2>
        {!order ? <>
          <div className="checkout-item"><span>{kind === "route" ? "01" : "3×"}</span><div><small>{kind === "route" ? "TRASA" : "BALÍČEK"}</small><b>{title}</b><p>Pro tým 1–5 lidí · {routeCount} {routeCount === 1 ? "trasa" : "trasy"}</p></div><strong>{price} Kč</strong></div>
          <div className="checkout-benefits"><span>✓ Start kdykoliv</span><span>✓ Bez instalace</span><span>✓ Pauza a návrat</span></div>
          <label className="checkout-coupon">Slevový kupón <small>(nepovinné)</small><div><input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Např. PODZIM20" /><span>Ověří se bezpečně při vytvoření objednávky</span></div></label>
          <div className="checkout-total"><span>Celkem za tým</span><strong>{price} Kč</strong></div>
          {!paymentIban && <p className="form-message error" role="alert">Platební účet zatím není nakonfigurovaný. Objednávka se nevytvoří a nic se nerezervuje.</p>}
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="button primary full" onClick={createOrder} disabled={busy || !paymentIban}>{busy ? "Vytvářím objednávku…" : paymentIban ? "Vygenerovat QR pro tým →" : "Platba zatím není dostupná"}</button>
        </> : <div className="qr-payment">
          {order.qr ? <img src={order.qr} alt={`QR platba ${order.amount} Kč, variabilní symbol ${order.variableSymbol}`} /> : <div className="qr-placeholder"><b>Použij ruční bankovní převod</b><small>Platební QR není v tomto prohlížeči nebo prostředí dostupné.</small></div>}
          <div><small>Částka</small><b>{order.amount} Kč</b>{order.discount > 0 && <><small>Původní cena</small><b>{order.gross} Kč</b><small>Slevový kupón</small><b>− {order.discount} Kč</b></>}<small>Variabilní symbol</small><b>{order.variableSymbol}</b><small>IBAN příjemce</small><b>{paymentIban ?? "zatím nenastaven"}</b></div>
          <p>Po potvrzení platby se trasa odemkne celému vašemu týmu. Začít můžete, až se vám to bude hodit.</p>
          <button className="button primary full" onClick={onClose}>Hotovo</button>
          <button className="reset-button" onClick={() => void cancelOrder()} disabled={busy}>{busy ? "Ruším…" : "Zrušit tuto objednávku"}</button>
          {error && <p className="form-message error">{error}</p>}
        </div>}
      </div>
    </div>
  );
}

export function CityRouteMap({ routes, releasedRouteIds, onBuy, onDetail }: { routes: RouteSummary[]; releasedRouteIds: readonly string[]; onBuy: (route: RouteSummary) => void; onDetail: (route: RouteSummary) => void }) {
  const [selectedId, setSelectedId] = useState(routes[0]?.id ?? "");
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];
  const districtGroups = useMemo(() => {
    const grouped = new Map<string, RouteSummary[]>();
    routes.forEach((route) => {
      const mapDistrict = route.mapDistrict ?? route.district;
      grouped.set(mapDistrict, [...(grouped.get(mapDistrict) ?? []), route]);
    });
    return [...grouped.entries()].map(([district, districtRoutes]) => ({
      district,
      routes: districtRoutes,
      routeCount: districtRoutes.length,
      hasActive: districtRoutes.some((route) => canPurchasePublishedRoute(route, releasedRouteIds)),
      isSeasonal: districtRoutes.every((route) => route.status === "seasonal"),
    }));
  }, [releasedRouteIds, routes]);
  if (!selected) return null;
  const selectedMapDistrict = selected.mapDistrict ?? selected.district;
  const selectedDistrictRoutes = districtGroups.find((group) => group.district === selectedMapDistrict)?.routes ?? [selected];
  const purchasable = canPurchasePublishedRoute(selected, releasedRouteIds);

  return (
    <section className="city-route-map section-wrap" aria-label="Interaktivní mapa tras v Brně">
      <div className="city-map-canvas">
        <BrnoIllustratedMap
          routes={districtGroups}
          selectedDistrict={selectedMapDistrict}
          onSelectDistrict={(district) => {
            const firstRoute = districtGroups.find((group) => group.district === district)?.routes[0];
            if (firstRoute) setSelectedId(firstRoute.id);
          }}
        />
      </div>
      <aside className="map-route-detail">
        <span className="section-label">BRNO · {selected.district}</span>
        <h2>{selected.title}</h2><p>{selected.tagline}</p>
        {selectedDistrictRoutes.length > 1 && <div className="map-route-variants" aria-label={`Trasy v lokalitě ${selected.district}`}>{selectedDistrictRoutes.map((route) => <button key={route.id} className={route.id === selected.id ? "active" : ""} onClick={() => setSelectedId(route.id)} aria-pressed={route.id === selected.id}>{route.title}</button>)}</div>}
        <RouteSuitabilityBadges strollerStatus={selected.strollerStatus} preschoolStatus={selected.preschoolStatus} durationMaxMinutes={selected.durationMaxMinutes} compact />
        <div className="map-route-stats"><span><small>Délka</small><b>{selected.distance} km</b></span><span><small>Čas</small><b>{selected.duration}</b></span><span><small>Licence</small><b>Tým 1–5</b></span></div>
        <div className="map-price"><div><small>{purchasable ? "Za celý tým" : "Plánovaná cena"}</small><strong>{selected.price} Kč</strong></div><div className="map-price-actions"><button className="button secondary" onClick={() => onDetail(selected)}>Detail trasy</button><button className="button primary" onClick={() => onBuy(selected)} disabled={!purchasable}>{purchasable ? "Koupit →" : "Připravujeme"}</button></div></div>
        <p className="map-availability">{purchasable ? "Připraveno ke hraní" : `Dostupné po terénním ověření · ${selected.available ?? "připravujeme"}`}</p>
      </aside>
    </section>
  );
}

export function ProfileExperience({ auth, completed, activities, badges, onLogin, onRegister }: {
  auth: AuthController;
  completed: boolean;
  activities: Array<{ id: string; title: string; date: string; distance: string; time: string }>;
  badges: Array<{ id: string; name: string; detail: string; icon: string; earned: boolean }>;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const name = auth.profile?.username || auth.profile?.display_name || auth.user?.email?.split("@")[0] || "Městský hráč";
  const completedRoutes = completed ? 1 : 0;
  const earnedStamps = badges.filter((badge) => badge.earned).length;
  const role = auth.profile?.role === "superadmin" ? "Superadmin" : auth.profile?.role === "route_manager" ? "Správce" : "Hráč";

  if (!auth.loading && !auth.user) return <section className="page section-wrap signed-out-profile"><span className="section-label">Městský pas</span><h1>Tvoje město. Tvoje objevy.</h1><p>Vytvoř si účet a měj zakoupené trasy, rozehraný postup i razítka z dokončených čtvrtí bezpečně na jednom místě.</p><div className="profile-auth-actions"><button className="button primary" onClick={onRegister}>Vytvořit městský pas →</button><button className="text-button dark" onClick={onLogin}>Už mám účet</button></div></section>;

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <div className="section-wrap profile-head">
          <div className="profile-avatar">{initials(name, auth.user?.email)}<span>{completed ? "✓" : "·"}</span></div>
          <div><span className="eyebrow light"><span /> MĚSTSKÝ PAS</span><h1>{name}</h1><p>{auth.profile?.home_city ?? "Brno"} · {role}</p></div>
          <div className="passport-card"><span>SBÍRKA BRNA</span><strong>{completedRoutes} ze 3 čtvrtí</strong><small>{completed ? "Královo Pole je v kronice. Další příběh připravujeme." : "První razítko čeká v Králově Poli."}</small></div>
        </div>
      </div>
      <div className="section-wrap profile-content">
        <div className="stat-strip"><div><small>Dokončené trasy</small><b>{completedRoutes}</b></div><div><small>Objevené čtvrti</small><b>{completedRoutes}</b></div><div><small>Ušlá vzdálenost</small><b>{completed ? "4,1 km" : "0 km"}</b></div><div><small>Razítka</small><b>{earnedStamps}</b></div></div>
        <div className="profile-grid">
          <div className="profile-main">
            <section className="panel badges-panel">
              <div className="panel-heading"><div><span className="section-label">Městský pas</span><h2>Razítka z výprav</h2></div><span>{earnedStamps} / {badges.length}</span></div>
              <div className="badges-grid">{badges.map((badge) => <article key={badge.id} className={badge.earned ? "earned" : "locked"}><span>{badge.icon}</span><b>{badge.name}</b><small>{badge.detail}</small></article>)}</div>
            </section>
            <section className="panel recent-panel">
              <div className="panel-heading"><div><span className="section-label">Deník</span><h2>Poslední výpravy</h2></div></div>
              {activities.length === 0 ? <p className="empty-journal">Deník se naplní po první dokončené trase.</p> : activities.slice(0, 3).map((activity) => <article key={activity.id}><span>↗</span><div><b>{activity.title}</b><small>{activity.date} · {activity.distance}</small></div><strong>{activity.time}</strong></article>)}
            </section>
          </div>
          <aside className="panel passport-next"><span className="section-label">Další výprava</span><h2>Brno-střed: Pod povrchem</h2><p>Skryté vrstvy centra, průchody a příběhy, kolem kterých se běžně jen projde.</p><ul><li>75–100 minut</li><li>přibližně 3,6 km</li><li>pro tým 1–5 lidí</li></ul><span className="passport-soon">Připravujeme</span></aside>
        </div>
        <button className="reset-button" onClick={() => void auth.signOut()}>Odhlásit se</button>
      </div>
    </section>
  );
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

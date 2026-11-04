"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type DiscountType = "percent" | "fixed_czk";

type DiscountCode = {
  id: string;
  code: string;
  title: string;
  discount_type: DiscountType;
  discount_value: number;
  usage_limit: number;
  reserved_count: number;
  redeemed_count: number;
  applies_to_all_routes: boolean;
  active: boolean;
  valid_from: string;
  valid_until: string | null;
  updated_at: string;
};

type DiscountRoute = {
  discount_code_id: string;
  route_id: string;
};

type RouteOption = {
  id: string;
  district: string;
  title: string;
  status: string;
};

type DiscountDraft = {
  id: string | null;
  code: string;
  title: string;
  discountType: DiscountType;
  discountValue: number;
  usageLimit: number;
  appliesToAllRoutes: boolean;
  routeIds: string[];
  validFrom: string;
  validUntil: string;
  active: boolean;
};

function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function newDraft(): DiscountDraft {
  return {
    id: null,
    code: "",
    title: "",
    discountType: "percent",
    discountValue: 10,
    usageLimit: 5,
    appliesToAllRoutes: true,
    routeIds: [],
    validFrom: localDateTime(new Date()),
    validUntil: "",
    active: true,
  };
}

function generatedCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `SIF-${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function codeState(item: DiscountCode) {
  const now = Date.now();
  if (!item.active) return "Pozastavený";
  if (new Date(item.valid_from).getTime() > now) return "Čeká na začátek";
  if (item.valid_until && new Date(item.valid_until).getTime() <= now) return "Po platnosti";
  if (item.reserved_count + item.redeemed_count >= item.usage_limit) return "Vyčerpaný";
  return "Aktivní";
}

function readableDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "bez konce";
}

export function DiscountAdmin({ onMessage }: { onMessage: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [scopes, setScopes] = useState<DiscountRoute[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [draft, setDraft] = useState<DiscountDraft>(() => newDraft());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setLoadError("Supabase není nakonfigurovaný.");
      return;
    }
    setLoading(true);
    const [codeResult, scopeResult, routeResult] = await Promise.all([
      supabase.from("discount_codes").select("id,code,title,discount_type,discount_value,usage_limit,reserved_count,redeemed_count,applies_to_all_routes,active,valid_from,valid_until,updated_at").order("updated_at", { ascending: false }),
      supabase.from("discount_code_routes").select("discount_code_id,route_id"),
      supabase.from("routes").select("id,district,title,status").order("district"),
    ]);
    const error = codeResult.error ?? scopeResult.error ?? routeResult.error;
    if (error) {
      setLoadError(error.message);
      onMessage(`Kupóny se nepodařilo načíst: ${error.message}`);
    } else {
      setLoadError("");
      setCodes((codeResult.data as DiscountCode[] | null) ?? []);
      setScopes((scopeResult.data as DiscountRoute[] | null) ?? []);
      setRoutes((routeResult.data as RouteOption[] | null) ?? []);
    }
    setLoading(false);
  }, [onMessage, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function edit(item: DiscountCode) {
    setDraft({
      id: item.id,
      code: item.code,
      title: item.title,
      discountType: item.discount_type,
      discountValue: item.discount_value,
      usageLimit: item.usage_limit,
      appliesToAllRoutes: item.applies_to_all_routes,
      routeIds: scopes.filter((scope) => scope.discount_code_id === item.id).map((scope) => scope.route_id),
      validFrom: localDateTime(new Date(item.valid_from)),
      validUntil: item.valid_until ? localDateTime(new Date(item.valid_until)) : "",
      active: item.active,
    });
    document.getElementById("discount-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleRoute(routeId: string) {
    setDraft((current) => ({
      ...current,
      routeIds: current.routeIds.includes(routeId)
        ? current.routeIds.filter((id) => id !== routeId)
        : [...current.routeIds, routeId],
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;

    const code = draft.code.trim().toUpperCase();
    const validFrom = new Date(draft.validFrom);
    const validUntil = draft.validUntil ? new Date(draft.validUntil) : null;
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
      return onMessage("Kód musí mít 3 až 32 znaků: písmena, čísla, pomlčku nebo podtržítko.");
    }
    if (!Number.isInteger(draft.discountValue) || draft.discountValue <= 0 || (draft.discountType === "percent" && draft.discountValue > 99)) {
      return onMessage("Zkontroluj hodnotu slevy. Procentní sleva může být 1–99 %.");
    }
    if (!Number.isInteger(draft.usageLimit) || draft.usageLimit <= 0) {
      return onMessage("Počet použití musí být kladné celé číslo.");
    }
    if (!draft.appliesToAllRoutes && draft.routeIds.length === 0) {
      return onMessage("Vyber alespoň jednu trasu nebo nastav kupón pro všechny trasy.");
    }
    if (Number.isNaN(validFrom.getTime()) || (validUntil && (Number.isNaN(validUntil.getTime()) || validUntil <= validFrom))) {
      return onMessage("Konec platnosti musí být později než začátek.");
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("admin_upsert_discount_code", {
      p_discount_code_id: draft.id,
      p_code: code,
      p_title: draft.title,
      p_discount_type: draft.discountType,
      p_discount_value: draft.discountValue,
      p_usage_limit: draft.usageLimit,
      p_applies_to_all_routes: draft.appliesToAllRoutes,
      p_route_ids: draft.appliesToAllRoutes ? [] : draft.routeIds,
      p_valid_from: validFrom.toISOString(),
      p_valid_until: validUntil?.toISOString() ?? null,
      p_active: draft.active,
    });
    setBusy(false);
    if (error) return onMessage(`Kupón se nepodařilo uložit: ${error.message}`);

    onMessage(draft.id ? `Kupón ${code} je aktualizovaný.` : `Kupón ${code} je připravený k použití.`);
    setDraft({ ...draft, id: data as string, code });
    await load();
  }

  async function toggleActive(item: DiscountCode) {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.from("discount_codes").update({ active: !item.active }).eq("id", item.id);
    setBusy(false);
    if (error) return onMessage(`Stav kupónu se nepodařilo změnit: ${error.message}`);
    onMessage(item.active ? `Kupón ${item.code} je pozastavený.` : `Kupón ${item.code} je znovu aktivní.`);
    await load();
  }

  const routeNames = useMemo(() => new Map(routes.map((route) => [route.id, `${route.district}: ${route.title}`])), [routes]);

  return <div className="section-wrap discount-admin">
    <form id="discount-editor" className="panel" onSubmit={save}>
      <div className="panel-heading"><div><span className="section-label">Prodej</span><h2>{draft.id ? "Upravit slevový kupón" : "Nový slevový kupón"}</h2></div>{draft.id && <button className="button secondary" type="button" onClick={() => setDraft(newDraft())}>＋ Nový</button>}</div>
      <p>Kupón je samostatný od doporučení hráčů. Uplatnění i limit použití kontroluje server až při vytvoření objednávky.</p>
      <div className="form-columns">
        <label>Kód<div className="discount-code-input"><input required minLength={3} maxLength={32} autoCapitalize="characters" autoComplete="off" spellCheck={false} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="PODZIM20" /><button className="button secondary" type="button" onClick={() => setDraft({ ...draft, code: generatedCode() })}>Vygenerovat</button></div></label>
        <label>Interní název<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Podzimní kampaň" /></label>
        <label>Typ slevy<select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value as DiscountType })}><option value="percent">Procentní sleva</option><option value="fixed_czk">Pevná sleva v Kč</option></select></label>
        <label>{draft.discountType === "percent" ? "Sleva (%)" : "Sleva (Kč)"}<input required type="number" inputMode="numeric" min="1" max={draft.discountType === "percent" ? 99 : undefined} step="1" value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: Number(event.target.value) })} /></label>
        <label>Celkový počet použití<input required type="number" inputMode="numeric" min="1" step="1" value={draft.usageLimit} onChange={(event) => setDraft({ ...draft, usageLimit: Number(event.target.value) })} /></label>
        <label>Platnost od<input required type="datetime-local" value={draft.validFrom} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value })} /></label>
        <label>Platnost do <small>(nepovinné)</small><input type="datetime-local" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} /></label>
      </div>
      <fieldset className="discount-scope"><legend>Platí pro</legend><label><input type="radio" name="discount-scope" checked={draft.appliesToAllRoutes} onChange={() => setDraft({ ...draft, appliesToAllRoutes: true })} /> Všechny současné i budoucí trasy</label><label><input type="radio" name="discount-scope" checked={!draft.appliesToAllRoutes} onChange={() => setDraft({ ...draft, appliesToAllRoutes: false })} /> Jen vybrané trasy</label>{!draft.appliesToAllRoutes && <div className="discount-route-options">{routes.length === 0 ? <p>Nejdřív publikuj alespoň jednu trasu.</p> : routes.map((route) => <label key={route.id}><input type="checkbox" checked={draft.routeIds.includes(route.id)} onChange={() => toggleRoute(route.id)} /> <span>{route.district}: {route.title}</span><small>{route.status}</small></label>)}</div>}</fieldset>
      <label className="discount-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Kupón je aktivní</label>
      <p className="cms-help">Procentní sleva může být nejvýše 99 %. Pevná sleva se při nákupu omezí tak, aby kvůli bankovnímu platebnímu toku zůstal minimální doplatek 1 Kč.</p>
      <button className="button primary" disabled={busy}>{busy ? "Ukládám…" : draft.id ? "Uložit změny" : "Vytvořit kupón"}</button>
    </form>

    <section className="panel discount-list" aria-busy={loading}>
      <div className="panel-heading"><div><span className="section-label">Přehled</span><h2>Slevové kupóny</h2></div><span>{codes.length}</span></div>
      {loading ? <p>Načítám kupóny…</p> : loadError ? <p role="alert">Kupóny teď nelze načíst: {loadError}</p> : codes.length === 0 ? <p>Zatím tu není žádný kupón.</p> : codes.map((item) => {
        const routeIds = scopes.filter((scope) => scope.discount_code_id === item.id).map((scope) => scope.route_id);
        const used = item.reserved_count + item.redeemed_count;
        return <article key={item.id} className="discount-card"><div><div className="discount-card-heading"><strong>{item.code}</strong><span>{codeState(item)}</span></div><p>{item.title || (item.discount_type === "percent" ? `${item.discount_value}% sleva` : `${item.discount_value} Kč sleva`)}</p><small>{item.discount_type === "percent" ? `${item.discount_value} %` : `${item.discount_value} Kč`} · {used}/{item.usage_limit} rezervováno nebo použito · {item.redeemed_count} zaplaceno</small><small>Platnost: {readableDate(item.valid_from)} – {readableDate(item.valid_until)}</small><small>{item.applies_to_all_routes ? "Všechny trasy" : routeIds.map((id) => routeNames.get(id) ?? id).join(", ") || "Bez trasy"}</small></div><div className="discount-card-actions"><button className="button secondary" type="button" onClick={() => edit(item)}>Upravit</button><button className="button secondary" type="button" disabled={busy} onClick={() => void toggleActive(item)}>{item.active ? "Pozastavit" : "Aktivovat"}</button></div></article>;
      })}
    </section>
  </div>;
}

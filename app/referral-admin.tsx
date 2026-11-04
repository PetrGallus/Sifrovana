"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type ReferralProgram = {
  version: string;
  reward_czk: number;
  min_paid_czk: number;
  reward_hold_days: number;
  max_apply_czk: number;
  max_apply_bps: number;
  minimum_cash_czk: number;
  terms_version: string;
};

const fallback: ReferralProgram = {
  version: "brno-pilot-v1",
  reward_czk: 100,
  min_paid_czk: 199,
  reward_hold_days: 14,
  max_apply_czk: 200,
  max_apply_bps: 5000,
  minimum_cash_czk: 199,
  terms_version: "2026-11",
};

export function ReferralAdmin({ onMessage }: { onMessage: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [program, setProgram] = useState<ReferralProgram>(fallback);
  const [stats, setStats] = useState({ invited: 0, qualified: 0, credits: 0 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: programData }, { data: referrals }, { data: ledger }] = await Promise.all([
      supabase.from("referral_programs").select("version,reward_czk,min_paid_czk,reward_hold_days,max_apply_czk,max_apply_bps,minimum_cash_czk,terms_version").eq("active", true).single(),
      supabase.from("referrals").select("status"),
      supabase.from("credit_ledger").select("amount_czk,entry_type").eq("entry_type", "referral_reward"),
    ]);
    if (programData) setProgram(programData as ReferralProgram);
    const referralRows = (referrals as Array<{ status: string }> | null) ?? [];
    const ledgerRows = (ledger as Array<{ amount_czk: number }> | null) ?? [];
    setStats({
      invited: referralRows.length,
      qualified: referralRows.filter((item) => item.status === "qualified").length,
      credits: ledgerRows.reduce((sum, item) => sum + item.amount_czk, 0),
    });
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("replace_referral_program", {
      p_reward_czk: program.reward_czk,
      p_min_paid_czk: program.min_paid_czk,
      p_reward_hold_days: program.reward_hold_days,
      p_max_apply_czk: program.max_apply_czk,
      p_max_apply_bps: program.max_apply_bps,
      p_minimum_cash_czk: program.minimum_cash_czk,
      p_terms_version: program.terms_version,
    });
    setBusy(false);
    if (error) return onMessage(`Referral program se nepodařilo uložit: ${error.message}`);
    onMessage("Nová verze referral programu je aktivní. Starší pozvánky si zachovaly původní podmínky.");
    await load();
  }

  return <div className="section-wrap referral-admin">
    <div className="referral-admin-stats"><article><small>Pozvaní hráči</small><strong>{stats.invited}</strong></article><article><small>Kvalifikované odměny</small><strong>{stats.qualified}</strong></article><article><small>Připsané kredity</small><strong>{stats.credits} Kč</strong></article></div>
    <form className="panel" onSubmit={save}><div className="panel-heading"><div><span className="section-label">Doporučení</span><h2>Pravidla kreditů</h2></div><span>{program.version}</span></div><p>Uložení vytvoří novou verzi pravidel. Již přijaté pozvánky zůstávají navázané na podmínky, se kterými vznikly.</p><div className="form-columns"><label>Odměna doporučiteli (Kč)<input type="number" min="1" value={program.reward_czk} onChange={(event) => setProgram({ ...program, reward_czk: Number(event.target.value) })} /></label><label>Minimální skutečná platba (Kč)<input type="number" min="1" value={program.min_paid_czk} onChange={(event) => setProgram({ ...program, min_paid_czk: Number(event.target.value) })} /></label><label>Ochranná lhůta (dní)<input type="number" min="0" value={program.reward_hold_days} onChange={(event) => setProgram({ ...program, reward_hold_days: Number(event.target.value) })} /></label><label>Maximum kreditu na nákup (Kč)<input type="number" min="1" value={program.max_apply_czk} onChange={(event) => setProgram({ ...program, max_apply_czk: Number(event.target.value) })} /></label><label>Maximum ceny hrazené kreditem (%)<input type="number" min="1" max="100" value={program.max_apply_bps / 100} onChange={(event) => setProgram({ ...program, max_apply_bps: Number(event.target.value) * 100 })} /></label><label>Nejnižší doplatek (Kč)<input type="number" min="1" value={program.minimum_cash_czk} onChange={(event) => setProgram({ ...program, minimum_cash_czk: Number(event.target.value) })} /></label><label>Verze podmínek<input value={program.terms_version} onChange={(event) => setProgram({ ...program, terms_version: event.target.value })} /></label></div><button className="button primary" disabled={busy}>{busy ? "Ukládám…" : "Aktivovat nová pravidla"}</button></form>
  </div>;
}

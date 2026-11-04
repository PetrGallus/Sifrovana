"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export type ReferralDashboard = {
  code: string;
  available_credit_czk: number;
  pending_credit_czk: number;
  invited_count: number;
  rewarded_count: number;
  reward_czk: number;
  hold_days: number;
  max_apply_czk: number;
  max_apply_bps: number;
  minimum_cash_czk: number;
};

export function ReferralPanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.rpc("referral_dashboard");
    if (error) {
      setMessage("Pozvánky se teď nepodařilo načíst.");
      return;
    }
    setDashboard(data as ReferralDashboard);
  }, [supabase, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!dashboard) {
    return <section className="panel referral-panel"><span className="section-label">Pozvi parťáka</span><h2>Výprava chutná lépe ve dvou</h2><p>{message || "Připravuji tvůj osobní odkaz…"}</p></section>;
  }

  const link = `${window.location.origin}/?ref=${dashboard.code}`;
  const rewardPercent = Math.round(dashboard.max_apply_bps / 100);
  const rewardCzk = dashboard.reward_czk;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Odkaz je zkopírovaný.");
    } catch {
      setMessage(`Zkopíruj odkaz: ${link}`);
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Šifrovaná – městská výprava",
          text: `Pojď se mnou objevovat město. Po první zaplacené trase mi Šifrovaná připíše ${rewardCzk} Kč na další výpravu.`,
          url: link,
        });
        return;
      } catch {
        return;
      }
    }
    await copyLink();
  }

  return (
    <section className="panel referral-panel">
      <div className="referral-heading">
        <div><span className="section-label">Pozvi parťáka</span><h2>Sdílej město. Získej další trasu levněji.</h2></div>
        <div className="credit-balance"><small>Dostupný kredit</small><strong>{dashboard.available_credit_czk} Kč</strong>{dashboard.pending_credit_czk > 0 && <span>+ {dashboard.pending_credit_czk} Kč čeká</span>}</div>
      </div>
      <p>Po první potvrzené platbě nového hráče získáš <b>{dashboard.reward_czk} Kč</b>. Kredit se uvolní za {dashboard.hold_days} dní a při další objednávce se použije automaticky.</p>
      <div className="referral-link"><code>{dashboard.code}</code><button onClick={() => void copyLink()}>Kopírovat odkaz</button><button className="button primary" onClick={() => void shareLink()}>Pozvat přátele →</button></div>
      {message && <p className="referral-message" role="status">{message}</p>}
      <dl className="referral-stats"><div><dt>Pozvaní hráči</dt><dd>{dashboard.invited_count}</dd></div><div><dt>Odměněné pozvánky</dt><dd>{dashboard.rewarded_count}</dd></div><div><dt>Na jednu objednávku</dt><dd>max. {dashboard.max_apply_czk} Kč / {rewardPercent} %</dd></div></dl>
      <small className="referral-terms">Jen pro nové hráče před jejich první objednávkou. Kredit není převoditelný ani vyplatitelný a vždy zůstává alespoň {dashboard.minimum_cash_czk} Kč k úhradě.</small>
    </section>
  );
}

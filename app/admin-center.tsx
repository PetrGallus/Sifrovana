"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { DiscountAdmin } from "./discount-admin";
import { RouteCms } from "./route-cms";
import type { AuthController } from "./product-sections";

type OrderRow = {
  id: string;
  user_id: string;
  package_type: string;
  route_ids: string[];
  amount_czk: number;
  discount_amount_czk?: number;
  variable_symbol: string;
  status: string;
  created_at: string;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  variables: string[];
};

export function AdminCenter({ auth }: { auth: AuthController }) {
  const [section, setSection] = useState<"routes" | "orders" | "discounts" | "emails">("routes");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const load = useCallback(async () => {
    if (!supabase || auth.profile?.role !== "superadmin") return;
    setLoading(true);
    setLoadError("");
    try {
      const [{ data: orderData, error: orderError }, { data: templateData, error: templateError }] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("email_templates").select("*").order("name"),
      ]);
      if (orderError || templateError) {
        setLoadError(orderError?.message ?? templateError?.message ?? "Administraci se nepodařilo načíst.");
        return;
      }
      setOrders((orderData as OrderRow[]) ?? []);
      setTemplates((templateData as EmailTemplate[]) ?? []);
      setSelectedTemplate((current) => current ?? ((templateData?.[0] as EmailTemplate | undefined) ?? null));
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Administraci se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }, [auth.profile?.role, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function approve(order: OrderRow) {
    if (!supabase || !auth.user) return;
    setMessage("");
    const { data, error } = await supabase.rpc("finalize_order_paid", { p_order_id: order.id });
    if (error) return setMessage(error.message);
    const result = data as { paid?: boolean; expired?: boolean } | null;
    if (!result?.paid) {
      setMessage(result?.expired ? `Objednávka ${order.variable_symbol} vypršela a byla zrušena.` : "Platbu se nepodařilo potvrdit.");
      await load();
      return;
    }
    setMessage(`Platba ${order.variable_symbol} je schválená a trasy jsou odemčené.`);
    await load();
  }

  async function cancel(order: OrderRow) {
    if (!supabase || !auth.user) return;
    setMessage("");
    const { error } = await supabase.rpc("cancel_checkout_order", { p_order_id: order.id });
    if (error) return setMessage(error.message);
    setMessage(`Objednávka ${order.variable_symbol} je zrušená; případná rezervace kupónu se uvolnila.`);
    await load();
  }

  async function saveTemplate() {
    if (!supabase || !selectedTemplate || !auth.user) return;
    const { error } = await supabase.from("email_templates").update({
      subject: selectedTemplate.subject,
      body_html: selectedTemplate.body_html,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).eq("id", selectedTemplate.id);
    setMessage(error ? error.message : "E-mailová šablona byla uložena.");
    if (!error) await load();
  }

  if (!auth.user) return <section className="page section-wrap"><h1>Správa aplikace</h1><p>Pro vstup se přihlas.</p></section>;
  if (auth.profile?.role !== "route_manager" && auth.profile?.role !== "superadmin") return <section className="page section-wrap"><h1>Přístup jen pro správce</h1><p>Tvůj účet má roli uživatele.</p></section>;

  const isSuperadmin = auth.profile.role === "superadmin";
  return <section className="page admin-page">
    <div className="section-wrap page-heading"><span className="section-label">{isSuperadmin ? "Superadmin" : "Správce trasy"}</span><h1>Řídicí centrum</h1><p>Obsah tras, terénní kontrola{isSuperadmin ? ", platby a komunikace" : " a předání k publikaci"} na jednom místě.</p></div>
    <nav className="section-wrap admin-primary-nav" aria-label="Sekce administrace">
      <button className={section === "routes" ? "active" : ""} aria-current={section === "routes" ? "page" : undefined} onClick={() => setSection("routes")}>Obsah tras</button>
      {isSuperadmin && <button className={section === "orders" ? "active" : ""} aria-current={section === "orders" ? "page" : undefined} onClick={() => setSection("orders")}>Objednávky <span>{orders.filter((order) => order.status === "pending").length}</span></button>}
      {isSuperadmin && <button className={section === "discounts" ? "active" : ""} aria-current={section === "discounts" ? "page" : undefined} onClick={() => setSection("discounts")}>Slevové kupóny</button>}
      {isSuperadmin && <button className={section === "emails" ? "active" : ""} aria-current={section === "emails" ? "page" : undefined} onClick={() => setSection("emails")}>E-maily</button>}
    </nav>
    {loading && <p className="admin-message section-wrap" role="status">Načítám objednávky a šablony…</p>}
    {loadError && <p className="admin-message section-wrap error" role="alert">Data administrace nejsou dostupná: {loadError} <button type="button" onClick={() => void load()}>Zkusit znovu</button></p>}
    {message && <p className="admin-message section-wrap" role="status">{message}</p>}
    {section === "routes" && <RouteCms auth={auth} onMessage={setMessage} />}
    {isSuperadmin && section === "orders" && !loading && !loadError && <div className="section-wrap"><section className="panel admin-orders"><div className="panel-heading"><div><span className="section-label">Čeká na kontrolu</span><h2>QR platby</h2></div><span>{orders.filter((order) => order.status === "pending").length}</span></div>{orders.length === 0 ? <p>Zatím žádné objednávky.</p> : orders.map((order) => <article key={order.id}><div><b>{order.amount_czk} Kč · VS {order.variable_symbol}</b><small>{order.package_type} · {order.route_ids.length} tras · {new Date(order.created_at).toLocaleDateString("cs-CZ")}{order.discount_amount_czk ? ` · sleva ${order.discount_amount_czk} Kč` : ""}</small></div><span className={`order-status ${order.status}`}>{order.status}</span>{order.status === "pending" && <div className="admin-order-actions"><button onClick={() => approve(order)}>Označit zaplaceno</button><button className="secondary" onClick={() => cancel(order)}>Zrušit</button></div>}</article>)}</section></div>}
    {isSuperadmin && section === "discounts" && <DiscountAdmin onMessage={setMessage} />}
    {isSuperadmin && section === "emails" && !loading && !loadError && <div className="section-wrap"><section className="panel email-editor"><div className="panel-heading"><div><span className="section-label">Komunikace</span><h2>E-mailové šablony</h2></div></div><div className="template-tabs" role="group" aria-label="E-mailové šablony">{templates.map((template) => <button key={template.id} aria-pressed={selectedTemplate?.id === template.id} className={selectedTemplate?.id === template.id ? "active" : ""} onClick={() => setSelectedTemplate(template)}>{template.name}</button>)}</div>{templates.length === 0 ? <p>Zatím nejsou vytvořené žádné e-mailové šablony.</p> : selectedTemplate && <><label>Předmět<input value={selectedTemplate.subject} onChange={(event) => setSelectedTemplate({ ...selectedTemplate, subject: event.target.value })} /></label><label>HTML tělo<textarea rows={10} value={selectedTemplate.body_html} onChange={(event) => setSelectedTemplate({ ...selectedTemplate, body_html: event.target.value })} /></label><small>Proměnné: {selectedTemplate.variables.map((item) => `{{${item}}}`).join(", ")}</small><button className="button primary" onClick={saveTemplate}>Uložit šablonu</button></>}</section></div>}
  </section>;
}

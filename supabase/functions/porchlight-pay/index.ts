// Card payments through Stripe Checkout. Inert until card_enabled is switched on in porchlight_pay_settings
// AND the STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET secrets exist.
// Actions: checkout (pay up front), tip (after a visit), and Stripe's own webhook (signed, no JWT).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://porchlightpetcare.vercel.app";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const svc = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function stripe(path: string, params: URLSearchParams) {
  const r = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers: { Authorization: "Bearer " + Deno.env.get("STRIPE_SECRET_KEY"), "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? "Stripe error");
  return j;
}
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

// Unpaid, bookable-for-payment bookings with server-side prices.
async function dueBookings(db: ReturnType<typeof svc>, filter: (q: any) => any) {
  let q = db.from("porchlight_bookings").select("id,start_at,service_id,fare_cents,tip_cents,porchlight_payments(id)").in("status", ["requested", "confirmed"]).neq("service_id", "meet");
  q = filter(q);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const { data: sv } = await db.from("porchlight_services").select("id,price_cents,label");
  const price: Record<string, { c: number; l: string }> = {};
  (sv ?? []).forEach((s: any) => (price[s.id] = { c: s.price_cents, l: s.label }));
  return (rows ?? []).filter((b: any) => !(b.porchlight_payments ?? []).length).map((b: any) => ({ ...b, base: b.fare_cents ?? price[b.service_id]?.c ?? 0, label: price[b.service_id]?.l ?? b.service_id }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = svc();
  const sig = req.headers.get("stripe-signature");

  // ---------- Stripe webhook ----------
  if (sig) {
    const raw = await req.text();
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) return json({ error: "not configured" }, 503);
    const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
    if (!parts.t || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300 || (await hmac(secret, `${parts.t}.${raw}`)) !== parts.v1) return json({ error: "bad signature" }, 400);
    const ev = JSON.parse(raw);
    if (ev.type !== "checkout.session.completed") return json({ ok: true });
    const s = ev.data.object;
    if (s.payment_status !== "paid") return json({ ok: true });
    const { data: dup } = await db.from("porchlight_payments").select("id").eq("reference", s.id).limit(1);
    if (dup?.length) return json({ ok: true });
    const md = s.metadata ?? {};
    const ids: string[] = Object.keys(md).filter((k) => /^b\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).flatMap((k) => String(md[k]).split(",")).filter(Boolean);
    if (md.kind === "tip") {
      await db.from("porchlight_payments").insert({ booking_id: ids[0], amount_cents: 0, tip_cents: Number(md.tip_cents), method: "card", reference: s.id });
    } else {
      const due = await dueBookings(db, (q) => q.in("id", ids));
      const rows = due.map((b: any, i: number) => ({ booking_id: b.id, amount_cents: b.base, tip_cents: b.tip_cents ?? 0, method: "card", reference: s.id, card_fee_cents: i === 0 ? Number(md.fee_cents ?? 0) : 0 }));
      if (rows.length) await db.from("porchlight_payments").insert(rows);
    }
    return json({ ok: true });
  }

  // ---------- Checkout / tip ----------
  try {
    const body = await req.json();
    const { data: st } = await db.from("porchlight_pay_settings").select("*").eq("id", "main").single();
    if (!st?.card_enabled || !Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Card payment is not open yet. We will email you a secure payment link." }, 503);

    // Signed-in client (portal): resolve what they are allowed to touch through their own RLS.
    const auth = req.headers.get("authorization") ?? "";
    const asUser = auth.startsWith("Bearer ") && auth.length > 200 ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }) : null;

    const p = new URLSearchParams();
    p.set("mode", "payment"); p.set("success_url", SITE + "/portal?paid=1"); p.set("cancel_url", SITE + "/portal");
    p.set("payment_method_types[0]", "card");

    if (body.action === "tip") {
      if (!asUser) return json({ error: "Please sign in to your portal to tip by card." }, 401);
      const cents = Math.round(Number(body.cents));
      if (!(cents >= 100 && cents <= 50000)) return json({ error: "Enter a tip between $1 and $500" }, 400);
      const { data: b } = await asUser.from("porchlight_bookings").select("id,status").eq("id", body.booking_id).eq("status", "completed").maybeSingle();
      if (!b) return json({ error: "We could not find that visit" }, 404);
      p.set("line_items[0][price_data][currency]", "usd"); p.set("line_items[0][price_data][product_data][name]", "Tip for your Porchlight sitter");
      p.set("line_items[0][price_data][unit_amount]", String(cents)); p.set("line_items[0][quantity]", "1");
      p.set("metadata[kind]", "tip"); p.set("metadata[tip_cents]", String(cents)); p.set("metadata[b0]", b.id);
    } else {
      let due: any[];
      if (body.group_id && body.email) due = await dueBookings(db, (q) => q.eq("group_id", body.group_id).ilike("client_email", String(body.email).trim()));
      else if (asUser && Array.isArray(body.booking_ids)) {
        const { data: mine } = await asUser.from("porchlight_bookings").select("id").in("id", body.booking_ids.slice(0, 120));
        due = await dueBookings(db, (q) => q.in("id", (mine ?? []).map((m: any) => m.id)));
      } else return json({ error: "Missing details" }, 400);
      if (!due.length) return json({ error: "Nothing is due" }, 400);
      let n = 0;
      due.forEach((b: any) => {
        p.set(`line_items[${n}][price_data][currency]`, "usd"); p.set(`line_items[${n}][price_data][product_data][name]`, `${b.label} · ${fmt(b.start_at)}`);
        p.set(`line_items[${n}][price_data][unit_amount]`, String(b.base)); p.set(`line_items[${n}][quantity]`, "1"); n++;
      });
      const tip = due.reduce((t: number, b: any) => t + (b.tip_cents ?? 0), 0);
      if (tip) { p.set(`line_items[${n}][price_data][currency]`, "usd"); p.set(`line_items[${n}][price_data][product_data][name]`, "Tip for your Porchlight sitter"); p.set(`line_items[${n}][price_data][unit_amount]`, String(tip)); p.set(`line_items[${n}][quantity]`, "1"); n++; }
      if (st.card_fee_cents > 0) { p.set(`line_items[${n}][price_data][currency]`, "usd"); p.set(`line_items[${n}][price_data][product_data][name]`, "Card processing fee"); p.set(`line_items[${n}][price_data][unit_amount]`, String(st.card_fee_cents)); p.set(`line_items[${n}][quantity]`, "1"); }
      if (due.length > 480) return json({ error: "That is a large request. Please split it into two bookings or call us." }, 400);
      p.set("metadata[kind]", "visits"); p.set("metadata[fee_cents]", String(st.card_fee_cents));
      for (let i = 0; i * 12 < due.length; i++) p.set(`metadata[b${i}]`, due.slice(i * 12, i * 12 + 12).map((b: any) => b.id).join(","));
    }
    const session = await stripe("checkout/sessions", p);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

// Porchlight geo helper.
//  POST { action: "geocode", address }            -> { ok, lat, lng, formatted }
//  POST { action: "route", dest, lat?, lng?, origin? } -> { ok, miles, minutes, dest_formatted }  (pet taxi fares)
//  POST { action: "prime", date, days?, lat, lng } -> fills porchlight_drive_cache with Google drive times
//                                                    between this address and that day's booked stops.
// Without the GOOGLE_MAPS_SERVER_KEY secret it answers { ok:false, reason:"no_key" } and the
// calendar falls back to straight-line estimates.
import { createClient } from "jsr:@supabase/supabase-js@2";

const KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const HOME = { lat: 35.2429, lng: -81.0373 }; // Belmont

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const okPoint = (lat: unknown, lng: unknown) =>
  typeof lat === "number" && typeof lng === "number" && lat > 34 && lat < 37 && lng > -83 && lng < -79;

async function geocode(address: string) {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", address);
  u.searchParams.set("components", "country:US");
  u.searchParams.set("bounds", "34.9,-81.5|35.5,-80.7");
  u.searchParams.set("key", KEY);
  const r = await fetch(u);
  const j = await r.json();
  const hit = j.results?.[0];
  if (!hit) return json({ ok: false, reason: "not_found" });
  const { lat, lng } = hit.geometry.location;
  const exact = !hit.partial_match && ["ROOFTOP", "RANGE_INTERPOLATED"].includes(hit.geometry.location_type);
  return json({ ok: true, lat, lng, formatted: hit.formatted_address, exact, in_area: okPoint(lat, lng) });
}

type Pt = { lat: number; lng: number };
async function matrix(origins: Pt[], dests: Pt[]) {
  const wp = (p: Pt) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  const r = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({ origins: origins.map(wp), destinations: dests.map(wp), travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
  });
  if (!r.ok) throw new Error("routes " + r.status + " " + (await r.text()).slice(0, 200));
  const rows = await r.json();
  return (rows as any[]).filter((e) => e.condition === "ROUTE_EXISTS" && e.duration).map((e) => ({
    o: origins[e.originIndex ?? 0], d: dests[e.destinationIndex ?? 0],
    minutes: Math.ceil(parseInt(String(e.duration)) / 60), meters: e.distanceMeters ?? null,
  }));
}

// Driving distance and time from a pickup point to any destination address (pet taxi fares).
async function lookup(address: string) {
  const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address", address);
  u.searchParams.set("components", "country:US");
  u.searchParams.set("bounds", "34.9,-81.5|35.5,-80.7");
  u.searchParams.set("key", KEY);
  const j = await (await fetch(u)).json();
  const hit = j.results?.[0];
  if (!hit) return null;
  return { lat: hit.geometry.location.lat as number, lng: hit.geometry.location.lng as number, formatted: hit.formatted_address as string };
}
async function route(body: any) {
  const dest = String(body.dest ?? "").trim();
  if (dest.length < 4 || dest.length > 300) return json({ ok: false, reason: "bad_dest" }, 400);
  let from: Pt | null = okPoint(body.lat, body.lng) ? { lat: body.lat, lng: body.lng } : null;
  if (!from) {
    const o = String(body.origin ?? "").trim();
    if (o.length < 4 || o.length > 300) return json({ ok: false, reason: "bad_origin" }, 400);
    const g = await lookup(o);
    if (!g) return json({ ok: false, reason: "origin_not_found" });
    from = { lat: g.lat, lng: g.lng };
  }
  const d = await lookup(dest);
  if (!d || !(d.lat > 24 && d.lat < 50 && d.lng > -125 && d.lng < -66)) return json({ ok: false, reason: "dest_not_found" });
  const m = await matrix([from], [{ lat: d.lat, lng: d.lng }]);
  if (!m.length || m[0].meters == null) return json({ ok: false, reason: "no_route" });
  return json({ ok: true, miles: Math.round((m[0].meters / 1609.344) * 10) / 10, minutes: m[0].minutes, dest_formatted: d.formatted.replace(/, USA$/, "") });
}

async function prime(date: string, me: Pt, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, reason: "bad_date" }, 400);
  const day = new Date(date + "T12:00:00Z");
  const from = new Date(day.getTime() - 36 * 3600e3).toISOString();
  const to = new Date(day.getTime() + (Math.min(Math.max(days, 1), 92) - 1) * 864e5 + 36 * 3600e3).toISOString();
  const { data, error } = await db.from("porchlight_bookings")
    .select("lat,lng,porchlight_clients(lat,lng),porchlight_towns(lat,lng)")
    .in("status", ["requested", "confirmed"]).lt("start_at", to).gt("end_at", from).limit(400);
  if (error) throw error;
  const pts = new Map<string, Pt>();
  for (const b of data as any[]) {
    const p = okPoint(b.lat, b.lng) ? { lat: b.lat, lng: b.lng }
      : okPoint(b.porchlight_clients?.lat, b.porchlight_clients?.lng) ? b.porchlight_clients
      : b.porchlight_towns;
    if (!p) continue;
    const k = r3(p.lat) + "," + r3(p.lng);
    if (k !== r3(me.lat) + "," + r3(me.lng)) pts.set(k, { lat: p.lat, lng: p.lng });
  }
  const others = [...pts.values()].slice(0, 24);
  if (!others.length) return json({ ok: true, primed: 0 });

  // Skip pairs we already know (cache entries are kept for 90 days).
  const { data: known } = await db.from("porchlight_drive_cache").select("o_lat,o_lng,d_lat,d_lng")
    .or(`and(o_lat.eq.${r3(me.lat)},o_lng.eq.${r3(me.lng)}),and(d_lat.eq.${r3(me.lat)},d_lng.eq.${r3(me.lng)})`)
    .gt("fetched_at", new Date(Date.now() - 90 * 864e5).toISOString());
  const have = new Set((known ?? []).map((k: any) => `${+k.o_lat},${+k.o_lng}>${+k.d_lat},${+k.d_lng}`));
  const key = (a: Pt, b: Pt) => `${r3(a.lat)},${r3(a.lng)}>${r3(b.lat)},${r3(b.lng)}`;
  const needOut = others.filter((p) => !have.has(key(me, p)));
  const needIn = others.filter((p) => !have.has(key(p, me)));

  const results = [
    ...(needOut.length ? await matrix([me], needOut) : []),
    ...(needIn.length ? await matrix(needIn, [me]) : []),
  ];
  if (results.length) {
    const { error: e2 } = await db.from("porchlight_drive_cache").upsert(results.map((x) => ({
      o_lat: r3(x.o.lat), o_lng: r3(x.o.lng), d_lat: r3(x.d.lat), d_lng: r3(x.d.lng),
      minutes: x.minutes, meters: x.meters, fetched_at: new Date().toISOString(),
    })));
    if (e2) throw e2;
  }
  return json({ ok: true, primed: results.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  if (!KEY) return json({ ok: false, reason: "no_key" });
  try {
    const body = await req.json();
    if (body.action === "geocode") {
      const a = String(body.address ?? "").trim();
      if (a.length < 5 || a.length > 200) return json({ ok: false, reason: "bad_address" }, 400);
      return await geocode(a);
    }
    if (body.action === "route") return await route(body);
    if (body.action === "prime") {
      if (!okPoint(body.lat, body.lng)) return json({ ok: false, reason: "bad_point" }, 400);
      const me = { lat: body.lat, lng: body.lng };
      const far = Math.hypot(me.lat - HOME.lat, (me.lng - HOME.lng) * 0.82) * 69;
      if (far > 35) return json({ ok: false, reason: "out_of_area" });
      return await prime(String(body.date ?? ""), me, Number(body.days) || 1);
    }
    return json({ ok: false, reason: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, reason: "error" }, 500);
  }
});

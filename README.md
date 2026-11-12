# Porchlight Pet & Home Care

Website, booking and portals for Porchlight Pet & Home Care (Belmont, NC).

Plain static site, no build step. Hosted on Vercel; data and logins in Supabase.

| Page | What it is |
|---|---|
| `index.html` | Public homepage with drive-time-aware booking requests |
| `intake.html` (`/intake`) | New client form: household, pets, vet, home access, agreement |
| `portal.html` (`/portal`) | Sitter portal (schedule, requests, clients, visit reports) and client portal (visits, reports, pets & home) |
| `assets/app.js` | Shared Supabase client, form field definitions, helpers |
| `assets/porchlight.css` | Styles for the intake form and portal |

## Data

Supabase tables are all prefixed `porchlight_` (towns, services, bookings, clients, pets, visit_reports, staff, staff_notes). Visit and pet photos live in the private `porchlight-photos` storage bucket. Row-level security means:

- Visitors can only see open times, submit booking requests, and submit the intake form.
- Clients see and edit only their own record, pets, visits and reports.
- Staff (emails in `porchlight_staff`) see everything.

To give someone sitter access, add their email to `porchlight_staff` after they create a portal login.

## Changing prices

Prices come from the `porchlight_services` table (`price_cents`). Change them there; the site reads them on load.

## Maps and drive times

- `assets/address.js` adds Google address suggestions (browser key, locked to porchlightpetcare.com and the Vercel site).
- `supabase/functions/porchlight-geo` turns addresses into map points and asks Google Routes for real drive
  times, saved in `porchlight_drive_cache`. It needs the `GOOGLE_MAPS_SERVER_KEY` secret in Supabase.
- `porchlight_drive_min_pts()` uses Google's minutes when cached, otherwise a road-factor estimate, and adds 25%
  during weekday rush hours. A $20/month budget alert is set in Google Cloud billing.

## Visits

- Clients see 30-minute arrival windows (`P.WINDOW_MIN` in `assets/app.js`).
- The visit screen has a "before you go in" box, a checklist, mood chips and a one-time GPS check-in/out.
- Clients can skip a stretch of dates in a repeating request (`porchlight_skip_dates`).
- Requests waiting more than 2 hours get a banner in the portal. Email alerts come once the domain is set up in Resend.

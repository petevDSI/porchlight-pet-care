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

## Rides, trips and payments

- **Pet taxi** (`taxi` one way, `taxi_rt` round trip) books on the normal calendar. The client gives a pickup address and a drop-off address; the drop-off is stored on the booking (`dropoff_address`) and shown to Kraig on the schedule and the visit screen. Prices live in `porchlight_services` and are editable there.
- **Flight companion** and **pet transport** are quoted per trip. `/quote` sends a request to `porchlight_quotes` through the `porchlight_request_quote` function; Kraig sees them in the portal's **Quotes** tab, records the price he quoted, and moves each through new, quoted, booked, declined or closed.
- **Payments are due up front.** After booking, clients see the amount and how to pay (Venmo or Zelle with no fee; card adds a fee). Kraig sets his Venmo username, Zelle contact, card fee and the card on/off switch in the Payments tab ("How clients pay you"). When money arrives he records it in the Payments tab, then confirms the visits. Unpaid requested, confirmed and completed visits all show there. Taxi waiting time is billed after the ride as a balance. The free meet and greet is never charged.
- **Tips.** A tip can be added at booking (paid with the booking) or after a completed visit: the portal shows a "Leave a tip" button with 10/15/20% suggestions. Venmo, Zelle or cash tips are reported by the client and confirmed by Kraig ("Tips to confirm"). Card tips have no extra fee.
- **Cards (Stripe) are built but switched off.** The `porchlight-pay` edge function creates Stripe Checkout sessions and records payments from Stripe's signed webhook. To turn it on: create a Stripe account, add the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Supabase, point a Stripe webhook for `checkout.session.completed` at `https://ngiwnyoxdcycwotxargm.supabase.co/functions/v1/porchlight-pay`, test with Stripe test keys, then tick "Accept cards". Card networks limit surcharges (Visa: 3% or your cost, whichever is lower; credit only, not debit), so check the $5 fee against current rules first.
- Page content for all seven services is in `tools/build-services.js`. Edit there and run `node tools/build-services.js`.

## Service area border

The border is one polygon stored in the database table `porchlight_area` (row `main`, vertices as `[lat, lng]`). It runs down the middle of the Catawba River and Lake Wylie and along Celanese Rd in Rock Hill, and it is enforced by `porchlight_in_area()` inside `porchlight_available_slots` (every booking) and `porchlight_submit_intake`. `assets/address.js` carries a copy (`AREA`) so the address box can warn right away; change both together. A 75-minute drive-time check remains as a second safety net.

## Pet taxi fares and tips

Pet taxi is metered like a cab. Rates live in the table `porchlight_taxi_rates` (edit there): $20 base, $2 per mile one way ($30 minimum), $3 per mile round trip ($40 minimum), waiting free for 10 minutes then $10 per 15. The booking form asks the `porchlight-geo` function (action `route`) for the driving distance from the pickup to the drop-off and shows an estimate; the database recomputes the fare when the request is saved. Kraig records minutes waited in the Payments tab and the amount due updates. At checkout clients can add a tip (10, 15, 20 percent or a custom amount); it is stored on the bookings and pre-filled when Kraig marks the visit paid.

## Vaccination records

- The new client form has a **Vaccination records** box under each pet: a rabies certificate upload, an optional "other vaccine records" upload, and a **Rabies vaccine expires** date. Uploading is optional on the form; the portal asks for anything missing before the first visit.
- Files (PDF or photo, 10 MB each) live in the private `porchlight-records` storage bucket. Each file has a row in `porchlight_pet_docs` (pet, kind `rabies` or `other`, path). Only the client and staff can open them, through links that expire after an hour.
- The form is filled out before a login exists, so it may only add files under `intake/<form id>/`; it can never read or list them. `porchlight_submit_intake` attaches those files to the new pets. Uploads from the form are capped at 60 an hour.
- `P.vaxStatus()` in `assets/app.js` decides what is shown: current, expires within 30 days, expired, or needed. It applies to dogs, cats and ferrets. Kraig sees a "Vaccine record needed" chip on the client list and a note on the visit screen.
- The vet section asks whether Porchlight may confirm records with the vet (`vet_records_ok`).
- Database changes are in `supabase/migrations/20261112_vaccination_records.sql`.


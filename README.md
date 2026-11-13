# Porchlight Pet & Home Care

Website, booking and portals for Porchlight Pet & Home Care (Belmont, NC).

Plain static site, no build step. Hosted on Vercel; data and logins in Supabase.

| Page | What it is |
|---|---|
| `index.html` | Public homepage with drive-time-aware booking requests |
| `intake.html` (`/intake`) | New client form: household, pets, vet, home access, agreement |
| `portal.html` (`/portal`) | Sitter portal (schedule, requests, quotes, sitter applications, clients, visit reports) and client portal (visits, reports, pets & home) |
| `assets/app.js` | Shared Supabase client, form field definitions, helpers |
| `assets/porchlight.css` | Styles for the intake form and portal |

## Data

Supabase tables are all prefixed `porchlight_` (towns, services, bookings, clients, pets, visit_reports, staff, staff_notes). Visit and pet photos live in the private `porchlight-photos` storage bucket. Row-level security means:

- Visitors can only see open times, submit booking requests, and submit the intake form.
- Clients see and edit only their own record, pets, visits and reports.
- Staff (emails in `porchlight_staff`) see everything.

To give someone sitter access, add their email to `porchlight_staff` after they create a portal login.

## Contracted sitters and payouts

Migration `20261113_sitters.sql` adds `porchlight_sitters`, `porchlight_payouts` and `sitter_id` / `sitter_keep_pct` / `payout_id` on bookings.

- **Onboarding:** an applicant is approved in Portal > Sitters (towns + keep %). That creates the sitter row; they then sign up at /portal with the same email.
- **Claiming:** sitters see open requests (no client names or addresses) and accept first-come. Claims are race-safe and reject overlapping visits. A sitter can give a visit back up to 24 hours before it starts.
- **Privacy:** a sitter sees client details only for assigned, confirmed visits, until 3 days after the visit.
- **Pay:** the sitter keeps `keep_pct` (default 88) of cash actually collected, plus 100% of tips. The percentage is snapshotted when the visit is assigned. Staff record payouts in Portal > Sitters > Payouts after sending the money; each visit is paid once.

### Availability and choosing a sitter

Migration `20261114_sitter_availability.sql` (apply after `20261113_sitters.sql`).

- Each sitter has weekly hours and days off (portal > Availability). New sitters start Mon-Fri 8-6. A sitter with no hours can't be booked.
- `porchlight_sitter_conflict()` is the one rule: active, in their towns/services, inside hours, not on time off, and no clash or drive-time problem with their own visits. The booking calendar, "open requests" and "accept" all use it.
- The booking page shows "Who would you like?" (Anyone, or a named sitter). If the named sitter is busy at a time, that time shows dashed with a free sitter's name. Picks are stored as `sitter_id` on each visit. "Anyone" leaves it open for any free sitter to accept.
- Visits nobody has accepted yet use up capacity, so the site can't sell more simultaneous "anyone" visits than there are free sitters.
- Until at least one sitter is active, the old single-provider logic runs, so booking keeps working during the switch.

## Legal documents, consent log and additional animals

**The documents** are plain text in `tools/legal/*.md` (Terms of Service, Privacy Policy, Owner Service Agreement and Release, Independent Sitter Agreement, Overnight Stay Addendum, Home Standards, Cameras and Safety Policy, Animals in the Home Policy, Background Check Disclosure). `ATTORNEY-NOTES.md` there lists the questions for a lawyer and is never published.

- Edit a document, change its `version:` line, then run `node tools/build-legal.js`. It writes the public pages in `/legal`, `assets/legal-docs.js` (versions and SHA-256 fingerprints used by the checkboxes) and a migration that registers the new version. If you change the text and forget the version, the script stops.
- `tools/legal/config.json` has `"draft": true`, which puts a "draft pending legal review" banner on every legal page. Set it to `false` after a lawyer signs off.
- Changing a version makes the portal ask every affected client and sitter to accept it again at next sign-in.

**The consent log** (`supabase/migrations/20261117_consent_logging.sql`):

- `porchlight_consents` is append only (updates and deletes are blocked). Each row is one checked box: email, document, version, fingerprint, the exact words next to the box, time, IP address, browser, and the booking, client or sitter it belongs to. Staff see them under Clients > Agreements accepted.
- Every booking carries its own checked boxes (Terms, Privacy, Owner Agreement, Home Standards, Animals in the Home; overnights add the Overnight Addendum plus a cameras and people-in-the-home statement). New client forms and sitter applications record theirs too. Signed-in people are asked to accept the current versions before using the portal.
- The site calls `porchlight_book_with_consent`, `porchlight_submit_intake_consent` and `porchlight_apply_sitter_consent`. These run the original function and save the consent in the same transaction, and the database rejects a version or fingerprint that is not the current published one.
- **Apply in this order:** `20261117_consent_logging.sql`, `20261118_legal_doc_versions.sql` (generated), deploy the site, then `20261119_require_consent.sql`, which closes the original functions to the web so a booking cannot be made without a consent record. Re-run `node tools/build-legal.js` and apply the new `20261118` file after every document change.
- Tests: `supabase/tests/run_consent_tests.sh` runs the migrations against a throwaway local Postgres (stand-in tables in `stub_schema.sql`) and checks pricing, consent capture, rejection cases, and that the log cannot be edited.

**Additional animals.** Every animal in the home beyond the first is charged `porchlight_pay_settings.extra_animal_cents` (default 500), whether or not the animal is being booked for care, with two exemptions:
- **Overnights** always charge each additional animal per night (automatic feeders do not change that).
- **Walks, drop-ins and home check-ins** charge an additional animal per visit only if it needs a service from the sitter. The booking form asks (`animals.extra_care`).
- **Fish tanks and reptile enclosures that need no care** are never charged (`animals.no_care_fr`, the count of tanks/enclosures needing nothing). If a tank or reptile needs feeding, leave it out of that count and it is charged like any other animal.

The database stores the answers on each booking (`animals_in_home`, `animals_no_care_fr`, `animals_extra_care`, `animals_note`, `extra_animal_cents`) and raises `fare_cents` to price plus the extra, which is the amount the card checkout, the client portal and the Payments tab bill. Sitters see the count and the care answer on the visit screen and are told to report it if they end up caring for an animal the client said needed nothing. To change the rate, update `extra_animal_cents`.

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
- **Payments are due up front.** After booking, clients see the amount and how to pay (Venmo, Zelle, check or card all pay the posted price; the old payment discount is set to $0 and can still be changed in Portal > Payments settings, but sitter shares are calculated on cash collected, so keep it at $0). Kraig sets his Venmo username, Zelle contact, discount and the card on/off switch in the Payments tab ("How clients pay you"). When money arrives he records it in the Payments tab, then confirms the visits. Unpaid requested, confirmed and completed visits all show there. Taxi waiting time is billed after the ride as a balance. The free meet and greet is never charged.
- **Tips.** A tip can be added at booking (paid with the booking) or after a completed visit: the portal shows a "Leave a tip" button with 10/15/20% suggestions. Venmo, Zelle or cash tips are reported by the client and confirmed by Kraig ("Tips to confirm"). Card tips have no extra fee.
- **Cards (Stripe) are built but switched off.** The `porchlight-pay` edge function creates Stripe Checkout sessions and records payments from Stripe's signed webhook. To turn it on: create a Stripe account, add the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Supabase, point a Stripe webhook for `checkout.session.completed` at `https://ngiwnyoxdcycwotxargm.supabase.co/functions/v1/porchlight-pay`, test with Stripe test keys, then tick "Accept cards". Cards pay the posted (standard) price. Venmo, Zelle, check and cash get a discount (default $5 per booking, set in the Payments tab), which avoids card-network surcharge limits. The discount is stored on each payment (`discount_cents`) so balances add up.
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


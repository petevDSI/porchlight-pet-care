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

---
key: attorney-notes
title: Notes for the reviewing attorney
version: 2026-11-13.4
audience: internal
summary: Internal. Not published on the site.
internal: true
---

These documents were drafted as a starting point by Claude (an AI assistant) for Pete Volk's Porchlight Pet & Home Care marketplace. They are not legal advice and have not been reviewed by a lawyer. Please treat them as a first draft to revise, not a finished product.

## Business facts the drafts rely on

- A hyper-local pet-sitting marketplace in Gaston County, NC (Belmont, Mt. Holly, Cramerton, McAdenville, Lowell, Ranlo, East Gastonia) and York County, SC (Clover, York, Lake Wylie, Rock Hill's Celanese Rd edge). Services: dog walks, drop-ins, overnight stays at the **owner's** home, home check-ins, pet taxi, wedding attendant (quoted).
- Porchlight collects payment from the owner up front (Venmo, Zelle, check, cash, and Stripe cards when switched on) and pays the sitter a percentage (default 88%) plus 100% of tips after the visit is completed. Porchlight sets prices, vets sitters, assigns bookings first-come, requires visit reports and GPS check-in/check-out.
- No entity has been formed yet. **The LLC name needs to be inserted** in every document (currently "Porchlight Pet & Home Care, a business based in Belmont, North Carolina").
- The site currently says "Insured and bonded." Pete has not confirmed a policy. Do not publish that claim unless it is true.

## Questions for you

1. **Contractor classification.** Does the control Porchlight exercises (set prices, payment handling, vetting, reports, check-in/out, a one-year non-circumvention clause) risk employee classification under NC and SC law and the IRS test? What should change?
2. **Release and liability cap.** Are the owner release, the cap at amount paid, and the carve-out for gross negligence and intentional acts appropriate and enforceable in NC? Anything unconscionable?
3. **Arbitration.** The draft chooses Gaston County courts and does not require arbitration or a class waiver. Do you recommend adding either?
4. **SC.** Choice of law is NC for all users, including SC owners and sitters. Is that sound? Any SC licensing, tax, or consumer-protection requirement for SC-based work? Sitters working from SC?
5. **Animal rules.** Does NC or SC (or Belmont, Gastonia, Rock Hill, York County) require a kennel/boarding license or permit, or limit pets, for in-home pet care? Overnight stays are at the owner's home only. Boarding in a sitter's home is excluded.
6. **Additional-animal charge.** Is the billing and retroactive back-billing (12 months) for undisclosed animals enforceable as drafted? The surcharge is disclosed at booking and in the policy. It applies to every additional animal on overnights; on walks, drop-ins and check-ins only when the animal needs a service; and never to fish or reptiles that need no care. Please check the "no care needed" self-declaration and the back-billing when it turns out to be wrong.
7. **Camera and audio rules.** Are the camera/microphone rules consistent with NC and SC wiretap and surveillance statutes? Should the sitter be required to disclose their own devices (phones, doorbells)?
8. **Privacy.** NC has no comprehensive privacy law yet, but the site collects home codes and location. Do you want a CCPA-style notice for California visitors or any other additions? Is the GPS check-in disclosure adequate?
9. **Background checks.** Is the stand-alone FCRA disclosure sufficient? Does the sitter-agreement language on adverse action match the vendor's process (Pete has not picked a vendor)?
10. **Electronic acceptance.** The site records a versioned, unchecked-by-default clickwrap acceptance with timestamp, IP, user agent, and document fingerprint at signup and again on each booking. Is that adequate under NC's UETA and E-SIGN?
11. **Recurring bookings.** Repeat series are chosen date by date. If a true auto-renewing series is added, we will need a separate consent for ROSCA and state auto-renewal laws.
12. **Insurance.** What insurance should Porchlight (the marketplace) and sitters carry, and how should the agreements describe it?

## Outside review applied (November 13)

An outside launch review of the eight drafts was applied to the wording. Changed: Terms and Owner Agreement release, liability cap and indemnity (one controlling sentence for fraud, gross negligence, intentional misconduct and bodily injury; cap limited to ordinary scheduling and billing errors); one-year claims deadline and mandatory 30-day informal period removed; South Carolina court and mandatory-protection language added; recurring-renewal exception replaced with "you choose and confirm each date"; sitter rolling 12-month restriction replaced with a narrow rule against diverting a booked job; payout adjustments limited to listed, reviewable reasons; removal limited to documented grounds; written FCRA process (pre-adverse notice, human review, final notice) in the Sitter Agreement and a disclosure-and-authorization-only background-check form; sitter insurance requirements stated, with a blank for Porchlight's own coverage; camera rules (video-only exterior cameras, all indoor surveillance off on overnights, sitter devices); boarding and sitter-hosting language removed; ferrets added to the rabies clause; back-billing limited to dates that can be substantiated; GPS and access-code retention added.

Pete's decisions after the review (version .4): (1) Sitters are independent contractors and will not be W-2 employees. (2) Porchlight publishes a suggested price per service; each sitter may set their own price within a band (50% to 200% of suggested, whole dollars) and owners see it before booking. (3) Porchlight's fee is the greater of a minimum (12% of the suggested price, e.g. $3.60 on a $30 visit) and 12% of the sitter's price, deducted from the sitter's share, so a sitter who charges below the suggested price absorbs the shortfall and one who charges above it earns Porchlight more. Extra-animal charges and tips go entirely to the sitter. (4) All client payments are by card through the site (Stripe); Venmo, Zelle, check and cash are removed. Porchlight pays sitters by bank transfer or Stripe out of the client payment. (5) Privacy features built: a plain-language location notice before the device permission prompt; access codes shown to the assigned sitter only from two hours before to two hours after a visit, with each reveal logged; sitters never see an owner's email or exact coordinates; sitters lose all client details 3 days after the visit; nightly purge of access codes 30 days after the client's last booking and of check-in/out coordinates 90 days after the visit.

Still open and not decided in the drafts: whether the fee and rate band satisfy the classification and pricing-control questions in item 1 (sitters now set their own rates, but Porchlight controls the fee, payment handling and the price band); handling of sitters paid out of state and Stripe Connect or other payout onboarding (payouts are recorded manually for now); the unpaid meet-and-greet; whether to ask for the legal entity name before launch; Rock Hill and York County licensing; South Carolina qualification and withholding; insurance binding.

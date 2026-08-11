# Consent & legal considerations

This system remotely locks, tracks, and can wipe devices. What that
requires before shipping depends entirely on **whose hands the device is
in** when it happens:

- **Your own device** (a personal owner protecting their own laptop, or a
  business protecting hardware only its own operators/admins use): you're
  acting on something in your own possession. This is closer to "Find My
  Device" than anything requiring special consent machinery — the rest of
  this document mostly doesn't apply. Normal terms-of-service-level
  disclosure is enough.
- **Internal staff PCs** a business issues to its own employees: an
  employer monitoring/locking a company-owned device an employee uses at
  work is well-trodden ground, generally covered by an IT-use policy the
  employee already agreed to.
- **A device leased or issued to a customer** — i.e. `computers.customer_id`
  is set and that customer is someone outside the organization: this is the
  case the rest of this document is about. Remotely locking someone's
  laptop, showing them a message, logging their IP over time, or deleting
  files on it is — depending on jurisdiction — adjacent to computer misuse
  law, consumer protection law, and data protection/privacy law, even when
  the org legally owns the hardware and the customer is behind on payments.
  Ownership of a device does not automatically imply a right to remotely
  act on it while it's in someone else's possession and use.

This is not legal advice, and none of the engineering here substitutes for
review by someone qualified to give it. It's a list of the things that
came up designing the feature, so they don't get silently skipped.

## Before this goes live with real customers

1. **Written disclosure in the lease agreement.** The customer should sign
   something that plainly states, before they take the device: it can be
   remotely locked, its approximate location (via IP) can be logged, and
   its personal-data folders can be remotely erased if it is reported lost
   or stolen or the lease is defaulted on. Burying this in fine print
   undermines the "informed consent" the rest of this list depends on.
2. **Scope the trigger conditions in the agreement, not just in code.**
   `security_status` here only distinguishes `FLAGGED_LOST` /
   `FLAGGED_STOLEN` from everything else — the agreement should say what
   actually qualifies (reported lost/stolen by the customer, a missed
   payment threshold, a police report, etc.), because "we can lock it
   whenever we decide" is a much harder consent to defend than a
   pre-agreed trigger.
3. **A defined, disclosed retention period for location history.**
   `device_location_history` (see `database/migrations/`) is currently
   unbounded — nothing here ever deletes old rows. An indefinitely growing
   IP/timestamp log of a named customer's device is exactly the kind of
   thing data-protection regimes (GDPR, POPIA, and similar) expect a
   stated retention/deletion policy for. Add one before storing real
   customer data.
4. **A path for the customer to dispute a flag or a wipe.** `computer_audit_log`
   (trigger-populated, see the same migration) exists so every
   `FLAGGED_STOLEN` / `WIPE` action has a "who did this and when" record —
   necessary but not sufficient. There should be a human process for a
   customer to say "this was a mistake" and have it reviewed, ideally
   before wipe fires rather than only after.
5. **The agent's credential is per-organization, not per-device — know what
   that does and doesn't buy you.** Every device belonging to one
   organization currently authenticates to `api/` with the same
   `organizations.agent_api_key` (see `pc-agent/config.py` /
   `api/src/middleware/requireAgentKey.ts`). That's already a meaningfully
   smaller blast radius than a platform-wide key shipped to every visitor's
   browser: extracting it means walking up to one of *that org's* already-
   installed devices, not reading it out of public JS. It's still a
   shared-fleet secret, though — a key extracted from one device can act
   on every other device in the same org (register new devices, flag them,
   queue commands). Per-device credentials would close that gap; not done
   here because it adds real provisioning complexity for comparatively
   little benefit until a fleet is large enough for one compromised device
   to matter beyond itself.
6. **Confirm remote wipe is proportionate where the customer is.** Some
   jurisdictions restrict remotely destroying data on a device in a
   consumer's possession even with a signed agreement, particularly if the
   data destroyed is the *customer's* (not the lessor's) content. Confirm
   this against local consumer-protection law before enabling WIPE for a
   given market — LOCK + recovery message + location history alone may be
   the defensible baseline in some jurisdictions even with a signed
   agreement.

## What the implementation already does to reduce risk

These don't replace the legal review above, but they're the concrete
mitigations already in the code, not just talk:

- `security_status` is a separate field from `lease_status` (see
  `database/migrations/001_leasing_theft_prevention.sql`), so a routine
  lease-lifecycle change can never accidentally trigger lockdown/wipe.
- `computer_audit_log` is populated only by database triggers, not
  application code — no code path can flag a device or issue a command
  without it being logged, including who did it.
- `WIPE` requires an explicit `{"confirm": true}` in the command payload,
  enforced by a database CHECK constraint (not just client-side), and the
  agent independently re-verifies the device is actually flagged
  lost/stolen before it deletes anything — see `pc-agent/wipe.py`.
- The wipe itself is scoped to a fixed allow-list of personal-content
  folders under `C:\Users\<profile>` — never the OS, installed
  applications, or anything outside a real user profile. See the module
  docstring in `pc-agent/wipe.py` for the full reasoning.
- Payment card data never touches this codebase at all — signup and
  subscription billing (`api/src/routes/billing.ts`) hand off to Stripe
  Checkout and the Stripe Billing Portal, both hosted by Stripe. This
  system only ever sees a Stripe customer/subscription id, which keeps it
  out of PCI-DSS scope for card data.

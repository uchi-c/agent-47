# Consent & legal considerations

This system remotely locks, tracks, and can wipe devices that belong to
(or are in the possession of) **customers** — not internal staff. That is
a materially different situation from the café-PC tracking this is adapted
from, and it changes what's required before any of this ships to a real
lessor:

- **Internal staff PCs**: an employer monitoring/locking a company-owned
  device an employee uses at work is well-trodden ground, generally covered
  by an IT-use policy the employee already agreed to.
- **Leased devices in a customer's possession**: remotely locking someone's
  laptop, showing them a message, logging their IP over time, or deleting
  files on it is — depending on jurisdiction — adjacent to computer misuse
  law, consumer protection law, and data protection/privacy law, even when
  the lessor legally owns the hardware and the customer is behind on
  payments. Ownership of the device does not automatically imply a right to
  remotely act on it while it's in someone else's possession and use.

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
5. **Harden the device's own credentials before this handles real leases.**
   `database/schema.sql` reuses dube-man-system's MVP posture: the agent
   authenticates with the project's public anon key, which ships inside
   the installed agent. That's an acceptable stopgap for trusted café LAN
   machines an operator can physically walk up to. It is a materially
   weaker posture once the same key can flip a stranger's laptop into
   `FLAGGED_STOLEN` (and trigger a wipe) from anywhere on the internet —
   anyone who extracts the key from one installed agent can act on every
   device in that tenant. Move agent writes behind a per-device signed
   token or an Edge Function using the service_role key before relying on
   this for real customer devices, not just café hardware.
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

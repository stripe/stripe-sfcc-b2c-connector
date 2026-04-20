# Stripe SFCC B2C Connector — Agent Grounding Index

This file is the entry point for AI agents working in this repository.
Load additional context files from `.claude/` based on your task.

```
CLAUDE.md                        ← You are here — index, cartridge map, invariants, key files
.claude/
  architecture.md                ← Cartridge layers, SFRA vs SiteGenesis, service layer, hooks, data model
  payment-flows.md               ← All payment flows: card, APM, ECE, bank transfer, saved methods, capture, refund
  webhooks-and-jobs.md           ← Webhook ingestion, signature verification, job processing, event catalog
  configuration.md               ← Site preferences, API version, BM setup, metadata import, deployment checklist
  anti-patterns.md               ← 16 real failure modes with wrong/correct patterns and reasons
```

---

## What This Project Is

The **Stripe SFCC B2C Connector** is a set of cartridges that integrate
[Stripe Payments](https://docs.stripe.com/payments/about) into
**Salesforce B2C Commerce Cloud (SFCC)**, formerly known as Demandware.

- **Version:** 24.0.2
- **Frameworks supported:** SFRA (Salesforce Reference Architecture) and SiteGenesis JS Controllers
- **External docs:** https://docs.stripe.com/connectors/salesforce-commerce-cloud
- **Repository:** https://github.com/stripe/stripe-sfcc-b2c-connector

---

## Why This Is Open Source — The Customization Model

Commerce Cloud integrations are never pure plug-and-play. Every merchant storefront is different — custom checkout flows, bespoke UI frameworks, existing payment instrument models, OMS integrations, and heavily modified SFRA or SiteGenesis bases. A black-box managed app cannot accommodate this reality.

This connector follows the **Demandware/SFCC cartridge convention**: source code is public and fully readable so that merchants, developers, and implementation partners can:

- **Adapt the cartridge to an existing storefront** — override controllers, templates, and client JS using the standard SFCC cartridge override mechanism without forking the core
- **Build a net-new storefront** with Stripe payments already wired in, using the cartridge as a reference implementation
- **Understand exactly what the code does** — no black-box API calls, no hidden logic; every Stripe API call, webhook handler, and order lifecycle step is visible and auditable
- **Extend without breaking** — the layered cartridge architecture (`int_stripe_core` → `int_stripe_sfra` → `app_stripe_sfra`) is designed so merchants override only the app layer while the integration layer stays intact

**The connector is opinionated about payment flows** (deferred intent, server-side confirmation, SFCC-order-first) — these are non-negotiable constraints that ensure correctness and PCI compliance. **Everything else is flexible**: templates, styling, checkout UX, which payment methods to show, capture behaviour, and how order data maps to downstream systems.

When answering questions about customization, the answer is almost always "yes, and here's where to make that change" — not "that's not supported."

---

## Cartridge Map (Quick Reference)

| Cartridge | Framework | Role |
|---|---|---|
| `int_stripe_core` | Both | Stripe API service layer, helpers, models, jobs, hooks |
| `int_stripe_sfra` | SFRA | SFRA controllers, payment processor hooks, ISML templates |
| `app_stripe_sfra` | SFRA | SFRA client JS (Webpack), checkout overrides, wallet UI |
| `int_stripe_controllers` | SiteGenesis | SiteGenesis payment processor hooks |
| `app_stripe_core` | SiteGenesis | SiteGenesis client JS, checkout templates, static assets |
| `app_stripe_controllers` | SiteGenesis | SiteGenesis app-level controller overrides |
| `bm_stripe` | Both | Business Manager UI: setup, refunds, captures |

Full cartridge path strings and setup: see `.claude/configuration.md`.

---

## Context Files — What to Load & When

### Pre-sales / Capability Questions
*"Does it support X?" / "What payment methods?" / "Which platforms?"*
- Load: `.claude/architecture.md` (capabilities matrix, supported platforms, payment methods)
- Load: `.claude/payment-flows.md` (flow descriptions, what each mode does)

### Engineering — Understanding the Codebase
*"How does X work?" / "Where is Y implemented?"*
- Load: `.claude/architecture.md`
- Load: `.claude/payment-flows.md`

### Engineering — Building a Feature or Fixing a Bug
*"Add X" / "Fix Y" / "Extend Z"*
- Load: `.claude/architecture.md`
- Load: `.claude/payment-flows.md`
- Load: `.claude/anti-patterns.md` ← critical before writing code
- Load: `.claude/webhooks-and-jobs.md` (if touching async flows)

### Configuration / Setup / Deployment
*"How do I set up X?" / "What site preferences exist?" / "How do I deploy?"*
- Load: `.claude/configuration.md`
- Load: `.claude/architecture.md`

### Debugging / Troubleshooting
*"Why is X broken?" / "Order stuck?" / "Webhook not firing?"*
- Load: `.claude/anti-patterns.md` ← start here
- Load: `.claude/webhooks-and-jobs.md`
- Load: `.claude/payment-flows.md` (for the specific flow that's broken)

### Business Manager Usage
*"How do I refund?" / "How do I capture?" / "How do I configure Stripe in BM?"*
- Load: `.claude/configuration.md`

---

## Architectural Invariants (Never Violate These)

1. **SFCC order is created before the Stripe Payment Intent is confirmed.** Do not reverse this order.
2. **Storefront uses `stripeService.js`; Business Manager uses `stripeBMService.js`.** Never cross these.
3. **Inventory is owned entirely by SFCC.** The connector never calls inventory APIs directly.
4. **Webhooks are stored as Custom Objects first, then processed by a scheduled job.** Never process webhooks inline.
5. **All Stripe API calls go through the service layer** (`stripeService.js` / `stripeBMService.js`). Never call `fetch`/`http` directly.
6. **Card Element is deprecated for SFRA since v23.7.0** — all SFRA card work goes through Payment Element. SiteGenesis still uses Card Element (`create('card', ...)`) for new card entry at checkout and adding cards to wallet; do not replace it there without a full SiteGenesis migration.

---

## Key Files Quick Reference

| Need | File |
|---|---|
| Stripe API client (storefront) | `cartridges/int_stripe_core/cartridge/scripts/stripe/services/stripeService.js` |
| Stripe API client (BM) | `cartridges/bm_stripe/cartridge/scripts/services/stripeBMService.js` |
| Checkout logic (PI creation) | `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/checkoutHelper.js` |
| Webhook processing | `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/webhooksHelper.js` |
| Card payment controller | `cartridges/int_stripe_sfra/cartridge/controllers/StripePaymentsCard.js` |
| Payment Element / APM controller | `cartridges/int_stripe_sfra/cartridge/controllers/StripePaymentsAPM.js` |
| Express Checkout controller endpoint | `cartridges/int_stripe_sfra/cartridge/controllers/StripePaymentsAPM.js` → `StripeQuickCheckout` |
| Saved payment methods (wallet) | `cartridges/int_stripe_core/cartridge/scripts/stripe/models/stripeWallet.js` |
| Async webhook job | `cartridges/int_stripe_core/cartridge/scripts/stripe/jobs/processSavedNotifications.js` |
| BM setup / refund / capture | `cartridges/bm_stripe/cartridge/controllers/StripeBM.js` |
| Client JS — SFRA checkout | `cartridges/app_stripe_sfra/cartridge/client/default/js/stripe.checkout.js` |
| Client JS — Express Checkout | `cartridges/app_stripe_sfra/cartridge/client/default/js/stripe.expressCheckout.js` |
| Payment Element template | `cartridges/int_stripe_sfra/cartridge/templates/default/checkout/billing/paymentOptions/stripePaymentElementContent.isml` |

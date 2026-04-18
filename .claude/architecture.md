# Architecture — Stripe SFCC B2C Connector

## Supported Platforms & Capabilities Matrix

| Capability | SFRA | SiteGenesis |
|---|---|---|
| Card payments (Payment Element) | Yes | Yes |
| Card Element (card input) | Deprecated v23.7.0 — replaced by Payment Element | Still active — used for new card entry at checkout and adding cards to wallet |
| Alternative Payment Methods (APMs) | Yes | Yes |
| Express Checkout Element (ECE) | Yes | Yes |
| Mini-cart Express Checkout | Yes | No |
| Bank Transfer payments | Yes | Yes |
| Saved payment methods (Customer Sessions) | Yes | Limited |
| Customer wallet management | Yes | Yes |
| Stripe Radar (fraud scoring) | Yes | Yes |
| 3D Secure (3DS) | Automatic | Automatic |
| Manual capture | Yes | Yes |
| Multi-capture (partial) | Yes (via BM) | Yes (via BM) |
| Refunds (BM-initiated) | Yes | Yes |
| Webhook-driven order finalization | Yes | Yes |

**Supported SFCC versions:** B2C Commerce Cloud (any version supporting SFRA or SiteGenesis JS Controllers)

---

## Cartridge Architecture

### Seven Cartridges, Three Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Core (framework-agnostic)                                │
│  int_stripe_core    Stripe API client, helpers, models, jobs        │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — Integration (framework-specific)                         │
│  int_stripe_sfra         SFRA controllers, hooks, templates         │
│  int_stripe_controllers  SiteGenesis hooks                          │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 3 — Application (overrides & UI)                             │
│  app_stripe_sfra         SFRA client JS (Webpack), checkout mods    │
│  app_stripe_core         SiteGenesis static JS, templates           │
│  app_stripe_controllers  SiteGenesis controller overrides           │
├─────────────────────────────────────────────────────────────────────┤
│  MANAGEMENT                                                         │
│  bm_stripe               Business Manager UI & service client       │
└─────────────────────────────────────────────────────────────────────┘
```

Cartridge path strings: see `configuration.md`.

---

## Service Layer Architecture

Two isolated service files handle all Stripe API communication. **Never cross them.**

### Storefront Service
**File:** `cartridges/int_stripe_core/cartridge/scripts/stripe/services/stripeService.js`

- Used for all checkout and webhook processing
- API key read automatically from `stripeApiKey` site preference
- Idempotency keys generated automatically for write operations
- Card numbers and CVC values are masked in logs

**Exposed namespaces:**
```
stripeService.paymentIntents    → create, retrieve, update, confirm, capture, cancel
stripeService.paymentMethods    → create, retrieve, list, attach, detach
stripeService.customers         → create, retrieve, update, delete, list
stripeService.customerSessions  → create
stripeService.charges           → create, retrieve, update, capture
stripeService.refunds           → create, retrieve, update
stripeService.sources           → create, retrieve (legacy)
```

### Business Manager Service
**File:** `cartridges/bm_stripe/cartridge/scripts/services/stripeBMService.js`

- Used exclusively within Business Manager actions
- API key passed explicitly as a parameter (not from site preferences)
- Supports: refunds, captures

**Why separate:** BM actions allow the operator to provide credentials directly (e.g., when switching between test/live keys for a manual operation) rather than always relying on the site-wide key.

---

## Hook Architecture

Hooks wire the SFCC payment processor pipeline to Stripe logic.

### SFRA Hooks (`int_stripe_sfra/cartridge/hooks.json`)

| Hook | Handler | Purpose |
|---|---|---|
| `app.template.htmlHead` | `loadStripe.js` | Inject Stripe.js into every page |
| `app.payment.processor.stripe_credit` | `stripe_credit.js` | Card payment Handle + Authorize |
| `app.payment.form.processor.stripe_credit` | `stripe_credit.js` | Card form field processing |
| `app.payment.processor.stripe_apm` | `stripe_apm.js` | APM Handle + Authorize |
| `app.payment.form.processor.stripe_apm` | `stripe_apm.js` | APM form field processing |

### Core Hooks (`int_stripe_core/cartridge/hooks.json`)

| Hook | Handler | Purpose |
|---|---|---|
| `dw.order.payment.authorizeCreditCard` | `authorizeCSC.js` | CSC (Call Center) card authorization |
| `dw.order.payment.authorize` | `authorizeCSC.js` | Generic CSC authorization |

### SiteGenesis Hooks (`int_stripe_controllers/cartridge/hooks.json`)

| Hook | Handler | Purpose |
|---|---|---|
| `app.payment.processor.STRIPE_CREDIT` | `STRIPE_CREDIT.js` | SiteGenesis card processor |
| `app.payment.processor.STRIPE_APM` | `STRIPE_APM.js` | SiteGenesis APM processor |

---

## SFRA vs SiteGenesis Differences

| Aspect | SFRA | SiteGenesis |
|---|---|---|
| **Client JS** | Webpack-compiled, `/client/default/js/` | Static files, `/static/default/js/` |
| **Controllers** | REST-style, JSON responses via `server.js` | Pipeline/form-based, HTML responses |
| **Payment Element support** | Full (deferred intent + Customer Sessions) | Basic |
| **Express Checkout** | ECE + Mini-cart support | ECE only (no mini-cart) |
| **Saved cards UI** | Customer Sessions API (v23.9.0+) | Legacy card tab |
| **Template location** | `/templates/default/checkout/billing/paymentOptions/` | `/templates/default/stripe/` |
| **Checkout override** | Extends `CheckoutServices-PlaceOrder` | Replaces pipeline steps |
| **Build tool** | `sgmf-scripts` + Webpack | `sgmf-scripts` |

---

## Data Model — Custom Attributes

All Stripe data is stored in SFCC custom attributes. No separate database.

### Order Custom Attributes (`dw.order.Order.custom`)

| Attribute | Type | Purpose |
|---|---|---|
| `stripePaymentIntentID` | String | Payment Intent ID (pi_*) |
| `stripePaymentSourceID` | String | Legacy source ID (src_*) |
| `stripeIsPaymentIntentInReview` | Boolean | Payment under Radar manual review |
| `stripeRiskLevel` | String | Radar risk level (normal / elevated / highest) |
| `stripeRiskScore` | Number | Radar risk score 0–99 |

### Payment Instrument Custom Attributes (`dw.order.PaymentInstrument.custom`)

| Attribute | Type | Purpose |
|---|---|---|
| `stripeId` | String | Stripe Payment Method ID (pm_*) for saved cards |
| `stripeChargeID` | String | Charge ID (ch_*) — legacy/non-PI flows |
| `stripeAccountId` | String | Connected account ID (for Connect integrations) |
| `stripeAccountType` | String | Connected account type |

### Customer Profile Custom Attributes (`dw.customer.Customer.profile.custom`)

| Attribute | Type | Purpose |
|---|---|---|
| `stripeCustomerID` | String | Stripe Customer ID (cus_*) — permanent link between SFCC customer and Stripe |

### Webhook Custom Object (`StripeWebhookNotifications`)

Stores incoming webhook events for async processing by the scheduled job.
Status lifecycle and field details: see `webhooks-and-jobs.md`.

Payment processor IDs (`STRIPE_CREDIT`, `STRIPE_APM`) and how to register them: see `configuration.md`.

---

## Key Helper Responsibilities

| Helper | File | Responsibility |
|---|---|---|
| `stripeHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | Feature flag checks, payment instrument extraction |
| `checkoutHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | Payment Intent creation, order detail building |
| `webhooksHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | Signature verification, CO storage |
| `stripeCreditHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | Card payment processor Handle + Authorize |
| `stripeApmHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | APM payment processor Handle + Authorize |
| `stripePaymentsHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | APM redirect, order failure, error logging |
| `stripeWalletHelper.js` | `int_stripe_core/scripts/stripe/helpers/` | Wallet add/set-default actions |

## Key Model Responsibilities

| Model | File | Responsibility |
|---|---|---|
| `stripeWallet.js` | `int_stripe_core/scripts/stripe/models/` | Wraps SFCC customer for saved payment operations |
| `customerPaymentInstrument.js` | `int_stripe_core/scripts/stripe/models/` | Represents one saved payment method for display |

---

## Inventory & Order Lifecycle (SFCC-Owned)

The connector never manages inventory directly. SFCC's `OrderMgr` owns it entirely.

```
1. OrderMgr.createOrder(basket)   → Reserves inventory
2. Stripe payment confirmed       → OrderMgr.placeOrder(order) commits reservation
3. Payment fails                  → OrderMgr.failOrder(order, true) releases inventory
```

This is a hard constraint. Do not place or fail orders outside of these three paths.

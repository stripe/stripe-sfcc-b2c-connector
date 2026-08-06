# Configuration — Stripe SFCC B2C Connector

## Setup Methods

There are two ways to configure the connector:

1. **BM Quick Setup (recommended):** Single UI form that configures all site preferences, registers webhooks, and detects framework automatically.
2. **Manual:** Set each site preference individually in Business Manager → Merchant Tools → Site Preferences → Custom Preferences.

---

## BM Quick Setup

**Menu path:** Business Manager → Stripe Integration → Stripe Quick Setup
**Controller:** `StripeBM-HandleStripeQuickSetup`
**File:** `cartridges/bm_stripe/cartridge/controllers/StripeBM.js`

### What Quick Setup Does

1. Accepts: Site IDs (comma-separated), Public Key, Private Key
2. For each site:
   - Detects framework (SFRA vs SiteGenesis) from cartridge path
   - Retrieves Stripe account info (country code, account ID)
   - Deletes any existing webhook for the same URL
   - Creates new webhook with all required events
   - Sets all site preferences listed below
   - Confirms success per site

**Run Quick Setup once per site.** Re-running it recreates the webhook (safe — deletes the old one first).

---

## Site Preferences Reference

All preferences live under: Business Manager → Merchant Tools → Site Preferences → Custom Preferences → Stripe

### Authentication

| Preference | Type | Set By | Notes |
|---|---|---|---|
| `stripeEnabled` | Boolean | Quick Setup | Master on/off switch |
| `stripeApiKey` | String | Quick Setup | Secret/private key (`sk_*` or `rk_*`) |
| `stripePublicKey` | String | Quick Setup | Publishable key (`pk_*`) |
| `stripeWebhookSigningSecret` | String | Quick Setup | Webhook endpoint signing secret (`whsec_*`) |
| `stripeApiVersion` | String | Manual | Stripe API version (e.g., `2023-10-16`) — see API Version section below |
| `stripeApiURL` | String | Manual | Stripe.js URL (default: `https://js.stripe.com/v3/`) |

### Account Info

| Preference | Type | Set By | Notes |
|---|---|---|---|
| `stripeAccountId` | String | Quick Setup | Stripe account ID (`acct_*`) |
| `stripeAccountCountryCode` | String | Quick Setup | Two-letter ISO country code |
| `stripeAccountType` | Enum | Manual | `Standard` / `Express` / `Restricted` |
| `stripeIsSFRA` | Boolean | Quick Setup | Framework detection flag |

### Payment Behavior

| Preference | Type | Default | Notes |
|---|---|---|---|
| `stripeChargeCapture` | Boolean | `true` | `true` = auto-capture; `false` = manual authorize-only |
| `stripeAllowedWebHookStatuses` | Multi-select | (all events) | Webhook event types to process |
| `stripeUpdateInvoiceOnRefundWebhook` | Boolean | `false` | Update SFCC invoice on `charge.refunded` |

### Saved Cards

| Preference | Type | Default | Notes |
|---|---|---|---|
| `stripePaymentElementsSavePaymentsEnabled` | Boolean | `false` | Enable save payment method in Payment Element |
| `isCVCRecollectionEnabled` | Boolean | `false` | Require CVC re-entry for saved cards |
| `stripeSaveCustomerCards` | Enum | `ask` | Guest card saving: `always` / `ask` / `never` |

### UI / Appearance

| Preference | Type | Notes |
|---|---|---|
| `stripeCardElementCSSStyle` | JSON String | Custom CSS for card element (legacy) |
| `stripePaymentElementCSSStyle` | JSON String | Custom CSS for Payment Element |
| `stripeExpressCheckoutAppearance` | JSON String | Appearance object for Express Checkout Element |
| `stripePaymentMethodsInBeta` | String | Comma-separated beta feature flags |

---

## Payment Methods Setup

**Menu path:** Business Manager → Stripe (per-site) → Stripe Payment Methods Setup
**Controller:** `StripeBM-HandlePaymentsSetup`

This tool generates a `payment-methods.xml` file that you import into SFCC to register the Stripe payment processors.

### Step-by-Step

1. Go to Stripe Payment Methods Setup in BM
2. Check the payment methods you want to enable
3. Click Generate — downloads `payment-methods.xml`
4. Import via: Business Manager → Merchant Tools → Ordering → Import & Export → Payment Methods

### Required Payment Method IDs

| ID | Name | Processor |
|---|---|---|
| `STRIPE_CREDIT` | Stripe Credit Card | `STRIPE_CREDIT` |
| `STRIPE_APM` | Stripe Alternative Payment Methods | `STRIPE_APM` |

At minimum, one of these must be enabled. Both can be enabled simultaneously.

---

## Cartridge Path Configuration

**Critical:** Cartridge path order determines which cartridge overrides take precedence.

### SFRA Path
```
int_stripe_core:int_stripe_sfra:app_stripe_sfra:app_storefront_base
```

### SiteGenesis Path
```
int_stripe_core:int_stripe_controllers:app_stripe_core:app_stripe_controllers:sitegenesis_storefront_core
```

### Business Manager Path
```
bm_stripe:bm_app_storefront_base
```

Configure in: Business Manager → Administration → Sites → Manage Sites → [Site] → Settings → Cartridges

---

## Metadata Files

All SFCC metadata (site preferences, services, jobs, custom objects) is in the `metadata/` directory.

```
metadata/
  sfcc_metadata/
    meta/
      system-objecttype-extensions.xml   ← Custom attributes on Order, PaymentInstrument, Customer
    services/
      services.xml                       ← stripe.http.service definition
    jobs/
      jobs.xml                           ← StripeProcessWebhookNotifications, StripeDeleteCustomObjects
    customobjects/
      StripeWebhookNotifications.xml     ← Webhook CO type definition
```

### Importing Metadata

1. Business Manager → Administration → Site Development → Site Import & Export
2. Upload the `sfcc_metadata` folder as a ZIP
3. Import in order: `system-objecttype-extensions.xml` → `services.xml` → `jobs.xml` → custom objects

---

## Service Configuration

**Service name:** `stripe.http.service`

Defined in `metadata/sfcc_metadata/services/services.xml`.

| Field | Value |
|---|---|
| Service ID | `stripe.http.service` |
| Type | HTTP |
| Base URL | `https://api.stripe.com` |
| Auth type | Basic Auth (API key set in code, not in service config) |

**Do not store the API key in the service configuration.** The connector reads `stripeApiKey` from site preferences at runtime and sets the `Authorization` header programmatically. This allows per-site key configuration.

---

## Jobs Configuration

Both jobs are defined in `metadata/sfcc_metadata/jobs/jobs.xml` and must be scheduled in Business Manager after import.

**Menu path:** Business Manager → Administration → Operations → Jobs

### Recommended Schedules

| Job | Recommended Schedule | Notes |
|---|---|---|
| `StripeProcessWebhookNotifications` | Every 5–15 minutes | More frequent = faster APM order finalization |
| `StripeDeleteCustomObjects` | Daily (off-peak) | Housekeeping; run after processing job |

### Configuring StripeDeleteCustomObjects

Set the `PROCESSED` parameter to `true` at minimum. Only set `FAIL_OR_CANCEL` to `true` after reviewing failed notifications to ensure no unprocessed events are deleted.

---

## Stripe API Version

### How It Works

`stripeApiVersion` is a site preference that flows into **two places simultaneously**:

1. **Server-side** — sent as the `Stripe-Version` HTTP header on every Stripe API call in `stripeService.js`:
   ```javascript
   svc.addHeader('Stripe-Version', apiVersion); // stripeService.js line 150
   ```

2. **Client-side** — injected into the page via `loadStripe.isml` as a hidden input, then read by `stripe.checkout.js` and `stripe.expressCheckout.js` to initialize the Stripe.js client:
   ```javascript
   var stripeApiVersion = document.getElementById('stripeApiVersion').value;
   if (stripeApiVersion) {
       stripeOptions.apiVersion = stripeApiVersion;
   }
   var stripe = Stripe(publicKey, stripeOptions);
   ```

This means a single site preference controls the API version for both the server API calls and the client Stripe.js Element behaviour.

### What Happens If Left Blank

If `stripeApiVersion` is empty, the `Stripe-Version` header is sent as `null`/empty. Stripe then falls back to the **account's default pinned API version** set on the Stripe Dashboard. This may differ from the version the connector was built and tested against, and can cause subtle inconsistencies.

**Always set an explicit value.**

### Can You Change It?

Yes — but with caution. The connector is not hardcoded to a specific version; the preference is the single source of truth. However:

- The connector code was written and tested against a specific API version. Upgrading to a newer version may surface **changed response shapes**, **renamed fields**, or **deprecated parameters** that break the integration silently.
- The server-side version and client-side version **must always match**. Since both are driven from the same preference, this is automatic — but if you ever override one independently (e.g., in a customization), mismatches will cause inconsistent behaviour between what the Payment Element renders and what the server processes.
- Stripe API versioning is additive for non-breaking changes but some upgrades are breaking. Always test a version change end-to-end (card, APM, webhook, refund, ECE) in a staging environment before applying to production.

### Recommendation

Set `stripeApiVersion` to the version explicitly listed in the connector's release notes for your installed version. Only upgrade when you have tested the full payment flow against the new version.

---

## Deployment Checklist

### First-Time Setup

- [ ] Import metadata (system-objecttype-extensions, services, jobs, custom objects)
- [ ] Add cartridges to cartridge path (correct order)
- [ ] Run BM Quick Setup for each site (enter public + secret keys)
- [ ] Import `payment-methods.xml` generated by BM Payment Methods Setup
- [ ] Schedule both jobs in BM
- [ ] Verify `stripe.http.service` exists under Administration → Operations → Services
- [ ] Place a test order using Stripe test keys

### Per-Feature Configuration

| Feature | Additional Steps |
|---|---|
| Express Checkout (product/cart) | Set `stripeExpressCheckoutAppearance` if custom branding needed |
| Saved payment methods | Enable `stripePaymentElementsSavePaymentsEnabled = true` |
| CVC re-collection | Enable `isCVCRecollectionEnabled = true` |
| Manual capture | Set `stripeChargeCapture = false`; schedule monitoring for uncaptured PIs |
| Bank Transfer | No extra config; enabled automatically when STRIPE_APM is active |
| Radar risk score display | No extra config; BM order view shows risk score if Radar is active on account |

### Going Live (Test → Production)

1. Swap test keys (`pk_test_*`, `sk_test_*`) for live keys (`pk_live_*`, `sk_live_*`) in site preferences
2. Re-run BM Quick Setup with live keys to re-register webhooks (new signing secret)
3. Confirm `stripeWebhookSigningSecret` updated in site preferences
4. Place a live test order with a real card

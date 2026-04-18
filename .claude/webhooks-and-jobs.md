# Webhooks & Jobs — Stripe SFCC B2C Connector

## Why Webhooks Matter Here

Many payment methods (APMs, Bank Transfer) are asynchronous — the payment is not confirmed at the moment the customer clicks "Place Order." The connector uses a two-stage pattern:

1. **Ingestion:** Webhook arrives → stored as a Custom Object immediately (fast, reliable)
2. **Processing:** Scheduled job reads Custom Objects → places/fails orders

This decoupling means the connector never blocks a webhook response on order logic, and order processing can be retried if it fails.

---

## Webhook Ingestion Flow

**Endpoint:** `POST Stripe-WebHook`
**Controller:** `cartridges/int_stripe_sfra/cartridge/controllers/Stripe.js`
**Handler:** `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/webhooksHelper.js`

### Ingestion Sequence

```
1. Stripe POST to https://<site>/Stripe-WebHook
   ↓
2. Read raw request body (must be raw bytes, not parsed)
   ↓
3. Parse Stripe-Signature header:
   - Format: "t=<timestamp>,v1=<sig1>,v1=<sig2>"
   - Extract: timestamp, signatures array
   ↓
4. Compute expected signature:
   HMAC-SHA256(key=stripeWebhookSigningSecret, data="<timestamp>.<raw_body>")
   ↓
5. Compare computed signature against each v1 signature in header
   - Mismatch → return HTTP 500 (Stripe will retry)
   - Match → continue
   ↓
6. Check timestamp tolerance (prevent replay attacks)
   ↓
7. Parse JSON body → extract event type
   ↓
8. Validate event type is in stripeAllowedWebHookStatuses site preference
   - Not in allowlist → return 200 (silently ignore)
   ↓
9. Filter out card source events (isSourceHasValidType)
   - Ignores events where source ID starts with 'card_'
   ↓
10. Store as Custom Object: StripeWebhookNotifications
    - Key: Stripe event ID (prevents duplicate processing)
    - Status: UNKNOWN
    - Body: full JSON payload
    ↓
11. Return HTTP 200
```

**Critical:** Always return 200 after storing the event. Never return 200 before storing. If storage fails, return 500 so Stripe retries.

---

## Webhook Signature Verification

**File:** `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/webhooksHelper.js`

```javascript
// Header parsing
function parseHeader(header) {
    // Returns: { timestamp: '...', signatures: ['sig1', 'sig2'] }
}

// Signature computation
function computeSignature(timestamp, payload, secret) {
    // HMAC-SHA256(secret, timestamp + "." + payload)
    // Returns hex string
}
```

**The signing secret** (`stripeWebhookSigningSecret`) is set per site and comes from the Stripe Dashboard webhook configuration. It is set automatically by the BM Quick Setup or can be configured manually in Site Preferences.

---

## Custom Object Storage

**Type:** `StripeWebhookNotifications`

| Status | Meaning |
|---|---|
| `UNKNOWN` | Received, awaiting processing |
| `PROCESS` | Currently being processed by job |
| `PROCESSED` | Successfully handled |
| `FAIL_OR_CANCEL` | Processing failed; may need manual review |
| `PENDING_CHARGE` | Waiting for charge to be created (intermediate state) |

The job queries for objects with status `UNKNOWN` and `PENDING_CHARGE`.

---

## Job: Process Webhook Notifications

**ID:** `custom.StripeProcessWebhookNotifications`
**File:** `cartridges/int_stripe_core/cartridge/scripts/stripe/jobs/processSavedNotifications.js`
**Trigger:** Scheduled in Business Manager (recommended: every 5–15 minutes)

### Processing Sequence

```
1. Query CustomObjectMgr for StripeWebhookNotifications WHERE status IN (UNKNOWN, PENDING_CHARGE)
   ↓
2. For each notification:
   a) Mark status = PROCESS (prevent concurrent processing)
   b) Parse event JSON
   c) Branch by event type:
      ↓
      ┌─ payment_intent.succeeded
      │   → Find SFCC order by PI ID
      │   → OrderMgr.placeOrder(order)
      │   → order.setConfirmationStatus(CONFIRMED)
      │   → order.setPaymentStatus(PAID)
      │   → order.setExportStatus(READY)
      │   → Send confirmation email
      │
      ├─ payment_intent.payment_failed
      │   → Find order
      │   → OrderMgr.failOrder(order, true)   ← releases inventory
      │   → Send failure email to customer
      │
      ├─ charge.succeeded
      │   → Update order payment status
      │
      ├─ charge.failed
      │   → Fail order
      │
      ├─ charge.refunded
      │   → If stripeUpdateInvoiceOnRefundWebhook=true: update invoice status
      │   → Send refund email
      │   → Log refund amount on order
      │
      ├─ source.chargeable
      │   → Create charge for source (legacy APM flow)
      │
      ├─ source.canceled / source.failed
      │   → Fail order
      │
      ├─ review.opened
      │   → order.custom.stripeIsPaymentIntentInReview = true
      │   → Do NOT fail order (payment may still succeed after review)
      │
      └─ review.closed
          → order.custom.stripeIsPaymentIntentInReview = false
          → Update order status based on review outcome
   ↓
3. Mark notification status = PROCESSED (or FAIL_OR_CANCEL on error)
```

---

## Job: Delete Old Custom Objects

**ID:** `custom.StripeDeleteCustomObjects`
**File:** `cartridges/int_stripe_core/cartridge/scripts/stripe/jobs/deleteCustomObjectsStep.js`
**Purpose:** Housekeeping — removes processed webhook Custom Objects to prevent database bloat

**Parameters (each is a boolean):**

| Parameter | Default | Deletes objects with status |
|---|---|---|
| `PROCESSED` | true | `PROCESSED` |
| `FAIL_OR_CANCEL` | false | `FAIL_OR_CANCEL` |
| `PENDING_CHARGE` | false | `PENDING_CHARGE` |
| `PROCESS` | false | `PROCESS` (in-progress, use with caution) |
| `UNKNOWN` | false | `UNKNOWN` (unprocessed, use with caution) |

**Recommended schedule:** Run daily, after `StripeProcessWebhookNotifications` completes.

---

## Webhook Event Catalog

Events enabled by default during BM Quick Setup:

| Event | Trigger | Action |
|---|---|---|
| `payment_intent.succeeded` | Payment confirmed | Place order, mark PAID |
| `payment_intent.payment_failed` | Payment declined | Fail order, email customer |
| `charge.succeeded` | Charge captured | Update payment status |
| `charge.failed` | Charge declined | Fail order |
| `charge.refunded` | Refund issued | Update invoice, email customer |
| `source.chargeable` | APM source ready (legacy) | Create charge |
| `source.canceled` | APM source expired (legacy) | Fail order |
| `source.failed` | APM source failed (legacy) | Fail order |
| `review.opened` | Radar flagged payment | Mark order as in-review |
| `review.closed` | Radar review resolved | Update order status |

**To add new events:** Update `stripeAllowedWebHookStatuses` site preference AND add a handler case in `processSavedNotifications.js`.

---

## Retry & Error Handling

| Scenario | Behavior |
|---|---|
| Invalid signature | Return 500 → Stripe retries with exponential backoff |
| Storage failure | Return 500 → Stripe retries |
| Event not in allowlist | Return 200, discard (no retry) |
| Duplicate event ID | CO key collision → silently skipped (SFCC CustomObjectMgr deduplicates) |
| Job processing error | Status = `FAIL_OR_CANCEL`; Stripe won't retry (200 was already sent) |
| Job not running | Objects accumulate in `UNKNOWN` state; process when job resumes |

**Monitoring recommendation:** Alert on Custom Objects stuck in `UNKNOWN` or `PROCESS` status for more than 30 minutes, which typically indicates the job is not running.

---

## Webhook Registration

The connector registers webhooks automatically during BM Quick Setup:

1. Calls `DELETE /webhook_endpoints/{id}` to remove any existing endpoint for the same URL
2. Calls `POST /webhook_endpoints` to create a new endpoint with all required event types
3. Stores the returned `signing_secret` in `stripeWebhookSigningSecret` site preference

**Webhook URL format:** `https://<site-hostname>/Stripe-WebHook`

If you register webhooks manually on the Stripe Dashboard, you must copy the signing secret into the `stripeWebhookSigningSecret` site preference.

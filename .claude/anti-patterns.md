# Anti-Patterns — Stripe SFCC B2C Connector

Real failure modes derived from the codebase, changelog history, and known edge cases.
Read this file before writing or modifying any payment or order logic.

---

## 1. Reversing the Order-Then-Payment Sequence

**Never create a Payment Intent before creating the SFCC order.**

```javascript
// WRONG
stripeService.paymentIntents.create(...)
OrderMgr.createOrder(basket)

// CORRECT
OrderMgr.createOrder(basket)           // inventory reserved
stripeService.paymentIntents.create(...)
```

**Why it breaks:** If the SFCC order creation fails after the Payment Intent is created, you have a charge in Stripe with no corresponding order. Inventory is not reserved. The customer's card may be charged.

**History:** Corrected as a major hotfix in v22.4.0 after production issues with payment discrepancies.

---

## 2. Processing Webhooks Inline (Synchronously)

**Never place or fail an order directly inside the webhook controller.**

```javascript
// WRONG — inside Stripe-WebHook controller
var order = OrderMgr.getOrder(orderNo);
OrderMgr.placeOrder(order);
res.setStatusCode(200);

// CORRECT
webhooksHelper.processIncomingNotification(); // stores to Custom Object
res.setStatusCode(success ? 200 : 500);       // job handles the rest
```

**Why it breaks:** The webhook endpoint must respond within Stripe's timeout window (30 seconds). Order placement, email sending, and export-status updates can exceed this. A timeout causes Stripe to retry, resulting in duplicate order placements.

---

## 3. Using `handleCardAction` for 3DS (Replaced by `handleNextAction`)

**Do not call `stripe.handleCardAction()` for 3DS flows. Use `stripe.handleNextAction()` instead.**

```javascript
// WRONG (pre-v23.8.0, now broken for many APMs)
stripe.handleCardAction(clientSecret)

// CORRECT
stripe.handleNextAction({ clientSecret })
```

**Why it breaks:** `handleCardAction` only handles card-specific actions. `handleNextAction` handles all payment method types including 3DS, redirects, vouchers, etc. Updated in v23.8.0.

---

## 4. Using the Card Element for New SFRA Work (Deprecated since v23.7.0)

**Do not build new card payment functionality using the Card Element in SFRA.**

The Card Element was deprecated for SFRA in v23.7.0. All SFRA card payment work must go through the **Payment Element**.

```javascript
// WRONG — for SFRA new work
stripe.elements().create('card', ...)

// CORRECT — for SFRA
stripe.elements(paymentElementOptions).create('payment', ...).mount('#payment-element')
```

**Why it matters:** The Card Element does not support Confirmation Tokens, deferred intents, or Customer Sessions. Any new SFRA feature built on the Card Element will be incompatible with the current payment flow architecture.

**SiteGenesis exception:** The Card Element remains the active implementation in SiteGenesis — both for new card entry at checkout (`stripe.checkout.js`, `elements.create('card', ...)`) and for adding cards to the wallet (`stripe.newcardform.js`). Do not remove or replace these. Saved cards in SiteGenesis are displayed as HTML radio buttons (not via a Stripe element); the Card Element is only used when the customer enters a new card.

---

## 5. Creating a Payment Intent Without a Confirmation Token (Card Flow)

**Since v23.7.0, the card flow requires a Confirmation Token. Do not create a Payment Intent without one.**

```javascript
// WRONG — bypasses confirmation token requirement
stripeService.paymentIntents.create({ amount, currency, payment_method: pm_* })

// CORRECT
// 1. Client creates confirmation token
stripe.createConfirmationToken({ elements }) // → ct_*
// 2. Server creates PI with confirmation token
stripeService.paymentIntents.create({ confirmation_token: ct_*, ... })
```

**Why it breaks:** The confirmation token embeds payment method details, billing info, and device fingerprint. Skipping it means the PI is created without card details and cannot be confirmed without an extra round-trip.

---

## 6. Calling `OrderMgr.placeOrder()` Without Checking PI Status First

**Always validate the Payment Intent status before placing the order.**

```javascript
// WRONG
OrderMgr.placeOrder(order); // placed regardless of payment status

// CORRECT
if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
    OrderMgr.placeOrder(order);
} else {
    OrderMgr.failOrder(order, true);
}
```

**Valid statuses to place on:**
- Manual capture: `requires_capture`
- Auto capture: `succeeded`

Any other status (e.g., `requires_action`, `requires_payment_method`, `canceled`) must result in `OrderMgr.failOrder()`.

---

## 7. Closing the 3DS Popup Causing Order Failure with Successful Payment

**Do not treat a missing `requires_action` response from the client as a payment failure.**

**Background:** If a customer confirms 3DS and then closes the browser/popup before the response returns to your page, the client never sends `CardPaymentHandleRequiresAction`. The Payment Intent may already be `succeeded` in Stripe, but the SFCC order is stuck.

**Pattern:** On `StripePaymentsAPM-FailOrder`, check the actual PI status via the Stripe API before failing the order:

```javascript
var paymentIntent = stripeService.paymentIntents.retrieve(piId);
if (paymentIntent.status === 'succeeded') {
    // Place the order, do not fail it
}
```

**History:** Fixed in v24.0.2. The empty 3DS error message was also addressed in the same release.

---

## 8. Hardcoding the API Key in the Service Configuration

**Never store the Stripe API key in `services.xml` or the SFCC service profile.**

The service reads the key from `stripeApiKey` site preference at runtime:

```javascript
// In stripeService.js — this is the correct pattern
const apiKey = Site.current.getCustomPreferenceValue('stripeApiKey');
svc.setAuthentication('NONE');
svc.addHeader('Authorization', 'Bearer ' + apiKey);
```

**Why it matters:** Storing keys in service config exposes them to anyone with BM access to the service profile, and makes multi-site key management impossible.

---

## 9. Ignoring Idempotency Keys on Retried Requests

**All write operations to the Stripe API must use idempotency keys.**

The service layer generates these automatically (`stripeService.js`). Do not bypass the service layer with raw HTTP calls.

**Why it matters:** Without idempotency keys, network retries can create duplicate Payment Intents, charges, or refunds. This is especially dangerous in webhook processing where the job may retry a step.

**History:** Idempotency key implementation added/hardened in v24.0.2.

---

## 10. Using `stripeBMService` in Storefront Code

**`stripeBMService` is for Business Manager only. Never import it in storefront controllers or helpers.**

```javascript
// WRONG — in a storefront controller
var stripeBMService = require('*/cartridge/scripts/services/stripeBMService');

// CORRECT — in a storefront controller
var stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
```

**Why it breaks:** `stripeBMService` requires an explicit API key parameter. Storefront code does not have access to the key at the call site — it is read from site preferences by `stripeService`. Using the wrong service will result in missing auth headers or runtime errors.

---

## 11. Not Releasing Inventory on Payment Failure

**Always call `OrderMgr.failOrder(order, true)` (with `true`) when a payment fails, not `failOrder(order, false)`.**

```javascript
// WRONG — inventory not released
OrderMgr.failOrder(order, false);

// CORRECT — inventory released back to stock
OrderMgr.failOrder(order, true);
```

The `true` parameter triggers SFCC's inventory release mechanism. Without it, inventory stays reserved for a failed order.

---

## 12. Re-registering Webhooks Without Deleting the Old Endpoint

**When re-running BM Quick Setup or creating webhooks manually, always delete the existing endpoint for the same URL first.**

Stripe does not deduplicate webhooks by URL. Running setup twice without deleting creates two endpoints both firing for every event, resulting in duplicate Custom Objects and potential duplicate order placements.

The BM Quick Setup handles this automatically:
1. Lists existing webhook endpoints
2. Finds any with matching URL
3. Deletes them
4. Creates a new one

If registering manually, always check the Stripe Dashboard for existing endpoints.

---

## 13. Expecting Bank Transfer Orders to Finalize Immediately

**Bank Transfer is asynchronous. Orders may stay in `Created` status for 1–5 business days.**

Do not build fulfillment triggers based on order creation for Bank Transfer. Trigger fulfillment only on `PAYMENT_STATUS_PAID`, which is set by the webhook job after `charge.succeeded` fires.

---

## 14. Duplicated API Key in Service Headers (Fixed in v23.9.1)

**Do not add the API key to both the `Authorization` header and a custom header.**

Pre-v23.9.1 code accidentally sent the API key twice. If you are extending the service layer, add the key only once:

```javascript
svc.addHeader('Authorization', 'Bearer ' + apiKey);
// Do NOT also add: svc.addHeader('Stripe-API-Key', apiKey)
```

---

## 15. Billing Address Site Preference Not Populating (Fixed in v24.0.1)

**The site preference for billing details collection in the Payment Element requires a specific format.**

If the Payment Element is not pre-populating billing details, verify:
1. `stripePaymentElementCSSStyle` is valid JSON (not plain string)
2. The billing address fields are not hidden by the appearance object

This was a bug in v24.0.0 that caused billing collection preferences to be silently ignored. Fixed in v24.0.1.

---

## 16. Leaving `stripeApiVersion` Blank or Overriding It in One Place Only

**Always set `stripeApiVersion` explicitly. Never override the server-side version without also updating the client-side, or vice versa.**

The API version controls both the `Stripe-Version` header on server API calls and the `apiVersion` option passed to `Stripe(publicKey, { apiVersion })` on the client. Both are read from the same site preference — so if you leave it blank, Stripe falls back to your account's pinned default (which may not match what the connector was tested against), and if you override one independently in a customization, they diverge.

**What breaks when they diverge:** the Payment Element may render fields or collect data shaped for one API version while the server creates/confirms the Payment Intent against a different version — causing confirmation failures or silently dropped fields.

---

## Architectural Invariants Summary

These must never be violated regardless of the change being made:

| Rule | Reason |
|---|---|
| SFCC order before Stripe PI | Inventory safety, no orphaned charges |
| Webhooks stored → processed async | Timeout protection, reliability |
| Storefront uses `stripeService`, BM uses `stripeBMService` | Security, per-site key management |
| All Stripe calls via service layer | Idempotency, logging, masking |
| `failOrder(order, true)` on payment failure | Inventory release |
| Card Form is deprecated; use Payment Element | Compatibility with current architecture |
| No API keys in service config | Security, multi-site support |

# Payment Flows — Stripe SFCC B2C Connector

## Core Architectural Concepts

Before reading any individual flow, understand these three foundational decisions that shape the entire integration.

### 1. Deferred Intent

The connector uses **deferred PaymentIntent creation** — the Payment Intent is NOT created when the Payment Element loads. It is created only when the customer clicks "Place Order."

This means:
- No PI is created for abandoned checkouts
- The PI amount is always accurate (basket is final at submit time)
- The SFCC order is always created before the PI (inventory is reserved first)

### 2. Server-Side Confirmation (Card Flow)

For card payments, the PI is confirmed **server-side** using a Confirmation Token:

```
Client: stripe.createConfirmationToken({ elements })  → ct_*  (embeds card details)
Server: paymentIntents.create({ confirmation_token: ct_* })    (creates + confirms in one API call)
```

The server owns confirmation. The client never calls `stripe.confirmCard*` directly for the initial charge. This pattern is required for PCI compliance — raw card data never touches the server, but the server controls when the charge is finalized.

For APMs (non-card), confirmation is **client-side** via `stripe.confirmPayment()` after the server creates the PI and returns the `clientSecret`. The server cannot confirm redirect-based APMs (iDEAL, Klarna, etc.) because the customer must be redirected to the provider first.

### 3. `automatic_payment_methods`

APM and Payment Element flows are initialized with `automatic_payment_methods: { enabled: true }`. This tells Stripe to dynamically show all payment methods enabled on the Stripe account for the given currency/country — without hardcoding a list. Adding a new payment method in the Stripe Dashboard activates it in the Payment Element automatically, with no code changes required.

Bank Transfer is the **one exception** — it uses `payment_method_types: ['customer_balance']` and runs through a dedicated element and checkout flow, not the standard Payment Element.

---

## Overview of Payment Modes

| Mode | Processor | Confirmation | PI Creation |
|---|---|---|---|
| Card (Payment Element) | `STRIPE_CREDIT` | Server-side via Confirmation Token | On order submit |
| APM / Payment Element | `STRIPE_APM` | Client-side via `stripe.confirmPayment()` | On order submit |
| Express Checkout (ECE) | `STRIPE_APM` | Server-side (pm_* passed directly) | On ECE confirm |
| Bank Transfer | `STRIPE_APM` | Client-side, separate element + flow | On order submit |
| Saved Payment Methods | `STRIPE_CREDIT` / `STRIPE_APM` | Follows card or APM path above | On order submit |

---

## 1. Card Payment Flow (Payment Element)

**A Confirmation Token is created client-side before the Payment Intent is created server-side.**

### Sequence

```
1. Customer reaches billing step
   ↓
2. GET StripePaymentsAPM-GetPaymentElementOptions
   ← Server returns: { mode, currency, amount, appearance, customerSessionClientSecret }
   ↓
3. Client: stripe.elements(options) → mount Payment Element
   ↓
4. Customer fills card details, clicks "Place Order"
   ↓
5. Client: stripe.createConfirmationToken({ elements }) → ct_*
   ↓
6. POST StripePaymentsCard-CardPaymentSubmitOrder
   Body: { confirmationToken: ct_* }
   Server:
     a) Validate basket
     b) OrderMgr.createOrder(basket)       ← SFCC order created FIRST
     c) stripeService.paymentIntents.create({ confirmation_token: ct_*, capture_method })
     d) If status = 'requires_action' → return { requiresAction: true, clientSecret }
     e) If status = 'succeeded' or 'requires_capture' → place order, mark PAID/NOTPAID
   ↓
7a. Status = succeeded / requires_capture (no 3DS needed):
    - OrderMgr.placeOrder(order)
    - order.setPaymentStatus(PAYMENT_STATUS_PAID or NOTPAID for manual capture)
    - Send confirmation email
    - Redirect to confirmation page
    ↓
7b. Status = requires_action (3DS):
    - Client receives clientSecret
    - stripe.handleNextAction(clientSecret) → browser shows 3DS challenge
    ↓
8. POST StripePaymentsCard-CardPaymentHandleRequiresAction
   Body: { paymentIntentId }
   Server: retrieve PI, re-validate status, place order
```

**Key files:**
- Controller: `cartridges/int_stripe_sfra/cartridge/controllers/StripePaymentsCard.js`
- Processor: `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/stripeCreditHelper.js`
- Client: `cartridges/app_stripe_sfra/cartridge/client/default/js/stripe.checkout.js`

---

## 2. APM / Payment Element Flow (Deferred Intent)

**All non-card payment methods go through `STRIPE_APM`. Order finalization is async (webhook-driven).**

### Sequence

```
1. Customer reaches billing step
   ↓
2. GET StripePaymentsAPM-GetPaymentElementOptions
   ← Same options endpoint as card, but Payment Element shows all enabled APMs
   ↓
3. Client: stripe.elements(options) → mount Payment Element
   ↓
4. Customer selects APM (e.g., iDEAL, Klarna, PayPal), clicks "Place Order"
   ↓
5. POST StripePaymentsAPM-PaymentElementSubmitOrder
   Server:
     a) Validate basket
     b) OrderMgr.createOrder(basket)       ← SFCC order created FIRST
     c) stripeService.paymentIntents.create({ automatic_payment_methods, capture_method })
     d) Return { clientSecret } to client
   ↓
6. Client: stripe.confirmPayment({ elements, clientSecret, redirect: 'if_required' })
   - For redirect-based APMs: browser redirects to payment provider
   - For non-redirect: resolves inline
   ↓
7. (Redirect-based) Customer completes payment on provider's page
   → Redirected back to: Stripe-PaymentElementOrderPlaced
   ↓
8. Stripe sends webhook: payment_intent.succeeded
   → Job: processSavedNotifications
   → OrderMgr.placeOrder(order)
   → order.setPaymentStatus(PAYMENT_STATUS_PAID)
   → Send confirmation email
```

**Critical:** For APMs, `OrderMgr.placeOrder()` is called from the webhook job, NOT from the controller. The order remains in `Created` status until the webhook is processed.

**Key files:**
- Controller: `cartridges/int_stripe_sfra/cartridge/controllers/StripePaymentsAPM.js`
- Processor: `cartridges/int_stripe_core/cartridge/scripts/stripe/helpers/stripeApmHelper.js`
- Job: `cartridges/int_stripe_core/cartridge/scripts/stripe/jobs/processSavedNotifications.js`

---

## 3. Express Checkout Element (ECE) Flow

**Allows one-click checkout via Apple Pay, Google Pay, or Link — from product page, cart, or mini-cart.**

### Entry Points

ECE is rendered in three locations, each with different amount calculation and template behaviour:

| Location | Template | Amount Source | Framework |
|---|---|---|---|
| Product detail page (PDP) | `stripeExpressCheckoutButton.isml` | `product.price.sales.value × quantity` (client-side) | SFRA + SiteGenesis |
| Cart page | `stripeExpressCheckoutButton.isml` | Basket total from hidden `stripe_order_amount` field | SFRA + SiteGenesis |
| Mini-cart | `stripeMinicartExpressCheckoutButton.isml` | Basket total from hidden field | **SFRA only** |

PDP and cart share the same template but behave differently: the PDP calculates the amount client-side from product price × selected quantity, while cart and mini-cart use a pre-computed server-side basket total. The mini-cart uses a dedicated template and is not available in SiteGenesis.

### Sequence

```
1. Page load: ECE button mounts
   - stripe.elements({ mode: 'payment', currency, amount, capture_method })
   - elements.create('expressCheckout').mount('#express-checkout-element')
   ↓
2. Customer clicks Apple Pay / Google Pay / Link button
   → Browser/OS shows payment sheet
   ↓
3. Customer authenticates and confirms payment in the sheet
   → ECE returns: { paymentMethod, shippingAddress, billingAddress, email }
   ↓
4. POST StripePaymentsAPM-StripeQuickCheckout
   Body: { paymentMethodId, shippingAddress, billingAddress, email }
   Server:
     a) Set shipping address on basket
     b) Set billing address on basket
     c) Calculate shipping methods
     d) Set selected shipping method
     e) OrderMgr.createOrder(basket)
     f) stripeService.paymentIntents.create({ payment_method: pm_*, confirm: true })
     g) Place order, set payment status
     h) Send confirmation email
   ↓
5. Redirect to order confirmation page
```

### Amount Calculation

The amount displayed in the payment sheet is calculated client-side:

```javascript
// Product page: price × quantity (in cents)
var productTotalPrice = product.price.sales.value * 100;
return productTotalPrice * quantitySelected + shippingCost;

// Cart / mini-cart: basket total (pre-calculated server-side)
return parseInt(document.getElementById('stripe_order_amount').value, 10);
```

**Shipping options** are fetched via `GET Stripe-GetShippingOptions` and passed to the ECE payment sheet, allowing the customer to select a shipping method before confirming payment.

**Key files:**
- Controller endpoint: `StripePaymentsAPM-StripeQuickCheckout`
- Client: `cartridges/app_stripe_sfra/cartridge/client/default/js/stripe.expressCheckout.js`
- Templates: `cartridges/int_stripe_sfra/cartridge/templates/default/checkout/billing/paymentOptions/`

---

## 4. Bank Transfer Flow

**Bank Transfer is architecturally distinct from all other payment methods.** It does not use the standard Payment Element or `automatic_payment_methods`. It has its own dedicated element, its own options endpoint, and `payment_method_types: ['customer_balance']` — making it a fully separate checkout path that must be treated independently from the APM flow.

**It is fully asynchronous. Funds are received via webhook, not at checkout time.**

### Sequence

```
1. Customer selects "Bank Transfer" at checkout
   ↓
2. GET StripePaymentsAPM-GetBankTransferElementOptions
   ← Returns: { elementOptions: { mode: 'payment', payment_method_types: ['customer_balance'] }, customerEmail }
   ↓
3. Client: stripe.elements(options) → mount Bank Transfer Element
   → Customer sees bank account details + transfer instructions
   ↓
4. POST StripePaymentsAPM-PaymentElementSubmitOrder (same as APM)
   → Order created in SFCC (status: Created)
   → Payment Intent created with payment_method_types: ['customer_balance']
   → Client receives clientSecret
   ↓
5. Client: stripe.confirmPayment(...)
   → No redirect — customer is shown instructions to transfer funds
   ↓
6. Customer initiates bank transfer from their bank
   ↓
7. Stripe receives funds → fires: charge.succeeded webhook
   → Job processes webhook
   → OrderMgr.placeOrder(order)
   → order.setPaymentStatus(PAYMENT_STATUS_PAID)
```

**Timing note:** Bank transfers can take 1–5 business days. The order remains in `Created` status until the webhook fires. Design any downstream OMS or fulfillment integrations to handle this delay.

**Key files:**
- Options endpoint: `StripePaymentsAPM-GetBankTransferElementOptions`
- Template: `cartridges/int_stripe_sfra/cartridge/templates/default/checkout/billing/paymentOptions/stripeBankTransferElementContent.isml`

---

## 5. Saved Payment Methods (Customer Sessions)

**Introduced in v23.9.0, replacing the legacy saved cards tab.**

### Setup Flow

```
1. GET StripePaymentsAPM-GetPaymentElementOptions (authenticated customer)
   Server:
     a) Check customer.profile.custom.stripeCustomerID
     b) If none: stripeService.customers.create({ email, name }) → save cus_* to profile
     c) stripeService.customerSessions.create({
            customer: cus_*,
            components: {
                payment_element: {
                    enabled: true,
                    features: {
                        payment_method_redisplay: 'enabled',
                        payment_method_save: 'enabled',
                        payment_method_save_usage: 'on_session',
                        payment_method_remove: 'enabled'
                    }
                }
            }
        }) → returns client_secret
     d) Return { customerSessionClientSecret: client_secret, ... } to client
   ↓
2. Client: stripe.elements({ ..., customerSessionClientSecret })
   → Payment Element pre-populates saved payment methods
   → Customer selects saved card or adds new one
```

### Wallet Management (Account Pages)

Customers can manage saved cards from their account:

| Action | Controller | Handler |
|---|---|---|
| View saved methods | `PaymentInstruments-List` | `app_stripe_sfra` append |
| Delete a method | `PaymentInstruments-DeletePayment` | `app_stripe_sfra` prepend |
| Add new card | `StripeWallet-AddNewCard` | `int_stripe_sfra` |
| Set default card | `StripeWallet-MakeDefault` | `int_stripe_sfra` |

**CVC re-collection (optional):** When the `isCVCRecollectionEnabled` site preference is `true`, the Payment Element prompts for CVC even for saved cards.

**Key files:**
- Model: `cartridges/int_stripe_core/cartridge/scripts/stripe/models/stripeWallet.js`
- Controller: `cartridges/int_stripe_sfra/cartridge/controllers/StripeWallet.js`
- Template: `cartridges/app_stripe_sfra/cartridge/templates/default/account/payment/`

---

## 6. Capture Modes

### Automatic Capture (default)

Site preference: `stripeChargeCapture = true`

```
Payment Intent created with capture_method: 'automatic'
→ Stripe captures funds immediately on confirmation
→ charge.succeeded webhook fires
→ Order set to PAYMENT_STATUS_PAID
```

### Manual Capture (authorize-only)

Site preference: `stripeChargeCapture = false`

```
Payment Intent created with capture_method: 'manual'
→ On confirmation: PI status = 'requires_capture'
→ Order placed with PAYMENT_STATUS_NOTPAID
→ Merchant must capture within 7 days (Stripe limit)
→ BM: StripeBM-HandlePaymentsCapture → capture PI
→ charge.succeeded webhook → order set to PAYMENT_STATUS_PAID
```

### Partial Capture (via Business Manager)

The BM Capture tool accepts an amount parameter, enabling partial captures:

```javascript
// cartridges/bm_stripe/cartridge/controllers/StripeBM.js
stripeBMService.captures.captureByPaymentIntent(amountInCents, paymentIntentId, apiKey)
```

**Important:** Manual capture authorization windows expire after 7 days. Uncaptured Payment Intents automatically cancel. Build monitoring for orders that remain `NOTPAID` beyond 6 days.

---

## 7. Refund Flow

### BM-Initiated Refund

```
BM: StripeBM-HandlePaymentsRefund
  → Input: order number + amount (dollars)
  → Lookup: order.custom.stripePaymentIntentID (preferred)
  → Fallback: paymentInstrument.custom.stripeChargeID
  → stripeBMService.refunds.createByPaymentIntent(amountCents, pi_*, apiKey)
  → Response: succeeded / pending / failed
```

**Refund amount is entered in dollars; the service converts to cents.**

### Webhook-Driven Refund Processing

When Stripe processes the refund, `charge.refunded` fires:
- If `stripeUpdateInvoiceOnRefundWebhook = true`: SFCC invoice status is updated
- Refund confirmation email sent to customer
- Refund amount logged in order notes

---

## Payment Element Options Endpoint

`GET StripePaymentsAPM-GetPaymentElementOptions` is the central initialization endpoint for all Payment Element-based flows (card, APM, saved cards).

**It returns:**
```json
{
  "paymentElementOptions": {
    "mode": "payment",
    "amount": 5000,
    "currency": "usd",
    "capture_method": "automatic",
    "appearance": { ... },
    "customerSessionClientSecret": "cs_..."
  },
  "customerEmail": "user@example.com"
}
```

This single endpoint serves card, APM, and saved method flows. The Payment Element determines which methods to show based on the Stripe account configuration and the `automatic_payment_methods` setting.

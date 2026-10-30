# CHANGELOG

## 24.1.0
* Checkout Sessions Implementation
* Adaptive Pricing with Checkout Sessions
* Checkout Sessions are off by default ('stripeUseCheckoutSessions'). Before enabling them on an existing installation, add 'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed' and 'checkout.session.expired' to the Stripe webhook endpoint and to 'stripeAllowedWebHookStatuses' (Quick Setup does both). Orders whose Checkout Session expires unpaid are failed by the webhook job
* Defaults and recommended values for 'stripeApiVersion'/'stripeApiURL' '2026-04-22.dahlia' are now 'https://js.stripe.com/dahlia/stripe.js'. Please make sure to update Site Preferences with these values, and also update the version in your Stripe Dashboard -> Developer Settings -> Preferences -> Default API version
* Improved localization logic
* Webhooks: duplicate deliveries of an already stored event are acknowledged with HTTP 200 instead of 500, so Stripe stops retrying
* Webhooks: the processing job no longer re-charges a source that already has a charge, and no longer marks failed / cancelled / already paid orders as paid again or moves exported orders back to export READY
* Webhook cleanup job only removes custom objects older than 'MinAgeInDays' (default 4) and 'StripeWebhookNotifications' retention is raised to 7 days (re-import metadata)
* Idempotency keys: money-moving calls use keys derived from the order / request and are retried once with the same key when the outcome is unknown
* BM refund / capture: double submits can no longer refund or capture twice, amounts are converted using the currency's decimal digits
* 'StripeProfile' service timeout raised from 3s to 10s (update the service profile in BM on existing installations)
* Removed the legacy card integration. Cards are paid through the Payment Element: before upgrading, make sure 'STRIPE_PAYMENT_ELEMENT' is enabled and 'CREDIT_CARD' is no longer assigned to 'STRIPE_CREDIT'
* Payment Element orders now store the card details correctly
* Bank Transfer: failed orders cancel their Payment Intent, so funds already received go back to the customer's cash balance instead of staying on the failed order
* Bank Transfer: the payment method ID is now 'STRIPE_BANK_TRANSFER' (was 'BANK_TRANSFER'), so it no longer takes over a 'BANK_TRANSFER' method assigned to another provider. Before upgrading, create 'STRIPE_BANK_TRANSFER' with processor 'STRIPE_APM' (or import 'payment-methods.xml') and disable 'BANK_TRANSFER'. IMPORTANT: If you are already using Stripe Bank Transfer under 'BANK_TRANSFER' payment method make sure to change back 'STRIPE_BANK_TRANSFER' with 'BANK_TRANSFER' after upgrading to the new version.
* Upgraded Webpack from version 4 to version 5 ('sgmf-scripts' 3.x, same build setup as SFRA 8), which fixes the 'compile:scss' build. Run 'npm install' before compiling
* SFRA client settings are now rendered as JSON config built by 'clientConfigHelper.js', replacing the hidden inputs.
* Removed the Protractor integration tests and the Mocha unit tests ('tests/' folder, 'protractor-conf.js', '.babelrc') along with their dev dependencies.

## 24.0.3 (2026-09-04) 
* Fix BM refund/capture amount conversion for zero-decimal currencies- #31

## 24.0.2 (2026-03-16)
* Implemented idempotency keys
* Fixed an error where 3DS error message was empty and the order was failing(with successful payment) when users were closing the website

## 24.0.1 (2025-10-22)
* Removed documentation from repository
* Fixed an issue where the site preference for billing details collection on payment element was not working poperly
* Removed code duplication on client side and refactored some functions

## 24.0.0 (2025-09-09)
* Bank transfer implementation as a new payment method
* Fixed an issue where changing the shipping address in the express checkout popup was not updating the shipping methods

## 23.9.1 (2025-08-11)
* Removed duplicated API key from service headers
* Populated stripeAccountID site preference within Quick Setup BM module

## 23.9.0 (2025-08-06)
* Controllers and client side js refactoring and optimization
* Customer sessions Implementation (replacing old saved cards tab that was using Card Payment Logic)
* APM cvc recollection 
* Minicart ECE 

## 23.8.0 (2025-02-18)
* Added Multi Capture Option as a configuration
* Card payment refactoring and JS updated to use handleNextAction instead of handleCardAction

## 23.7.0 (2024-12-09)
* Removed PRB related functonality
* Payment element now creates confirmation token before initalizing the payment. PaymentIntent creation now takes the Confirmation Token as a parameter and automatically confirms it.

## 23.6.0 (2024-09-05)
* Reduced number of API calls by merging and using expand option to include customer data in the stripeService.paymentMethods.list method from stripeWallet.js -> fetchSavedPaymentInstruments()  

## 23.5.0 (2024-07-01)
* Express Checkout for SFRA and Site Genesis

## 23.4.0 (2024-01-18)
* Business Manager module for capturing payments 
* Added the option to include Shipping Details in the payment intent payload
* Fixed an issue where a model was crashing the website when the session was expiring during the checkout
* Fixed an issue where closing 3DS popup right after confirming it on mobile was resulting in a successful payment but a failed order
* Removed URL brackets from the service header.

## 23.2.0 (2023-04-24)
* Stripe Payment Element: Defer intent/decoupled payment intent creation on init of Stripe Payment Element widget
* Stripe Card Payments: Bug fix redirecting to Order Completed Page instead of Order failure page on 3DS card decline

## 23.2.0 (2023-03-03)
* fix Saved Card functionality - not saving cards when capture mode is enabled
* merge confirmPaymentIntent and placeOrder in one request instead of separate AJAX calls
* merge create SFCC order and Stripe payment intent into one request instead of separate AJAX calls
* clean up session privacy variable for Stripe Order Id after placing an order

## 23.1.0 (2023-02-06)
* Card payments: add additional check to generate new payment intent on place order
* Stripe Payment Element: Init card details for Card Payments in OMS


## 22.4.0 (2022-12-10)
* clean up deprecated payment methods
* Card payments: create SFCC order before making a call to Stripe to authorize/capture the payment
* fix issues order confirmation email locales
* fix issues Payment discrepancy issue and e-mail order confirm sent twice
* fix issue with OM app orders sync
* Note: In 22.4.0 we have made major changes (as a hotfix) of the Checkout flow when create a Payment Intents in Stripe and creating of SFCC orders. For card payments, the SFCC order is being created first, then on success we create a new payment intent and make a call to Stripe to authorize/capture. For Stripe Payment Elements, the SFCC order also is being created first in status ‘Created’, then on success in SFCC there should be receive Stripe payment_intent.succeeded webhook which will be processed then by ‘Stripe – Process Webhook Notifications’ job which will change the order status accordingly.

## 22.3.0 (2022-11-14)
* fix issue with not writing meta data to payment intent

## 22.2.0 (2022-07-01)
* add Stripe Radar Support

## 22.1.0 (2022-06-02)
* add Stripe Payment Element

## 21.3.0 (2021-09-13)
* add OM app support
* add EPS
* add P24

## 21.2.0 (2021-06-01)
* add Paypal (beta) support

## 21.1.0 (2021-03-19)
* add Multibanco
* add credit card form customizable
* add quick setup BM page
* add Klarna support

## 20.2.0 (2020-07-22)
* add ACH debit
* add WeChat pay

## 20.1.0 (2020-02-01)
* Update documentation to match the new Salesforce template

## 18.1.0 (2019-04-15)
* Update to use Stripe elements, sources, payment request button, webhooks and asynchronous payments

## 16.1.0 (2019-07-30)
* Initial release


# CHANGELOG

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


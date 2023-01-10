# CHANGELOG

## 22.4.0
* clean up deprecated payment methods
* Card payments: create SFCC order before making a call to Stripe to authorize/capture the payment
* fix issues order confirmation email locales
* fix issues Payment discrepancy issue and e-mail order confirm sent twice
* fix issue with OM app orders sync
* Note: In 22.4.0 we have made major changes of the order of creating Payment Intents in Stripe and creating of SFCC orders. For card payments, the SFCC order is being created first, then on success we create a new payment intent and make a call to Stripe to authorize/capture. For Stripe Payment Elements, the SFCC order also is being created first in status ‘Created’, then on success in SFCC there should be receive Stripe payment_intent.succeeded webhook which will be processed then by ‘Stripe – Process Webhook Notifications’ job which will change the order status accordingly.

## 22.3.0
* fix issue with not writing meta data to payment intent

## 22.2.0
* add Stripe Radar Support

## 22.1.0
* add Stripe Payment Element

## 21.3.0
* add OM app support
* add EPS
* add P24

## 21.2.0
* add Paypal (beta) support

## 21.1.0
* add Multibanco
* add credit card form customizable
* add quick setup BM page
* add Klarna support

## 20.2.0
* add ACH debit
* add WeChat pay

## 20.1.0
* initial release


# Instalation
## SG Controllers
1. Install `int_stripe_core` and `int_stripe_controllers` cartriges.
2. Import the metadata.
3. Configure the custom site preferences for Stripe.
4. Use `app_stripe_core` and `app_stripe_controllers` cartriges as reference to change the code in your cartridge - all added code is surrounded by the comments `//STRIPE change begin` and `//STRIPE change end`.
5. In Stripe Dashboard enable webhooks, point it to `Stripe-WebHook` controller and subscribe to these events:
- review.opened
- review.closed
- charge.succeeded
- charge.failed
- source.canceled
- source.failed
- source.chargeable
6. Shedulle the imported jobs to run at reasonable interval, for example 15 minutes.

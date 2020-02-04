/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT */
// v1
/**
*   @input Card : Object
*/

/* Stripe include */
var stripeHelper = require('int_stripe_core').getStripeHelper();


function execute(args) {
    stripeHelper.getStripeWallet(customer).removePaymentInstrument(args.Card);

    return PIPELET_NEXT;
}

/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT */
// v1
/**
* @output PaymentInstruments : dw.util.ArrayList
*/
// eslint-disable-next-line no-undef
importPackage(dw.system);

/* Stripe include */
var stripeHelper = require('int_stripe_core').getStripeHelper();

function execute(pdict) {
    pdict.PaymentInstruments = stripeHelper.getStripeWallet(customer).getPaymentInstruments();

    return PIPELET_NEXT;
}

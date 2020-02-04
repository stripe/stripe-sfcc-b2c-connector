/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT,PIPELET_ERROR */
// v1
/**
*   @input PaymentInstrument: dw.order.PaymentInstrument
*/
const stripeApmHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/paymentprocessors/stripeApmHelper');

function execute(args) {
    var result = stripeApmHelper.Authorize(args);

    if (result.authorized) {
        return PIPELET_NEXT;
    }
    return PIPELET_ERROR;
}

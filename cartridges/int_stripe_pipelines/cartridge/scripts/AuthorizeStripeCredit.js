/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT, PIPELET_ERROR */
// v1
/**
*   @input OrderNo : String
*   @input PaymentInstrument: dw.order.PaymentInstrument
*/
const stripeCreditHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/paymentprocessors/stripeCreditHelper');

function execute(args) {
    var result = stripeCreditHelper.Authorize(args);

    if (result.authorized) {
        return PIPELET_NEXT;
    }
    return PIPELET_ERROR;
}

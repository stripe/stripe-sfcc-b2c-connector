/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT,PIPELET_ERROR */
// v1
/**
*   @input Basket : dw.order.Basket
*/
const stripeCreditHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/paymentprocessors/stripeCreditHelper');

function execute(args) {
    var result = stripeCreditHelper.Handle(args);

    if (result.success) {
        return PIPELET_NEXT;
    }
    return PIPELET_ERROR;
}

/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT */
// v1
/**
*   @output redirectUrl : dw.web.URL
*/

const stripePaymentsHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');

function execute(args) {
    args.redirectUrl = stripePaymentsHelper.HandleAPM();

    // eslint-disable-next-line no-undef
    return PIPELET_NEXT;
}

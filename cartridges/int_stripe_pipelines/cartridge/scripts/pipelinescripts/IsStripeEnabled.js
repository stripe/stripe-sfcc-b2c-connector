/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT,PIPELET_ERROR */
// v1
/**
* Demandware Script File
* Checks if Stripe is enabled.
*
* @output IsStripeEnabled : Boolean
*/
// eslint-disable-next-line no-undef
importPackage(dw.system);

var StripeHelper = require('int_stripe_core').getStripeHelper();

function execute(pdict) {
    pdict.IsStripeEnabled = StripeHelper.isStripeEnabled();

    return PIPELET_NEXT;
}

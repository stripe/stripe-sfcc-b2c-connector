/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
/* globals PIPELET_NEXT,PIPELET_ERROR */
// v1
/**
*   @output JSONPayload : String
*/

const stripeWalletHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');


function execute(pdict) {
    pdict.JSONPayload = JSON.stringify(stripeWalletHelper.AddNewCard());

    return PIPELET_NEXT;
}

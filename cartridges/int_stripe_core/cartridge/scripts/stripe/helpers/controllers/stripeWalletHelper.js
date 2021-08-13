/* eslint-env es6 */
/* global request, customer */

'use strict';

/**
* Add New Card
*
* @returns {array} - array with result info
*/
function AddNewCard() {
    const stripePaymentMethodId = request.httpParameterMap.payment_method_id.stringValue;
    const stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    const wallet = stripeHelper.getStripeWallet(customer);

    var responsePayload = {
        success: true
    };

    try {
        wallet.attachPaymentInstrument(stripePaymentMethodId);
    } catch (e) {
        responsePayload = {
            success: false,
            error: e.message
        };
    }

    return responsePayload;
}

module.exports.AddNewCard = AddNewCard;
module.exports.AddNewCard.public = true;

/**
* Make card default
*/
function MakeDefault() {
    const stripeId = request.httpParameterMap.stripe_id.stringValue;
    const stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    const wallet = stripeHelper.getStripeWallet(customer);

    try {
        wallet.makeDefault(stripeId);
    } catch (e) {
        require('dw/system/Logger').error('Failed to make card default, original error was: {0}', e.message);
    }
}

module.exports.MakeDefault = MakeDefault;
module.exports.MakeDefault.public = true;

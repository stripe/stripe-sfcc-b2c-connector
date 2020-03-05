/* eslint-disable new-cap */
// v1

'use strict';

var ISML = require('dw/template/ISML');
var URLUtils = require('dw/web/URLUtils');
var stripeWalletHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');

/**
 * AddNewCard controller to handle AJAX calls
 */
function AddNewCard() {
    var result = stripeWalletHelper.AddNewCard();

    ISML.renderTemplate('stripe/json', {
        JSONPayload: JSON.stringify(result)
    });
}

module.exports.AddNewCard = AddNewCard;
module.exports.AddNewCard.public = true;

/**
 * Makes a card default.
 */
function MakeDefault() {
    stripeWalletHelper.MakeDefault();
    response.redirect(URLUtils.https('PaymentInstruments-List'));
}

module.exports.MakeDefault = MakeDefault;
module.exports.MakeDefault.public = true;

/* eslint-disable new-cap */
// v1

'use strict';

var URLUtils = require('dw/web/URLUtils');
var stripeWalletHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');

/**
 * AddNewCard controller to handle AJAX calls
 */
function AddNewCard() {
    var result = stripeWalletHelper.AddNewCard();

    var jsonResponse = JSON.stringify(result);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
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

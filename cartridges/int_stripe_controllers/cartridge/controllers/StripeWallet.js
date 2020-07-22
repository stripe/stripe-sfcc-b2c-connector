/* eslint-disable new-cap */
/* global response */
// v1

'use strict';

var URLUtils = require('dw/web/URLUtils');
var CSRFProtection = require('dw/web/CSRFProtection');
var stripeWalletHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');
var app = require('*/cartridge/scripts/app');

/**
 * AddNewCard controller to handle AJAX calls
 */
function AddNewCard() {
    var result;

    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        result = {
            redirectUrl: URLUtils.url('Home-Show').toString()
        };
        response.setStatus(500);
    } else {
        result = stripeWalletHelper.AddNewCard();
    }

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
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        response.redirect(URLUtils.https('Home-Show'));
        return;
    }
    stripeWalletHelper.MakeDefault();
    response.redirect(URLUtils.https('PaymentInstruments-List'));
}

module.exports.MakeDefault = MakeDefault;
module.exports.MakeDefault.public = true;

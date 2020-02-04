/* eslint-disable new-cap */
// v1

'use strict';

var ISML = require('dw/template/ISML');
var stripePaymentsHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 */
function beforePaymentAuthorization() {
    var responsePayload = stripePaymentsHelper.BeforePaymentAuthorization();

    ISML.renderTemplate('stripe/json', {
        JSONPayload: JSON.stringify(responsePayload)
    });
}

exports.BeforePaymentAuthorization = beforePaymentAuthorization;
exports.BeforePaymentAuthorization.public = true;


/**
 * An entry point to handle returns from alternative payment methods.
 */
function handleAPM() {
    var redirectUrl = stripePaymentsHelper.HandleAPM();

    response.redirect(redirectUrl);
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

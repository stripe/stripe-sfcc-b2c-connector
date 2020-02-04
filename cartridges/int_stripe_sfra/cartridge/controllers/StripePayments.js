/* eslint-disable new-cap */

'use strict';

var server = require('server');

var stripePaymentsHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 */
server.post('BeforePaymentAuthorization', function (req, res, next) {
    var responsePayload = stripePaymentsHelper.BeforePaymentAuthorization();
    res.json(responsePayload);
    next();
});


/**
 * An entry point to handle returns from alternative payment methods.
 */

server.get('HandleAPM', function (req, res, next) {
    var redirectUrl = stripePaymentsHelper.HandleAPM(true);
    res.redirect(redirectUrl);
    next();
});

module.exports = server.exports();

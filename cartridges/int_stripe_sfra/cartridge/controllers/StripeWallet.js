/* eslint-disable new-cap */
/* global response */

'use strict';

var server = require('server');

var URLUtils = require('dw/web/URLUtils');
var stripeWalletHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * AddNewCard controller to handle AJAX calls
 */
server.post('AddNewCard', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var result = stripeWalletHelper.AddNewCard();
    res.json(result);
    next();
});

/**
 * Makes a card default.
 */
server.post('MakeDefault', csrfProtection.validateAjaxRequest, function (req, res, next) {
    stripeWalletHelper.MakeDefault();
    response.redirect(URLUtils.https('PaymentInstruments-List'));
    next();
});

module.exports = server.exports();

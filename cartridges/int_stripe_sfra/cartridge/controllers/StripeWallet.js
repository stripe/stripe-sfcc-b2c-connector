/* eslint-disable new-cap */

'use strict';

var server = require('server');

var URLUtils = require('dw/web/URLUtils');
var stripeWalletHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripeWalletHelper');

/**
 * AddNewCard controller to handle AJAX calls
 */
server.post('AddNewCard', function (req, res, next) {
    var result = stripeWalletHelper.AddNewCard();
    res.json(result);
    next();
});


/**
 * Makes a card default.
 */
server.post('MakeDefault', function (req, res, next) {
    stripeWalletHelper.MakeDefault();
    response.redirect(URLUtils.https('PaymentInstruments-List'));
    next();
});

module.exports = server.exports();

/* eslint-disable new-cap */

'use strict';

var server = require('server');

var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 */
server.post('BeforePaymentAuthorization', csrfProtection.validateAjaxRequest, function (req, res, next) {
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

/**
 * Get Stripe Order Items used for Klarna Widget
 */
server.get('GetStripeOrderItems', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    var stripeOrderDetails = basket ? require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getStripeOrderDetails(basket) : null;

    res.json({
        amount: stripeOrderDetails ? stripeOrderDetails.amount : [],
        orderItems: stripeOrderDetails ? stripeOrderDetails.order_items : []
    });

    next();
});

module.exports = server.exports();

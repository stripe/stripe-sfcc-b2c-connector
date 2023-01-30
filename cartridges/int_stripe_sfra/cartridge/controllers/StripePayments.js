/* eslint-disable new-cap */

'use strict';

var server = require('server');

var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 */
server.post('BeforePaymentAuthorization', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var isInitial = (req.form && req.form.isinitial) ? req.form.isinitial : false;

    var responsePayload = stripePaymentsHelper.BeforePaymentAuthorization(isInitial);
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
 * Get Stripe Order Items
 */
server.get('GetStripeOrderItems', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    var stripeOrderDetails = basket ? require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getStripeOrderDetails(basket) : null;

    res.json({
        amount: stripeOrderDetails ? stripeOrderDetails.amount : [],
        orderItems: stripeOrderDetails ? stripeOrderDetails.order_items : [],
        currency: stripeOrderDetails ? stripeOrderDetails.currency : null,
        purchase_country: stripeOrderDetails ? stripeOrderDetails.purchase_country : null,
        order_shipping: stripeOrderDetails ? stripeOrderDetails.order_shipping : [],
        shipping_first_name: stripeOrderDetails ? stripeOrderDetails.shipping_first_name : null,
        shipping_last_name: stripeOrderDetails ? stripeOrderDetails.shipping_last_name : null
    });

    next();
});

/**
 * Entry point for handling payment intent creation for APMs.
 */
server.post('BeforePaymentSubmit', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var type = req.form.type;
    var params = {};

    if (req.form.orderid) {
        params.orderid = req.form.orderid;
    }

    var responsePayload = stripePaymentsHelper.BeforePaymentSubmit(type, params);
    res.json(responsePayload);

    next();
});

/**
 * Get Customer Email
 */
server.get('GetCustomerEmail', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    var email = basket ? basket.getCustomerEmail() : '';

    res.json({
        email: email
    });

    next();
});

/**
 * Entry point for handling writing errors to Stripe Logger called as an AJAX request
 */
server.post('LogStripeErrorMessage', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var msg = req.form.msg;

    stripePaymentsHelper.LogStripeErrorMessage(msg);

    res.json({
        success: true
    });

    next();
});

/**
 * Entry point for handling writing errors to Stripe Logger called as an AJAX request
 */
server.post('FailOrder', csrfProtection.validateAjaxRequest, function (req, res, next) {
    stripePaymentsHelper.FailOrder();

    res.json({
        success: true
    });

    next();
});

module.exports = server.exports();

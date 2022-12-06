/* eslint-env es6 */
/* global request, dw, response, customer, session */

'use strict';

var URLUtils = require('dw/web/URLUtils');
var app = require('*/cartridge/scripts/app');
var OrderMgr = require('dw/order/OrderMgr');
var Resource = require('dw/web/Resource');

/**
 * Entry point for processing webhooks push notifications.
 */
function webHook() {
    const webhooksHelper = require('*/cartridge/scripts/stripe/helpers/webhooksHelper');
    webhooksHelper.processIncomingNotification();
}

exports.WebHook = webHook;
exports.WebHook.public = true;

/**
 * Handle Payment request button action
 */
function paymentRequestButtonHandler() {
    // v1
    // eslint-disable-next-line no-unused-vars
    const payload = JSON.parse(request.httpParameterMap.requestBodyAsString);
}

exports.PaymentRequestButtonHandler = paymentRequestButtonHandler;
exports.PaymentRequestButtonHandler.public = true;

/**
 * Return shipping options used for payment request button
 */
function getShippingOptions() {
    // v1
    // eslint-disable-next-line no-unused-vars
    var currentBasket = dw.order.BasketMgr.getCurrentBasket();
}

exports.GetShippingOptions = getShippingOptions;
exports.GetShippingOptions.public = true;

/**
 * Display Order summary page for Stripe Payment Element Orders
 */
function paymentElementOrderPlaced() {
    if (!session.privacy.stripeOrderNumber) {
        response.redirect(URLUtils.https('Cart-Show'));
        return;
    }

    var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
    if (!order) {
        response.redirect(URLUtils.https('Cart-Show'));
        return;
    }

    if (!customer.authenticated) {
        // Initializes the account creation form for guest checkouts by populating the first and last name with the
        // used billing address.
        var customerForm = app.getForm('profile.customer');
        customerForm.setValue('firstname', order.billingAddress.firstName);
        customerForm.setValue('lastname', order.billingAddress.lastName);
        customerForm.setValue('email', order.customerEmail);
        customerForm.setValue('orderNo', order.orderNo);
    }

    app.getForm('profile.login.passwordconfirm').clear();
    app.getForm('profile.login.password').clear();

    var pageMeta = require('*/cartridge/scripts/meta');
    pageMeta.update({
        pageTitle: Resource.msg('confirmation.meta.pagetitle', 'checkout', 'SiteGenesis Checkout Confirmation')
    });

    app.getView({
        Order: order,
        ContinueURL: URLUtils.https('Account-RegistrationForm') // needed by registration form after anonymous checkouts
    }).render('checkout/confirmation/confirmation');
}

exports.PaymentElementOrderPlaced = paymentElementOrderPlaced;
exports.PaymentElementOrderPlaced.public = true;

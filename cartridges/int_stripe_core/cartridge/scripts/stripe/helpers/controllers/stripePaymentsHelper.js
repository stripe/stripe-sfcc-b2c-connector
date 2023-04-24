/* eslint-env es6 */
/* global request, response, dw, empty, customer, session */

'use strict';

const OrderMgr = require('dw/order/OrderMgr');
const Transaction = require('dw/system/Transaction');

/**
 * Entry point for writing errors to Stripe Logger
 * @param {string} msg - error message to be logged
 */
function logStripeErrorMessage(msg) {
    if (empty(msg)) {
        return;
    }

    const Logger = require('dw/system/Logger').getLogger('Stripe', 'stripe');

    Logger.error('Error: {0}', msg);
}

exports.LogStripeErrorMessage = logStripeErrorMessage;
exports.LogStripeErrorMessage.public = true;

/**
 * Entry point for fail of Stripe Order
 */
function failOrder() {
    try {
        if (session.privacy.stripeOrderNumber) {
            var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
            if (order) {
                Transaction.wrap(function () {
                    order.addNote('Order Failed Reason', 'failed from storefront Stripe.js: stripe.confirmPayment (for Stripe Payment Elements) or stripe.handleCardAction (for Card Payments)');
                    OrderMgr.failOrder(order, true);
                });
            }
            session.privacy.stripeOrderNumber = null;
            delete session.privacy.stripeOrderNumber;
        }
    } catch (e) {
        logStripeErrorMessage('stripePaymentsHelper.js failOrder error: ' + e.message);
    }
}

exports.FailOrder = failOrder;
exports.FailOrder.public = true;

/**
 * An entry point to handle returns from alternative payment methods.
 * @param {Object} sfra - .
 * @return {Object} redirectUrl.
 */
function handleAPM(sfra) {
    const URLUtils = require('dw/web/URLUtils');
    const paramsMap = request.httpParameterMap;

    const sourceId = paramsMap.source ? paramsMap.source.stringValue : null;
    const sourceClientSecret = paramsMap.client_secret ? paramsMap.client_secret.stringValue : null;

    const paymentIntentId = paramsMap.payment_intent ? paramsMap.payment_intent.stringValue : null;
    const paymentIntentClientSecret = paramsMap.payment_intent_client_secret ? paramsMap.payment_intent_client_secret.stringValue : null;

    var redirectUrl = '';
    try {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        // handle payments with source id
        if (!empty(sourceId)) {
            const source = stripeService.sources.retrieve(sourceId);

            if (source.client_secret !== sourceClientSecret) {
                throw new Error('Source client secret mismatch');
            }

            if (['chargeable', 'pending'].indexOf(source.status) < 0) {
                throw new Error('Source not authorized.');
            }
        }

        // handle payment intents
        if (!empty(paymentIntentId)) {
            const paymentIntent = stripeService.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.client_secret !== paymentIntentClientSecret) {
                throw new Error('PaymentIntent client secret mismatch');
            }

            if (['requires_source', 'requires_payment_method'].indexOf(paymentIntent.status) >= 0) {
                throw new Error('Payment intent failed.');
            }

            // Set a cookie to authenticate customers for Link
            if ((paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') && paymentIntent.payment_method) {
                const paymentMethod = stripeService.paymentMethods.retrieve(paymentIntent.payment_method);
                if (paymentMethod && paymentMethod.link && paymentMethod.link.persistent_token) {
                    var stripeCookie = new dw.web.Cookie('stripe.link.persistent_token', paymentMethod.link.persistent_token);
                    stripeCookie.setSecure(true);
                    stripeCookie.setHttpOnly(true);
                    stripeCookie.setMaxAge(90 * 24 * 3600);

                    response.addHttpCookie(stripeCookie);
                }
            }
        }

        if (sfra) {
            redirectUrl = URLUtils.url('Stripe-PaymentElementOrderPlaced');
        } else {
            redirectUrl = URLUtils.url('Stripe-PaymentElementOrderPlaced');
        }
    } catch (e) {
        logStripeErrorMessage('handleAPM: ' + e.message);

        if (sfra) {
            redirectUrl = URLUtils.url('Checkout-Begin', 'stage', 'payment', 'apm_return_error', e.message);
        } else {
            redirectUrl = URLUtils.url('COBilling-Start', 'apm_return_error', e.message);
        }
    }

    return redirectUrl;
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

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
 * Checks a Stripe object ID's prefix and format.
 * @param {string} id - Stripe object ID
 * @param {string} prefix - expected prefix, e.g. 'pi_'
 * @return {boolean} true when valid
 */
function isValidStripeId(id, prefix) {
    return typeof id === 'string'
        && id.indexOf(prefix) === 0
        && /^[A-Za-z0-9_]+$/.test(id);
}

/**
 * Saves the payment method on the order of a returned Payment Intent.
 * @param {Object} paymentIntent - Payment Intent
 * @param {Object} paymentMethod - its Payment Method
 */
function saveReturnedPaymentMethod(paymentIntent, paymentMethod) {
    try {
        const orderNo = paymentIntent.metadata && paymentIntent.metadata.order_id;
        const order = orderNo ? OrderMgr.getOrder(orderNo) : null;

        if (!order || !paymentMethod || order.custom.stripePaymentIntentID !== paymentIntent.id) {
            return;
        }

        const checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
        const stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

        Transaction.wrap(function () {
            checkoutHelper.savePaymentMethodDetails(stripePaymentInstrument, paymentMethod,
                paymentMethod.billing_details && paymentMethod.billing_details.name);
        });
    } catch (e) {
        logStripeErrorMessage('handleAPM saveReturnedPaymentMethod: ' + e.message);
    }
}

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

    const checkoutSessionId = paramsMap.session_id ? paramsMap.session_id.stringValue : null;

    var redirectUrl = '';
    try {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        // handle payments with source id
        if (!empty(sourceId)) {
            if (!isValidStripeId(sourceId, 'src_')) {
                throw new Error('Invalid source id');
            }
            const source = stripeService.sources.retrieve(sourceId);

            if (source.client_secret !== sourceClientSecret) {
                throw new Error('Source client secret mismatch');
            }

            if (['chargeable', 'pending'].indexOf(source.status) < 0) {
                throw new Error('Source not authorized.');
            }
        }

        if (!empty(checkoutSessionId)) {
            if (!isValidStripeId(checkoutSessionId, 'cs_')) {
                throw new Error('Invalid Checkout Session id');
            }
            const checkoutSession = stripeService.checkoutSessions.retrieve(checkoutSessionId);
            // Session statuses are open / complete / expired; 'complete' includes delayed payments still processing
            if (checkoutSession.status !== 'complete') {
                throw new Error('Checkout Session not completed, status: ' + checkoutSession.status);
            }
        }

        // handle payment intents
        if (!empty(paymentIntentId)) {
            if (!isValidStripeId(paymentIntentId, 'pi_')) {
                throw new Error('Invalid PaymentIntent id');
            }
            const paymentIntent = stripeService.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.client_secret !== paymentIntentClientSecret) {
                throw new Error('PaymentIntent client secret mismatch');
            }

            if (['requires_source', 'requires_payment_method'].indexOf(paymentIntent.status) >= 0) {
                throw new Error('Payment intent failed.');
            }

            if ((paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') && paymentIntent.payment_method) {
                const paymentMethod = stripeService.paymentMethods.retrieve(paymentIntent.payment_method);

                // Set a cookie to authenticate customers for Link
                if (paymentMethod && paymentMethod.link && paymentMethod.link.persistent_token) {
                    var stripeCookie = new dw.web.Cookie('stripe.link.persistent_token', paymentMethod.link.persistent_token);
                    stripeCookie.setSecure(true);
                    stripeCookie.setHttpOnly(true);
                    stripeCookie.setMaxAge(90 * 24 * 3600);

                    response.addHttpCookie(stripeCookie);
                }

                saveReturnedPaymentMethod(paymentIntent, paymentMethod);
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
            redirectUrl = URLUtils.url('Checkout-Begin', 'stage', 'payment', 'apm_return_error', 'true');
        } else {
            redirectUrl = URLUtils.url('COBilling-Start', 'apm_return_error', 'true');
        }
    }

    return redirectUrl;
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

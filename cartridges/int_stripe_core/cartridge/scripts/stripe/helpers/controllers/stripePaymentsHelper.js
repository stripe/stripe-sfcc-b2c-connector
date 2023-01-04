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
    if (session.privacy.stripeOrderNumber) {
        var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
        if (order) {
            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
            });
        }
        session.privacy.stripeOrderNumber = null;
        delete session.privacy.stripeOrderNumber;
    }
}

exports.FailOrder = failOrder;
exports.FailOrder.public = true;

/**
 * Created a response payload for beforePaymentAuthorization based on the status
 * of a given payment intent.
 *
 * @param {Object} intent - PaymentIntent object
 * @return {Object} - Response payload to return to client
 */
function generateCardsPaymentResponse(intent) {
    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    var responsePayload;
    if (intent.status === 'requires_capture' && !stripeChargeCapture) {
        // The payment requires capture which will be made later
        responsePayload = {
            success: true
        };
    } else if (intent.status === 'requires_action' || intent.status === 'requires_source_action') {
        // Tell the client to handle the action
        responsePayload = {
            requires_action: true,
            payment_intent_client_secret: intent.client_secret
        };
    } else if (intent.status === 'succeeded') {
        // The payment didn’t need any additional actions and completed!
        // Handle post-payment fulfilment
        responsePayload = {
            success: true
        };
    } else {
        // Invalid status
        responsePayload = {
            error: 'Invalid PaymentIntent status'
        };
    }

    return responsePayload;
}

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 * @return {Object} responsePayload.
 */
function beforePaymentAuthorization() {
    var BasketMgr = require('dw/order/BasketMgr');
    var responsePayload;
    var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var stripePaymentInstrument;
    var paymentIntent;
    var paymentIntentId;
    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    const stripeAccountId = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountId');
    const stripeAccountType = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountType');

    try {
        var basket = BasketMgr.getCurrentBasket();
        if (basket) {
            stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(basket);

            /*
             * Check if we have a zero order i.e. after full gift certificate redemption
             */
            if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction
                && stripePaymentInstrument.paymentTransaction.amount
                && stripePaymentInstrument.paymentTransaction.amount.value === 0) {
                responsePayload = {
                    success: true
                };

                return responsePayload;
            }

            if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'CREDIT_CARD') {
                paymentIntentId = (stripePaymentInstrument.paymentTransaction)
                    ? stripePaymentInstrument.paymentTransaction.getTransactionID() : null;
                if (paymentIntentId) {
                    paymentIntent = checkoutHelper.confirmPaymentIntent(paymentIntentId, stripePaymentInstrument);
                } else {
                    paymentIntent = checkoutHelper.createPaymentIntent(stripePaymentInstrument);

                    Transaction.wrap(function () {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(paymentIntent.id);
                        stripePaymentInstrument.paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);

                        if (!empty(stripeAccountId)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountId = stripeAccountId;
                        }

                        if (!empty(stripeAccountType) && 'value' in stripeAccountType && !empty(stripeAccountType.value)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountType = stripeAccountType.value;
                        }
                    });
                }

                Transaction.wrap(function () {
                    if (paymentIntent.review) {
                        basket.custom.stripeIsPaymentIntentInReview = true;
                    }
                    basket.custom.stripePaymentIntentID = paymentIntent.id;
                    basket.custom.stripePaymentSourceID = '';

                    if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0 && paymentIntent.charges.data[0].outcome) {
                        basket.custom.stripeRiskLevel = paymentIntent.charges.data[0].outcome.risk_level;
                        basket.custom.stripeRiskScore = paymentIntent.charges.data[0].outcome.risk_score;
                    }
                });

                responsePayload = generateCardsPaymentResponse(paymentIntent);
            } else {
                Transaction.wrap(function () {
                    /*
                     * Check if Stripe payment is based on Payment Intents
                     */
                    if (basket.custom.stripePaymentIntentID && stripePaymentInstrument && stripePaymentInstrument.paymentTransaction) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(basket.custom.stripePaymentIntentID);
                        stripePaymentInstrument.paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);

                        if (!empty(stripeAccountId)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountId = stripeAccountId;
                        }

                        if (!empty(stripeAccountType) && 'value' in stripeAccountType && !empty(stripeAccountType.value)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountType = stripeAccountType.value;
                        }
                    }

                    /*
                     * Check if Stripe payment is based on Sources
                     */
                    if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction && stripePaymentInstrument.custom.stripeSourceID) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(stripePaymentInstrument.custom.stripeSourceID);
                        stripePaymentInstrument.paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);

                        if (!empty(stripeAccountId)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountId = stripeAccountId;
                        }

                        if (!empty(stripeAccountType) && 'value' in stripeAccountType && !empty(stripeAccountType.value)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountType = stripeAccountType.value;
                        }
                    }

                    if (stripePaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
                        basket.custom.stripePaymentSourceID = stripePaymentInstrument.custom.stripeSourceID;
                        basket.custom.stripePaymentIntentID = '';
                    }
                });

                responsePayload = {
                    success: true
                };
            }
        } else {
            /*
             * Handle the case when SFCC order is being created before making call to Stripe to create a Payment Intent and confirm the payment
             */
            if (!session || !session.privacy || !session.privacy.stripeOrderNumber) {
                responsePayload = {
                    success: false
                };
                return responsePayload;
            }

            var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
            if (!order) {
                responsePayload = {
                    success: false
                };
                return responsePayload;
            }

            stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

            if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'CREDIT_CARD') {
                paymentIntentId = (stripePaymentInstrument.paymentTransaction)
                    ? stripePaymentInstrument.paymentTransaction.getTransactionID() : null;
                if (paymentIntentId) {
                    paymentIntent = checkoutHelper.confirmPaymentIntent(paymentIntentId, stripePaymentInstrument);
                } else {
                    paymentIntent = checkoutHelper.createPaymentIntent(stripePaymentInstrument);

                    Transaction.wrap(function () {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(paymentIntent.id);
                        stripePaymentInstrument.paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);

                        if (!empty(stripeAccountId)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountId = stripeAccountId;
                        }

                        if (!empty(stripeAccountType) && 'value' in stripeAccountType && !empty(stripeAccountType.value)) {
                            stripePaymentInstrument.paymentTransaction.custom.stripeAccountType = stripeAccountType.value;
                        }
                    });
                }

                Transaction.wrap(function () {
                    if (paymentIntent.review) {
                        order.custom.stripeIsPaymentIntentInReview = true;
                    }
                    order.custom.stripePaymentIntentID = paymentIntent.id;
                    order.custom.stripePaymentSourceID = '';

                    if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0 && paymentIntent.charges.data[0].outcome) {
                        order.custom.stripeRiskLevel = paymentIntent.charges.data[0].outcome.risk_level;
                        order.custom.stripeRiskScore = paymentIntent.charges.data[0].outcome.risk_score;
                    }
                });

                responsePayload = generateCardsPaymentResponse(paymentIntent);
            }
        }
    } catch (e) {
        if (e.callResult) {
            var o = JSON.parse(e.callResult.errorMessage);
            responsePayload = {
                error: {
                    code: o.error.code,
                    message: o.error.message
                }
            };
        } else {
            responsePayload = {
                error: {
                    message: e.message
                }
            };
        }
    }

    return responsePayload;
}

exports.BeforePaymentAuthorization = beforePaymentAuthorization;
exports.BeforePaymentAuthorization.public = true;

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

/**
 * Entry point for handling payment intent creation for APMs and Stripe Payment Element
 * @param {string} type - stripe payment method type
 * @param {Object} params - additional parameters
 * @return {Object} responsePayload.
 */
function beforePaymentSubmit(type, params) {
    const supportedTypes = ['au_becs_debit', 'card', 'card_present',
        'interac_present', 'paymentelement'];

    if (supportedTypes.indexOf(type) === -1) {
        return {
            error: {
                message: 'Not supported type ' + type
            }
        };
    }

    const BasketMgr = require('dw/order/BasketMgr');
    const Money = require('dw/value/Money');
    const basket = BasketMgr.getCurrentBasket();
    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');

    if (!basket) {
        return {
            error: {
                message: 'Empty basket'
            }
        };
    }

    var responsePayload;

    try {
        const basketCurrencyCode = basket.getCurrencyCode();
        const basketTotal = basket.getTotalGrossPrice();

        var basketCurency = dw.util.Currency.getCurrency(basketCurrencyCode);
        var multiplier = Math.pow(10, basketCurency.getDefaultFractionDigits());

        // Iterates over the list of gift certificate payment instruments
        // and updates the total redemption amount.
        var gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments().iterator();
        var orderPI = null;
        var giftCertTotal = new Money(0.0, basket.getCurrencyCode());

        while (gcPaymentInstrs.hasNext()) {
            orderPI = gcPaymentInstrs.next();
            giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
        }

        var totalAmount = basketTotal.subtract(giftCertTotal);

        const amount = Math.round(totalAmount.getValue() * multiplier);

        var shippingAddress = null;
        var shipments = basket.getShipments();
        var iter = shipments.iterator();
        while (iter != null && iter.hasNext()) {
            var shipment = iter.next();
            shippingAddress = shipment.getShippingAddress();
            if (shippingAddress) {
                break;
            }
        }

        var createPaymentIntentPayload = null;
        if (type === 'paymentelement') {
            const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
            createPaymentIntentPayload = {
                amount: amount,
                currency: basketCurrencyCode,
                automatic_payment_methods: {
                    enabled: true
                },
                capture_method: stripeChargeCapture ? 'automatic' : 'manual'
            };

            if (request.httpCookies['stripe.link.persistent_token'] && request.httpCookies['stripe.link.persistent_token'].value) {
                createPaymentIntentPayload.payment_method_options = {
                    link: {
                        persistent_token: request.httpCookies['stripe.link.persistent_token'].value
                    }
                };
            }
        } else {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };
        }

        if (customer.authenticated && customer.profile && customer.profile.email) {
            /*
             * Check if registered customer has an associated Stripe customer ID
             * if not, make a call to Stripe to create such id and save it as customer profile custom attribute
             */
            if (!customer.profile.custom.stripeCustomerID) {
                const newStripeCustomer = stripeService.customers.create({
                    email: customer.profile.email,
                    name: customer.profile.firstName + ' ' + customer.profile.lastName
                });

                Transaction.wrap(function () {
                    customer.profile.custom.stripeCustomerID = newStripeCustomer.id;
                });
            }

            createPaymentIntentPayload.customer = customer.profile.custom.stripeCustomerID;

            /*
             * Save the Stripe Payment Element for reuse by setting the setup_future_usage parameter to off_session
             */
            if (type === 'paymentelement' && stripeHelper.isStripePaymentElementsSavePaymentsEnabled()) {
                createPaymentIntentPayload.setup_future_usage = 'off_session';
            }
        }

        if (params.orderid) {
            if (!createPaymentIntentPayload.metadata) {
                createPaymentIntentPayload.metadata = {};
            }

            createPaymentIntentPayload.metadata.order_id = params.orderid;
            createPaymentIntentPayload.metadata.site_id = dw.system.Site.getCurrent().getID();
        }

        const paymentIntent = stripeService.paymentIntents.create(createPaymentIntentPayload);

        Transaction.wrap(function () {
            basket.custom.stripePaymentIntentID = paymentIntent.id;
            basket.custom.stripePaymentSourceID = '';

            if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0 && paymentIntent.charges.data[0].outcome) {
                basket.custom.stripeRiskLevel = paymentIntent.charges.data[0].outcome.risk_level;
                basket.custom.stripeRiskScore = paymentIntent.charges.data[0].outcome.risk_score;
            }
        });

        responsePayload = {
            success: true,
            clientSecret: paymentIntent.client_secret
        };
    } catch (e) {
        if (e.callResult) {
            var o = JSON.parse(e.callResult.errorMessage);
            responsePayload = {
                error: {
                    code: o.error.code,
                    message: o.error.message
                }
            };
        } else {
            responsePayload = {
                error: {
                    message: e.message
                }
            };
        }
    }

    return responsePayload;
}

exports.BeforePaymentSubmit = beforePaymentSubmit;
exports.BeforePaymentSubmit.public = true;

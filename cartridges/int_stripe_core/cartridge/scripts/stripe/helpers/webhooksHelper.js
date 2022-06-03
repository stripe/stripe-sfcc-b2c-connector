/* eslint-env es6 */
/* eslint-disable no-plusplus */
/* global request, response, empty */

'use strict';

const NOTIFICATIONS_CUSTOM_OBJECT_TYPE = 'StripeWebhookNotifications';

/**
 * Returns the type of custom objects for handling webhook notifications.
 *
 * @return {string} - Custom objects type.
 */
exports.getNotificationsCustomObjectType = function () {
    return NOTIFICATIONS_CUSTOM_OBJECT_TYPE;
};

// /* global request, response */

const Mac = require('dw/crypto/Mac');
const Encoding = require('dw/crypto/Encoding');
const Transaction = require('dw/system/Transaction');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const OrderMgr = require('dw/order/OrderMgr');
const Order = require('dw/order/Order');
const PaymentTransaction = require('dw/order/PaymentTransaction');

/**
* According to site pref setting will return status of possibility to store CO.
*
* @param {string} status - Status to check
* @returns {boolean} - True if status is valid (i.e. present in site prefs).
*/
function isWebHookStatusValid(status) {
    const webHookConfig = Site.getCurrent().getCustomPreferenceValue('stripeAllowedWebHookStatuses');

    return webHookConfig && webHookConfig.length && (webHookConfig.indexOf(status) >= 0);
}

/**
* Ignore sources that start with "card_*" along with sources that are of type "card"
*
* @param {Object} json - JSON object, payload received from Stripe
* @returns {boolean} - True if source type is valid.
*/
function isSourceHasValidType(json) {
    // charge event, but we should check source id and type for this charge to ignore card events
    if (json.data.object.object === 'charge'
        && json.data.object.source !== null
        && (json.data.object.source.id.indexOf('card_') !== -1
        || json.data.object.source.type === 'card')) {
        return false;
    } if (json.data.object.object === 'source'
        && (json.data.object.type === 'card'
        || json.data.object.id.indexOf('card_') !== -1)) {
        return false;
    }
    return true;
}

/**
 * Parse Stripe-Signature header and get an object with timestamp and key/value pairs of signatures.
 *
 * @param {string} header - Stripe-Signature header
 * @param {string} scheme - Stripe-Signature true key
 * @returns {Object} - Object with timestamp and key/value pairs of signatures
 */
function parseHeader(header, scheme) {
    if (typeof header !== 'string') {
        return null;
    }

    return header.split(',').reduce(function (accum, item) {
        var kv = item.split('=');

        if (kv[0] === 't') {
            accum.timestamp = kv[1]; // eslint-disable-line
        }

        if (kv[0] === scheme) {
            accum.signatures.push(kv[1]);
        }

        return accum;
    }, {
        timestamp: -1,
        signatures: []
    });
}

/**
 * Encrypt payload and secret key
 *
 * @param {Object} payload - Payload object
 * @param {string} secret - Sectet key
 * @returns {string} encoded string
 */
function computeSignature(payload, secret) {
    var HMAC = new Mac(Mac.HMAC_SHA_256);
    return Encoding.toHex(HMAC.digest(payload, secret));
}

/**
 * Retrieves Stripe customer ID from customer profile associated with a given order.
 *
 * @param {dw.order.Order} order - Order to get Stripe customer ID from
 * @returns {string} - Stripe customer ID if available or null;
 */
function getStripeCustomerIdFromOrder(order) {
    const orderCustomer = order.getCustomer();
    var stripeCustomerId = null;

    if (orderCustomer && orderCustomer.profile && ('stripeCustomerID' in orderCustomer.profile.custom) && orderCustomer.profile.custom.stripeCustomerID) {
        stripeCustomerId = orderCustomer.profile.custom.stripeCustomerID;
    }

    return stripeCustomerId;
}

/**
 * Process Klarna Source Chargeable Notification
 *
 * @param {Object} json - Payload object
 * @returns {string} - true if success;
 */
function processKlarnaSourceChargeableNotification(json) {
    if (!json || !json.data || !json.data.object
        || !json.data.object.amount || !json.data.object.currency || !json.data.object.id) {
        return false;
    }

    // Ensure valid order
    var order = null;

    // try to get Order by Meta Data (if provided)
    if (!empty(json.data.object.metadata) && !empty(json.data.object.metadata.order_id)) {
        const orderNo = json.data.object.metadata.order_id;
        order = OrderMgr.getOrder(orderNo);
    } else if (!empty(json.data.object.payment_intent)) {
        order = OrderMgr.searchOrder('custom.stripePaymentIntentID={0}', json.data.object.payment_intent);
    } else if (!empty(json.data.object.id)) {
        order = OrderMgr.searchOrder('custom.stripePaymentSourceID={0}', json.data.object.id);
    }

    if (!order) {
        return false;
    }

    var stripePaymentInstrument = null;
    for (let i = 0; i < order.paymentInstruments.length; i++) {
        let paymentInstrument = order.paymentInstruments[i];
        let paymentTransaction = paymentInstrument.paymentTransaction;
        let paymentProcessor = paymentTransaction && paymentTransaction.paymentProcessor;

        if (paymentProcessor && 'STRIPE_APM'.equals(paymentProcessor.ID)) {
            stripePaymentInstrument = paymentInstrument;
            break;
        }
    }

    if (!stripePaymentInstrument) {
        return false;
    }

    var customerEmail = order.getCustomerEmail();

    var createChargePayload = {
        amount: json.data.object.amount,
        currency: json.data.object.currency,
        source: json.data.object.id,
        description: 'Charge for ' + customerEmail + ', order ' + order.orderNo
    };

    var stripeCustomerId = stripePaymentInstrument.custom.stripeCustomerID || getStripeCustomerIdFromOrder(order);

    if (stripeCustomerId) {
        createChargePayload.customer = stripeCustomerId;
    }

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    try {
        const charge = stripeService.charges.create(createChargePayload);
        Transaction.wrap(function () {
            stripePaymentInstrument.custom.stripeChargeID = charge.id; // eslint-disable-line

            if (charge.balance_transaction && stripePaymentInstrument.paymentTransaction) {
                stripePaymentInstrument.paymentTransaction.transactionID = charge.balance_transaction;
                stripePaymentInstrument.paymentTransaction.type = PaymentTransaction.TYPE_CAPTURE;
            }

            if (order.status.value === Order.ORDER_STATUS_CREATED) {
                OrderMgr.placeOrder(order);
            }

            order.custom.stripeIsPaymentIntentInReview = false; // eslint-disable-line no-param-reassign
            order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
            order.setExportStatus(Order.EXPORT_STATUS_READY);
        });
    } catch (e) {
        Logger.error('Stripe Klarna charge error: ' + JSON.stringify(e));
        return false;
    }

    return true;
}

exports.processIncomingNotification = function () {
    const DEFAULT_TOLERANCE = 300;
    const EXPECTED_SCHEME = 'v1';

    const endpointSecret = Site.current.preferences.custom.stripeWebhookSigningSecret;

    const payload = request.httpParameterMap.requestBodyAsString;
    const stripeSignature = request.httpHeaders['stripe-signature'];

    var tolerance = DEFAULT_TOLERANCE;

    try {
        const details = parseHeader(stripeSignature, EXPECTED_SCHEME);
        if (!details || details.timestamp === -1) {
            response.setStatus(500);
            return false;
        }

        if (!details.signatures.length) {
            response.setStatus(500);
            return false;
        }

        var expectedSignature = computeSignature(details.timestamp + '.' + payload, endpointSecret);
        var signatureFound = details.signatures.indexOf(expectedSignature);

        if (signatureFound === -1) {
            response.setStatus(500);
            return false;
        }

        var timestampAge = Math.floor(Date.now() / 1000) - details.timestamp;

        if (tolerance > 0 && timestampAge > tolerance) {
            response.setStatus(500);
            return false;
        }

        var json = JSON.parse(payload);

        // check if Klarna charge transaction, if yes process it immediately
        if (json && json.data && json.data.object && json.data.object.type === 'klarna'
            && json.data.object.object === 'source' && json.type === 'source.chargeable') {
            var result = processKlarnaSourceChargeableNotification(json);
            if (result) {
                return true;
            }
        }

        var success = Transaction.wrap(function () {
            if (CustomObjectMgr.getCustomObject(NOTIFICATIONS_CUSTOM_OBJECT_TYPE, json.id) === null) {
                if (isWebHookStatusValid(json.type) && isSourceHasValidType(json)) {
                    var stripeNotification = CustomObjectMgr.createCustomObject(NOTIFICATIONS_CUSTOM_OBJECT_TYPE, json.id);

                    stripeNotification.custom.dateCreated = json.created;
                    stripeNotification.custom.stripeObjectId = json.data.object.id;
                    stripeNotification.custom.stripeObjectType = json.data.object.object;
                    stripeNotification.custom.amount = json.data.object.amount;
                    stripeNotification.custom.currency = json.data.object.currency;

                    switch (json.data.object.object) {
                        case 'source':
                            stripeNotification.custom.stripeSourceId = (json.data.object.source && json.data.object.source.id)
                                ? json.data.object.source.id : json.data.object.id;

                            stripeNotification.custom.siteId = (json.data.object.metadata && json.data.object.metadata.site_id)
                                ? json.data.object.metadata.site_id : '';

                            stripeNotification.custom.orderId = (json.data.object.metadata && json.data.object.metadata.order_id)
                                ? json.data.object.metadata.order_id : '';
                            break;
                        case 'charge':
                            stripeNotification.custom.stripeSourceId = (json.data.object.source && json.data.object.source.id)
                                ? json.data.object.source.id : json.data.object.id;

                            stripeNotification.custom.siteId = (json.data.object.metadata && json.data.object.metadata.site_id)
                                ? json.data.object.metadata.site_id : '';

                            stripeNotification.custom.orderId = (json.data.object.metadata && json.data.object.metadata.order_id)
                                ? json.data.object.metadata.order_id : '';

                            stripeNotification.custom.stripePaymentIntentID = json.data.object.payment_intent
                                ? json.data.object.payment_intent : '';
                            break;
                        default:
                            stripeNotification.custom.stripeSourceId = '';
                            break;
                    }
                    stripeNotification.custom.livemode = json.livemode;
                    stripeNotification.custom.stripeType = json.type;

                    switch (json.type) {
                        case 'source.chargeable':
                        case 'source.canceled':
                        case 'source.failed':
                        case 'charge.failed':
                        case 'charge.succeeded':
                        case 'charge.pending':
                        case 'review.opened':
                        case 'review.closed':
                        case 'charge.refunded':
                        case 'payment_intent.succeeded':
                        case 'payment_intent.payment_failed':
                            stripeNotification.custom.processingStatus = 'PROCESS';
                            break;
                        default:
                            stripeNotification.custom.processingStatus = 'UNKNOWN';
                    }

                    stripeNotification.custom.stripeWebhookData = payload;
                }

                return true;
            }

            return false;
        });

        if (!success) {
            response.setStatus(500);
            return false;
        }
    } catch (e) {
        Logger.error(e);
        response.setStatus(500);
        return false;
    }

    response.setStatus(200);
    return true;
};

/* eslint-env es6 */
/* eslint-disable no-plusplus */
/* global empty */

'use strict';

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');
const PaymentTransaction = require('dw/order/PaymentTransaction');
const OrderMgr = require('dw/order/OrderMgr');
const Resource = require('dw/web/Resource');
const Status = require('dw/system/Status');
const Logger = require('dw/system/Logger');
const Order = require('dw/order/Order');
const Site = require('dw/system/Site');
const Money = require('dw/value/Money');

const stripeLogger = Logger.getLogger('stripe_payments_job', 'stripe');
const logger = Logger.getLogger('Stripe', 'stripe');

const NOTIFICATIONS_CUSTOM_OBJECT_TYPE = 'StripeWebhookNotifications';

/**
* checks if SFRA options is enabled from Site Prefs
* @returns {bool} if SFRA is enabled
*/
function isSFRA() {
    return Site.current.getCustomPreferenceValue('stripeIsSFRA');
}

/**
* checks if Update SFCC Invoice on Stripe charge.refunded Webhook notification options is enabled from Site Prefs
* @returns {bool} true if stripeUpdateInvoiceOnRefundWebhook is enabled
*/
function isStripeUpdateInvoiceOnRefundWebhookEnabled() {
    return Site.current.getCustomPreferenceValue('stripeUpdateInvoiceOnRefundWebhook');
}

/**
* Send email with order status update to the customer.
*
* @param {dw.order.Order} order - Order to send email for
* @param {string} templateName - ISML template to use
* @param {string} subject - Email subject line
* @returns {dw.system.Status} - Status of sending the email
*/
function sendMail(order, templateName, subject) {
    const Mail = require('dw/net/Mail');
    const Template = require('dw/util/Template');
    const HashMap = require('dw/util/HashMap');

    if (!order || !templateName) {
        return new Status(Status.ERROR);
    }

    const mail = new Mail();
    mail.addTo(order.getCustomerEmail());
    mail.setSubject(subject || Resource.msg('order.orderconfirmation-email.001', 'order', null));
    mail.setFrom(Site.getCurrent().getCustomPreferenceValue('customerServiceEmail') || 'no-reply@salesforce.com');

    const context = new HashMap();
    context.put('Order', order);

    const template = new Template(templateName);
    const content = template.render(context).text;
    mail.setContent(content, 'text/html', 'UTF-8');

    return mail.send();
}

/**
 * Retrieves the payment instrument using Stripe alternative payment method for
 * an order.
 *
 * @param {dw.order.Order} order - Order to get the payment isntrument for
 * @return {paymentInstrument} - Stripe APM payment instrument if found or null otherwise
 */
function getStripeAPMPaymentInstrument(order) {
    for (let i = 0; i < order.paymentInstruments.length; i++) {
        let paymentInstrument = order.paymentInstruments[i];
        let paymentTransaction = paymentInstrument.paymentTransaction;
        let paymentProcessor = paymentTransaction && paymentTransaction.paymentProcessor;

        if (paymentProcessor && 'STRIPE_APM'.equals(paymentProcessor.ID)) {
            return paymentInstrument;
        }
    }

    return null;
}

/**
 * Retrieves the payment instrument using Stripe credit payment method for
 * an order.
 *
 * @param {dw.order.Order} order - Order to get the payment isntrument for
 * @return {paymentInstrument} - Stripe Credit payment instrument if found or null otherwise
 */
function getStripeCreditPaymentInstrument(order) {
    for (let i = 0; i < order.paymentInstruments.length; i++) {
        let paymentInstrument = order.paymentInstruments[i];
        let paymentTransaction = paymentInstrument.paymentTransaction;
        let paymentProcessor = paymentTransaction && paymentTransaction.paymentProcessor;

        if (paymentProcessor && 'STRIPE_CREDIT'.equals(paymentProcessor.ID)) {
            return paymentInstrument;
        }
    }

    return null;
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
 * Creates a charge for a given update.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order for which to create charge for
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function createCharge(stripeNotificationObject, order, stripePaymentInstrument) {
    var customerEmail = order.getCustomerEmail();

    var createChargePayload = {
        amount: stripeNotificationObject.custom.amount,
        currency: stripeNotificationObject.custom.currency,
        source: stripeNotificationObject.custom.stripeSourceId,
        description: 'Charge for ' + customerEmail + ', order ' + order.orderNo
    };

    if (stripePaymentInstrument.paymentMethod !== 'STRIPE_WECHATPAY') {
        var stripeCustomerId = stripePaymentInstrument.custom.stripeCustomerID || getStripeCustomerIdFromOrder(order);

        if (stripeCustomerId) {
            createChargePayload.customer = stripeCustomerId;
        }
    }

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    try {
        const charge = stripeService.charges.create(createChargePayload);
        Transaction.wrap(function () {
            stripePaymentInstrument.custom.stripeChargeID = charge.id; // eslint-disable-line
            stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line

            if (order.status.value === Order.ORDER_STATUS_CREATED) {
                OrderMgr.placeOrder(order);
            }

            if (charge.balance_transaction && stripePaymentInstrument.paymentTransaction) {
                stripePaymentInstrument.paymentTransaction.transactionID = charge.balance_transaction;  // eslint-disable-line
                stripePaymentInstrument.paymentTransaction.type = PaymentTransaction.TYPE_CAPTURE;  // eslint-disable-line
            }

            // Note: the Export ready and Paid status will be updated with further 'charge.succeeded' notification
            order.custom.stripeIsPaymentIntentInReview = false; // eslint-disable-line no-param-reassign
        });
        stripeLogger.info('Charge was successfull for order {0}, CO event id {1}, source {2}', order.orderNo, stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId);
    } catch (e) {
        stripeLogger.info('Unsuccessful charge for order {0}, CO event id {1}, source {2} message {3}', order.orderNo, stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, e.message);
    }
}

/**
 * Failes an order for a given notification.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to fail
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function failOrder(stripeNotificationObject, order, stripePaymentInstrument) {
    var chargeJSON = JSON.parse(stripeNotificationObject.custom.stripeWebhookData);
    var failedDetailsForOrder = {
        failure_code: chargeJSON.data.object.failure_code ? chargeJSON.data.object.failure_code : '',
        failure_message: chargeJSON.data.object.failure_message ? chargeJSON.data.object.failure_message : '',
        fraud_details: chargeJSON.data.object.fraud_details ? chargeJSON.data.object.fraud_details : '',
        outcome: chargeJSON.data.object.outcome ? chargeJSON.data.object.outcome : ''
    };

    Transaction.wrap(function () {
        order.addNote('Stripe Processing Job Note(failed details)', JSON.stringify(failedDetailsForOrder));
        var failStatus = OrderMgr.failOrder(order, true);
        if (failStatus.status === Status.ERROR) {
            stripeLogger.info('\n' + failStatus.message);
            logger.error('Error: {0}', failStatus.message);
        } else {
            stripeLogger.info('\nSuccessfully set order status to failed');
        }

        if (stripePaymentInstrument.paymentMethod === 'STRIPE_WECHATPAY') {
            order.custom.stripeIsPaymentIntentInReview = false; // eslint-disable-line no-param-reassign
        }

        stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL';  // eslint-disable-line
    });

    var statusMail = sendMail(order, 'stripe/mail/orderfailed', Resource.msg('order.orderfailed-email.001', 'stripe', null));

    stripeLogger.info('\nSuccessfully proccesed CO with event id: {0}, source id: {1}, updated SFCC order status to "FAILED". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'FAIL_OR_CANCEL', statusMail.status === Status.OK ? 'true' : 'false');
}

/**
 * Places an order.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to place
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function placeOrder(stripeNotificationObject, order, stripePaymentInstrument) {
    var chargeJSON = JSON.parse(stripeNotificationObject.custom.stripeWebhookData);
    Transaction.wrap(function () {
        stripePaymentInstrument.paymentTransaction.transactionID = chargeJSON.data.object.balance_transaction; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.type = PaymentTransaction.TYPE_CAPTURE; // eslint-disable-line
        stripePaymentInstrument.custom.stripeChargeID = chargeJSON.data.object.id; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeChargeId = chargeJSON.data.object.id; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeChargeOutcomeData = JSON.stringify(chargeJSON.data.object.outcome ? chargeJSON.data.object.outcome : {}); // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeJsonData = stripeNotificationObject.custom.stripeWebhookData; // eslint-disable-line

        var placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus === Status.ERROR) {
            OrderMgr.failOrder(order, true);
            stripeLogger.info('An error occured durring place order: {0}, error message: {1}', order.orderNo, placeOrderStatus.message);
        }

        order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
        order.setExportStatus(Order.EXPORT_STATUS_READY);

        stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
    });

    var statusMail = true;
    if (isSFRA()) {
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
        COHelpers.sendConfirmationEmail(order, 'default');
    } else {
        statusMail = sendMail(order, 'mail/orderconfirmation', Resource.msg('order.orderconfirmation-email.001', 'order', null));
    }

    stripeLogger.info('Successfully proccesed CO with event id: {0}, source id: {1} , updated SFCC order status to "EXPORT_STATUS_READY". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'PROCESSED', statusMail.status === Status.OK ? 'true' : 'false');
}

/**
 * Process Charge Refunded notification
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to place
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function processChargeRefunded(stripeNotificationObject, order, stripePaymentInstrument) {
    var chargeRefundedJSON = JSON.parse(stripeNotificationObject.custom.stripeWebhookData);

    Transaction.wrap(function () {
        const amountRefunded = chargeRefundedJSON.data.object.amount_refunded;
        const currency = stripeNotificationObject.custom.currency;
        const moneyRefunded = new Money((amountRefunded / 100).toFixed(2), currency);

        const noteTitle = Resource.msg('order.amountrefunded', 'stripe', null);
        const noteMessage = Resource.msgf('order.amountrefundedmsg', 'stripe', null, moneyRefunded.toString(), order.getOrderNo());

        order.addNote(noteTitle, noteMessage);

        /*
         * Note: SFCC Invoice can be updated only when Order post-processing APIs is enabled in SFCC
         *
         * Order post-processing APIs (gillian) are now inactive by default and will throw an exception if accessed.
         * Activation needs preliminary approval by Product Management. Please contact support in this case.
         */
        if (isStripeUpdateInvoiceOnRefundWebhookEnabled()) {
            try {
                var invoices = order.getInvoices();
                var invoice = null;

                if (invoices === null || invoices === undefined || invoices.length === 0) {
                    var invoiceNum = order.getInvoiceNo();
                    var shippingOrderTab = order.createShippingOrder();
                    invoice = shippingOrderTab.createInvoice(invoiceNum);
                } else {
                    invoice = invoices[0];
                }

                invoice.addRefundTransaction(stripePaymentInstrument, moneyRefunded);
            } catch (e) {
                logger.error('Error: {0}', e.message);
            }
        }

        stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
    });
}

/**
 * Places an order after review.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to place
 */
function placeOrderAfterReview(stripeNotificationObject, order) {
    Transaction.wrap(function () {
        var placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus === Status.ERROR) {
            OrderMgr.failOrder(order, true);
            stripeLogger.info('An error occured durring place order: {0}, error message: {1}', order.orderNo, placeOrderStatus.message);
        }

        order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
        order.setExportStatus(Order.EXPORT_STATUS_READY);

        stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
    });

    var statusMail = true;
    if (isSFRA()) {
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
        COHelpers.sendConfirmationEmail(order, 'default');
    } else {
        statusMail = sendMail(order, 'mail/orderconfirmation', Resource.msg('order.orderconfirmation-email.001', 'order', null));
    }

    stripeLogger.info('Successfully proccesed CO with event id: {0}, source id: {1} , updated SFCC order status to "EXPORT_STATUS_READY". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'PROCESSED', statusMail.status === Status.OK ? 'true' : 'false');
}

/**
 * Fail an order after review.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to place
 */
function failOrderAfterReview(stripeNotificationObject, order) {
    Transaction.wrap(function () {
        order.addNote('Stripe Processing Job Note(failed details)', stripeNotificationObject.custom.stripeWebhookData);
        var failStatus = OrderMgr.failOrder(order, true);
        if (failStatus.status === Status.ERROR) {
            stripeLogger.info('\n' + failStatus.message);
            logger.error('Error: {0}', failStatus.message);
        } else {
            stripeLogger.info('\nSuccessfully set order status to failed');
        }

        order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
        stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL';  // eslint-disable-line
    });

    var statusMail = sendMail(order, 'stripe/mail/orderfailed', Resource.msg('order.orderfailed-email.001', 'stripe', null));

    stripeLogger.info('\nSuccessfully proccesed CO with event id: {0}, source id: {1}, updated SFCC order status to "FAILED". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'FAIL_OR_CANCEL', statusMail.status === Status.OK ? 'true' : 'false');
}

/**
 * Process Review Notification.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 */
function processReviewNotification(stripeNotificationObject) {
    var event = JSON.parse(stripeNotificationObject.custom.stripeWebhookData);
    if (event.type === 'review.closed') {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
        var paymentIntent = stripeService.paymentIntents.retrieve(event.data.object.payment_intent);

        if (!(Site.getCurrent().getID() === paymentIntent.metadata.site_id)) {
            return;
        }
        const order = OrderMgr.getOrder(paymentIntent.metadata.order_id);

        if (order === null) {
            return;
        }

        switch (event.data.object.closed_reason) {
            case 'approved':
                placeOrderAfterReview(stripeNotificationObject, order);
                break;
            case 'refunded':
            case 'refunded_as_fraud':
            case 'disputed':
                failOrderAfterReview(stripeNotificationObject, order);
                break;
            default:
                break;
        }
    }
}

/**
 * Processes a custom object containing notification from Stripe.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 */
function processNotificationObject(stripeNotificationObject) {
    if (stripeNotificationObject.custom.stripeObjectType === 'review') {
        processReviewNotification(stripeNotificationObject);
        return;
    }

    const stripeEventId = stripeNotificationObject.custom.stripeEventId;

    // Ensure Payment Intent ID or Source ID existing in Custom Object
    const coStripePaymentIntentId = stripeNotificationObject.custom.stripePaymentIntentID;
    const coStripeSourceId = stripeNotificationObject.custom.stripeSourceId;
    if (!coStripeSourceId && !coStripePaymentIntentId) {
        stripeLogger.info('\nBoth Payment Intent Id and Source id are empty, event id: {0}', stripeEventId);
        return;
    }

    // Ensure valid order
    var order = null;
    var orderNo = '';

    // try to get Order by Meta Data (if provided)
    if (!empty(stripeNotificationObject.custom.orderId)) {
        orderNo = stripeNotificationObject.custom.orderId;
        order = OrderMgr.getOrder(orderNo);
    } else if (!empty(coStripePaymentIntentId)) {
        order = OrderMgr.searchOrder('custom.stripePaymentIntentID={0}', coStripePaymentIntentId);
    } else if (!empty(coStripeSourceId)) {
        order = OrderMgr.searchOrder('custom.stripePaymentSourceID={0}', coStripeSourceId);
    }

    if (!order) {
        stripeLogger.info(
            '\nSFCC order does not exist, order id: {0}, CO event id: {1}, source id: {2}, paymentItentID: {3}, siteID: {4}',
            orderNo,
            stripeEventId,
            coStripeSourceId,
            coStripePaymentIntentId,
            Site.getCurrent().ID
        );
        return;
    }

    // Ensure Stripe APM order
    const stripeAPMPaymentInstrument = getStripeAPMPaymentInstrument(order);
    const stripeCreditPaymentInstrument = getStripeCreditPaymentInstrument(order);
    const stripePaymentInstrument = stripeAPMPaymentInstrument || stripeCreditPaymentInstrument;

    if (!stripePaymentInstrument) {
        stripeLogger.info(
            '\nNo Stripe payment instrument found for order: {0}, CO event id: {1}, source id: {2}, paymentItentID: {3}, siteID: {4}',
            orderNo,
            stripeEventId,
            coStripeSourceId,
            coStripePaymentIntentId,
            Site.getCurrent().ID
        );
        return;
    }

    // we do not store source Id for orders placed with WeChat
    // so we skip the following checks for WeChat orders
    if (stripeAPMPaymentInstrument && stripePaymentInstrument.custom.stripeSourceID && stripePaymentInstrument.paymentMethod !== 'STRIPE_WECHATPAY') {
        const piStripeSourceId = stripePaymentInstrument.custom.stripeSourceID;

        if (coStripeSourceId !== piStripeSourceId) {
            stripeLogger.info(
                '\nSources do not match, SFCC order id: {0}, CO event id: {1}, \nSource from webhook: {2}, Source in payment transaction: {3}',
                orderNo,
                stripeEventId,
                coStripeSourceId,
                piStripeSourceId
            );
            return;
        }
    }

    const stripeEventType = stripeNotificationObject.custom.stripeType;
    switch (stripeEventType) {
        case 'source.chargeable':
            createCharge(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        case 'source.canceled':
        case 'source.failed':
        case 'charge.failed':
        case 'payment_intent.payment_failed':
            failOrder(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        case 'charge.succeeded':
        case 'payment_intent.succeeded':
            placeOrder(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        case 'charge.refunded':
            processChargeRefunded(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        default:
            break;
    }
}

/**
 * Checks if a notification is applicable for the current site.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @return {boolean} - True if applicable, false otherwise.
 */
function appliesToCurrentSite(stripeNotificationObject) {
    /*
     * metadata.site_id is not sent with all Stripe notification
     * So if empty we proceed with process
     * and if order is not found by payment intent id, we skip further processing
     */
    if (empty(stripeNotificationObject.custom.siteId)) {
        return true;
    }

    const coSiteId = stripeNotificationObject.custom.siteId;

    return !coSiteId || coSiteId === Site.getCurrent().getID();
}

exports.execute = function () {
    const queryString = "custom.processingStatus='PROCESS'";
    var stripeObjectsIter;

    try {
        stripeObjectsIter = CustomObjectMgr.queryCustomObjects(NOTIFICATIONS_CUSTOM_OBJECT_TYPE, queryString, null);

        while (stripeObjectsIter.hasNext()) {
            let stripeNotificationObject = stripeObjectsIter.next();

            if (appliesToCurrentSite(stripeNotificationObject)) {
                processNotificationObject(stripeNotificationObject);
            }
        }

        return new Status(Status.OK);
    } catch (e) {
        logger.error('Error: {0}', e.message);
        return new Status(Status.ERROR);
    } finally {
        if (stripeObjectsIter) {
            try {
                stripeObjectsIter.close();
            } catch (e) {
                Logger.error('Failed to close seekable iterator.');
            }
        }
    }
};

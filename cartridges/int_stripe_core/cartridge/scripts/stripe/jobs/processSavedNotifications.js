/* eslint-env es6 */
/* eslint-disable no-plusplus */
/* global empty, dw */

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
    // The source was already charged for this order (redelivered / re-stored source.chargeable
    // event, or a retry after a failure following the charge). Never charge it a second time.
    if (stripePaymentInstrument.custom.stripeChargeID) {
        Transaction.wrap(function () {
            stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
        });
        stripeLogger.info('Charge {0} already exists for order {1}, skipping CO event id {2}, source {3}', stripePaymentInstrument.custom.stripeChargeID, order.orderNo, stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId);
        return;
    }

    var customerEmail = order.getCustomerEmail();

    var createChargePayload = {
        amount: stripeNotificationObject.custom.amount,
        currency: stripeNotificationObject.custom.currency,
        source: stripeNotificationObject.custom.stripeSourceId,
        description: 'Charge for ' + customerEmail + ', order ' + order.orderNo
    };

    var stripeCustomerId = stripePaymentInstrument.custom.stripeCustomerID || getStripeCustomerIdFromOrder(order);

    if (stripeCustomerId) {
        createChargePayload.customer = stripeCustomerId;
    }

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    // Deterministic key: if this job retries the same charge (e.g. the charge succeeded but
    // persisting its ID failed), Stripe returns the original charge instead of creating a new one.
    const idempotencyKey = require('*/cartridge/scripts/stripe/helpers/idempotencyHelper')
        .buildKey('source-charge', order.orderNo + '-' + stripeNotificationObject.custom.stripeSourceId, createChargePayload);

    var charge;
    try {
        charge = stripeService.charges.create(createChargePayload, idempotencyKey);
    } catch (e) {
        stripeLogger.info('Unsuccessful charge for order {0}, CO event id {1}, source {2} message {3}', order.orderNo, stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, e.message);

        // A 4xx rejection (declined, source already consumed, ...) will not succeed on retry, so stop
        // re-attempting it every job run. Timeouts, 5xx, 409 (concurrent idempotent request) and
        // 429 stay in PROCESS and are retried with the same idempotency key.
        const httpStatus = e.callResult && e.callResult.error;
        if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 409 && httpStatus !== 429) {
            Transaction.wrap(function () {
                stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL'; // eslint-disable-line
            });
        }
        return;
    }

    // Persist the charge ID in its own transaction so that a failure while updating the order
    // below cannot roll it back and cause the source to be charged again on the next job run.
    Transaction.wrap(function () {
        stripePaymentInstrument.custom.stripeChargeID = charge.id; // eslint-disable-line
        stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
    });

    try {
        Transaction.wrap(function () {
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
        // The charge exists and is recorded; the order is placed by the follow-up 'charge.succeeded' notification.
        logger.error('Charge {0} created for order {1} but updating the order failed: {2}', charge.id, order.orderNo, e.message);
    }
}

/**
 * Failes an order for a given notification.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to fail
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function failOrder(stripeNotificationObject, order) {
    // If the order is failed, do not try to fail it (or email the customer) again
    if (order.status.value === Order.ORDER_STATUS_FAILED) {
        Transaction.wrap(function () {
            stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL'; // eslint-disable-line
        });
        return;
    }

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
        if (failStatus.isError()) {
            stripeLogger.info('\n' + failStatus.message);
            logger.error('Error: {0}', failStatus.message);
        } else {
            stripeLogger.info('\nSuccessfully set order status to failed');
        }

        stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL';  // eslint-disable-line
    });

    var statusMail = sendMail(order, 'stripe/mail/orderfailed', Resource.msg('order.orderfailed-email.001', 'stripe', null));

    stripeLogger.info('\nSuccessfully proccesed CO with event id: {0}, source id: {1}, updated SFCC order status to "FAILED". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'FAIL_OR_CANCEL', statusMail.status === Status.OK ? 'true' : 'false');
}

/**
 * @param {dw.order.Order} order - Order to check
 * @returns {boolean} - True if the order is placed (New, Open or Completed)
 */
function isOrderPlaced(order) {
    const orderStatus = order.status.value;
    return orderStatus === Order.ORDER_STATUS_NEW || orderStatus === Order.ORDER_STATUS_OPEN || orderStatus === Order.ORDER_STATUS_COMPLETED;
}

/**
 * Places and confirms an order for a successful payment. Must be called in a transaction.
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to confirm
 * @param {boolean} [paymentReceived] - False if the payment is only authorized
 * @returns {boolean} - True if the order was confirmed by this call, false otherwise
 */
function confirmPaidOrder(stripeNotificationObject, order, paymentReceived) {
    const orderStatus = order.status.value;
    const markPaid = paymentReceived !== false;

    stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line

    if (orderStatus === Order.ORDER_STATUS_FAILED || orderStatus === Order.ORDER_STATUS_CANCELLED) {
        order.addNote('Stripe Processing Job Note', 'Successful payment notification ' + stripeNotificationObject.custom.stripeEventId + ' received for a failed or cancelled order. Manual review required.');
        logger.warn('Successful payment notification {0} received for failed or cancelled order {1}, order not updated.', stripeNotificationObject.custom.stripeEventId, order.orderNo);
        return false;
    }

    const isPlaced = isOrderPlaced(order);

    if (isPlaced && (!markPaid || order.paymentStatus.value === Order.PAYMENT_STATUS_PAID)) {
        return false;
    }

    if (!isPlaced) {
        var placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus.isError()) {
            OrderMgr.failOrder(order, true);
            stripeLogger.info('An error occured durring place order: {0}, error message: {1}', order.orderNo, placeOrderStatus.message);
            return false;
        }
    }

    order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
    if (markPaid) {
        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
    }

    // Never move an order that was already exported back to READY (it would be exported again)
    if (order.exportStatus.value === Order.EXPORT_STATUS_NOTEXPORTED) {
        order.setExportStatus(Order.EXPORT_STATUS_READY);
    }

    return true;
}

/**
 * Places an order.
 *
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order to place
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 * @param {boolean} [paymentReceived] - False if the payment is only authorized
 */
function placeOrder(stripeNotificationObject, order, stripePaymentInstrument, paymentReceived) { // eslint-disable-line
    var chargeJSON = JSON.parse(stripeNotificationObject.custom.stripeWebhookData);

    // add card info (if any) to payment instrument for Stripe payment element
    try {
        const stripePEPaymentInstruments = order.getPaymentInstruments('STRIPE_PAYMENT_ELEMENT');
        const stripePEPaymentInstrument = stripePEPaymentInstruments.length && stripePEPaymentInstruments[0];

        if (stripePEPaymentInstrument && chargeJSON && chargeJSON.data && chargeJSON.data.object && chargeJSON.data.object.payment_method_details) {
            Transaction.wrap(function () {
                require('*/cartridge/scripts/stripe/helpers/checkoutHelper').savePaymentMethodDetails(
                    stripePEPaymentInstrument,
                    chargeJSON.data.object.payment_method_details,
                    chargeJSON.data.object.billing_details && chargeJSON.data.object.billing_details.name
                );
            });
        }

        var stripeChargeOutcomeData = (chargeJSON && chargeJSON.data && chargeJSON.data.object && chargeJSON.data.object.outcome) || null;

        if (stripeChargeOutcomeData && !empty(stripeChargeOutcomeData.risk_level)) {
            Transaction.wrap(function () {
                order.custom.stripeRiskLevel = chargeJSON.data.object.outcome.risk_level;
            });
        }

        if (stripeChargeOutcomeData && stripeChargeOutcomeData.risk_score !== null && stripeChargeOutcomeData.risk_score !== undefined) {
            Transaction.wrap(function () {
                order.custom.stripeRiskScore = chargeJSON.data.object.outcome.risk_score;
            });
        }
    } catch (e) {
        logger.error('Error writing stripePEPaymentInstrument: {0}', e.message);
    }

    const wasPlaced = isOrderPlaced(order);
    var orderConfirmed = Transaction.wrap(function () {
        /*
        stripePaymentInstrument.paymentTransaction.transactionID = chargeJSON.data.object.balance_transaction; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.type = PaymentTransaction.TYPE_CAPTURE; // eslint-disable-line
        stripePaymentInstrument.custom.stripeChargeID = chargeJSON.data.object.id; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeChargeId = chargeJSON.data.object.id; // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeChargeOutcomeData = JSON.stringify(chargeJSON.data.object.outcome ? chargeJSON.data.object.outcome : {}); // eslint-disable-line
        stripePaymentInstrument.paymentTransaction.custom.stripeJsonData = stripeNotificationObject.custom.stripeWebhookData; // eslint-disable-line
        */
        return confirmPaidOrder(stripeNotificationObject, order, paymentReceived);
    });

    if (!orderConfirmed) {
        stripeLogger.info('CO with event id: {0}, source id: {1} processed, order {2} not updated (already paid, failed or could not be placed)', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, order.orderNo);
        return;
    }

    // Already placed earlier (e.g. authorized, now captured): the confirmation email was sent then
    if (wasPlaced) {
        stripeLogger.info('CO with event id: {0} processed, order {1} marked as paid', stripeNotificationObject.custom.stripeEventId, order.orderNo);
        return;
    }

    const stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var isAPMOrder = stripeCheckoutHelper.isAPMOrder(order);
    if (isAPMOrder) {
        var statusMail = true;
        if (isSFRA()) {
            var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
            var customerLocaleID = order.getCustomerLocaleID();
            COHelpers.sendConfirmationEmail(order, customerLocaleID ? customerLocaleID : 'default'); // eslint-disable-line
        } else {
            statusMail = sendMail(order, 'mail/orderconfirmation', Resource.msg('order.orderconfirmation-email.001', 'order', null));
        }

        stripeLogger.info('Successfully proccesed CO with event id: {0}, source id: {1} , updated SFCC order status to "EXPORT_STATUS_READY". Set up CO processingStatus to {2}, email send - {3}', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'PROCESSED', statusMail.status === Status.OK ? 'true' : 'false');
    } else {
        stripeLogger.info('Successfully proccesed CO with event id: {0}, source id: {1} , updated SFCC order status to "EXPORT_STATUS_READY". Set up CO processingStatus to {2}, email Not sent', stripeNotificationObject.custom.stripeEventId, stripeNotificationObject.custom.stripeSourceId, 'PROCESSED');
    }
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
    var orderConfirmed = Transaction.wrap(function () {
        return confirmPaidOrder(stripeNotificationObject, order);
    });

    if (!orderConfirmed) {
        stripeLogger.info('CO with event id: {0} processed, order {1} not updated (already paid, failed or could not be placed)', stripeNotificationObject.custom.stripeEventId, order.orderNo);
        return;
    }

    var statusMail = true;
    if (isSFRA()) {
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
        var customerLocaleID = order.getCustomerLocaleID();
        COHelpers.sendConfirmationEmail(order, customerLocaleID ? customerLocaleID : 'default'); // eslint-disable-line
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
    // If the order is failed, do not try to fail it (or email the customer) again
    if (order.status.value === Order.ORDER_STATUS_FAILED) {
        Transaction.wrap(function () {
            stripeNotificationObject.custom.processingStatus = 'FAIL_OR_CANCEL'; // eslint-disable-line
        });
        return;
    }

    Transaction.wrap(function () {
        order.addNote('Stripe Processing Job Note(failed details)', stripeNotificationObject.custom.stripeWebhookData);
        var failStatus = OrderMgr.failOrder(order, true);
        if (failStatus.isError()) {
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

        if (order === null || isForeignCheckoutSessionEvent(stripeNotificationObject, order, paymentIntent, paymentIntent.id)) {
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
 * Stores a Checkout Session's Payment Intent on the order.
 * @param {string} paymentIntentId - Payment Intent ID, or null
 * @param {dw.order.Order} order - Order paid by the session
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 * @returns {string} - Payment Intent ID, or null if the session has none
 */
function recordCheckoutSessionPaymentIntent(paymentIntentId, order, stripePaymentInstrument) {
    if (!paymentIntentId || order.custom.stripePaymentIntentID === paymentIntentId) {
        return paymentIntentId;
    }

    const stripeChargeCapture = Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');

    Transaction.wrap(function () {
        order.custom.stripePaymentIntentID = paymentIntentId; // eslint-disable-line no-param-reassign
        stripePaymentInstrument.paymentTransaction.setTransactionID(paymentIntentId);
        stripePaymentInstrument.paymentTransaction.setType(stripeChargeCapture ? PaymentTransaction.TYPE_CAPTURE : PaymentTransaction.TYPE_AUTH);
    });

    // Lets the Payment Intent be traced back to the order in the Dashboard and in its later events
    try {
        require('*/cartridge/scripts/stripe/services/stripeService').paymentIntents.update(paymentIntentId, {
            metadata: { order_id: order.orderNo, site_id: Site.getCurrent().getID() }
        });
    } catch (e) {
        logger.warn('Could not add order metadata to Payment Intent {0} for order {1}: {2}', paymentIntentId, order.orderNo, e.message);
    }

    return paymentIntentId;
}

/**
 * Processes checkout.session.completed (paid, authorized or pending payment).
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order paid by the session
 * @param {dw.order.OrderPaymentInstrument} stripePaymentInstrument - Stripe payment instrument
 */
function processCheckoutSessionCompleted(stripeNotificationObject, order, stripePaymentInstrument) {
    const checkoutSession = JSON.parse(stripeNotificationObject.custom.stripeWebhookData).data.object;
    const paymentIntentId = recordCheckoutSessionPaymentIntent(checkoutSession.payment_intent || null, order, stripePaymentInstrument);

    if (checkoutSession.payment_status === 'paid') {
        placeOrder(stripeNotificationObject, order, stripePaymentInstrument);
        return;
    }

    var paymentIntentStatus = null;
    if (paymentIntentId) {
        try {
            paymentIntentStatus = require('*/cartridge/scripts/stripe/services/stripeService').paymentIntents.retrieve(paymentIntentId).status;
        } catch (e) {
            // Left in PROCESS: retried by the next job run
            logger.error('Could not retrieve Payment Intent {0} for order {1}: {2}', paymentIntentId, order.orderNo, e.message);
            return;
        }
    }

    if (paymentIntentStatus === 'requires_capture') {
        placeOrder(stripeNotificationObject, order, stripePaymentInstrument, false);
        return;
    }

    Transaction.wrap(function () {
        order.addNote('Stripe Processing Job Note', 'Checkout Session ' + checkoutSession.id + ' completed, payment pending (Payment Intent status: ' + paymentIntentStatus + ')');
        stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
    });
}

/**
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @returns {boolean} - False for a charge that is authorized but not captured
 */
function isPaymentCaptured(stripeNotificationObject) {
    const stripeObject = JSON.parse(stripeNotificationObject.custom.stripeWebhookData).data.object;
    return !(stripeObject.object === 'charge' && stripeObject.captured === false);
}

/**
 * Checks that an event for a Checkout Session order comes from that order's own session.
 * @param {dw.object.CustomObject} stripeNotificationObject - Notification CO
 * @param {dw.order.Order} order - Order found by the event metadata
 * @param {Object} stripeObject - Event object (checkout.session, payment_intent or charge)
 * @param {string} paymentIntentId - Payment Intent ID of the event, or null
 * @returns {boolean} - True if the event must not update the order
 */
function isForeignCheckoutSessionEvent(stripeNotificationObject, order, stripeObject, paymentIntentId) {
    const orderSessionId = order.custom.stripeCheckoutSessionID;
    if (!orderSessionId) {
        return false;
    }

    var matches;
    if (stripeObject.object === 'checkout.session') {
        // Every session created on the billing page carries the same order number
        matches = stripeObject.id === orderSessionId
            && require('*/cartridge/scripts/stripe/helpers/checkoutHelper').isCheckoutSessionAmountValid(stripeObject, order);
    } else if (order.custom.stripePaymentIntentID) {
        matches = paymentIntentId === order.custom.stripePaymentIntentID;
    } else {
        try {
            const orderSession = require('*/cartridge/scripts/stripe/services/stripeService').checkoutSessions.retrieve(orderSessionId);
            matches = !!paymentIntentId && orderSession.payment_intent === paymentIntentId;
        } catch (e) {
            // Left in PROCESS: retried by the next job run
            logger.error('Could not retrieve Checkout Session {0} for order {1}: {2}', orderSessionId, order.orderNo, e.message);
            return true;
        }
    }

    if (!matches) {
        Transaction.wrap(function () {
            order.addNote('Stripe Processing Job Note', 'Event ' + stripeNotificationObject.custom.stripeEventId + ' does not belong to Checkout Session ' + orderSessionId + ' of this order or its amount does not match, order not updated. Manual review required.');
            stripeNotificationObject.custom.processingStatus = 'PROCESSED'; // eslint-disable-line
        });
        logger.warn('Event {0} does not match Checkout Session {1} of order {2}, order not updated.', stripeNotificationObject.custom.stripeEventId, orderSessionId, order.orderNo);
    }

    return !matches;
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
    const coStripePaymentIntentId = stripeNotificationObject.custom.stripePaymentIntentID || stripeNotificationObject.custom.stripeObjectId;
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
    const stripePaymentInstrument = stripeAPMPaymentInstrument;

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

    if (stripeAPMPaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
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

    const stripeObject = JSON.parse(stripeNotificationObject.custom.stripeWebhookData).data.object;
    if (isForeignCheckoutSessionEvent(stripeNotificationObject, order, stripeObject, coStripePaymentIntentId || null)) {
        return;
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
            failOrder(stripeNotificationObject, order);
            break;
        case 'charge.succeeded':
        case 'payment_intent.succeeded':
            // Checkout Session order without checkout.session.* events: link its Payment Intent here
            if (order.custom.stripeCheckoutSessionID && !order.custom.stripePaymentIntentID) {
                recordCheckoutSessionPaymentIntent(coStripePaymentIntentId || null, order, stripePaymentInstrument);
            }
            placeOrder(stripeNotificationObject, order, stripePaymentInstrument, isPaymentCaptured(stripeNotificationObject));
            break;
        case 'checkout.session.completed':
            processCheckoutSessionCompleted(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        case 'checkout.session.async_payment_succeeded':
            recordCheckoutSessionPaymentIntent(JSON.parse(stripeNotificationObject.custom.stripeWebhookData).data.object.payment_intent || null, order, stripePaymentInstrument);
            placeOrder(stripeNotificationObject, order, stripePaymentInstrument);
            break;
        case 'checkout.session.async_payment_failed':
            failOrder(stripeNotificationObject, order);
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

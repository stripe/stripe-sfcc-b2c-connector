'use strict';

/**
 * Controller that creates an order from the current basket. It's a pure processing controller and does
 * no page rendering. The controller is used by checkout and is called upon the triggered place order action.
 * It contains the actual logic to authorize the payment and create the order. The controller communicates the result
 * of the order creation process and uses a status object PlaceOrderError to set proper error states.
 * The calling controller is must handle the results of the order creation and evaluate any errors returned by it.
 *
 * @module controllers/COPlaceOrder
 */

/* API Includes */
var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Resource = require('dw/web/Resource');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var PaymentInstrument = require('dw/order/PaymentInstrument');

/* Script Modules */
var app = require('~/cartridge/scripts/app');
var guard = require('~/cartridge/scripts/guard');

var Cart = app.getModel('Cart');
var Email = app.getModel('Email');
var Order = app.getModel('Order');
var PaymentProcessor = app.getModel('PaymentProcessor');
var Stripe = require('int_stripe/cartridge/scripts/service/stripe');
var StripeHelper = require('int_stripe/cartridge/scripts/stripeHelper');

/**
 * Responsible for payment handling. This function uses PaymentProcessorModel methods to
 * handle payment processing specific to each payment instrument. It returns an
 * error if any of the authorizations failed or a payment
 * instrument is of an unknown payment method. If a payment method has no
 * payment processor assigned, the payment is accepted as authorized.
 *
 * @transactional
 * @param {dw.order.Order} order - the order to handle payments for.
 * @return {Object} JSON object containing information about missing payments, errors, or an empty object if the function is successful.
 */
function handlePayments(order) {

    if (order.getTotalNetPrice() !== 0.00) {

        var paymentInstruments = order.getPaymentInstruments();

        if (paymentInstruments.length === 0) {
            return {
                missingPaymentInfo: true
            };
        }
        /**
         * Sets the transaction ID for the payment instrument.
         */
        var handlePaymentTransaction = function () {
            paymentInstrument.getPaymentTransaction().setTransactionID(order.getOrderNo());
        };

        for (var i = 0; i < paymentInstruments.length; i++) {
            var paymentInstrument = paymentInstruments[i];

            if (PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor() === null) {

                Transaction.wrap(handlePaymentTransaction);

            } else {

                var authorizationResult = PaymentProcessor.authorize(order, paymentInstrument);

                if (authorizationResult.not_supported || authorizationResult.error) {
                    return {
                        error: true
                    };
                }
            }
        }
    }

    return {};
}

/**
 * The entry point for order creation. This function is not exported, as this controller must only
 * be called by another controller.
 *
 * @transactional
 * @return {Object} JSON object that is empty, contains error information, or PlaceOrderError status information.
 */
function start() {
    var cart = Cart.get();

    if (cart) {

        var COShipping = app.getController('COShipping');

        // Clean shipments.
        COShipping.PrepareShipments(cart);

        // Make sure there is a valid shipping address, accounting for gift certificates that do not have one.
        if (cart.getProductLineItems().size() > 0 && cart.getDefaultShipment().getShippingAddress() === null) {
            COShipping.Start();
            return {};
        }

        // Make sure the billing step is fulfilled, otherwise restart checkout.
        if (!session.forms.billing.fulfilled.value) {
            app.getController('COCustomer').Start();
            return {};
        }

        Transaction.wrap(function () {
            cart.calculate();
        });

        var COBilling = app.getController('COBilling');

        Transaction.wrap(function () {
            if (!COBilling.ValidatePayment(cart)) {
                COBilling.Start();
                return {};
            }
        });

        // Recalculate the payments. If there is only gift certificates, make sure it covers the order total, if not
        // back to billing page.
        Transaction.wrap(function () {
            if (!cart.calculatePaymentTransactionTotal()) {
                COBilling.Start();
                return {};
            }
        });

        // Handle used addresses and credit cards.
        var saveCCResult = COBilling.SaveCreditCard();

        if (!saveCCResult) {
            return {
                error: true,
                PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical')
            };
        }

        // Creates a new order. This will internally ReserveInventoryForOrder and will create a new Order with status
        // 'Created'.
        var order = cart.createOrder();

        if (!order) {
            // TODO - need to pass BasketStatus to Cart-Show ?
            app.getController('Cart').Show();

            return {};
        } else {
            var handlePaymentsResult = handlePayments(order);

            if (handlePaymentsResult.error) {
                return Transaction.wrap(function () {
                    OrderMgr.failOrder(order);
                    return {
                        error: true,
                        PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical')
                    };
                });

            } else if (handlePaymentsResult.missingPaymentInfo) {
                return Transaction.wrap(function () {
                    OrderMgr.failOrder(order);
                    return {
                        error: true,
                        PlaceOrderError: new Status(Status.ERROR, 'confirm.error.technical')
                    };
                });
            }

            var orderPlacementStatus = submitImpl(order);
            // Make a refund on the charge if the order fails
            if (orderPlacementStatus.error && StripeHelper.IsStripeEnabled()) {
            	var paymentInstrument = order.getPaymentInstruments(PaymentInstrument.METHOD_CREDIT_CARD)[0];
            	Stripe.RefundCharge({PaymentInstrument:paymentInstrument});
            }
            
            return orderPlacementStatus;
        }
    } else {
        app.getController('Cart').Show();
        return {};
    }
}

/**
 * Submits an order.
 *
 * @transactional
 * @param {dw.order.Order} order - the order to submit.
 * @return {Boolean | Object} false if order cannot be placed. true if the order confirmation status is CONFIRMED.
 * JSON object containing error information, or the order and/or order creation information.
 */
function submitImpl(order) {

    var orderPlacementStatus = Transaction.wrap(function () {
        if (OrderMgr.placeOrder(order) === Status.ERROR) {
            OrderMgr.failOrder(order);
            return false;
        }

        order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);

        return true;
    });

    if (orderPlacementStatus === Status.ERROR) {
        return {error: true};
    }

    // Creates purchased gift certificates with this order.
    if (!createGiftCertificates(order)) {
        OrderMgr.failOrder(order);
        return {error: true};
    }

    // Send order confirmation and clear used forms within the checkout process.
    Email.get('mail/orderconfirmation', order.getCustomerEmail())
        .setSubject((Resource.msg('order.orderconfirmation-email.001', 'order', null) + ' ' + order.getOrderNo()).toString())
        .send({
            Order: order
        });

    // Mark order as EXPORT_STATUS_READY.
    Transaction.wrap(function () {
        order.setExportStatus(dw.order.Order.EXPORT_STATUS_READY);
        order.setConfirmationStatus(dw.order.Order.CONFIRMATION_STATUS_CONFIRMED);
    });

    // Clears all forms used in the checkout process.
    session.forms.singleshipping.clearFormElement();
    session.forms.multishipping.clearFormElement();
    session.forms.billing.clearFormElement();

    return {
        Order: order,
        order_created: true
    };
}

/**
 * Creates a gift certificate for each gift certificate line item in the order
 * and sends an email to the gift certificate receiver.
 *
 * @param {dw.order.Order} order - the order to create the gift certificates for.
 * @return {Boolean} true if the order successfully created the gift certificates, false otherwise.
 */
function createGiftCertificates(order) {

    var giftCertificates = Order.get(order).createGiftCertificates();

    if (giftCertificates) {

        for (var i = 0; i < giftCertificates.length; i++) {
            var giftCertificate = giftCertificates[i];

            // Send order confirmation and clear used forms within the checkout process.
            Email.get('mail/giftcert', giftCertificate.recipientEmail)
                .setSubject(Resource.msg('resource.ordergcemsg', 'email', null) + ' ' + giftCertificate.senderName)
                .send({
                    GiftCertificate: giftCertificate
                });
        }

        return true;
    } else {
        return false;
    }
}

/**
 * Asynchronous Callbacks for OCAPI. These functions result in a JSON response.
 * Sets the payment instrument information in the form from values in the httpParameterMap.
 * Checks that the payment instrument selected is valid and authorizes the payment. Renders error
 * message information if the payment is not authorized.
 */
function submitPaymentJSON() {

    var order = Order.get(request.httpParameterMap.order_id.stringValue);
    if (order.object && (request.httpParameterMap.order_token.stringValue === order.getOrderToken())) {

        session.forms.billing.paymentMethods.clearFormElement();

        var requestObject = JSON.parse(request.httpParameterMap.requestBodyAsString);
        var form = session.forms.billing.paymentMethods;

        for (var requestObjectItem in requestObject) {
            var asyncPaymentMethodResponse = requestObject[requestObjectItem];

            var terms = requestObjectItem.split('_');
            if (terms[0] === 'creditCard') {
                var value = (terms[1] === 'month' || terms[1] === 'year')
                    ? Number(asyncPaymentMethodResponse) : asyncPaymentMethodResponse;
                form.creditCard[terms[1]].setValue(value);
            } else if (terms[0] === 'selectedPaymentMethodID') {
                form.selectedPaymentMethodID.setValue(asyncPaymentMethodResponse);
            }
        }

        if (app.getController('COBilling').HandlePaymentSelection('cart').error || handlePayments().error) {
            app.getView().render('checkout/components/faults');
            return;
        } else {
            app.getView().render('checkout/components/payment_methods_success');
            return;
        }
    } else {
        app.getView().render('checkout/components/faults');
        return;
    }
}

/*
 * Asynchronous Callbacks for SiteGenesis.
 * Identifies if an order exists, submits the order, and shows a confirmation message.
 */
function submit() {
    var order = Order.get(request.httpParameterMap.order_id.stringValue);
    var orderPlacementStatus;
    if (order.object && request.httpParameterMap.order_token.stringValue === order.getOrderToken()) {
        orderPlacementStatus = submitImpl(order);
        if (!orderPlacementStatus.error) {
            return app.getController('COSummary').ShowConfirmation(order);
        }
    }
    app.getController('COSummary').Start();
}

/*
 * Module exports
 */

/*
 * Web exposed methods
 */
/** @see module:controllers/COPlaceOrder~submitPaymentJSON */
exports.SubmitPaymentJSON = guard.ensure(['https'], submitPaymentJSON);
/** @see module:controllers/COPlaceOrder~submitPaymentJSON */
exports.Submit = guard.ensure(['https'], submit);

/*
 * Local methods
 */
exports.Start = start;
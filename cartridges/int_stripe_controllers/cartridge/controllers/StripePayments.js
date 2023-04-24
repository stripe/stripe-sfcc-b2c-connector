/* eslint-disable new-cap */
/* eslint-disable no-plusplus */
/* global response, request, session, dw, empty, customer */
// v1

'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var Order = require('dw/order/Order');
var Money = require('dw/value/Money');

var URLUtils = require('dw/web/URLUtils');
var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var CSRFProtection = require('dw/web/CSRFProtection');
var app = require('*/cartridge/scripts/app');

var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

var stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');

/**
 * An entry point to handle returns from alternative payment methods.
 */
function handleAPM() {
    var redirectUrl = stripePaymentsHelper.HandleAPM();

    response.redirect(redirectUrl);
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

/**
 * Entry point for writing errors to Stripe Logger
 */
function logStripeErrorMessage() {
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        response.setStatus(500);
    } else {
        var msg = request.httpParameterMap.msg.stringValue;

        stripePaymentsHelper.LogStripeErrorMessage(msg);
    }

    var jsonResponse = JSON.stringify({
        success: true
    });
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.LogStripeErrorMessage = logStripeErrorMessage;
exports.LogStripeErrorMessage.public = true;

/**
 * Entry point for fail Stripe order
 */
function failOrder() {
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        response.setStatus(500);
    } else {
        stripePaymentsHelper.FailOrder();
    }

    var jsonResponse = JSON.stringify({
        success: true
    });
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.FailOrder = failOrder;
exports.FailOrder.public = true;

var Cart = app.getModel('Cart');
var PaymentProcessor = app.getModel('PaymentProcessor');

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
    if (order.getTotalNetPrice().value !== 0.00) {
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
            // eslint-disable-next-line
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
 * Entry point for handling CardPaymentSubmitOrder.
 */
function cardPaymentSubmitOrder() {
    var responsePayload;
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        responsePayload = {
            error: true
        };
        response.setStatus(500);
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();
    if (currentBasket) {
        if (currentBasket.custom.stripePaymentIntentID) {
            Transaction.wrap(function () {
                currentBasket.custom.stripePaymentIntentID = null;
            });
        }

        var cardPaymentInstrument = checkoutHelper.getStripePaymentInstrument(currentBasket);
        if (cardPaymentInstrument && cardPaymentInstrument.paymentTransaction && cardPaymentInstrument.paymentTransaction.getTransactionID()) {
            Transaction.wrap(function () {
                cardPaymentInstrument.paymentTransaction.setTransactionID(null);
            });
        }
    }

    /*
     * I. Create SFCC Order
     */
    session.privacy.stripeOrderNumber = null;
    delete session.privacy.stripeOrderNumber;

    var cart = Cart.get();
    if (!cart) {
        app.getController('Cart').Show();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var COShipping = app.getController('COShipping');

    // Clean shipments.
    COShipping.PrepareShipments(cart);

    // Make sure there is a valid shipping address, accounting for gift certificates that do not have one.
    if (cart.getProductLineItems().size() > 0 && cart.getDefaultShipment().getShippingAddress() === null) {
        COShipping.Start();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    // Make sure the billing step is fulfilled, otherwise restart checkout.
    if (!session.forms.billing.fulfilled.value) {
        app.getController('COCustomer').Start();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    Transaction.wrap(function () {
        cart.calculate();
    });

    var COBilling = app.getController('COBilling');

    Transaction.wrap(function () {
        if (!COBilling.ValidatePayment(cart)) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
        }
    });

    // Recalculate the payments. If there is only gift certificates, make sure it covers the order total, if not
    // back to billing page.
    Transaction.wrap(function () {
        if (!cart.calculatePaymentTransactionTotal()) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
        }
    });

    // Handle used addresses and credit cards.
    var saveCCResult = COBilling.SaveCreditCard();

    if (!saveCCResult) {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    // Creates a new order. This will internally ReserveInventoryForOrder and will create a new Order with status
    // 'Created'.
    // Stripe changes BEGIN
    var isBasketPaymentIntentValid = stripeCheckoutHelper.isBasketPaymentIntentValid();
    if (cart.object.custom.stripePaymentIntentID && !isBasketPaymentIntentValid) {
        // detach the associated payment intent id from the basket
        Transaction.wrap(function () {
            cart.object.custom.stripePaymentIntentID = '';
        });

        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var order = stripeCheckoutHelper.createOrder(cart.object);
    // Stripe changes END

    if (!order) {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    session.privacy.stripeOrderNumber = order.orderNo;

    var handlePaymentsResult = handlePayments(order);

    if (handlePaymentsResult.error) {
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    if (handlePaymentsResult.missingPaymentInfo) {
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    /*
     * II. Create Payment Intent
     */
    var stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

    if (!stripePaymentInstrument || stripePaymentInstrument.paymentMethod !== 'CREDIT_CARD') {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));

        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on paymentMethod is CREDIT_CARD check');
        Transaction.wrap(function () {
            order.addNote('Stripe Error', 'Try to process Order as CREDIT_CARD for a different payment method');
        });
        return;
    }

    // So far, we have created an SFCC order and return order datails to be used for Checkout Summary Page
    responsePayload = {
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    };

    var paymentIntent = null;
    try {
        paymentIntent = checkoutHelper.createPaymentIntent(stripePaymentInstrument);
    } catch (e) {
        Transaction.wrap(function () {
            var noteMessage = e.message.length > 1000 ? e.message.substring(0, 1000) : e.message;
            order.addNote('Error When Create Stripe Payment Intent', noteMessage);
            OrderMgr.failOrder(order, true);
        });

        responsePayload.error = true;
        responsePayload.errorMessage = Resource.msg('confirm.error.technical', 'checkout', null);

        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }
    var stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    var stripeAccountId = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountId');
    var stripeAccountType = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountType');

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

    if (paymentIntent.status === 'requires_capture' && !stripeChargeCapture) {
        // The payment requires capture which will be made later
        try {
            Transaction.wrap(function () {
                var placeOrderStatus = OrderMgr.placeOrder(order);
                if (placeOrderStatus.isError()) {
                    throw new Error();
                }

                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                order.setExportStatus(Order.EXPORT_STATUS_READY);
            });
            app.getModel('Email').sendMail({
                template: 'stripe/mail/orderreceived',
                recipient: order.getCustomerEmail(),
                subject: Resource.msg('order.ordercreceived-email.001', 'stripe', null),
                context: {
                    Order: order
                }
            });
            responsePayload.success = true;
        } catch (e) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on paymentIntent.status === requires_capture && !stripeChargeCapture');
            responsePayload.error = true;
        }
    } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
        // Tell the client to handle the action
        Transaction.wrap(function () {
            order.addNote('Stripe 3DS', 'requires_action: Pending');
        });
        responsePayload.requires_action = true;
        responsePayload.payment_intent_client_secret = paymentIntent.client_secret;
    } else if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_confirmation') {
        // The payment didn’t need any additional actions and completed!
        // Handle post-payment fulfilment
        try {
            Transaction.wrap(function () {
                var placeOrderStatus = OrderMgr.placeOrder(order);
                if (placeOrderStatus.isError()) {
                    throw new Error();
                }

                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                order.setExportStatus(Order.EXPORT_STATUS_READY);

                if (stripeChargeCapture) {
                    order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                }
            });
            app.getModel('Email').sendMail({
                template: 'stripe/mail/orderreceived',
                recipient: order.getCustomerEmail(),
                subject: Resource.msg('order.ordercreceived-email.001', 'stripe', null),
                context: {
                    Order: order
                }
            });
            responsePayload.success = true;
        } catch (e) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on paymentIntent.status === succeeded || paymentIntent.status === requires_confirmation');
            responsePayload.error = true;
        }
    } else {
        // Invalid status
        Transaction.wrap(function () {
            order.addNote('Order Failed Reason', 'Invalid payment intent status: ' + paymentIntent.status);
            OrderMgr.failOrder(order, true);
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on invalid payment intent status: ' + paymentIntent.status);
        Transaction.wrap(function () {
            order.addNote('Stripe Error', 'StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on invalid payment intent status: ' + paymentIntent.status);
        });
        responsePayload.error = true;
        responsePayload.errorMessage = 'Invalid PaymentIntent status';
    }

    var jsonResponse = JSON.stringify(responsePayload);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.CardPaymentSubmitOrder = cardPaymentSubmitOrder;
exports.CardPaymentSubmitOrder.public = true;

/**
 * Entry point for handling payment intent confirmation when requires action and confirmation AJAX calls.
 */
function cardPaymentHandleRequiresAction() {
    var responsePayload = {};
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        responsePayload = {
            error: true
        };
        response.setStatus(500);
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var stripePaymentInstrument;
    var paymentIntent;
    var paymentIntentId;
    var stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    var stripeAccountId = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountId');
    var stripeAccountType = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountType');

    try {
        /*
         * Handle the case when SFCC order is being created before making call to Stripe to create a Payment Intent and confirm the payment
         */
        if (!session || !session.privacy || !session.privacy.stripeOrderNumber) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
            return;
        }

        var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
        if (!order) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
            return;
        }

        stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

        if (!stripePaymentInstrument || stripePaymentInstrument.paymentMethod !== 'CREDIT_CARD') {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
            return;
        }

        /**
         * I. Confirms the payment intent
         */
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

        if (paymentIntent.status === 'requires_capture' && !stripeChargeCapture) {
            // The payment requires capture which will be made later
            try {
                Transaction.wrap(function () {
                    order.addNote('Stripe 3DS', 'requires_action: Confirmed');
                    var placeOrderStatus = OrderMgr.placeOrder(order);
                    if (placeOrderStatus.isError()) {
                        throw new Error();
                    }

                    order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                    order.setExportStatus(Order.EXPORT_STATUS_READY);
                });
                app.getModel('Email').sendMail({
                    template: 'stripe/mail/orderreceived',
                    recipient: order.getCustomerEmail(),
                    subject: Resource.msg('order.ordercreceived-email.001', 'stripe', null),
                    context: {
                        Order: order
                    }
                });
                responsePayload.success = true;
            } catch (e) {
                stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create Payment Intent: Error on paymentIntent.status === requires_capture && !stripeChargeCapture');
                responsePayload.error = true;
            }
        } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
            Transaction.wrap(function () {
                order.addNote('Stripe 3DS', 'requires_action: Pending');
            });
            // Tell the client to handle the action
            responsePayload.requires_action = true;
            responsePayload.payment_intent_client_secret = paymentIntent.client_secret;
        } else if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_confirmation') {
            // The payment didn’t need any additional actions and completed!
            // Handle post-payment fulfilment
            try {
                Transaction.wrap(function () {
                    order.addNote('Stripe 3DS', 'requires_action: Confirmed');
                    var placeOrderStatus = OrderMgr.placeOrder(order);
                    if (placeOrderStatus.isError()) {
                        throw new Error();
                    }

                    order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                    order.setExportStatus(Order.EXPORT_STATUS_READY);

                    if (stripeChargeCapture) {
                        order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                    }
                });
                app.getModel('Email').sendMail({
                    template: 'stripe/mail/orderreceived',
                    recipient: order.getCustomerEmail(),
                    subject: Resource.msg('order.ordercreceived-email.001', 'stripe', null),
                    context: {
                        Order: order
                    }
                });
                responsePayload.success = true;
            } catch (e) {
                stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Confirm Payment Intent: Error on paymentIntent.status === succeeded || paymentIntent.status === requires_confirmation');
                responsePayload.error = true;
            }
        } else {
            // Invalid status
            Transaction.wrap(function () {
                order.addNote('Order Failed Reason', 'Invalid payment intent status: ' + paymentIntent.status);
                OrderMgr.failOrder(order, true);
            });
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Confirm Payment Intent: Error on invalid payment intent status: ' + paymentIntent.status);
            Transaction.wrap(function () {
                order.addNote('Stripe Error', 'StripePayments.CardPaymentSubmitOrder Confirm Payment Intent: Error on invalid payment intent status: ' + paymentIntent.status);
            });
            responsePayload.error = true;
            responsePayload.errorMessage = 'Invalid PaymentIntent status';
        }

        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    } catch (e) {
        responsePayload = {
            error: true,
            errorMessage: e.message
        };
    }

    response.setContentType('application/json');
    response.writer.print(JSON.stringify(responsePayload));
}

exports.CardPaymentHandleRequiresAction = cardPaymentHandleRequiresAction;
exports.CardPaymentHandleRequiresAction.public = true;

/**
 * Entry point for handling PaymentElementSubmitOrder.
 */
function paymentElementSubmitOrder() {
    var responsePayload;
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        responsePayload = {
            error: true
        };
        response.setStatus(500);
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();
    if (currentBasket) {
        if (currentBasket.custom.stripePaymentIntentID) {
            Transaction.wrap(function () {
                currentBasket.custom.stripePaymentIntentID = null;
            });
        }

        var cardPaymentInstrument = checkoutHelper.getStripePaymentInstrument(currentBasket);
        if (cardPaymentInstrument && cardPaymentInstrument.paymentTransaction && cardPaymentInstrument.paymentTransaction.getTransactionID()) {
            Transaction.wrap(function () {
                cardPaymentInstrument.paymentTransaction.setTransactionID(null);
            });
        }
    }

    /*
     * I. Create SFCC Order
     */
    session.privacy.stripeOrderNumber = null;
    delete session.privacy.stripeOrderNumber;

    var cart = Cart.get();
    if (!cart) {
        app.getController('Cart').Show();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var COShipping = app.getController('COShipping');

    // Clean shipments.
    COShipping.PrepareShipments(cart);

    // Make sure there is a valid shipping address, accounting for gift certificates that do not have one.
    if (cart.getProductLineItems().size() > 0 && cart.getDefaultShipment().getShippingAddress() === null) {
        COShipping.Start();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    // Make sure the billing step is fulfilled, otherwise restart checkout.
    if (!session.forms.billing.fulfilled.value) {
        app.getController('COCustomer').Start();
        responsePayload = {
            error: true
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    Transaction.wrap(function () {
        cart.calculate();
    });

    var COBilling = app.getController('COBilling');

    Transaction.wrap(function () {
        if (!COBilling.ValidatePayment(cart)) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
        }
    });

    // Recalculate the payments. If there is only gift certificates, make sure it covers the order total, if not
    // back to billing page.
    Transaction.wrap(function () {
        if (!cart.calculatePaymentTransactionTotal()) {
            responsePayload = {
                error: true
            };
            response.setContentType('application/json');
            response.writer.print(JSON.stringify(responsePayload));
        }
    });

    // Handle used addresses and credit cards.
    var saveCCResult = COBilling.SaveCreditCard();

    if (!saveCCResult) {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    // Creates a new order. This will internally ReserveInventoryForOrder and will create a new Order with status
    // 'Created'.
    // Stripe changes BEGIN
    var isBasketPaymentIntentValid = stripeCheckoutHelper.isBasketPaymentIntentValid();
    if (cart.object.custom.stripePaymentIntentID && !isBasketPaymentIntentValid) {
        // detach the associated payment intent id from the basket
        Transaction.wrap(function () {
            cart.object.custom.stripePaymentIntentID = '';
        });

        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var order = stripeCheckoutHelper.createOrder(cart.object);
    // Stripe changes END

    if (!order) {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    session.privacy.stripeOrderNumber = order.orderNo;

    var handlePaymentsResult = handlePayments(order);

    if (handlePaymentsResult.error) {
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    if (handlePaymentsResult.missingPaymentInfo) {
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    /*
     * II. Create Payment Intent
     */
    var stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

    if (!stripePaymentInstrument || stripePaymentInstrument.paymentMethod !== 'STRIPE_PAYMENT_ELEMENT') {
        responsePayload = {
            error: true,
            errorMessage: Resource.msg('confirm.error.technical', 'checkout', null)
        };
        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));

        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create Payment Intent: Error on paymentMethod is STRIPE_PAYMENT_ELEMENT check');
        Transaction.wrap(function () {
            order.addNote('Stripe Error', 'Try to process Order as STRIPE_PAYMENT_ELEMENT for a different payment method');
        });
        return;
    }

    // So far, we have created an SFCC order and return order datails to be used for Checkout Summary Page
    responsePayload = {
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    };

    try {
        var orderCurrencyCode = order.getCurrencyCode();
        var orderTotal = order.getTotalGrossPrice();

        var orderCurency = dw.util.Currency.getCurrency(orderCurrencyCode);
        var multiplier = Math.pow(10, orderCurency.getDefaultFractionDigits());

        // Iterates over the list of gift certificate payment instruments
        // and updates the total redemption amount.
        var gcPaymentInstrs = order.getGiftCertificatePaymentInstruments().iterator();
        var orderPI = null;
        var giftCertTotal = new Money(0.0, order.getCurrencyCode());

        while (gcPaymentInstrs.hasNext()) {
            orderPI = gcPaymentInstrs.next();
            giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
        }

        var totalAmount = orderTotal.subtract(giftCertTotal);

        var amount = Math.round(totalAmount.getValue() * multiplier);

        var shippingAddress = null;
        var shipments = order.getShipments();
        var iter = shipments.iterator();
        while (iter != null && iter.hasNext()) {
            var shipment = iter.next();
            shippingAddress = shipment.getShippingAddress();
            if (shippingAddress) {
                break;
            }
        }

        var createPaymentIntentPayload = null;

        var stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
        createPaymentIntentPayload = {
            amount: amount,
            currency: orderCurrencyCode,
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

        if (customer.authenticated && customer.profile && customer.profile.email) {
            /*
             * Check if registered customer has an associated Stripe customer ID
             * if not, make a call to Stripe to create such id and save it as customer profile custom attribute
             */
            if (!customer.profile.custom.stripeCustomerID) {
                var newStripeCustomer = stripeService.customers.create({
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
            if (stripeHelper.isStripePaymentElementsSavePaymentsEnabled()) {
                createPaymentIntentPayload.setup_future_usage = 'off_session';
            }
        }

        if (!createPaymentIntentPayload.metadata) {
            createPaymentIntentPayload.metadata = {};
        }

        createPaymentIntentPayload.metadata.order_id = order.orderNo;
        createPaymentIntentPayload.metadata.site_id = dw.system.Site.getCurrent().getID();

        var paymentIntent = stripeService.paymentIntents.create(createPaymentIntentPayload);
        var paymentTransaction = stripePaymentInstrument.paymentTransaction;
        Transaction.wrap(function () {
            order.custom.stripePaymentIntentID = paymentIntent.id;
            order.custom.stripePaymentSourceID = '';

            if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0 && paymentIntent.charges.data[0].outcome) {
                order.custom.stripeRiskLevel = paymentIntent.charges.data[0].outcome.risk_level;
                order.custom.stripeRiskScore = paymentIntent.charges.data[0].outcome.risk_score;
            }

            paymentTransaction.setTransactionID(paymentIntent.id);
            paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);
        });

        responsePayload.clientSecret = paymentIntent.client_secret;
    } catch (e) {
        Transaction.wrap(function () {
            var noteMessage = e.message.length > 1000 ? e.message.substring(0, 1000) : e.message;
            order.addNote('Error When Create Stripe Payment Intent', noteMessage);
            OrderMgr.failOrder(order, true);
        });

        responsePayload.error = true;
        responsePayload.errorMessage = Resource.msg('confirm.error.technical', 'checkout', null);

        response.setContentType('application/json');
        response.writer.print(JSON.stringify(responsePayload));
        return;
    }

    var jsonResponse = JSON.stringify(responsePayload);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.PaymentElementSubmitOrder = paymentElementSubmitOrder;
exports.PaymentElementSubmitOrder.public = true;

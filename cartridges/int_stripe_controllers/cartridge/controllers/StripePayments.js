/* eslint-disable new-cap */
/* eslint-disable no-plusplus */
/* global response, request, session, dw, empty, customer */
// v1

'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
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
    var returnObj = { success: true };
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        response.setStatus(500);
    } else {
        if (session.privacy.stripeOrderNumber) {
            var order = require('dw/order/OrderMgr').getOrder(session.privacy.stripeOrderNumber);
            var paymentIntentId = order ? order.getPaymentInstruments()[0].getPaymentTransaction().transactionID : null;

            if (!empty(paymentIntentId)) {
                var paymentIntent = stripeService.paymentIntents.retrieve(paymentIntentId);

                // Set a cookie to authenticate customers for Link
                if ((paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') && paymentIntent.payment_method) {
                    var paymentMethod = stripeService.paymentMethods.retrieve(paymentIntent.payment_method);
                    if (paymentMethod && paymentMethod.link && paymentMethod.link.persistent_token) {
                        var stripeCookie = new dw.web.Cookie('stripe.link.persistent_token', paymentMethod.link.persistent_token);
                        stripeCookie.setSecure(true);
                        stripeCookie.setHttpOnly(true);
                        stripeCookie.setMaxAge(90 * 24 * 3600);

                        response.addHttpCookie(stripeCookie);
                    }

                    returnObj.success = false;
                    returnObj.redirectUrl = require('dw/web/URLUtils').url('Stripe-PaymentElementOrderPlaced').toString();
                }
            }
        }

        if (returnObj.success !== false) {
            stripePaymentsHelper.FailOrder();
        }
    }

    var jsonResponse = JSON.stringify(returnObj);
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
            OrderMgr.failOrder(order, true);
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
            confirm: true,
            amount: amount,
            currency: orderCurrencyCode,
            automatic_payment_methods: {
                enabled: true
            },
            capture_method: stripeChargeCapture ? 'automatic' : 'manual'
        };

        if (!empty(shippingAddress) && dw.system.Site.getCurrent().getCustomPreferenceValue('includeShippingDetailsInPaymentIntentPayload')) {
            createPaymentIntentPayload.shipping = {
                address: {
                    city: shippingAddress.city,
                    country: shippingAddress.countryCode.value,
                    line1: shippingAddress.address1,
                    line2: !empty(shippingAddress.address2) ? shippingAddress.address2 : '',
                    postal_code: shippingAddress.postalCode,
                    state: shippingAddress.stateCode
                },
                name: shippingAddress.fullName,
                phone: shippingAddress.phone,
                tracking_number: !empty(shipment) && !empty(shipment.trackingNumber) ? shipment.trackingNumber : '',
                carrier: !empty(shipment) && !empty(shipment.shippingMethod) ? shipment.shippingMethod.displayName : ''
            };
        }

        createPaymentIntentPayload.payment_method_options = {};
        var multicaptureEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeMultiCaptureEnabled');

        if (multicaptureEnabled) {
            createPaymentIntentPayload.payment_method_options.card = {
                    request_multicapture: "if_available"
            };
        }

        if (request.httpCookies['stripe.link.persistent_token'] && request.httpCookies['stripe.link.persistent_token'].value) {
            createPaymentIntentPayload.payment_method_options.link = {
                persistent_token: request.httpCookies['stripe.link.persistent_token'].value
            };
        }

        var confirmationToken = JSON.parse(request.httpParameterMap.confirmationToken.value);

        if (!empty(confirmationToken)) {
            createPaymentIntentPayload.confirmation_token = confirmationToken.id;
            // Required for redirect-based payment methods
            createPaymentIntentPayload.return_url = URLUtils.https('StripePayments-HandleAPM').toString();
        }

        if (customer.authenticated && customer.profile && customer.profile.email) {
            /*
             * Check if registered customer has an associated Stripe customer ID
             * if not, make a call to Stripe to create such id and save it as customer profile custom attribute
             */
            if (!customer.profile.custom.stripeCustomerID) {
                var newStripeCustomerPayload = {
                    email: customer.profile.email,
                    name: customer.profile.firstName + ' ' + customer.profile.lastName
                };
                var newStripeCustomer = stripeService.customers.create(newStripeCustomerPayload,
                    require('*/cartridge/scripts/stripe/helpers/idempotencyHelper').buildKey('customer', customer.profile.customerNo, newStripeCustomerPayload));

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

        var idempotencyHelper = require('*/cartridge/scripts/stripe/helpers/idempotencyHelper');
        var paymentIntentIdempotencyKey = idempotencyHelper.buildKey('pi-create', order.orderNo, createPaymentIntentPayload);
        var paymentIntent = idempotencyHelper.callWithRetry(function () {
            return stripeService.paymentIntents.create(createPaymentIntentPayload, paymentIntentIdempotencyKey);
        }, paymentIntentIdempotencyKey);
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
        responsePayload.status = paymentIntent.status;

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

/**
 * Entry point for handling PaymentElementSubmitOrder.
 */
function expressCheckoutSubmitOrder() {
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
    var currentBasket = BasketMgr.getCurrentOrNewBasket();

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

    if (!empty(request.httpParameterMap.pid) && !empty(request.httpParameterMap.pid.stringValue)) {
        currentBasket = checkoutHelper.retrieveTemporaryOrCurrentBasket(currentBasket);
    }

    var cart = Cart.get(currentBasket);

    if (!empty(request.httpParameterMap.pid) && !empty(request.httpParameterMap.pid.stringValue)) {
        Transaction.wrap(function () {
            var productToAdd = app.getModel('Product').get(request.httpParameterMap.pid.stringValue);
            var productOptionModel = productToAdd.updateOptionSelection(request.httpParameterMap);
            cart.addProductItem(productToAdd.object, request.httpParameterMap.Quantity.doubleValue, productOptionModel);
        });
    }

    var COShipping = app.getController('COShipping');

    // Clean shipments.
    COShipping.PrepareShipments(cart);

    var stripeShippingAddress = JSON.parse(request.httpParameterMap.shippingAddress.value);
    var shippingName = request.httpParameterMap.shippingName.value.split(' ');
    var shippingFirstName = shippingName[0];
    var shippingLastname = shippingName[1];

    var shipment = cart.object.defaultShipment;

    Transaction.wrap(function () {
        cart.updateShipmentShippingMethod(shipment.ID, request.httpParameterMap.selectedShippingRateId.stringValue);
        cart.calculate();
    });

    // Check to make sure there is a shipping address
    if (cart.object.defaultShipment.shippingAddress === null) {
        var shipment = cart.object.defaultShipment;
        var shippingAddress = shipment.shippingAddress;

        Transaction.wrap(function () {
            if (shippingAddress === null) {
                shippingAddress = shipment.createShippingAddress();
            }

            shippingAddress.setFirstName(shippingFirstName);
            shippingAddress.setLastName(shippingLastname);
            shippingAddress.setAddress1(stripeShippingAddress.line1);
            shippingAddress.setAddress2(stripeShippingAddress.line1);
            shippingAddress.setCity(stripeShippingAddress.city);
            shippingAddress.setPostalCode(stripeShippingAddress.postal_code);
            shippingAddress.setCountryCode(stripeShippingAddress.country);
    
            if (!empty(stripeShippingAddress.state)) {
                shippingAddress.setStateCode(stripeShippingAddress.state);
            }
            if (!shippingAddress.phone) {
                shippingAddress.setPhone(request.httpParameterMap.phone.value);
            }
        });
    }

    var stripeBillingAddress = JSON.parse(request.httpParameterMap.billingAddress.value);
    var billingName = request.httpParameterMap.billingName.value.split(' ');
    var billingFirstName = billingName[0];
    var billingLastName = billingName[1];
    // Check to make sure billing address exists
    if (!cart.object.billingAddress) {
        var billingAddress = cart.object.billingAddress;

        Transaction.wrap(function () {
            if (!billingAddress) {
                billingAddress = cart.object.createBillingAddress();
            }

            billingAddress.setFirstName(billingFirstName);
            billingAddress.setLastName(billingFirstName);
            billingAddress.setAddress1(stripeBillingAddress.line1);
            billingAddress.setAddress2(stripeBillingAddress.line2);
            billingAddress.setCity(stripeBillingAddress.city);
            billingAddress.setPostalCode(stripeBillingAddress.postal_code);

            if (!empty(stripeBillingAddress.state)) {
                billingAddress.setStateCode(stripeBillingAddress.state);
            }
            billingAddress.setCountryCode(stripeBillingAddress.country);
            if (!billingAddress.phone) {
                billingAddress.setPhone(request.httpParameterMap.phone.value);
            }
        });
    }

    Transaction.wrap(function () {
        if (customer.authenticated && customer.registered) {
            cart.object.customerEmail = customer.profile.email;
            cart.object.customerNo = customer.profile.customerNo;
        } else {
            cart.object.customerEmail = req.httpParameterMap.email.value;
        }
    });

    Transaction.wrap(function () {
        cart.calculate();
    });

    var COBilling = app.getController('COBilling');

    Transaction.wrap(function () {
        checkoutHelper.createStripePaymentInstrument(cart.object, 'STRIPE_PAYMENT_ELEMENT', {});
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

    Transaction.wrap(function () {
        cart.calculate();
    });

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

        createPaymentIntentPayload.payment_method_options = {};

        if (customer.authenticated && customer.profile && customer.profile.email) {
            /*
             * Check if registered customer has an associated Stripe customer ID
             * if not, make a call to Stripe to create such id and save it as customer profile custom attribute
             */
            if (!customer.profile.custom.stripeCustomerID) {
                var newStripeCustomerPayload = {
                    email: customer.profile.email,
                    name: customer.profile.firstName + ' ' + customer.profile.lastName
                };
                var newStripeCustomer = stripeService.customers.create(newStripeCustomerPayload,
                    require('*/cartridge/scripts/stripe/helpers/idempotencyHelper').buildKey('customer', customer.profile.customerNo, newStripeCustomerPayload));

                Transaction.wrap(function () {
                    customer.profile.custom.stripeCustomerID = newStripeCustomer.id;
                });
            }

            createPaymentIntentPayload.customer = customer.profile.custom.stripeCustomerID;
        }

        createPaymentIntentPayload.payment_method_options = {};
        var multicaptureEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeMultiCaptureEnabled');

        if (multicaptureEnabled) {
            createPaymentIntentPayload.payment_method_options.card = {
                    request_multicapture: "if_available"
            };
        }

        if (request.httpCookies['stripe.link.persistent_token'] && request.httpCookies['stripe.link.persistent_token'].value) {
            createPaymentIntentPayload.payment_method_options.link = {
                persistent_token: request.httpCookies['stripe.link.persistent_token'].value
            };
        }

        if (!createPaymentIntentPayload.metadata) {
            createPaymentIntentPayload.metadata = {};
        }

        createPaymentIntentPayload.metadata.order_id = order.orderNo;
        createPaymentIntentPayload.metadata.site_id = dw.system.Site.getCurrent().getID();

        var idempotencyHelper = require('*/cartridge/scripts/stripe/helpers/idempotencyHelper');
        var paymentIntentIdempotencyKey = idempotencyHelper.buildKey('pi-create', order.orderNo, createPaymentIntentPayload);
        var paymentIntent = idempotencyHelper.callWithRetry(function () {
            return stripeService.paymentIntents.create(createPaymentIntentPayload, paymentIntentIdempotencyKey);
        }, paymentIntentIdempotencyKey);
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
    return;
}

exports.StripeQuickCheckout = expressCheckoutSubmitOrder;
exports.StripeQuickCheckout.public = true;


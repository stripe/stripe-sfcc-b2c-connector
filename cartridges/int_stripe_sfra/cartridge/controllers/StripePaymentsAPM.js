/* eslint-disable new-cap */
/* global dw, session, empty, request, customer */

'use strict';

var server = require('server');

var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

var Transaction = require('dw/system/Transaction');

var stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

/**
 * An entry point to handle returns from alternative payment methods.
 */

server.get('HandleAPM', function (req, res, next) {
    var redirectUrl = stripePaymentsHelper.HandleAPM(true);
    res.redirect(redirectUrl);
    next();
});

/**
 * Get Stripe Order Items
 */
server.get('GetStripeOrderItems', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    var stripeOrderDetails = basket ? require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getStripeOrderDetails(basket) : null;

    res.json({
        amount: stripeOrderDetails ? stripeOrderDetails.amount : [],
        orderItems: stripeOrderDetails ? stripeOrderDetails.order_items : [],
        currency: stripeOrderDetails ? stripeOrderDetails.currency : null,
        purchase_country: stripeOrderDetails ? stripeOrderDetails.purchase_country : null,
        order_shipping: stripeOrderDetails ? stripeOrderDetails.order_shipping : [],
        shipping_first_name: stripeOrderDetails ? stripeOrderDetails.shipping_first_name : null,
        shipping_last_name: stripeOrderDetails ? stripeOrderDetails.shipping_last_name : null
    });

    next();
});

/**
 * Get Stripe Payment Element Options
 */
server.get('GetPaymentElementOptions', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    var basket = BasketMgr.getCurrentBasket();

    var stripeOrderDetails = basket ? checkoutHelper.getStripeOrderDetails(basket) : null;

    var customerEmail;
    var paymentElementOptions = {
        mode: 'payment',
        amount: parseInt(stripeOrderDetails.amount, 10),
        currency: stripeOrderDetails.currency,
        appearance: {
            theme: 'stripe',
            variables: stripeHelper.getStripePaymentElementStyle().variables
        },
        capture_method: dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture') ? 'automatic' : 'manual'
    };

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

        var customerSession = stripeService.customerSessions.create({
            customer: customer.profile.custom.stripeCustomerID,
            components: {
                payment_element: {
                    enabled: true,
                    features: {
                        payment_method_redisplay: 'enabled',
                        payment_method_save: 'enabled',
                        payment_method_save_usage: 'on_session',
                        payment_method_remove: 'enabled'
                    }
                }
            }
        });

        paymentElementOptions.customerSessionClientSecret = customerSession.client_secret;
        if (stripeHelper.isStripePaymentElementsSavePaymentsEnabled()) {
            paymentElementOptions.setup_future_usage = 'off_session';
        }

        if (stripeHelper.isCVCRecollectionEnabled()) {
            paymentElementOptions.paymentMethodOptions = {
                card: {
                    require_cvc_recollection: true
                }
            };
        }

        customerEmail = customer.profile.email;
    }

    if (empty(customerEmail)) {
        customerEmail = basket ? basket.getCustomerEmail() : '';
    }

    res.json({
        customerEmail: customerEmail,
        paymentElementOptions: paymentElementOptions
    });

    next();
});

/**
 * Get Customer Email
 */
server.get('GetCustomerEmail', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();

    var email = basket ? basket.getCustomerEmail() : '';

    res.json({
        email: email
    });

    next();
});

/**
 * Entry point for handling writing errors to Stripe Logger called as an AJAX request
 */
server.post('LogStripeErrorMessage', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var msg = req.form.msg;

    stripePaymentsHelper.LogStripeErrorMessage(msg);

    res.json({
        success: true
    });

    next();
});

/**
 * Entry point for handling writing errors to Stripe Logger called as an AJAX request
 */
server.post('FailOrder', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var returnObj = { success: true };

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

                    res.addHttpCookie(stripeCookie);
                }

                returnObj.success = false;
                returnObj.redirectUrl = require('dw/web/URLUtils').url('Stripe-PaymentElementOrderPlaced').toString();
            }
        }
    }

    if (returnObj.success !== false) {
        stripePaymentsHelper.FailOrder();
    }

    res.json(returnObj);

    next();
});

/**
 * Entry point for handling PaymentElementSubmitOrder
 */
server.post('PaymentElementSubmitOrder', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');

    var basketValidationResult = COHelpers.validateBasketAndOrder(req);
    if (basketValidationResult.error === true) {
        res.json(basketValidationResult.response);
        return next();
    }
    var currentBasket = basketValidationResult.currentBasket;

    var order = COHelpers.createOrder(currentBasket);
    if (!order) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create SFCC Order: Error on COHelpers.createOrder');
        return next();
    }

    session.privacy.stripeOrderNumber = order.orderNo;

    // Handles payment authorization
    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);

    // Handle custom processing post authorization
    var options = {
        req: req,
        res: res
    };
    var postAuthCustomizations = hooksHelper('app.post.auth', 'postAuthorization', handlePaymentResult, order, options, require('*/cartridge/scripts/hooks/postAuthorizationHandling').postAuthorization);
    if (postAuthCustomizations && Object.prototype.hasOwnProperty.call(postAuthCustomizations, 'error')) {
        res.json(postAuthCustomizations);
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create SFCC Order: Error on postAuthCustomizations');
        return next();
    }

    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function () {
            order.addNote('Order Failed Reason', 'fraudDetectionStatus.status === fail');
            OrderMgr.failOrder(order, true);
        });

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);

        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.CardPaymentSubmitOrder Create SFCC Order: Error on fraudDetectionStatus.status');
        return next();
    }

    /*
     * II. Create Payment Intent
     */
    var stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

    if (!stripePaymentInstrument || stripePaymentInstrument.paymentMethod !== 'STRIPE_PAYMENT_ELEMENT') {
        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create Payment Intent: Error on paymentMethod is CREDIT_CARD check');
        Transaction.wrap(function () {
            order.addNote('Stripe Error', 'Try to process Order as STRIPE_PAYMENT_ELEMENT for a different payment method');
        });
        return next();
    }

    // So far, we have created an SFCC order and return order datails to be used for Checkout Summary Page
    var responsePayload = {
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    };

    try {
        var stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
        var paymentIntentPayload = COHelpers.buildPaymentIntentPayload(order, req, stripeChargeCapture);
        var paymentIntent = stripeService.paymentIntents.create(paymentIntentPayload);
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
        responsePayload.errorMessage = Resource.msg('error.technical', 'checkout', null);

        res.json(responsePayload);

        return next();
    }

    res.json(responsePayload);

    return next();
});

server.post('StripeQuickCheckout', csrfProtection.validateAjaxRequest, function (req, res, next) {
    /*
     * I. Create SFCC Order
     */
    var BasketMgr = require('dw/order/BasketMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
    var Money = require('dw/value/Money');
    var cartHelper = require('*/cartridge/scripts/cart/cartHelpers');

    session.privacy.stripeOrderNumber = null;
    delete session.privacy.stripeOrderNumber;

    var currentBasket = BasketMgr.getCurrentOrNewBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder: Error Create SFCC Order: Empty Basket');
        return next();
    }

    if (req.form.pid) {
        currentBasket = checkoutHelper.retrieveTemporaryOrCurrentBasket(currentBasket);

        Transaction.wrap(function () {
            var addToCartResult = cartHelper.addProductToCart(
                currentBasket,
                req.form.pid,
                parseInt(req.form.quantity, 10),
                Object.hasOwnProperty.call(req.form, 'childProducts') ? JSON.parse(req.form.childProducts) : [],
                req.form.options ? JSON.parse(req.form.options) : []
            );

            if (!addToCartResult.error) {
                cartHelper.ensureAllShipmentsHaveMethods(currentBasket);
                basketCalculationHelpers.calculateTotals(currentBasket);
            }
        });
    }

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

    var validatedProducts = validationHelpers.validateProducts(currentBasket);
    if (validatedProducts.error) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder: Error Create SFCC Order: Error validationHelpers.validateProducts');
        return next();
    }

    if (req.session.privacyCache.get('fraudDetectionStatus')) {
        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', '01').toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on fraudDetectionStatus');
        return next();
    }

    var stripeShippingAddress = JSON.parse(req.form.shippingAddress);
    var shippingName = req.form.shippingName.split(' ');
    var shippingFirstName = shippingName[0];
    var shippingLastname = shippingName[1];
    var selectedShippingRateId = req.form.selectedShippingRateId;
    var shipment = currentBasket.defaultShipment;

    // Check to make sure there is a shipping address
    if (currentBasket.defaultShipment.shippingAddress === null) {
        Transaction.wrap(function () {
            var shippingAddress = shipment.shippingAddress;
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
                shippingAddress.setPhone(req.form.phone);
            }
        });
    }

    Transaction.wrap(function() {
        var shipmentShippingModel = dw.order.ShippingMgr.getShipmentShippingModel(shipment);
        var shippingMethods = shipmentShippingModel.getApplicableShippingMethods();
        require('*/cartridge/scripts/checkout/shippingHelpers').selectShippingMethod(shipment, selectedShippingRateId, shippingMethods);
    })

    var stripeBillingAddress = JSON.parse(req.form.billingAddress);
    Transaction.wrap(function() {
        basketCalculationHelpers.calculateTotals(currentBasket);
    })
    var billingName = req.form.billingName.split(' ');
    var billingFirstName = billingName[0];
    var billingLastName = billingName[1];
    // Check to make sure billing address exists
    if (!currentBasket.billingAddress) {
        var billingAddress = currentBasket.billingAddress;

        Transaction.wrap(function () {
            if (!billingAddress) {
                billingAddress = currentBasket.createBillingAddress();
            }

            billingAddress.setFirstName(billingFirstName);
            billingAddress.setLastName(billingLastName);
            billingAddress.setAddress1(stripeBillingAddress.line1);
            billingAddress.setAddress2(stripeBillingAddress.line1);
            billingAddress.setCity(stripeBillingAddress.city);
            billingAddress.setPostalCode(stripeBillingAddress.postal_code);

            if (!empty(stripeBillingAddress.state)) {
                billingAddress.setStateCode(stripeBillingAddress.state);
            }
            billingAddress.setCountryCode(stripeBillingAddress.country);
            if (!billingAddress.phone) {
                billingAddress.setPhone(req.form.phone);
            }
        });
    }

    Transaction.wrap(function () {
        if (req.currentCustomer.authenticated && req.currentCustomer.registered) {
            currentBasket.customerEmail = req.currentCustomer.profile.email;
            currentBasket.customerNo = req.currentCustomer.profile.customerNo;
        } else {
            currentBasket.customerEmail = req.form.email;
        }
    });

    var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);
    if (validationOrderStatus.error) {
        res.json({
            error: true,
            errorMessage: validationOrderStatus.message
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on app.validate.order');
        return next();
    }

    // Calculate the basket
    Transaction.wrap(function () {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-validates existing payment instruments
    var validPayment = COHelpers.validatePayment(req, currentBasket);
    if (validPayment.error) {
        res.json({
            error: true,
            errorStage: {
                stage: 'payment',
                step: 'paymentInstrument'
            },
            errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on COHelpers.validatePayment');
        return next();
    }

    // Re-calculate the payments.
    var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on calculatedPaymentTransactionTotal.error');
        return next();
    }

    // Creates a new order.
    var order = COHelpers.createOrder(currentBasket);
    if (!order) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on COHelpers.createOrder');
        return next();
    }

    session.privacy.stripeOrderNumber = order.orderNo;

    Transaction.begin();
        checkoutHelper.createStripePaymentInstrument(order, 'STRIPE_PAYMENT_ELEMENT', {});
    Transaction.commit();

    // Handles payment authorization
    var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);

    // Handle custom processing post authorization
    var options = {
        req: req,
        res: res
    };
    var postAuthCustomizations = hooksHelper('app.post.auth', 'postAuthorization', handlePaymentResult, order, options, require('*/cartridge/scripts/hooks/postAuthorizationHandling').postAuthorization);
    if (postAuthCustomizations && Object.prototype.hasOwnProperty.call(postAuthCustomizations, 'error')) {
        res.json(postAuthCustomizations);
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on postAuthCustomizations');
        return next();
    }

    if (handlePaymentResult.error) {
        res.json({
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function () {
            order.addNote('Order Failed Reason', 'fraudDetectionStatus.status === fail');
            OrderMgr.failOrder(order, true);
        });

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);

        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on fraudDetectionStatus.status');
        return next();
    }

    /*
     * II. Create Payment Intent
     */
    var stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(order);

    if (!stripePaymentInstrument || stripePaymentInstrument.paymentMethod !== 'STRIPE_PAYMENT_ELEMENT') {
        res.json({
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create Payment Intent: Error on paymentMethod is CREDIT_CARD check');
        Transaction.wrap(function () {
            order.addNote('Stripe Error', 'Try to process Order as STRIPE_PAYMENT_ELEMENT for a different payment method');
        });
        return next();
    }

    // So far, we have created an SFCC order and return order datails to be used for Checkout Summary Page
    var responsePayload = {
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

        shipment = order.getDefaultShipment();
        var shippingAddress = shipment.getShippingAddress();

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
        responsePayload.errorMessage = Resource.msg('error.technical', 'checkout', null);

        res.json(responsePayload);

        return next();
    }

    res.json(responsePayload);

    return next();
});

module.exports = server.exports();

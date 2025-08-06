/* eslint-env es6 */

'use strict';

var COHelpers = module.superModule;
var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var Transaction = require('dw/system/Transaction');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');

if (stripeHelper.isStripeEnabled()) {
    /**
     * Validates payment - Overriden because Stripe validates the cards.
     * @param {Object} req - The local instance of the request object
     * @param {dw.order.Basket} currentBasket - The current basket
     * @returns {Object} an object that has error information
     */
    // v1
    // eslint-disable-next-line no-unused-vars
    COHelpers.validatePayment = function validatePayment(req, currentBasket) {
        return { error: false };
    };

    COHelpers.createOrder = function createOrder(currentBasket) {
        try {
            const stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
            return stripeCheckoutHelper.createOrder(currentBasket);
        } catch (e) {
            stripePaymentsHelper.LogStripeErrorMessage('COHelpers.createOrder createOrder error: ' + e.message);
            return null;
        }
    };

    COHelpers.validateBasketAndOrder = function validateBasketAndOrder(req) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Resource = require('dw/web/Resource');
        var URLUtils = require('dw/web/URLUtils');
        var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
        var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
        var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

        session.privacy.stripeOrderNumber = null;
        delete session.privacy.stripeOrderNumber;

        var currentBasket = BasketMgr.getCurrentBasket();

        if (!currentBasket) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder: Error Create SFCC Order: Empty Basket');
            return {
                error: true, 
                response: {
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                }
            };
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
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder: Error Create SFCC Order: Error validationHelpers.validateProducts');
            return {
                error: true, 
                response: {
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                }
            };
        }

        if (req.session.privacyCache.get('fraudDetectionStatus')) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on fraudDetectionStatus');
            return {
                error: true,
                response: {
                    error: true,
                    cartError: true,
                    redirectUrl: URLUtils.url('Error-ErrorCode', 'err', '01').toString(),
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                }
            };
        }

        var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);
        if (validationOrderStatus.error) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on app.validate.order');
            return {
                error: true,
                response: {
                    error: true,
                    errorMessage: validationOrderStatus.message
                }
            };
        }

        // Check to make sure there is a shipping address
        if (currentBasket.defaultShipment.shippingAddress === null) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on currentBasket.defaultShipment.shippingAddress === null');
            return {
                error: true,
                response: {
                    error: true,
                    errorStage: {
                        stage: 'shipping',
                        step: 'address'
                    },
                    errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null)
                }
            };
        }

        // Check to make sure billing address exists
        if (!currentBasket.billingAddress) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on !currentBasket.billingAddress');
            return {
                error: true,
                response: {
                    error: true,
                    errorStage: {
                        stage: 'payment',
                        step: 'billingAddress'
                    },
                    errorMessage: Resource.msg('error.no.billing.address', 'checkout', null)
                }
            };
        }

        // Calculate the basket
        Transaction.wrap(function () {
            basketCalculationHelpers.calculateTotals(currentBasket);
        });

        // Re-validates existing payment instruments
        var validPayment = COHelpers.validatePayment(req, currentBasket);
        if (validPayment.error) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on COHelpers.validatePayment');
            return {
                error: true,
                response: {
                    error: true,
                    errorStage: {
                        stage: 'payment',
                        step: 'paymentInstrument'
                    },
                    errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
                }

            };
        }

        var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
        if (calculatedPaymentTransactionTotal.error) {
            stripePaymentsHelper.LogStripeErrorMessage('StripePayments.PaymentElementSubmitOrder Create SFCC Order: Error on calculatedPaymentTransactionTotal.error');
            return {
                error: true,
                response: {
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                }
            };
        }

        return { error: false, currentBasket: currentBasket };
    };

    COHelpers.buildPaymentIntentPayload = function buildPaymentIntentPayload(order, req, stripeChargeCapture) {
        var Money = require('dw/value/Money');

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

        var createPaymentIntentPayload = {
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
                carrier: !empty(shipment) && !empty(shipment.shippingMethod) ? shipment.shippingMethod.displayName : '',
            };
        }

        createPaymentIntentPayload.payment_method_options = {};
        createPaymentIntentPayload.payment_method_options.card = {};
        var multicaptureEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeMultiCaptureEnabled');

        if (multicaptureEnabled) {
            createPaymentIntentPayload.payment_method_options.card.request_multicapture = "if_available";
        }

        if (request.httpCookies['stripe.link.persistent_token'] && request.httpCookies['stripe.link.persistent_token'].value) {
            createPaymentIntentPayload.payment_method_options.link = {
                persistent_token: request.httpCookies['stripe.link.persistent_token'].value
            };
        }

        var confirmationToken = JSON.parse(req.form.confirmationToken);
        if (!empty(confirmationToken)) {
            createPaymentIntentPayload.confirmation_token = confirmationToken.id;
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

            if (stripeHelper.isCVCRecollectionEnabled()) {
                createPaymentIntentPayload.payment_method_options.card.require_cvc_recollection = true;
            }

            createPaymentIntentPayload.customer = customer.profile.custom.stripeCustomerID;
            createPaymentIntentPayload.setup_future_usage = confirmationToken.setup_future_usage;
        }

        if (!createPaymentIntentPayload.metadata) {
            createPaymentIntentPayload.metadata = {};
        }

        createPaymentIntentPayload.metadata.order_id = order.orderNo;
        createPaymentIntentPayload.metadata.site_id = dw.system.Site.getCurrent().getID();

        return createPaymentIntentPayload;
    };
}

module.exports = COHelpers;

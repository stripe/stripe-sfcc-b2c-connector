/* eslint-env es6 */
/* eslint-disable no-plusplus */
/* global session, customer, dw, empty, request */

'use strict';

/**
 * Returns the country for Payment Request button from Site Preferences.
 *
 * @return {string} - Payment Request button country
 */
exports.getPRCountry = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeAccountCountryCode');
};

/**
 * Checks if Stripe integration for card payments is enabled.
 *
 * @return {boolean} - True if Stripe is used as processor for card payments.
 */
exports.isStripeCardsPaymentMethodEnabled = function () {
    const PaymentMgr = require('dw/order/PaymentMgr');
    const PaymentInstrument = require('dw/order/PaymentInstrument');

    const cardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
    if (cardPaymentMethod && cardPaymentMethod.active) {
        const paymentProcessor = cardPaymentMethod.getPaymentProcessor();

        return (paymentProcessor && 'STRIPE_CREDIT'.equals(paymentProcessor.ID));
    }

    return false;
};

exports.areStripeAlernativePaymentMethodsEnabled = function () {
    const PaymentMgr = require('dw/order/PaymentMgr');

    var activePaymentMethods = PaymentMgr.getActivePaymentMethods();

    for (let i = 0; i < activePaymentMethods.length; i++) {
        let paymentMethod = activePaymentMethods[i];
        let paymentProcessor = paymentMethod.getPaymentProcessor();

        if (paymentProcessor && 'STRIPE_APM'.equals(paymentProcessor.ID)) {
            return true;
        }
    }

    return false;
};

exports.isAnyStripePaymentMethodEnabled = function () {
    return this.isStripeCardsPaymentMethodEnabled() || this.areStripeAlernativePaymentMethodsEnabled();
};

/**
 * Checks whether a given payment isntrument is handled by Stripe.
 *
 * @param {dw.order.PaymentInstrument} paymentInstrument - Payment instrument to check.
 * @return {boolean} - True if a Stripe payment instrument
 */
function isStripePaymentInstrument(paymentInstrument) {
    if (!paymentInstrument || !paymentInstrument.paymentMethod) {
        return false;
    }

    const stripePaymentInstrumentRegex = /(^CREDIT_CARD$|^STRIPE_.+)/i;
    return stripePaymentInstrumentRegex.test(paymentInstrument.paymentMethod);
}

/**
 * Check if customer cards should always be saved for guest customers
 * @returns {boolean} true if customer cards always should be saved
 */
function shouldAlwaysSaveGuessCustomerCards() {
    return dw.system.Site.getCurrent().getCustomPreferenceValue('stripeSaveCustomerCards').value === 'always';
}

/**
 * Check if customer should be asked before save cards on Stripe side
 * @returns {boolean} true customer should be asked before save cards on Stripe side
 */
function shouldAskBeforeSaveGuessCustomerCards() {
    return dw.system.Site.getCurrent().getCustomPreferenceValue('stripeSaveCustomerCards').value === 'ask';
}

exports.shouldAskBeforeSaveGuessCustomerCards = shouldAskBeforeSaveGuessCustomerCards;

/**
 * Gets the Stripe payment instrument created for a given line item container.
 *
 * @param {dw.order.LineItemContainer} lineItemCtnr - Line item container
 * @return {dw.order.OrderPaymentInstruments} - Stripe payment instrument or null
 */
function getStripePaymentInstrument(lineItemCtnr) {
    const allPaymentInstruments = lineItemCtnr.paymentInstruments.toArray();
    const stripePaymentInstruments = allPaymentInstruments.filter(isStripePaymentInstrument);

    return stripePaymentInstruments.length ? stripePaymentInstruments[0] : null;
}

exports.getStripePaymentInstrument = getStripePaymentInstrument;

exports.removeStripePaymentInstruments = function (lineItemCtnr) {
    const iter = lineItemCtnr.paymentInstruments.iterator();
    var existingPI;

    // remove them
    while (iter.hasNext()) {
        existingPI = iter.next();

        if (isStripePaymentInstrument(existingPI)) {
            lineItemCtnr.removePaymentInstrument(existingPI);
        }
    }
};

exports.createStripePaymentInstrument = function (lineItemCtnr, paymentMethodId, params) {
    exports.removeStripePaymentInstruments(lineItemCtnr);

    const paymentInstrument = lineItemCtnr.createPaymentInstrument(paymentMethodId, this.getNonGiftCertificateAmount(lineItemCtnr));

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    if (params) {
        if ('sourceId' in params) {
            paymentInstrument.custom.stripeSourceID = params.sourceId;
        }

        if ('cardHolder' in params) {
            paymentInstrument.creditCardHolder = params.cardHolder;
        }

        if ('cardNumber' in params) {
            paymentInstrument.creditCardNumber = params.cardNumber;
        }

        if ('cardType' in params) {
            paymentInstrument.creditCardType = params.cardType;
        }

        if ('cardExpMonth' in params) {
            paymentInstrument.creditCardExpirationMonth = params.cardExpMonth;
        }

        if ('cardExpYear' in params) {
            paymentInstrument.creditCardExpirationYear = params.cardExpYear;
        }

        if ('prUsed' in params) {
            paymentInstrument.custom.stripePRUsed = params.prUsed;
        }
    }

    const paymentTransaction = paymentInstrument.paymentTransaction;
    const PaymentMgr = require('dw/order/PaymentMgr');
    var processor;

    // for Stripe Payment Element, we create the order before actual confirmation the payment on stripe
    // so we need to add the Payment processor and transaction details manually
    if (!paymentTransaction.getPaymentProcessor() && paymentMethodId === 'STRIPE_PAYMENT_ELEMENT') {
        processor = PaymentMgr.getPaymentMethod('STRIPE_PAYMENT_ELEMENT').getPaymentProcessor();
        if (processor) {
            paymentTransaction.setPaymentProcessor(processor);
        }
    }

    // for Stripe Card, we also create the order before actual confirmation the payment on stripe
    // so we need to add the Payment processor and transaction details manually
    if (!paymentTransaction.getPaymentProcessor() && paymentMethodId === 'CREDIT_CARD') {
        processor = PaymentMgr.getPaymentMethod('CREDIT_CARD').getPaymentProcessor();
        if (processor) {
            paymentTransaction.setPaymentProcessor(processor);
        }
    }

    var stripeAccountId = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountId');
    var stripeAccountType = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeAccountType');

    if (!empty(stripeAccountId)) {
        paymentTransaction.custom.stripeAccountId = stripeAccountId;
    }

    if (!empty(stripeAccountType) && 'value' in stripeAccountType && !empty(stripeAccountType.value)) {
        paymentTransaction.custom.stripeAccountType = stripeAccountType.value;
    }

    if (session.privacy.stripeOrderNumber) {
        paymentTransaction.custom.stripeOrderNumber = session.privacy.stripeOrderNumber;
    }

    if (customer.authenticated && customer.profile && customer.profile.email) {
        let stripeCustomerId = customer.profile.custom.stripeCustomerID;

        if (params.saveCard) {
            if (!stripeCustomerId) {
                const newStripeCustomer = stripeService.customers.create({
                    email: customer.profile.email,
                    name: customer.profile.firstName + ' ' + customer.profile.lastName
                });

                stripeCustomerId = newStripeCustomer.id;
                customer.profile.custom.stripeCustomerID = stripeCustomerId;
            }

            paymentInstrument.custom.stripeSavePaymentInstrument = true;
        }

        if (stripeCustomerId) {
            paymentInstrument.custom.stripeCustomerID = stripeCustomerId;
        }
    }

    if (!customer.authenticated && (shouldAlwaysSaveGuessCustomerCards() || (shouldAskBeforeSaveGuessCustomerCards() && params.saveGuessCard))) {
        const customerEmail = lineItemCtnr.getCustomerEmail();

        const guessCustomerName = lineItemCtnr.getBillingAddress().getFullName();

        const newStripeGuessCustomer = stripeService.customers.create({
            email: customerEmail,
            name: guessCustomerName
        });

        paymentInstrument.custom.stripeSavePaymentForReAuthorise = true;

        paymentInstrument.custom.stripeSavePaymentInstrument = true;

        if (newStripeGuessCustomer && newStripeGuessCustomer.id) {
            paymentInstrument.custom.stripeCustomerID = newStripeGuessCustomer.id;
        }
    }

    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    if (lineItemCtnr.custom.stripePaymentIntentID) {
        paymentTransaction.setTransactionID(lineItemCtnr.custom.stripePaymentIntentID);
        paymentTransaction.setType(stripeChargeCapture ? dw.order.PaymentTransaction.TYPE_CAPTURE : dw.order.PaymentTransaction.TYPE_AUTH);
    }

    if (paymentInstrument) {
        delete lineItemCtnr.custom.stripeIsPaymentIntentInReview; // eslint-disable-line
    }
};

exports.createPaymentIntent = function (paymentInstrument, orderShipments) {
    const paymentMethod = paymentInstrument.custom.stripeSourceID;

    var currentCurency = dw.util.Currency.getCurrency(paymentInstrument.paymentTransaction.amount.currencyCode);
    var multiplier = Math.pow(10, currentCurency.getDefaultFractionDigits());
    var amount = Math.round(paymentInstrument.paymentTransaction.amount.value * multiplier);
    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');

    const currency = paymentInstrument.paymentTransaction.amount.currencyCode.toLowerCase();

    const createPaymentIntentPayload = {
        payment_method: paymentMethod,
        amount: amount,
        currency: currency,
        confirmation_method: 'manual',
        capture_method: stripeChargeCapture ? 'automatic' : 'manual',
        confirm: true
    };

    if (paymentInstrument.custom.stripeCustomerID) {
        createPaymentIntentPayload.customer = paymentInstrument.custom.stripeCustomerID;
    }

    if (paymentInstrument.custom.stripeSavePaymentInstrument) {
        createPaymentIntentPayload.save_payment_method = true;
    }

    if (!stripeChargeCapture && paymentInstrument.custom.stripeSavePaymentForReAuthorise) {
        createPaymentIntentPayload.setup_future_usage = 'off_session';
    }

    if (session.privacy.stripeOrderNumber) {
        createPaymentIntentPayload.metadata = {};
        createPaymentIntentPayload.metadata.order_id = session.privacy.stripeOrderNumber;
        createPaymentIntentPayload.metadata.site_id = dw.system.Site.getCurrent().getID();
    }

    if (orderShipments && dw.system.Site.getCurrent().getCustomPreferenceValue('includeShippingDetailsInPaymentIntentPayload')) {
        createPaymentIntentPayload.shipping = exports.getPaymentIntentShipmentPayload(orderShipments);
    }

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    const paymentIntent = stripeService.paymentIntents.create(createPaymentIntentPayload);

    return paymentIntent;
};

exports.confirmPaymentIntent = function (paymentIntentId, paymentInstrument) {
    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    const paymentMethod = paymentInstrument.custom.stripeSourceID;

    const paymentIntentPayload = {
        payment_method: paymentMethod,
        return_url: dw.web.URLUtils.https('StripePayments-HandleAPM').toString()
    };

    const paymentIntent = stripeService.paymentIntents.confirm(paymentIntentId, paymentIntentPayload);

    return paymentIntent;
};

exports.getSiteID = function () {
    return require('dw/system/Site').getCurrent().getID();
};

exports.getNewStripeOrderNumber = function () {
    const OrderMgr = require('dw/order/OrderMgr');
    var stripeOrderNumber = session.privacy.stripeOrderNumber;

    if (!stripeOrderNumber // Order number has not been created yet
        || OrderMgr.getOrder(stripeOrderNumber) // The created order number has already been used, could happen in case a payment authorization attempt fails.
    ) {
        // v1
        // eslint-disable-next-line no-multi-assign
        stripeOrderNumber = session.privacy.stripeOrderNumber = OrderMgr.createOrderNo();
    }

    return stripeOrderNumber;
};

/**
 * Returns the saved order number. First checks in Stripe's payment instrument
 * of the given line item container, then falls back to the value stored in session.
 *
 * @param {dw.order.LineItemCtnr} lineItemCtnr - Line item container to check
 * @return {string} - Saved Order number
 */
function getSavedStripeOrderNumber(lineItemCtnr) {
    var stripeOrderNumber = null;

    if (lineItemCtnr) {
        const stripePaymentInstrument = getStripePaymentInstrument(lineItemCtnr);

        if (stripePaymentInstrument) {
            const paymentTransaction = stripePaymentInstrument.paymentTransaction;
            if ('stripeOrderNumber' in paymentTransaction.custom) {
                stripeOrderNumber = paymentTransaction.custom.stripeOrderNumber;
            }
        }
    }

    if (!stripeOrderNumber) {
        stripeOrderNumber = session.privacy.stripeOrderNumber;
    }

    return stripeOrderNumber;
}

exports.getNonGiftCertificateAmount = function (lineItemCtnr) {
    const Money = require('dw/value/Money');

    // The total redemption amount of all gift certificate payment instruments in the basket.
    var giftCertTotal = new Money(0.0, lineItemCtnr.getCurrencyCode());

    // Gets the list of all gift certificate payment instruments
    var gcPaymentInstrs = lineItemCtnr.getGiftCertificatePaymentInstruments();
    var iter = gcPaymentInstrs.iterator();
    var orderPI = null;

    // Sums the total redemption amount.
    while (iter.hasNext()) {
        orderPI = iter.next();
        giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
    }

    // Gets the order total.
    var orderTotal = lineItemCtnr.getTotalGrossPrice();
    if (orderTotal.value === 0) {
        orderTotal = lineItemCtnr.getAdjustedMerchandizeTotalPrice(true).add(lineItemCtnr.giftCertificateTotalPrice);
    }

    // Calculates the amount to charge for the payment instrument.
    // This is the remaining open order total that must be paid.
    var amountOpen = orderTotal.subtract(giftCertTotal);

    // Returns the open amount to be paid.
    return amountOpen;
};

/**
 * Attempts to create an order from the current basket
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {dw.order.Order} The order object created from the current basket
 */
exports.createOrder = function (currentBasket) {
    const OrderMgr = require('dw/order/OrderMgr');
    const Transaction = require('dw/system/Transaction');
    const stripeOrderNumber = getSavedStripeOrderNumber(currentBasket);

    var order;
    try {
        order = Transaction.wrap(function () {
            var newOrder;
            if (stripeOrderNumber) {
                newOrder = OrderMgr.createOrder(currentBasket, stripeOrderNumber);
            } else {
                newOrder = OrderMgr.createOrder(currentBasket);
            }

            return newOrder;
        });
    } catch (error) {
        if (order) {
            Transaction.wrap(function () {
                order.addNote('Error Create Order', error.message);
            });
        }
    }

    return order;
};

/**
 * Checks if order is APM
 * @param {dw.order.Order} order object
 * @returns {bool} true if AMP order
 */
exports.isAPMOrder = function (order) {
    for (let i = 0; i < order.paymentInstruments.length; i++) {
        let paymentInstrument = order.paymentInstruments[i];
        let paymentTransaction = paymentInstrument.paymentTransaction;
        let paymentProcessor = paymentTransaction && paymentTransaction.paymentProcessor;

        if (paymentProcessor && 'STRIPE_APM'.equals(paymentProcessor.ID)) {
            return true;
        }
    }

    return false;
};

exports.refundCharge = function (order) {
    const PaymentInstrument = require('dw/order/PaymentInstrument');
    const cardPaymentInstruments = order.getPaymentInstruments(PaymentInstrument.METHOD_CREDIT_CARD);
    const cardPaymentInstrument = cardPaymentInstruments.length && cardPaymentInstruments[0];
    const chargeId = cardPaymentInstrument && cardPaymentInstrument.custom.stripeChargeID;

    if (chargeId) {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        try {
            stripeService.refunds.create({
                charge: chargeId
            });
        } catch (e) {
            let errorMessage = 'Failed to refund charge ' + chargeId;
            errorMessage += '\n Original error was: ' + e.message;
            const Logger = require('dw/system/Logger');
            Logger.error(errorMessage);
            const Transaction = require('dw/system/Transaction');
            Transaction.wrap(function () {
                order.addNote('Stripe refund failed', errorMessage);
            });
        }
    }
};

exports.getStripeOrderDetails = function (basket) {
    var stripeOrderAmount = exports.getNonGiftCertificateAmount(basket);
    var currentCurency = dw.util.Currency.getCurrency(stripeOrderAmount.getCurrencyCode());
    var multiplier = Math.pow(10, currentCurency.getDefaultFractionDigits());
    var stripeOrderAmountCalculated = Math.round(stripeOrderAmount.getValue() * multiplier);

    var billingAddress = basket.billingAddress;
    var billingAddressCountryCode = billingAddress ? billingAddress.countryCode.value : '';

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

    var orderShipping = {
        phone: shippingAddress ? shippingAddress.getPhone() : '',
        address: {
            line1: shippingAddress ? shippingAddress.getAddress1() : '',
            line2: shippingAddress ? shippingAddress.getAddress2() : '',
            city: shippingAddress ? shippingAddress.getCity() : '',
            postal_code: shippingAddress ? shippingAddress.getPostalCode() : '',
            country: shippingAddress && shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().value.toUpperCase() : '',
            state: shippingAddress ? shippingAddress.getStateCode() : ''
        }
    };

    var shippingFirstName = shippingAddress ? shippingAddress.getFirstName() : '';
    var shippingLastName = shippingAddress ? shippingAddress.getLastName() : '';

    var orderItems = [];

    var subTotal = new dw.value.Money(0, stripeOrderAmount.getCurrencyCode());

    var productLineItems = basket.getAllProductLineItems().iterator();
    while (productLineItems.hasNext()) {
        var productLineItem = productLineItems.next();

        if (productLineItem.price.available) {
            var product = productLineItem.getProduct();
            var productName = (product) ? product.getName() : '';

            var productItem = {
                type: 'sku',
                description: productName,
                quantity: productLineItem.quantity.value,
                currency: productLineItem.price.currencyCode,
                amount: Math.round(productLineItem.getAdjustedPrice().getValue() * multiplier)
            };
            var productID = (product) ? product.getID() : '';
            if (productID) {
                productItem.parent = productID;
            }

            orderItems.push(productItem);

            subTotal = subTotal.add(productLineItem.getAdjustedPrice());
        }
    }

    // add shipping
    var shippingTotalPrice = basket.getAdjustedShippingTotalPrice();
    if (shippingTotalPrice.available) {
        var shippingItem = {
            type: 'shipping',
            description: 'Shipping',
            currency: shippingTotalPrice.currencyCode,
            amount: Math.round(shippingTotalPrice.getValue() * multiplier)
        };
        orderItems.push(shippingItem);

        subTotal = subTotal.add(shippingTotalPrice);
    }

    // add tax
    var totalTax = stripeOrderAmount.subtract(subTotal);
    if (totalTax.value > 0) {
        var taxItem = {
            type: 'tax',
            description: 'Taxes',
            currency: basket.totalTax.currencyCode,
            amount: Math.round(totalTax.getValue() * multiplier)
        };
        orderItems.push(taxItem);
    }

    return {
        amount: stripeOrderAmountCalculated,
        currency: stripeOrderAmount.getCurrencyCode().toLowerCase(),
        purchase_country: billingAddressCountryCode,
        order_items: JSON.stringify(orderItems),
        order_shipping: JSON.stringify(orderShipping),
        shipping_first_name: shippingFirstName,
        shipping_last_name: shippingLastName
    };
};

exports.getShippingOptions = function () {
    var basket = dw.order.BasketMgr.getCurrentBasket();
    var shipments = basket.getShipments();

    var currentCurency = dw.util.Currency.getCurrency(basket.getCurrencyCode());
    var multiplier = Math.pow(10, currentCurency.getDefaultFractionDigits());

    var shipmentShippingModel = dw.order.ShippingMgr.getShipmentShippingModel(shipments[0]);
    var shippingMethods = shipmentShippingModel.getApplicableShippingMethods();

    // Filter out whatever the method associated with in store pickup
    var result = [];
    for (let i = 0; i < shippingMethods.length; i++) {
        var shippingMethod = shippingMethods[i];
        if (!shippingMethod.custom.storePickupEnabled) {
            result.push({
                id: shippingMethod.ID,
                label: shippingMethod.displayName,
                detail: shippingMethod.description,
                amount: Math.round(shipmentShippingModel.getShippingCost(shippingMethod).amount.value * multiplier)
            });
        }
    }

    return result;
};

exports.getSiteLocale = function () {
    var locale = request.getLocale();

    return locale ? locale.replace('_', '-') : null;
};

exports.isBasketPaymentIntentValid = function () {
    const BasketMgr = require('dw/order/BasketMgr');
    const currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket || !currentBasket.custom.stripePaymentIntentID) {
        return false;
    }

    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');
    const paymentIntent = stripeService.paymentIntents.retrieve(currentBasket.custom.stripePaymentIntentID);
    if (!paymentIntent) {
        return false;
    }

    /*
     * validate basket currency code and amount are same as currency code and amount from payment intent
     */
    const Money = require('dw/value/Money');
    const basketCurrencyCode = currentBasket.getCurrencyCode();
    const basketTotal = currentBasket.getTotalGrossPrice();

    var basketCurency = dw.util.Currency.getCurrency(basketCurrencyCode);
    var multiplier = Math.pow(10, basketCurency.getDefaultFractionDigits());

    // Iterates over the list of gift certificate payment instruments
    // and updates the total redemption amount.
    var gcPaymentInstrs = currentBasket.getGiftCertificatePaymentInstruments().iterator();
    var orderPI = null;
    var giftCertTotal = new Money(0.0, currentBasket.getCurrencyCode());

    while (gcPaymentInstrs.hasNext()) {
        orderPI = gcPaymentInstrs.next();
        giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
    }

    var totalAmount = basketTotal.subtract(giftCertTotal);
    const amount = Math.round(totalAmount.getValue() * multiplier);

    if (amount !== paymentIntent.amount || basketCurrencyCode.toLowerCase() !== paymentIntent.currency.toLowerCase()) {
        /*
         * unlink current payment intent from Basket to be able to place a new order
         */
        const Transaction = require('dw/system/Transaction');
        Transaction.wrap(function () {
            currentBasket.custom.stripePaymentIntentID = '';
        });

        return false;
    }

    return true;
};

/**
 * Creates the shipping payload for the Payment Intent
 * @param {dw.order.Order} order object
 * @returns {Object} shipment details payload
 */
exports.getPaymentIntentShipmentPayload = function (shipments) {
    var shippingAddress = null;
    var iter = shipments.iterator();
    while (iter != null && iter.hasNext()) {
        var shipment = iter.next();
        shippingAddress = shipment.getShippingAddress();
        if (shippingAddress) {
            break;
        }
    }

    var paymentIntentShippingPayload = {};

    if (shippingAddress) {
        paymentIntentShippingPayload = {
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

    return paymentIntentShippingPayload;
}

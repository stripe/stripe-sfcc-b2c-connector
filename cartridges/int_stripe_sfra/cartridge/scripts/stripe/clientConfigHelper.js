/* global session */

'use strict';

/**
 * Serializes a config object for a script type="application/json" block.
 * @param {Object} config - Config object
 * @returns {string} - JSON safe to print unencoded inside a script tag
 */
function toScriptJson(config) {
    return JSON.stringify(config)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

/**
 * Config shared by every Stripe script.
 * @returns {Object} - Base config
 */
function getBaseConfig() {
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    var betas = stripeHelper.getPaymentMethodsInBeta();

    return {
        publicKey: stripeHelper.getPublicApiKey(),
        locale: require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getSiteLocale(),
        betas: betas ? betas.split(',') : []
    };
}

/**
 * Config for the Payment Element and Bank Transfer Element.
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object} - Checkout config
 */
function getCheckoutConfig(basket) {
    var URLUtils = require('dw/web/URLUtils');
    var Site = require('dw/system/Site').getCurrent();
    var stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var stripeOrder = stripeCheckoutHelper.getStripeOrderDetails(basket);

    return {
        urls: {
            paymentElementOptions: URLUtils.https('StripePaymentsAPM-GetPaymentElementOptions').toString(),
            bankTransferElementOptions: URLUtils.https('StripePaymentsAPM-GetBankTransferElementOptions').toString(),
            orderItems: URLUtils.https('StripePaymentsAPM-GetStripeOrderItems').toString(),
            submitOrder: URLUtils.https('StripePaymentsAPM-PaymentElementSubmitOrder').toString(),
            failOrder: URLUtils.https('StripePaymentsAPM-FailOrder').toString(),
            logError: URLUtils.https('StripePaymentsAPM-LogStripeErrorMessage').toString(),
            returnUrl: URLUtils.https('StripePaymentsAPM-HandleAPM').toString(),
            billingPage: URLUtils.url('Checkout-Begin', 'stage', 'payment').toString()
        },
        useCheckoutSessions: !!Site.getCustomPreferenceValue('stripeUseCheckoutSessions'),
        billingDetailsCollection: Site.getCustomPreferenceValue('stripeCollectBillingDetailsOnPaymentElement') ? 'auto' : 'never',
        order: {
            amount: stripeOrder.amount,
            currency: stripeOrder.currency,
            // Also reserves the order number used by createOrder
            number: stripeCheckoutHelper.getNewStripeOrderNumber()
        }
    };
}

/**
 * Config for the Express Checkout Element.
 * @param {dw.order.Basket} basket - Current basket, may be null
 * @returns {Object} - Express Checkout config
 */
function getExpressCheckoutConfig(basket) {
    var URLUtils = require('dw/web/URLUtils');
    var Site = require('dw/system/Site').getCurrent();
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
   

    var returnObj = {
        urls: {
            quickCheckout: URLUtils.https('StripePaymentsAPM-StripeQuickCheckout').toString(),
            shippingOptions: URLUtils.https('Stripe-GetShippingOptions').toString(),
            failOrder: URLUtils.https('StripePaymentsAPM-FailOrder').toString(),
            logError: URLUtils.https('StripePaymentsAPM-LogStripeErrorMessage').toString(),
            returnUrl: URLUtils.https('StripePaymentsAPM-HandleAPM').toString()
        },
        captureMethod: Site.getCustomPreferenceValue('stripeChargeCapture') ? 'automatic' : 'manual',
        appearance: stripeHelper.getStripeExpressCheckoutAppearance(),
    };

    if (basket) {
        var stripeOrder = require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getStripeOrderDetails(basket);
        returnObj.order = {
            amount: stripeOrder ? stripeOrder.amount : 0,
            currency: stripeOrder && stripeOrder.currency ? stripeOrder.currency : session.currency.currencyCode
        };
    } else {
        returnObj.order = {
            amount: 0,
            currency: session.currency.currencyCode
        };
    }

    return returnObj;
}

exports.toScriptJson = toScriptJson;
exports.getBaseConfig = getBaseConfig;
exports.getCheckoutConfig = getCheckoutConfig;
exports.getExpressCheckoutConfig = getExpressCheckoutConfig;

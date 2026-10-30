/* eslint-env es6 */
/* global dw, empty */

'use strict';

var Site = require('dw/system/Site');

/**
 * Checks if the payment is a Stripe APM method
 *
 * @param {dw.order.PaymentMethod} paymentMethod - SFCC PaymentMethod
 * @return {boolean} - True if Stripe is used as processor for the payment
 */
function isStripeAPMPayment(paymentMethod) {
    if (!empty(paymentMethod)) {
        var paymentProcessor = paymentMethod.getPaymentProcessor();
        if (!empty(paymentProcessor) && paymentProcessor.ID.equals('STRIPE_APM')) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if Stripe integration is enabled.
 *
 * @return {boolean} - True if sitepreference is set to true.
 */
exports.isStripeEnabled = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeEnabled');
};

/**
* Gets the Stripe secret API key from Site Preferences.
*
* @returns {string} Stripe secret API key.
*/
exports.getApiKey = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeApiKey');
};

/**
* Gets the URL from where Stripe.js can be loaded.
*
* @returns {string} Stripe.js URL
*/
exports.getStripeScriptUrl = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeApiURL');
};

/**
* Gets the Stripe publishable API key from Site Preferences.
*
* @returns {string} Stripe publishable API key
*/
exports.getPublicApiKey = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripePublicKey');
};

/**
* Gets the Stripe API version from Site Preferences.
*
* @returns {string} Stripe API version
*/
exports.getStripeApiVersion = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeApiVersion');
};

exports.isStripeAPMPayment = isStripeAPMPayment;

/**
 * Returns if the current site is SFRA
 * @returns {boolean} True if SFRA
 */
exports.isSFRA = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeIsSFRA');
};

/**
* Gets the Stripe Payment Methods in Beta from Site Preferences.
*
* @returns {string} Stripe payment methods in beta
*/
exports.getPaymentMethodsInBeta = function () {
    const paymentMethodsInBeta = Site.getCurrent().getCustomPreferenceValue('stripePaymentMethodsInBeta');

    return (paymentMethodsInBeta && paymentMethodsInBeta.length) ? paymentMethodsInBeta.join(',') : '';
};

/**
 * Get stripe payment element style from Site Preferences.
 * @returns {Object} - Stripe payment element style or default value if not configured.
 */
exports.getStripePaymentElementStyle = function () {
    const paymentElementStyle = Site.getCurrent().getCustomPreferenceValue('stripePaymentElementStyle');
    try {
        if (paymentElementStyle) {
            return JSON.parse(paymentElementStyle);
        }
    } catch (error) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripePaymentElementStyle from site preference value as JSON');
    }

    return {
        variables: {
            colorPrimary: '#0570de',
            colorBackground: '#ffffff',
            colorText: '#30313d',
            colorDanger: '#df1b41',
            fontFamily: 'Ideal Sans, system-ui, sans-serif',
            spacingUnit: '2px',
            borderRadius: '4px'
        }
    };
};

/**
 * Gets the Payment Element appearance and fonts from site preferences.
 * @returns {Object} { appearance, fonts }
 */
exports.getStripePaymentElementAppearanceOptions = function () {
    var appearance = exports.getStripePaymentElementStyle();
    var fonts = appearance.fonts;

    delete appearance.fonts;
    if (!appearance.theme) {
        appearance.theme = 'stripe';
    }

    return { appearance: appearance, fonts: fonts };
};

/**
 * Checks if Stripe Express Checkout on Product page is Enabled from site preferences
 *
 * @returns {boolean} - True if Express Checkout is enabled
 */
exports.getStripeExpressCheckoutProductPageEnabled = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeExpressCheckoutProductPageEnabled');
};

/**
 * Checks if Stripe Express Checkout on Cart Page is Enabled from site preferences
 *
 * @returns {boolean} - True if Express Checkout is enabled
 */
exports.getStripeExpressCheckoutCartPageEnabled = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripeExpressCheckoutCartPageEnabled');
};

/**
 * Checks if Stripe Express Checkout on Minicart is Enabled from site preferences
 *
 * @returns {boolean} - True if Express Checkout is enabled
 */
exports.isStripeExpressCheckoutMinicartEnabled = function() {
    return Site.getCurrent().getCustomPreferenceValue('stripeExpressCheckoutMinicartEnabled');
};

/**
 * Checks if Stripe Express Checkout on Cart Page is Enabled from site preferences
 *
 * @returns {boolean} - True if CVC recollection is enabled
 */
exports.isCVCRecollectionEnabled = function() {
    return Site.getCurrent().getCustomPreferenceValue('cvcRecollectionEnabled');
};

/**
 * Get stripe Express Checkout buttons style from Site Preferences.
 * @returns {Object} - Stripe Express Checkout style or default value if not configured.
 */
exports.getStripeExpressCheckoutAppearance = function () {
    const expressCheckoutStyle = Site.getCurrent().getCustomPreferenceValue('stripeExpressCheckoutStyle');
    try {
        if (expressCheckoutStyle) {
            return JSON.parse(expressCheckoutStyle);
        }
    } catch (error) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeExpressCheckoutStyle from site preference value as JSON');
    }

    return {
        theme: 'stripe',
        variables: {
            borderRadius: '36px'
        }
    };
};
/**
 * Checks if Stripe Payment Element: Enable Save Payment Method for Future Purchases is enabled.
 *
 * @return {boolean} - True if stripePaymentElementsSavePayments is set to true.
 */
exports.isStripePaymentElementsSavePaymentsEnabled = function () {
    return Site.getCurrent().getCustomPreferenceValue('stripePaymentElementsSavePayments');
};

/**
 * Checks if Stripe Payment Element is enabled.
 *
 * @return {boolean} - True if Stripe Payment Element Payment Method is enabled
 */
exports.isStripePaymentElementEnabled = function () {
    var PaymentMgr = require('dw/order/PaymentMgr');

    var paymentElementPM = PaymentMgr.getPaymentMethod('STRIPE_PAYMENT_ELEMENT');

    return !empty(paymentElementPM) && paymentElementPM.isActive();
};

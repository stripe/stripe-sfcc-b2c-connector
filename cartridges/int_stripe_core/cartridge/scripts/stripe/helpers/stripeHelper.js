/* eslint-env es6 */
/* global dw, empty */

'use strict';

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
    var Site = require('dw/system/Site');
    return Site.getCurrent().getCustomPreferenceValue('stripeEnabled');
};

/**
* Gets the Stripe secret API key from Site Preferences.
*
* @returns {string} Stripe secret API key.
*/
exports.getApiKey = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeApiKey');
};

/**
* Gets the URL from where Stripe.js can be loaded.
*
* @returns {string} Stripe.js URL
*/
exports.getStripeScriptUrl = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeApiURL');
};

/**
* Gets the Stripe publishable API key from Site Preferences.
*
* @returns {string} Stripe publishable API key
*/
exports.getPublicApiKey = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripePublicKey');
};

/**
* Gets the Stripe API version from Site Preferences.
*
* @returns {string} Stripe API version
*/
exports.getStripeApiVersion = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeApiVersion');
};

/**
 * Gets Stripe payment request button style from Site Preferences.
 *
 * @return {Object} - Stripe payment request button style or default if not configured.
 */
exports.getPaymentRequestButtonStyle = function () {
    const stylePreferences = require('dw/system/Site').current.getCustomPreferenceValue('stripePaymentRequestButtonStyle');

    try {
        if (stylePreferences) {
            return JSON.parse(stylePreferences);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripePaymentRequestButtonStyle site preference value as JSON');
    }

    return {
        type: 'default',
        theme: 'light',
        height: '40px'
    };
};

/**
 * Gets Stripe card form style from Site Preferences.
 *
 * @return {Object} - Stripe card form style or default if not configured.
 */
exports.getStripeCardFormStyle = function () {
    const cardFormStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripeCardElementCSSStyle');

    try {
        if (cardFormStyle) {
            return JSON.parse(cardFormStyle);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeCardElementCSSStyle site preference value as JSON');
    }

    return {
        base: {
            fontSize: '16px',
            color: '#32325d'
        }
    };
};

/**
 * Gets Stripe iDEAL form style from Site Preferences.
 *
 * @return {Object} - Stripe iDEAL form style or default if not configured.
 */
exports.getStripeIdealElementStyle = function () {
    const idealEmelentStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripeIdealElementCSSStyle');

    try {
        if (idealEmelentStyle) {
            return JSON.parse(idealEmelentStyle);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeIdealElementCSSStyle site preference value as JSON');
    }

    return {
        base: {
            padding: '9px 10px',
            color: '#32325d',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSmoothing: 'antialiased',
            fontSize: '12px',
            '::placeholder': {
                color: '#aab7c4'
            }
        },
        invalid: {
            color: '#fa755a'
        }
    };
};

/**
 * Gets Stripe SEPA Debit form style from Site Preferences.
 *
 * @return {Object} - Stripe SEPA Debitgit form style or default if not configured.
 */
exports.getStripeSepaDebitStyle = function () {
    const sepaDebitStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripeSepaDebitCSSStyle');

    try {
        if (sepaDebitStyle) {
            return JSON.parse(sepaDebitStyle);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeSepaDebitCSSStyle site preference value as JSON');
    }

    return {
        base: {
            color: '#32325d',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSmoothing: 'antialiased',
            fontSize: '16px',
            '::placeholder': {
                color: '#aab7c4'
            },
            ':-webkit-autofill': {
                color: '#32325d'
            }
        },
        invalid: {
            color: '#fa755a',
            iconColor: '#fa755a',
            ':-webkit-autofill': {
                color: '#fa755a'
            }
        }
    };
};

/**
 * Returns a StripeWallet wrapper for a given customer profile.
 *
 * @param {dw.customer.Customer} apiCustomer - SFCC API customer to return wrapper for.
 * @return {StripeWallet} - StripeWallet instance
 */
exports.getStripeWallet = function (apiCustomer) {
    return require('*/cartridge/scripts/stripe/models/stripeWallet')(apiCustomer);
};

/**
 * Returns Stripe allowed payment methods
 *
 * @param {dw.util.Collection} applicablePaymentMethods - SFCC payment methods
 * @param {string} locale - the APM locale
 * @return {dw.util.Collection} - filtered payment methods
 */
exports.getStripePaymentMethods = function (applicablePaymentMethods, locale) {
    const localeConfig = JSON.parse(require('dw/system/Site').current.getCustomPreferenceValue('stripeAllowedAPMMethods')) || {};
    const list = localeConfig[locale] != null ? localeConfig[locale] : localeConfig.default;
    const applicablePaymentMethodsIterator = applicablePaymentMethods.iterator();

    if (!empty(list)) {
        let filteredPaymentMethods = new dw.util.ArrayList();

        while (applicablePaymentMethodsIterator.hasNext()) {
            let method = applicablePaymentMethodsIterator.next();
            let isAPM = isStripeAPMPayment(method);
            if ((isAPM && list.indexOf(method.ID.substr(7).toLowerCase()) > -1) || !isAPM) {
                filteredPaymentMethods.push(method);
            }
        }

        return filteredPaymentMethods;
    }

    return applicablePaymentMethods;
};

exports.isStripeAPMPayment = isStripeAPMPayment;

/**
 * Returns if the current site is SFRA
 * @returns {boolean} True if SFRA
 */
exports.isSFRA = function () {
    var Site = require('dw/system/Site');
    return Site.current.getCustomPreferenceValue('stripeIsSFRA');
};

/**
* Gets the URL from where Klarna JS can be loaded.
*
* @returns {string} Stripe Klarna JS URL
*/
exports.getStripeKlarnaScriptUrl = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeKlarnaApiURL');
};

/**
 * Returns if the card form needs to be displayed instead of generated by Stripe
 * @returns {boolean} True if custom card form
 */
exports.isCustomCardForm = function () {
    var Site = require('dw/system/Site');
    return Site.current.getCustomPreferenceValue('stripeCustomCreditCardForm');
};

/**
* Gets the Stripe Payment Methods in Beta from Site Preferences.
*
* @returns {string} Stripe payment methods in beta
*/
exports.getPaymentMethodsInBeta = function () {
    const paymentMethodsInBeta = require('dw/system/Site').getCurrent().getCustomPreferenceValue('stripePaymentMethodsInBeta');

    return (paymentMethodsInBeta && paymentMethodsInBeta.length) ? paymentMethodsInBeta.join(',') : '';
};

/**
 * Gets Stripe Eps form style from Site Preferences.
 *
 * @return {Object} - Stripe Eps form style or default if not configured.
 */
exports.getStripeEpsElementStyle = function () {
    const epsEmelentStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripeEpsElementCSSStyle');

    try {
        if (epsEmelentStyle) {
            return JSON.parse(epsEmelentStyle);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeEpsElementCSSStyle site preference value as JSON');
    }

    return {
        base: {
            padding: '10px 12px',
            color: '#32325d',
            fontSize: '16px',
            '::placeholder': {
                color: '#aab7c4'
            }
        }
    };
};

/**
 * Get stripe payment element style from Site Preferences.
 * @returns {Object} - Stripe payment element style or default value if not configured.
 */
exports.getStripePaymentElementStyle = function () {
    const paymentElementStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripePaymentElementStyle');
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
 * Gets Stripe P24 form style from Site Preferences.
 *
 * @return {Object} - Stripe P24 form style or default if not configured.
 */
exports.getStripeP24ElementStyle = function () {
    const p24EmelentStyle = require('dw/system/Site').current.getCustomPreferenceValue('stripeP24ElementCSSStyle');

    try {
        if (p24EmelentStyle) {
            return JSON.parse(p24EmelentStyle);
        }
    } catch (e) {
        const Logger = require('dw/system/Logger');
        Logger.error('Failed to parse stripeEpsElementCSSStyle site preference value as JSON');
    }

    return {
        base: {
            padding: '10px 12px',
            color: '#32325d',
            fontSize: '16px',
            '::placeholder': {
                color: '#aab7c4'
            }
        }
    };
};

/**
 * Checks if Stripe Payment Element: Enable Save Payment Method for Future Purchases is enabled.
 *
 * @return {boolean} - True if stripePaymentElementsSavePayments is set to true.
 */
exports.isStripePaymentElementsSavePaymentsEnabled = function () {
    var Site = require('dw/system/Site');
    return Site.getCurrent().getCustomPreferenceValue('stripePaymentElementsSavePayments');
};

/**
 * Checks if Stripe Payment Element is enabled.
 *
 * @return {boolean} - True if Stripe Payment Element Payment Method is enabled
 */
exports.isStripePaymentElementEnabled = function () {
    var PaymentMgr = require('dw/order/PaymentMgr');

    return !empty(PaymentMgr.getPaymentMethod('STRIPE_PAYMENT_ELEMENT'));
};

/**
 * Checks if Credit Card is enabled.
 *
 * @return {boolean} - True if Credit Card is enabled
 */
exports.isCreditCardEnabled = function () {
    var PaymentMgr = require('dw/order/PaymentMgr');

    return !empty(PaymentMgr.getPaymentMethod('CREDIT_CARD'));
};

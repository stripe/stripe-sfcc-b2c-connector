/* eslint-env es6 */
/* eslint-disable no-plusplus */

'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');

/**
* Gets the Stripe secret API key from Site Preferences.
*
* @returns {string} Stripe secret API key.
*/
exports.getApiKey = function () {
    return require('dw/system/Site').current.getCustomPreferenceValue('stripeApiKey');
};

/**
 * Converts a Business Manager display amount (e.g. "10.99" or "500") into the
 * amount expressed in the currency's minor unit, as required by the Stripe API.
 *
 * Uses the currency's default fraction digits so zero-decimal currencies
 * (JPY, KRW, VND, XOF, XPF) are not incorrectly multiplied by 100. Mirrors the
 * conversion already used at checkout time in int_stripe_core.
 *
 * @param {string|number} displayAmount amount entered by the BM operator
 * @param {string} currencyCode ISO currency code of the order
 * @returns {number|null} amount in minor units, or null when the input is not a positive number
 */
exports.toStripeMinorUnits = function (displayAmount, currencyCode) {
    var Currency = require('dw/util/Currency');

    var numericAmount = Number(displayAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) { // eslint-disable-line no-restricted-globals
        return null;
    }

    var currency = Currency.getCurrency(currencyCode);
    var fractionDigits = currency ? currency.getDefaultFractionDigits() : 2;
    var multiplier = Math.pow(10, fractionDigits);

    return Math.round(numericAmount * multiplier);
};

/**
 * Get Stripe Payment Method Definitions
 *
 * @return {Array} array with Stripe payment methods definitions
 */
function getStripePaymentMethodDefinitions() {
    return [
        {
            id: 'CREDIT_CARD',
            name: 'Stripe Card',
            currencies: {},
            payment_processor: 'STRIPE_CREDIT'
        },
        {
            id: 'STRIPE_PAYMENT_ELEMENT',
            name: 'Stripe Payment Element',
            currencies: {},
            payment_processor: 'STRIPE_APM'
        }
    ];
}

exports.getStripePaymentMethodDefinitions = getStripePaymentMethodDefinitions;

/**
 * Get Array with Stripe Payment Methods info for Current site
*
* @return {Array} list with Stripe Payment methods info
*/
exports.getStripePaymentMethods = function () {
    var result = [];

    var stripePaymentMethods = getStripePaymentMethodDefinitions();

    for (var i = 0; i < stripePaymentMethods.length; i++) {
        var paymentMethodId = stripePaymentMethods[i].id;
        var paymentMethodName = stripePaymentMethods[i].name;
        var paymentProcessorId = stripePaymentMethods[i].payment_processor;

        var paymentMethod = PaymentMgr.getPaymentMethod(paymentMethodId);

        var isActive = paymentMethod && paymentMethod.isActive()
                        && (paymentProcessorId === paymentMethod.getPaymentProcessor().getID());

        result.push({
            id: paymentMethodId,
            name: paymentMethodName,
            isactive: isActive
        });
    }
    return result;
};

/**
 * Writes payment method elements to XML file.
 *
 * @param {dw.io.XMLStreamWriter} xsw Class used to write XML to file.
 * @param {Object} paymentMethod Object containing payment method info.
 * @param {Bolean} isEnabled true if payment method needs to be enabled
 */
exports.writePaymentMethod = function (xsw, paymentMethod, isEnabled) {
    /* eslint-disable indent */
    xsw.writeStartElement('payment-method');
    xsw.writeAttribute('method-id', paymentMethod.id);
        xsw.writeStartElement('name');
        xsw.writeAttribute('xml:lang', 'x-default');
        xsw.writeCharacters(paymentMethod.name);
        xsw.writeEndElement();

        xsw.writeStartElement('enabled-flag');
        xsw.writeCharacters(isEnabled);
        xsw.writeEndElement();

        xsw.writeStartElement('processor-id');
        xsw.writeCharacters(paymentMethod.payment_processor);
        xsw.writeEndElement();

        xsw.writeStartElement('currencies');
        for (var i = 0; i < paymentMethod.currencies.length; i++) {
            var currency = paymentMethod.currencies[i];

            xsw.writeStartElement('currency');
            xsw.writeCharacters(currency);
            xsw.writeEndElement();
        }
        xsw.writeEndElement();

    xsw.writeEndElement();
    /* eslint-enable indent */
};

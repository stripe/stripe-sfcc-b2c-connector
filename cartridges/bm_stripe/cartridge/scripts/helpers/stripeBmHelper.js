/* eslint-env es6 */
/* eslint-disable no-plusplus */

'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');

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
            id: 'STRIPE_PAYMENT_REQUEST_BTN',
            name: 'Stripe Payment Request',
            currencies: {},
            payment_processor: 'STRIPE_CREDIT'
        },
        {
            id: 'STRIPE_IDEAL',
            name: 'iDeal',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_SOFORT',
            name: 'Sofort',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_SEPA_DEBIT',
            name: 'SEPA Direct Debit',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_ALIPAY',
            name: 'Alipay',
            currencies: [
                'AUD',
                'CAD',
                'EUR',
                'GBP',
                'HKD',
                'JPY',
                'NZD',
                'SGD',
                'USD'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_BANCONTACT',
            name: 'Bancontact',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_EPS',
            name: 'EPS',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_ACH_DEBIT',
            name: 'ACH Debit',
            currencies: [
                'USD'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_WECHATPAY',
            name: 'WeChat Pay',
            currencies: [
                'AUD',
                'CAD',
                'EUR',
                'GBP',
                'HKD',
                'JPY',
                'SGD',
                'USD'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_KLARNA',
            name: 'Klarna',
            currencies: [
                'USD',
                'EUR',
                'DKK',
                'NOK',
                'SEK',
                'GBP'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_GIROPAY',
            name: 'Giropay',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_MULTIBANCO',
            name: 'Multibanco',
            currencies: [
                'EUR'
            ],
            payment_processor: 'STRIPE_APM'
        },
        {
            id: 'STRIPE_P24',
            name: 'Przelewy24',
            currencies: [
                'EUR',
                'PLN'
            ],
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

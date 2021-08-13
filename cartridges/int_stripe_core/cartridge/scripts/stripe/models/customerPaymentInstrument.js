/* eslint-env es6 */

'use strict';

/**
 * An adapter for Stripe payment instrument data objects, to make then
 * compatible (have the same properties) as dw.order.PaymentInstrumnent.
 *
 * @param {Object} stripePaymentInstrumentData - Payment instrument obejct
 *   received from Stripe service
 * @param {boolean} isDefault - Indicates whether this is the default payment
 *   instrument of the customer
 */
function CustomerPaymentInstrument(stripePaymentInstrumentData, isDefault) {
    const stripeCardData = stripePaymentInstrumentData.card;
    const billingDetails = stripePaymentInstrumentData.billing_details;

    const maskedCardNumber = '************' + stripeCardData.last4;

    var custom = Object.create(null, {
        stripeId: {
            value: stripePaymentInstrumentData.id,
            enumerable: true
        },
        stripeObject: {
            value: stripePaymentInstrumentData.object,
            enumerable: true
        },
        stripeType: {
            value: stripePaymentInstrumentData.type,
            enumerable: true
        },
        stripeCardBrand: {
            value: stripeCardData.brand,
            enumerable: true
        },
        isDefault: {
            value: isDefault || false,
            enumerable: true
        }
    });

    Object.defineProperties(this, {
        UUID: {
            value: stripePaymentInstrumentData.id,
            enumerable: true
        },
        creditCardNumber: {
            value: maskedCardNumber,
            enumerable: true
        },
        maskedCreditCardNumber: {
            value: maskedCardNumber,
            enumerable: true
        },
        permanentlyMasked: {
            value: true,
            enumerable: true
        },
        creditCardType: {
            value: require('../helpers/cardsHelper').getCardTypeByBrand(stripeCardData.brand),
            enumerable: true
        },
        creditCardHolder: {
            value: (billingDetails && billingDetails.name) || ' ',
            enumerable: true
        },
        creditCardExpirationYear: {
            value: stripeCardData.exp_year,
            enumerable: true
        },
        creditCardExpirationMonth: {
            value: stripeCardData.exp_month,
            enumerable: true
        },
        creditCardNumberLastDigits: {
            value: stripeCardData.last4,
            enumerable: true
        },
        custom: {
            value: Object.freeze(custom),
            enumerable: true
        }
    });
}

module.exports = CustomerPaymentInstrument;

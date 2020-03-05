/**
 * Maps Stripe card brand like 'visa' to SFCC card type, exactly as defined in
 * BM > Merchant Tools > Ordering > Payment Methods > Credit/Debit Cards.
 *
 * @param {string} stripeCardBrand - card brand as returned by Stripe APIs
 * @return {string} - SFCC card type
 */
function getCardType(stripeCardBrand) {
    var brandsToCardTypeMap = {
        visa: 'Visa',
        mastercard: 'Master',
        amex: 'Amex',
        discover: 'Discover'
    };

    return brandsToCardTypeMap[stripeCardBrand] || stripeCardBrand;

    // The mapping does not need to be exact, as validatePaymentInstruments has
    // been modified not to check for a match in case card payment are handled by
    // Stripe. So values can be stored as resource strings and the following code
    // can be used instead:
    // return require('dw/web/Resource').msg('cardtype.' + stripeCardBrand, 'stripe', stripeCardBrand);
}

exports.getCardType = getCardType;

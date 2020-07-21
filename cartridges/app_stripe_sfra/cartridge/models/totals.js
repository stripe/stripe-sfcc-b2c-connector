/* global dw */

'use strict';

var base = module.superModule;

/**
 * Accepts a total object and formats the value
 * @param {dw.value.Money} total - Total price of the cart
 * @returns {integer} the formatted money value
 */
function getTotalsValue(total) {
    var currentCurency = dw.util.Currency.getCurrency(total.getCurrencyCode());
    var multiplier = Math.pow(10, currentCurency.getDefaultFractionDigits());

    return !total.available ? 0 : parseInt(total.value * multiplier, 10);
}

/**
 * @constructor
 * @classdesc totals class that represents the order totals of the current line item container
 *
 * @param {dw.order.lineItemContainer} lineItemContainer - The current user's line item container
 */
function totals(lineItemContainer) {
    base.call(this, lineItemContainer);

    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    if (stripeHelper.isStripeEnabled()) {
        if (lineItemContainer) {
            this.grandTotalValue = getTotalsValue(lineItemContainer.totalGrossPrice);
        } else {
            this.grandTotalValue = 0;
        }
    }
}

module.exports = totals;

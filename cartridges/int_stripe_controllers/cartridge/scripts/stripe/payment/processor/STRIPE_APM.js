/* eslint-env es6 */
/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
// v1

'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
const stripeApmHelper = require('*/cartridge/scripts/stripe/helpers/paymentprocessors/stripeApmHelper');

/**
 * Verifies a credit card against a valid card number and expiration date and possibly invalidates invalid form fields.
 * If the verification was successful a credit card payment instrument is created.
 *
 * @param {Object} args - Pipeline dictionary parameters
 * @returns {Object} - Result
 */
function Handle(args) {
    return stripeApmHelper.Handle(args);
}

/**
 * Authorizes a payment using a credit card. The payment is authorized by using the BASIC_CREDIT processor
 * only and setting the order no as the transaction ID. Customizations may use other processors and custom
 * logic to authorize credit card payment.
 *
 * @param {Object} args - Pipeline dictionary parameters
 * @returns {Object} - Result
 */
function Authorize(args) {
    return stripeApmHelper.Authorize(args);
}

exports.Handle = Handle;
exports.Authorize = Authorize;

/* eslint-env es6 */
/* eslint-disable new-cap */
// v1

'use strict';

const stripeCreditHelper = require('*/cartridge/scripts/stripe/helpers/paymentprocessors/stripeCreditHelper');

/**
 * Verifies a credit card against a valid card number and expiration date and possibly invalidates invalid form fields.
 * If the verification was successful a credit card payment instrument is created.
 *
 * @param {Object} args - Pipeline dictionary parameters
 * @returns {Object} - Result
 */
function Handle(args) {
    return stripeCreditHelper.Handle(args);
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
    return stripeCreditHelper.Authorize(args);
}

exports.Handle = Handle;
exports.Authorize = Authorize;

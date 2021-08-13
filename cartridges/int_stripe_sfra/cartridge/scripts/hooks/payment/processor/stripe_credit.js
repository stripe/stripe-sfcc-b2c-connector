/* eslint-env es6 */
/* eslint-disable no-unused-vars */
/* eslint-disable new-cap */
/* global dw */
// v1

'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

var StripeCreditHelper = require('*/cartridge/scripts/stripe/helpers/paymentprocessors/stripeCreditHelper');

/**
 * Creates a token. This should be replaced by utilizing a tokenization provider
 * @returns {string} a token
 */
function createToken() {
    return Math.random().toString(36).substr(2);
}

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var serverErrors = [];

    var result = StripeCreditHelper.Handle({ Basket: basket });
    if (result.errorMessage) {
        serverErrors.push(result.errorMessage);
    }
    return { fieldErrors: [], serverErrors: serverErrors, error: result.error };
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var order = dw.order.OrderMgr.getOrder(orderNumber);

    var result = StripeCreditHelper.Authorize({
        Order: order, OrderNo: orderNumber, PaymentInstrument: paymentInstrument, PaymentProcessor: paymentProcessor
    });

    if (result.errorMessage) {
        serverErrors.push(result.errorMessage);
    }
    return { fieldErrors: [], serverErrors: serverErrors, error: result.error };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
exports.createToken = createToken;

// 'use strict';

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;
    const cardType = require('*/cartridge/scripts/stripe/helpers/cardsHelper').getCardType();

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.value,
        htmlName: paymentForm.paymentMethod.value
    };

    viewData.paymentInformation = {
        cardType: {
            value: cardType,
            htmlName: paymentForm.creditCardFields.cardType.htmlName
        }
    };

    if (req.form.storedPaymentUUID) {
        viewData.storedPaymentUUID = req.form.storedPaymentUUID;
    }

    return {
        error: false,
        viewData: viewData
    };
}

/**
 * Save the credit card information to login account if save card option is selected
 * @param {Object} req - The request object
 * @param {dw.order.Basket} basket - The current basket
 * @param {Object} billingData - payment information
 */
function savePaymentInformation(req, basket, billingData) {

}

exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;

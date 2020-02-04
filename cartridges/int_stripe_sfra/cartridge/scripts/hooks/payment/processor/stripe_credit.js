/* eslint-disable no-unused-vars */
/* eslint-disable new-cap */
// v1

'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');

var StripeCreditHelper = require('int_stripe_core/cartridge/scripts/stripe/helpers/paymentprocessors/stripeCreditHelper');

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

// var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    // var array = require('*/cartridge/scripts/util/array');

    var viewData = viewFormData;
    // var creditCardErrors = {};

    // if (!req.form.storedPaymentUUID) {
    //     // verify credit card form data
    //     creditCardErrors = COHelpers.validateCreditCard(paymentForm);
    // }

    // if (Object.keys(creditCardErrors).length) {
    //     return {
    //         fieldErrors: creditCardErrors,
    //         error: true
    //     };
    // }

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.value,
        htmlName: paymentForm.paymentMethod.value
    };

    // viewData.paymentInformation = {
    //     cardType: {
    //         value: paymentForm.creditCardFields.cardType.value,
    //         htmlName: paymentForm.creditCardFields.cardType.htmlName
    //     },
    //     cardNumber: {
    //         value: paymentForm.creditCardFields.cardNumber.value,
    //         htmlName: paymentForm.creditCardFields.cardNumber.htmlName
    //     },
    //     securityCode: {
    //         value: paymentForm.creditCardFields.securityCode.value,
    //         htmlName: paymentForm.creditCardFields.securityCode.htmlName
    //     },
    //     expirationMonth: {
    //         value: parseInt(
    //             paymentForm.creditCardFields.expirationMonth.selectedOption,
    //             10
    //         ),
    //         htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
    //     },
    //     expirationYear: {
    //         value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
    //         htmlName: paymentForm.creditCardFields.expirationYear.htmlName
    //     }
    // };

    // if (req.form.storedPaymentUUID) {
    //     viewData.storedPaymentUUID = req.form.storedPaymentUUID;
    // }

    // viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;

    // // process payment information
    // if (viewData.storedPaymentUUID
    //     && req.currentCustomer.raw.authenticated
    //     && req.currentCustomer.raw.registered
    // ) {
    //     var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
    //     var paymentInstrument = array.find(paymentInstruments, function (item) {
    //         return viewData.storedPaymentUUID === item.UUID;
    //     });

    //     viewData.paymentInformation.cardNumber.value = paymentInstrument.creditCardNumber;
    //     viewData.paymentInformation.cardType.value = paymentInstrument.creditCardType;
    //     viewData.paymentInformation.securityCode.value = req.form.securityCode;
    //     viewData.paymentInformation.expirationMonth.value = paymentInstrument.creditCardExpirationMonth;
    //     viewData.paymentInformation.expirationYear.value = paymentInstrument.creditCardExpirationYear;
    //     viewData.paymentInformation.creditCardToken = paymentInstrument.raw.creditCardToken;
    // }

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
//     var CustomerMgr = require('dw/customer/CustomerMgr');

    //     if (!billingData.storedPaymentUUID
    //         && req.currentCustomer.raw.authenticated
    //         && req.currentCustomer.raw.registered
    //         && billingData.saveCard
    //         && (billingData.paymentMethod.value === 'CREDIT_CARD')
    //     ) {
    //         var customer = CustomerMgr.getCustomerByCustomerNumber(
    //             req.currentCustomer.profile.customerNo
    //         );

    //         var saveCardResult = COHelpers.savePaymentInstrumentToWallet(
    //             billingData,
    //             basket,
    //             customer
    //         );

//         req.currentCustomer.wallet.paymentInstruments.push({
//             creditCardHolder: saveCardResult.creditCardHolder,
//             maskedCreditCardNumber: saveCardResult.maskedCreditCardNumber,
//             creditCardType: saveCardResult.creditCardType,
//             creditCardExpirationMonth: saveCardResult.creditCardExpirationMonth,
//             creditCardExpirationYear: saveCardResult.creditCardExpirationYear,
//             UUID: saveCardResult.UUID,
//             creditCardNumber: Object.hasOwnProperty.call(
//                 saveCardResult,
//                 'creditCardNumber'
//             )
//                 ? saveCardResult.creditCardNumber
//                 : null,
//             raw: saveCardResult
//         });
//     }
}

exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;


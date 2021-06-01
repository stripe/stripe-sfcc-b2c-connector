/* eslint-env es6 */
/* global request */

'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');

/**
* Handle alternative payment
*
* @param {array} args with paramenters
* @returns {array} - array with result info
*/
function Handle(args) {
    const checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    const paramsMap = request.httpParameterMap;
    const selectedPaymentMethodID = paramsMap.dwfrm_billing_paymentMethods_selectedPaymentMethodID.stringValue || paramsMap.dwfrm_billing_paymentMethod.stringValue;// app.getForm('billing').object.paymentMethods.selectedPaymentMethodID.value;
    const params = {
        sourceId: paramsMap.stripe_source_id.stringValue,
        bankAccountTokenId: paramsMap.stripe_bank_account_token_id.stringValue,
        bankAccountToken: paramsMap.stripe_bank_account_token.stringValue,
        stripeWeChatQRCodeURL: paramsMap.stripe_wechat_qrcode_url.stringValue,
        saveSepaCard: paramsMap.stripe_save_sepa_card.value
    };

    try {
        Transaction.begin();
        checkoutHelper.createStripePaymentInstrument(args.Basket, selectedPaymentMethodID, params);
        Transaction.commit();
        return {
            success: true
        };
    } catch (e) {
        Transaction.rollback();
        return {
            success: false,
            error: true,
            errorMessage: e.message
        };
    }
}

/**
* Authorize alternative payment
*
* @param {array} args with paramenters
* @returns {Object} - object with result info
*/
function Authorize(args) {
    const paymentInstrument = args.PaymentInstrument;
    const paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();

    Transaction.wrap(function () {
        paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
    });

    return {
        authorized: true,
        error: false
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;

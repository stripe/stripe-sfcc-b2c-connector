'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
// var app = require('*/cartridge/scripts/app');

function Handle(args) {
    const checkoutHelper = require('int_stripe_core').getCheckoutHelper();
    const paramsMap = request.httpParameterMap;
    const selectedPaymentMethodID = paramsMap.dwfrm_billing_paymentMethods_selectedPaymentMethodID.stringValue || paramsMap.dwfrm_billing_paymentMethod.stringValue;// app.getForm('billing').object.paymentMethods.selectedPaymentMethodID.value;
    const params = {
        sourceId: paramsMap.stripe_source_id.stringValue
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

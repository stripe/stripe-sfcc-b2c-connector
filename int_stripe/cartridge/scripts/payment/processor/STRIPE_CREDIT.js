'use strict';

/* API Includes */
var Cart = require('app_storefront_controllers/cartridge/scripts/models/CartModel');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var Stripe = require('~/cartridge/scripts/service/stripe');

/* Script Modules */
var app = require('app_storefront_controllers/cartridge/scripts/app');

/**
 * Verifies a credit card against a valid card number and expiration date and possibly invalidates invalid form fields.
 * If the verification was successful a credit card payment instrument is created.
 */
function Handle(args) {
    var cart = Cart.get(args.Basket);
    var creditCardForm = app.getForm('billing.paymentMethods.creditCard');
    var PaymentMgr = require('dw/order/PaymentMgr');

    var cardNumber = creditCardForm.get('number').value();
    var cardSecurityCode = creditCardForm.get('cvn').value();
    var cardType = creditCardForm.get('type').value();
    var expirationMonth = creditCardForm.get('expiration.month').value();
    var expirationYear = creditCardForm.get('expiration.year').value();
    var paymentCard = PaymentMgr.getPaymentCard(cardType);
    var stripeToken = request.httpParameterMap.get('stripeToken').value;
    var stripeCardID = request.httpParameterMap.get('stripeCardID').value;

    Transaction.wrap(function () {
        cart.removeExistingPaymentInstruments(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);
        var paymentInstrument = cart.createPaymentInstrument(dw.order.PaymentInstrument.METHOD_CREDIT_CARD, cart.getNonGiftCertificateAmount());

        paymentInstrument.creditCardHolder = creditCardForm.get('owner').value();
        paymentInstrument.creditCardNumber = cardNumber;
        paymentInstrument.creditCardType = cardType;
        paymentInstrument.creditCardExpirationMonth = expirationMonth;
        paymentInstrument.creditCardExpirationYear = expirationYear;
        if (!empty(stripeToken)) {
        	 paymentInstrument.creditCardToken = stripeToken;
        } else if (!empty(stripeCardID)) {
        	paymentInstrument.custom.stripeCardID = stripeCardID;
        }
    });

    return {success: true};
}

/**
 * Authorizes a payment using a credit card. The payment is authorized by using the BASIC_CREDIT processor
 * only and setting the order no as the transaction ID. Customizations may use other processors and custom
 * logic to authorize credit card payment.
 */
function Authorize(args) {
    var orderNo = args.OrderNo;
    var paymentInstrument = args.PaymentInstrument;
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
    
    var params = {
    		Order: args.Order,
    		PaymentInstrument: paymentInstrument
    };

    var result = Stripe.AuthorizePayment(params);
    
    if (result === PIPELET_ERROR) {
    	return {error: true};
    }
    
    Transaction.wrap(function () {
        paymentInstrument.paymentTransaction.transactionID = result.transactionID;
        paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
    });

    return {authorized: true};
}

/*
 * Module exports
 */

/*
 * Local methods
 */
exports.Handle = Handle;
exports.Authorize = Authorize;

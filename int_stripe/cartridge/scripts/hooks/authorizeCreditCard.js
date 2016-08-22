'use strict';

var Logger = require('dw/system/Logger');
var System = require('dw/system');
var dworder = require('dw/order');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var PaymentMgr = require('dw/order/PaymentMgr');

var Stripe = require('~/cartridge/scripts/service/stripe');


 
exports.authorizeCreditCard = function (order : dworder.Order, paymentDetails : dworder.OrderPaymentInstrument, cvn : String) : Status {
    Logger.debug("@@@@@ authorizeCreditCard order =" + order + " paymentinstrument =" + paymentinstrument);

    var params = {
    		Order: order,
    		PaymentInstrument: paymentinstrument
    };

    var orderNo = order.OrderNo;
    var paymentInstrument = paymentinstrument;
    var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();

    if (System.Site.getCurrent().getCustomPreferenceValue('stripeRELAYProcessAuthorization')) {
        var result = Stripe.AuthorizePayment(params);
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.transactionID = result.transactionID;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
        });
    } else {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.transactionID = orderNo;
            paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
        });
		
	} 

    return new Status(Status.OK);
}
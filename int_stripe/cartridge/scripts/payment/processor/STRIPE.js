'use strict';

/* API Includes */
var Cart = require('app_storefront_controllers/cartridge/scripts/models/CartModel');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');

/* Script Modules */
var app = require('app_storefront_controllers/cartridge/scripts/app');
var Stripe = require('~/cartridge/scripts/service/stripe');

/**
 * Verifies a credit card against a valid card number and expiration date and possibly invalidates invalid form fields.
 * If the verification was successful a credit card payment instrument is created.
 */
function Handle(args) {
	var req = request;
	var ses = session;
    var cart = Cart.get(args.Basket);

    Transaction.wrap(function () {
        cart.removeExistingPaymentInstruments('STRIPE_APM_METHODS');
        cart.removeExistingPaymentInstruments(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);
		
		var paymentInstrument = cart.createPaymentInstrument('STRIPE_APM_METHODS', cart.getNonGiftCertificateAmount());
		
		if (!empty(request.httpParameterMap.stripeJsonData)) {
			paymentInstrument.paymentTransaction.custom.stripeJsonData = request.httpParameterMap.stripeJsonData;
		}
        if (!empty(request.httpParameterMap.stripeSourceId)) {
        	paymentInstrument.paymentTransaction.custom.stripeSourceId = request.httpParameterMap.stripeSourceId.stringValue;
        }

        if (!empty(request.httpParameterMap.stripeClientSecret)) {
        	paymentInstrument.paymentTransaction.custom.stripeClientSecret = request.httpParameterMap.stripeClientSecret.stringValue;
        }
        if (request.httpParameterMap.isParameterSubmitted('selectedSource') && request.httpParameterMap.selectedSource != 'newSource') {
            if (!empty(request.httpParameterMap.stripeSourceId)) {
               	paymentInstrument.paymentTransaction.custom.stripeSourceId = request.httpParameterMap.selectedSource.stringValue;
               	paymentInstrument.paymentTransaction.custom.stripeSourceCanCharge = true;
            }
        }
        
        if (request.httpParameterMap.isParameterSubmitted('stripeOrderNumber') && !empty(request.httpParameterMap.stripeOrderNumber.value)) {
        	paymentInstrument.paymentTransaction.custom.stripeOrderNumber = request.httpParameterMap.stripeOrderNumber.stringValue;
        }
    });
    
    if (request.httpParameterMap.isParameterSubmitted('stripeSaveSource') && request.httpParameterMap.stripeSaveSource.value && !empty(request.httpParameterMap.stripeSourceId)) {
    	var customerEmail : String = '';
    	if (!empty(cart.object.customerEmail)) {
    		customerEmail = cart.object.customerEmail;
    	} else if (customer.authenticated) {
    		customerEmail = customer.profile.email;
    	}
        var params = {
        		StripeToken: request.httpParameterMap.stripeSourceId,
        		CustomerEmail : customerEmail
        };
    	Stripe.AddCard(params)
    }
    
    return {success: true};
}

/**
 * Authorizes a payment using a credit card. The payment is authorized by using the BASIC_CREDIT processor
 * only and setting the order no as the transaction ID. Customizations may use other processors and custom
 * logic to authorize credit card payment.
 */
function Authorize(args) {
	var paymentInstrument = args.PaymentInstrument;
    var amount : Number = paymentInstrument.paymentTransaction.getAmount().getValue();
	var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
	var currentCustomer = customer;
	var params = {};
	var stripeCusId = '';

	if (!empty(currentCustomer) && currentCustomer.authenticated && 'stripeCustomerID' in currentCustomer.profile.custom && !empty(currentCustomer.profile.custom.stripeCustomerID)) {
		stripeCusId = currentCustomer.profile.custom.stripeCustomerID;
	}
	if ('stripeSourceCanCharge' in paymentInstrument.paymentTransaction.custom && paymentInstrument.paymentTransaction.custom.stripeSourceCanCharge === true) {
    	params = {
    		amount : dw.util.StringUtils.formatNumber(amount * 100, '0'),
    		currency : paymentInstrument.getPaymentTransaction().getAmount().currencyCode,
    		stripeSourceId : paymentInstrument.paymentTransaction.custom.stripeSourceId,
    		email : args.Order.getCustomerEmail(),
    		stripeCustomerId : stripeCusId,
    		orderId : args.OrderNo
    	};
    	var result = Stripe.CreateCharge(params);
        if (result.isOk()) {
            Transaction.wrap(function () {
                paymentInstrument.paymentTransaction.transactionID = args.OrderNo;
                paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
                //paymentInstrument.paymentTransaction.custom.stripeJsonData = request.httpParameterMap.stripeJsonData;
            });
            return {authorized: true};
        } else {
            return	{
            	error : true,
            	errormessage : dw.web.Resource.msg('stripe.source.nochargeable', 'checkout', null) 
            };
        }

    }
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

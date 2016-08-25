'use strict';

var Logger = require('dw/system/Logger');
var System = require('dw/system');
var dworder = require('dw/order');
var Status = require('dw/system/Status');

exports.afterPostPaymentInstrument = function (basket : dworder.Basket , paymentInstrument : BasketPaymentInstrumentRequest ) : Status {
 
	//Post payment authorization processing custom code goes here

    return new Status(Status.OK);
}
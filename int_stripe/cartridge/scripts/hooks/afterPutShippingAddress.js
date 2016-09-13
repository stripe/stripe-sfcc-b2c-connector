'use strict';

var Logger = require('dw/system/Logger');
var System = require('dw/system');
var dworder = require('dw/order');
var Status = require('dw/system/Status');

exports.afterSetShippingAddress = function (basket) : Status {
 
	//Process custom tax calculations custom code goes here

    return new Status(Status.OK);
}
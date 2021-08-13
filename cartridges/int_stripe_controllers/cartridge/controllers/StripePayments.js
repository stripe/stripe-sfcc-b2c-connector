/* eslint-disable new-cap */
/* global response, request */
// v1

'use strict';

var URLUtils = require('dw/web/URLUtils');
var stripePaymentsHelper = require('*/cartridge/scripts/stripe/helpers/controllers/stripePaymentsHelper');
var CSRFProtection = require('dw/web/CSRFProtection');
var app = require('*/cartridge/scripts/app');

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 */
function beforePaymentAuthorization() {
    var responsePayload;
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        responsePayload = {
            redirectUrl: URLUtils.url('Home-Show').toString()
        };
        response.setStatus(500);
    } else {
        responsePayload = stripePaymentsHelper.BeforePaymentAuthorization();
    }

    var jsonResponse = JSON.stringify(responsePayload);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.BeforePaymentAuthorization = beforePaymentAuthorization;
exports.BeforePaymentAuthorization.public = true;

/**
 * An entry point to handle returns from alternative payment methods.
 */
function handleAPM() {
    var redirectUrl = stripePaymentsHelper.HandleAPM();

    response.redirect(redirectUrl);
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

/**
 * Entry point for creating payment intent for APMs.
 */
function beforePaymentSubmit() {
    var responsePayload;
    if (!CSRFProtection.validateRequest()) {
        app.getModel('Customer').logout();
        responsePayload = {
            redirectUrl: URLUtils.url('Home-Show').toString()
        };
        response.setStatus(500);
    } else {
        var type = request.httpParameterMap.type.stringValue;
        var params = {};
        if (request.httpParameterMap.saveSepaCard && request.httpParameterMap.saveSepaCard.value) {
            params.saveSepaCard = true;
        }
        if (request.httpParameterMap.savedSepaDebitCardId && request.httpParameterMap.savedSepaDebitCardId.value) {
            params.savedSepaDebitCardId = request.httpParameterMap.savedSepaDebitCardId.value;
        }
        responsePayload = stripePaymentsHelper.BeforePaymentSubmit(type, params);
    }

    var jsonResponse = JSON.stringify(responsePayload);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
}

exports.BeforePaymentSubmit = beforePaymentSubmit;
exports.BeforePaymentSubmit.public = true;

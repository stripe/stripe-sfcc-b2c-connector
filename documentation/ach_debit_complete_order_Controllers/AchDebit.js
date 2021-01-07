'use strict';

/* API Includes */
var Resource = require('dw/web/Resource');
var OrderMgr = require('dw/order/OrderMgr');

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');

function completeOrder() {
    app.getView().render('ach-debit-complete-form');
}

function verifyAndCharge() {
    var orderNumber = app.getForm('achdebitcomplete.ordernumber').value();
    var firstAmount = app.getForm('achdebitcomplete.firstamount').value();
    var secondAmount = app.getForm('achdebitcomplete.secondamount').value();
    
    // verify Order Number
    if (empty(orderNumber)) {
        app.getView({result: Resource.msg('ach.completeorder.enterordernumber', 'stripe', null)})
            .render('ach-debit-complete-form');
        return;
    }

    // verify first Amount
    if (empty(firstAmount)) {
        app.getView({result: Resource.msg('ach.completeorder.enterfirstamount', 'stripe', null)})
            .render('ach-debit-complete-form');
        return;
    }

    // verify second Amount
    if (empty(secondAmount)) {
        app.getView({result: Resource.msg('ach.completeorder.entersecondamount', 'stripe', null)})
            .render('ach-debit-complete-form');
        return;
    }

    // get ACH Debit order
    var order = OrderMgr.getOrder(orderNumber);
    if (empty(order)) {
        app.getView({result: Resource.msg('ach.completeorder.invalidorder', 'stripe', null)})
            .render('ach-debit-complete-form');
        return;
    }

    var stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

    try {
        
        // verify bank account
        stripeCheckoutHelper.VerifyBankAccountAndCreateAchCharge(order, firstAmount, secondAmount);
        
    } catch (e) {
        app.getView({result: Resource.msg('ach.completeorder.error', 'stripe', null) + ': ' + e.message})
            .render('ach-debit-complete-form');
        return;
    }

    // Success
    app.getView({result: Resource.msgf('ach.completeorder.success', 'stripe', null, firstAmount, secondAmount, orderNumber)})
        .render('ach-debit-complete-form');
}

/** Renders Complete ACH Debit form */
exports.CompleteOrder = guard.ensure(['get', 'https'], completeOrder);
exports.VerifyAndCharge = guard.ensure(['post', 'https'], verifyAndCharge);


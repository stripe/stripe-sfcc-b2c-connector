/* global empty */

'use strict';

var server = require('server');

server.get('CompleteOrder', server.middleware.https, function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');

    res.render('ach-debit-complete-form.isml', {
        actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString()
    });

    next();
});

server.post('VerifyAndCharge', server.middleware.https, function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var OrderMgr = require('dw/order/OrderMgr');
    var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

    var achDebitForm = req.form;
    var orderNumber = achDebitForm.orderNumber;
    var firstAmount = achDebitForm.firstAmount;
    var secondAmount = achDebitForm.secondAmount;

    // verify Order Number
    if (empty(orderNumber)) {
        res.render('ach-debit-complete-form.isml', {
            actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
            result: Resource.msg('ach.completeorder.enterordernumber', 'stripe', null)
        });

        return next();
    }

    // verify first Amount
    if (empty(firstAmount)) {
        res.render('ach-debit-complete-form.isml', {
            actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
            result: Resource.msg('ach.completeorder.enterfirstamount', 'stripe', null)
        });

        return next();
    }

    // verify second Amount
    if (empty(secondAmount)) {
        res.render('ach-debit-complete-form.isml', {
            actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
            result: Resource.msg('ach.completeorder.entersecondamount', 'stripe', null)
        });

        return next();
    }

    // get ACH Debit order
    var order = OrderMgr.getOrder(orderNumber);
    if (empty(order)) {
        res.render('ach-debit-complete-form.isml', {
            actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
            result: Resource.msg('ach.completeorder.invalidorder', 'stripe', null)
        });

        return next();
    }

    try {
        // verify bank account
        checkoutHelper.VerifyBankAccountAndCreateAchCharge(order, firstAmount, secondAmount);
    } catch (e) {
        res.render('ach-debit-complete-form.isml', {
            actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
            result: Resource.msg('ach.completeorder.error', 'stripe', null) + ': ' + e.message
        });

        return next();
    }

    // Success
    res.render('ach-debit-complete-form.isml', {
        actionUrl: URLUtils.url('AchDebit-VerifyAndCharge').toString(),
        result: Resource.msgf('ach.completeorder.success', 'stripe', null, firstAmount, secondAmount, orderNumber)
    });

    return next();
});

module.exports = server.exports();

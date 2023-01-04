/* eslint-env es6 */
/* global session, dw */

'use strict';

var server = require('server');

server.get('GetShippingOptions', function (req, res, next) {
    res.json({ shippingOptions: require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getShippingOptions() });
    next();
});

server.post('WebHook', function (req, res, next) {
    const webhooksHelper = require('*/cartridge/scripts/stripe/helpers/webhooksHelper');
    var success = webhooksHelper.processIncomingNotification();

    res.setStatusCode(success ? 200 : 500);
    res.json({
        success: !!success
    });
    next();
});

server.get('PaymentElementOrderPlaced', function (req, res, next) {
    res.render('checkout/paymentelementorderplaced.isml', {});
    next();
});

server.get('CardOrderPlaced', function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Order = require('dw/order/Order');
    var stripeCheckoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var Transaction = require('dw/system/Transaction');
    var Status = require('dw/system/Status');

    if (!session || !session.privacy || !session.privacy.stripeOrderNumber) {
        res.json({
            success: false
        });
        return next();
    }

    var order = OrderMgr.getOrder(session.privacy.stripeOrderNumber);
    if (!order) {
        res.json({
            success: false
        });
        return next();
    }

    var isAPMOrder = stripeCheckoutHelper.isAPMOrder(order);
    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    if (!isAPMOrder) {
        try {
            Transaction.wrap(function () {
                var placeOrderStatus = OrderMgr.placeOrder(order);
                if (placeOrderStatus === Status.ERROR) {
                    throw new Error();
                }

                order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                order.setExportStatus(Order.EXPORT_STATUS_READY);

                if (stripeChargeCapture) {
                    order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                }
            });
        } catch (e) {
            res.json({
                success: false
            });
            return next();
        }

        COHelpers.sendConfirmationEmail(order, req.locale.id);
    }

    res.json({
        success: true
    });
    return next();
});

module.exports = server.exports();

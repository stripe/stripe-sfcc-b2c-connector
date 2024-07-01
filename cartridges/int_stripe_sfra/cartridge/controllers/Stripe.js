/* eslint-env es6 */

'use strict';

var server = require('server');

server.get('GetShippingOptions', function (req, res, next) {
    res.json(require('*/cartridge/scripts/stripe/helpers/checkoutHelper').getShippingOptionsSFRA(req.querystring));
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

module.exports = server.exports();

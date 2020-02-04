'use strict';

var server = require('server');

server.get('GetShippingOptions', function (req, res, next) {
    res.json({ shippingOptions: require('int_stripe_core').getCheckoutHelper().getShippingOptions() });
    next();
});

server.post('WebHook', function (req, res, next) {
    const webhooksHelper = require('int_stripe_core').getWebhooksHelper();
    var success = webhooksHelper.processIncomingNotification();

    res.setStatusCode(success ? 200 : 500);
    res.json({
        success: !!success
    });
    next();
});

module.exports = server.exports();

/* eslint-env es6 */

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

module.exports = server.exports();

'use strict';

var server = require('server');
var page = module.superModule;
server.extend(page);

server.append('List', function (req, res, next) {
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    var wallet = stripeHelper.getStripeWallet(customer);
    var paymentInstruments = wallet.getPaymentInstruments();
    res.setViewData({ paymentInstruments: paymentInstruments });
    next();
});

server.replace('DeletePayment', function (req, res, next) {
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    var wallet = stripeHelper.getStripeWallet(customer);
    var UUID = req.querystring.UUID;
    wallet.removePaymentInstrument({ custom: { stripeId: UUID } });

    res.json({ UUID: UUID });
    next();
});

module.exports = server.exports();

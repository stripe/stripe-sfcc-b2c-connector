/* global customer */

'use strict';

var server = require('server');
var page = module.superModule;
server.extend(page);

var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');

server.append('List', function (req, res, next) {
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    if (stripeHelper.isStripeEnabled()) {
        var wallet = stripeHelper.getStripeWallet(customer);
        var paymentInstruments = wallet.getPaymentInstruments();
        res.setViewData({
            paymentInstruments: paymentInstruments,
            noSavedPayments: paymentInstruments.length === 0
        });
    }
    next();
});

server.prepend('DeletePayment', userLoggedIn.validateLoggedInAjax, function (req, res, next) {
    var array = require('*/cartridge/scripts/util/array');
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    var wallet = stripeHelper.getStripeWallet(customer);

    if (!stripeHelper.isStripeEnabled()) {
        return next();
    }

    var data = res.getViewData();
    if (data && !data.loggedin) {
        res.json();
        this.emit('route:Complete', req, res);
        return null;
    }

    var UUID = req.querystring.UUID;
    var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
    var paymentToDelete = array.find(paymentInstruments, function (item) {
        return UUID === item.UUID;
    });

    // Trigger SFRA payment delete if we receive actual payment instrument ID
    if (paymentToDelete) {
        return next();
    }

    wallet.removePaymentInstrument({ custom: { stripeId: UUID } });

    res.json({ UUID: UUID });
    this.emit('route:Complete', req, res);
    return null;
});

module.exports = server.exports();

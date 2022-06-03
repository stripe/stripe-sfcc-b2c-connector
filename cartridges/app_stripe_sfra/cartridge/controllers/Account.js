/* global customer, request */

'use strict';

var server = require('server');
var page = module.superModule;
server.extend(page);

server.append('Show', function (req, res, next) {
    var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
    if (stripeHelper.isStripeEnabled()) {
        var wallet = stripeHelper.getStripeWallet(customer);
        var paymentInstruments = wallet.getPaymentInstruments();
        var viewData = res.getViewData();
        if (paymentInstruments && paymentInstruments.length > 0) {
            viewData.payment = paymentInstruments[0];
        }

        res.setViewData(viewData);
    }
    next();
});

server.post('UpdateBillingAddress', function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Transaction = require('dw/system/Transaction');
    var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');

    var customer = CustomerMgr.getCustomerByCustomerNumber(
        req.currentCustomer.profile.customerNo
    );
    var addressBook = customer.getProfile().getAddressBook();
    if (customer.authenticated) {
        var params = request.httpParameterMap;
        var newAddress = JSON.parse(params.requestBodyAsString);
        Transaction.wrap(function () {
            var address = null;
            address = newAddress.addressId
                ? addressBook.getAddress(newAddress.addressId)
                : null;

            if (address) {
                if (newAddress.addressId) {
                    address.setID(newAddress.addressId);
                }

                // Save form's address
                addressHelpers.updateAddressFields(address, newAddress);

                res.json({
                    success: true
                });
            } else {
                res.json({
                    success: false
                });
            }
        });
    } else {
        res.json({
            success: false
        });
    }
    return next();
});

module.exports = server.exports();

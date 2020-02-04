'use strict';

exports.getStripeService = function () {
    const stripeService = require('~/cartridge/scripts/stripe/services/stripeService');

    return stripeService;
};

exports.getStripeHelper = function () {
    const stripeHelper = require('~/cartridge/scripts/stripe/helpers/stripeHelper');

    return stripeHelper;
};

exports.getCheckoutHelper = function () {
    const checkoutHelper = require('~/cartridge/scripts/stripe/helpers/checkoutHelper');

    return checkoutHelper;
};

exports.getCardsHelper = function () {
    const cardsHelper = require('~/cartridge/scripts/stripe/helpers/cardsHelper');

    return cardsHelper;
};

exports.getWebhooksHelper = function () {
    const webhooksHelper = require('~/cartridge/scripts/stripe/helpers/webhooksHelper');

    return webhooksHelper;
};

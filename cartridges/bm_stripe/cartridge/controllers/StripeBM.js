/* eslint-env es6 */
/* eslint-disable no-plusplus */
/* eslint-disable no-useless-concat */

'use strict';

var server = require('server');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');

var URLUtils = require('dw/web/URLUtils');
var URLAction = require('dw/web/URLAction');
var HTTPClient = require('dw/net/HTTPClient');

var StringWriter = require('dw/io/StringWriter');
var XMLStreamWriter = require('dw/io/XMLStreamWriter');

const OrderMgr = require('dw/order/OrderMgr');
const Resource = require('dw/web/Resource');

/**
 * Get Site object by site ID
 *
 * @param {string} siteID id of site to check
 * @return {Object} Site object
 */
function getSite(siteID) {
    var sites = Site.getAllSites();

    for (var i = 0; i < sites.length; i++) {
        var site = sites[i];
        if (siteID === site.getID()) {
            return site;
        }
    }

    return null;
}

/**
 * Check if site is SFRA
 *
 * @param {string} siteID id of site to check
 * @return {boolean} true if site is SFRA
 */
function isSiteSFRA(siteID) {
    var urlAction = new URLAction('CSRF-Generate', siteID);
    var url = URLUtils.abs(false, urlAction).toString();

    var httpClient = new HTTPClient();

    httpClient.open('GET', url);
    httpClient.setTimeout(3000);
    httpClient.send();

    return (httpClient.statusCode === 500);
}

server.get('QuickSetup', function (req, res, next) {
    res.render('/stripebm/quicksetup');
    next();
});

server.post('HandleStripeQuickSetup', function (req, res, next) {
    var siteIDs = req.form.stripe_site_ids.split(',');
    var stripePrivateKey = req.form.stripe_private_key;
    var stripePublicKey = req.form.stripe_public_key;

    const stripeBMService = require('*/cartridge/scripts/services/stripeBMService');

    var resultOutput = '';

    for (var siteIndex = 0; siteIndex < siteIDs.length; siteIndex++) {
        var siteID = siteIDs[siteIndex];

        try {
            var site = getSite(siteID);

            resultOutput = resultOutput.concat('<br><br>' + site.getName() + '(' + siteID + ')' + '<br>');

            // check if site is SFRA
            var isSFRA = isSiteSFRA(siteID);

            // get country code
            var stripeAccount = stripeBMService.account.get(stripePrivateKey);
            var countryCode = stripeAccount.country;

            // Get site web hook URL
            var urlAction = new URLAction('Stripe-WebHook', siteID);
            var url = URLUtils.abs(false, urlAction);
            var webHookURL = url.abs().toString();

            // Check if site web hook URL already exist on Stripe and if yes delete it before re-create
            var allWebhooks = stripeBMService.webhooks.list_all(stripePrivateKey);
            for (var i = 0; i < allWebhooks.data.length; i++) {
                var webHookData = allWebhooks.data[i];

                if (webHookData.url.toLowerCase() === webHookURL.toLowerCase()) {
                    stripeBMService.webhooks.delete(webHookData.id, stripePrivateKey);
                    resultOutput = resultOutput.concat('<br>Webhook ' + webHookData.url + ' found on Stripe. Deleted and Re-created');
                }
            }

            // Create new webhook on Stripe side
            var enabledEvents = ['review.opened',
                'review.closed',
                'charge.succeeded',
                'charge.failed',
                'source.canceled',
                'source.failed',
                'source.chargeable',
                'charge.refunded',
                'payment_intent.succeeded',
                'payment_intent.payment_failed'];

            var webHookCreateResult = stripeBMService.webhooks.create(webHookURL, enabledEvents, stripePrivateKey);
            var webHookSecretKey = webHookCreateResult.secret;

            resultOutput = resultOutput.concat('<br>WebHook URL = ' + webHookURL);

            // Store Stripe config values in Site Preferences
            // eslint-disable-next-line no-loop-func
            Transaction.wrap(function () {
                site.setCustomPreferenceValue('stripeEnabled', true);
                site.setCustomPreferenceValue('stripePublicKey', stripePublicKey);
                site.setCustomPreferenceValue('stripeApiKey', stripePrivateKey);
                site.setCustomPreferenceValue('stripeWebhookSigningSecret', webHookSecretKey);
                site.setCustomPreferenceValue('stripeAllowedWebHookStatuses', enabledEvents);
                site.setCustomPreferenceValue('stripeIsSFRA', isSFRA);
                site.setCustomPreferenceValue('stripeAccountCountryCode', countryCode);
            });

            resultOutput = resultOutput.concat('<br>Updated: stripeEnabled = ' + true);
            resultOutput = resultOutput.concat('<br>Updated: stripePublicKey = ' + stripePublicKey);
            resultOutput = resultOutput.concat('<br>Updated: stripeApiKey = ' + stripePrivateKey);
            resultOutput = resultOutput.concat('<br>Updated: stripeWebhookSigningSecret = ' + webHookSecretKey);
            resultOutput = resultOutput.concat('<br>Updated: stripeAllowedWebHookStatuses = ' + enabledEvents);
            resultOutput = resultOutput.concat('<br>Updated: stripeIsSFRA = ' + isSFRA);
            resultOutput = resultOutput.concat('<br>Updated: stripeAccountCountryCode = ' + countryCode);
        } catch (e) {
            res.json({
                error: true,
                message: e.message
            });

            return next();
        }
    }

    resultOutput = resultOutput.concat('<br><br>SUCCESS');
    res.json({
        error: false,
        message: resultOutput
    });

    return next();
});

server.get('PaymentsSetup', function (req, res, next) {
    res.render('/stripebm/paymentssetup');
    next();
});

server.post('HandlePaymentsSetup', function (req, res, next) {
    var stripeBmHelper = require('~/cartridge/scripts/helpers/stripeBmHelper');

    try {
        var stringWriter = new StringWriter();
        var xmlWriter = new XMLStreamWriter(stringWriter);
        xmlWriter.writeStartElement('payment-settings');
        xmlWriter.writeAttribute('xmlns', 'http://www.demandware.com/xml/impex/paymentsettings/2009-09-15');

        var stripePaymentMethodDefinitions = stripeBmHelper.getStripePaymentMethodDefinitions();
        for (var i = 0; i < stripePaymentMethodDefinitions.length; i++) {
            var stripePaymentMethodDefinition = stripePaymentMethodDefinitions[i];
            var isPaymentMethodEnabled = !!req.form[stripePaymentMethodDefinition.id];

            stripeBmHelper.writePaymentMethod(xmlWriter, stripePaymentMethodDefinition, isPaymentMethodEnabled);
        }
        xmlWriter.writeEndElement();

        xmlWriter.close();

        res.json({
            error: false,
            message: '',
            content: stringWriter.toString()
        });

        return next();
    } catch (e) {
        res.json({
            error: true,
            message: e.message
        });

        return next();
    }
});

server.get('PaymentsRefund', function (req, res, next) {
    res.render('/stripebm/paymentsrefund');
    next();
});

server.post('HandlePaymentsRefund', function (req, res, next) {
    const orderNumber = req.form.stripe_order_number;
    const amountToRefund = req.form.stripe_amount_to_refund;

    const stripeBMService = require('*/cartridge/scripts/services/stripeBMService');
    const stripeBmHelper = require('~/cartridge/scripts/helpers/stripeBmHelper');

    const apiKey = stripeBmHelper.getApiKey();

    try {
        const order = OrderMgr.getOrder(orderNumber);
        if (!order) {
            res.json({
                error: true,
                message: Resource.msgf('paymentsrefund.ordernotfound', 'stripebm', null, orderNumber)
            });
            return next();
        }

        const amount = (amountToRefund * 100);

        /*
         * check if stripePaymentIntentID is Not empty then refund by payment_intent
         */
        if (order.custom.stripePaymentIntentID) {
            var refundResult = stripeBMService.refunds.createByPaymentItent(amount, order.custom.stripePaymentIntentID, apiKey);

            if (refundResult.status && refundResult.status === 'succeeded') {
                res.json({
                    error: false,
                    message: Resource.msg('paymentsrefund.refundsucceeded', 'stripebm', null)
                });
            } else if (refundResult.status && refundResult.status === 'pending') {
                res.json({
                    error: false,
                    message: Resource.msg('paymentsrefund.refundpending', 'stripebm', null)
                });
            } else {
                res.json({
                    error: true,
                    message: JSON.stringify(refundResult)
                });
            }

            return next();
        }

        /*
         * search for stripeChargeID in Payment Instruments and try to refund with it
         */
        var paymentInstruments = order.getPaymentInstruments();
        for (var i = 0; i < paymentInstruments.length; i++) {
            var paymentInstrument = paymentInstruments[i];

            if (paymentInstrument && paymentInstrument.custom.stripeChargeID) {
                var refundChargeResult = stripeBMService.refunds.createByCharge(amount, paymentInstrument.custom.stripeChargeID, apiKey);

                if (refundChargeResult.status && refundChargeResult.status === 'succeeded') {
                    res.json({
                        error: false,
                        message: Resource.msg('paymentsrefund.refundsucceeded', 'stripebm', null)
                    });
                } else if (refundChargeResult.status && refundChargeResult.status === 'pending') {
                    res.json({
                        error: false,
                        message: Resource.msg('paymentsrefund.refundpending', 'stripebm', null)
                    });
                } else {
                    res.json({
                        error: true,
                        message: JSON.stringify(refundChargeResult)
                    });
                }
                return next();
            }
        }

        res.json({
            error: true,
            message: Resource.msg('paymentsrefund.cannotrefundorder', 'stripebm', null)
        });

        return next();
    } catch (e) {
        res.json({
            error: true,
            message: e.message
        });

        return next();
    }
});


server.get('PaymentsCapture', function (req, res, next) {
    res.render('/stripebm/paymentscapture');
    next();
});

server.post('HandlePaymentsCapture', function (req, res, next) {
    const orderNumber = req.form.stripe_order_number;
    const amountToCapture = req.form.stripe_amount_to_capture;

    const stripeBMService = require('*/cartridge/scripts/services/stripeBMService');
    const stripeBmHelper = require('~/cartridge/scripts/helpers/stripeBmHelper');

    const apiKey = stripeBmHelper.getApiKey();

    try {
        const order = OrderMgr.getOrder(orderNumber);
        if (!order) {
            res.json({
                error: true,
                message: Resource.msgf('paymentcapture.ordernotfound', 'stripebm', null, orderNumber)
            });
            return next();
        }

        const amount = (amountToCapture * 100);

        /*
         * check if stripePaymentIntentID is Not empty then refund by payment_intent
         */
        if (order.custom.stripePaymentIntentID) {
            var captureResult = stripeBMService.captures.captureByPaymentIntent(amount, order.custom.stripePaymentIntentID, apiKey);

            if (captureResult.status && captureResult.status === 'succeeded') {
                res.json({
                    error: false,
                    message: Resource.msg('paymentscapture.capturesucceeded', 'stripebm', null)
                });
            } else if (captureResult.status && captureResult.status === 'pending') {
                res.json({
                    error: false,
                    message: Resource.msg('paymentscapture.capturepending', 'stripebm', null)
                });
            } else {
                res.json({
                    error: true,
                    message: JSON.stringify(captureResult)
                });
            }

            return next();
        }

        /*
         * search for stripeChargeID in Payment Instruments and try to refund with it
         */
        var paymentInstruments = order.getPaymentInstruments();
        for (var i = 0; i < paymentInstruments.length; i++) {
            var paymentInstrument = paymentInstruments[i];

            if (paymentInstrument && paymentInstrument.custom.stripeChargeID) {
                var captureChargeResult = stripeBMService.captures.captureByCharge(amount, paymentInstrument.custom.stripeChargeID, apiKey);

                if (captureChargeResult.status && captureChargeResult.status === 'succeeded') {
                    res.json({
                        error: false,
                        message: Resource.msg('paymentscapture.capturesucceeded', 'stripebm', null)
                    });
                } else if (captureChargeResult.status && captureChargeResult.status === 'pending') {
                    res.json({
                        error: false,
                        message: Resource.msg('paymentscapture.capturepending', 'stripebm', null)
                    });
                } else {
                    res.json({
                        error: true,
                        message: JSON.stringify(captureChargeResult)
                    });
                }
                return next();
            }
        }

        res.json({
            error: true,
            message: Resource.msg('paymentscharge.cannotchargeorder', 'stripebm', null)
        });

        return next();
    } catch (e) {
        res.json({
            error: true,
            message: e.message
        });

        return next();
    }
});

module.exports = server.exports();

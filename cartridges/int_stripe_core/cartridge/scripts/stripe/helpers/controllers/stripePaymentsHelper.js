/* eslint-env es6 */
/* global request, dw, empty, customer */

'use strict';

/**
 * Created a response payload for beforePaymentAuthorization based on the status
 * of a given payment intent.
 *
 * @param {Object} intent - PaymentIntent object
 * @return {Object} - Response payload to return to client
 */
function generateCardsPaymentResponse(intent) {
    const stripeChargeCapture = dw.system.Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');
    var responsePayload;
    if (intent.status === 'requires_capture' && !stripeChargeCapture) {
        // The payment requires capture which will be made later
        responsePayload = {
            success: true
        };
    } else if (
        (intent.status === 'requires_action' || intent.status === 'requires_source_action')
        && intent.next_action.type === 'use_stripe_sdk'
    ) {
        // Tell the client to handle the action
        responsePayload = {
            requires_action: true,
            payment_intent_client_secret: intent.client_secret
        };
    } else if (intent.status === 'succeeded') {
        // The payment didn’t need any additional actions and completed!
        // Handle post-payment fulfilment
        responsePayload = {
            success: true
        };
    } else {
        // Invalid status
        responsePayload = {
            error: 'Invalid PaymentIntent status'
        };
    }

    return responsePayload;
}

/**
 * Entry point for handling payment intent creation and confirmation AJAX calls.
 * @return {Object} responsePayload.
 */
function beforePaymentAuthorization() {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');
    var PaymentTransaction = require('dw/order/PaymentTransaction');
    var responsePayload;

    try {
        var basket = BasketMgr.getCurrentBasket();
        if (basket) {
            var checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');

            var stripePaymentInstrument = checkoutHelper.getStripePaymentInstrument(basket);

            /*
             * Check if we have a zero order i.e. after full gift certificate redemption
             */
            if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction
                && stripePaymentInstrument.paymentTransaction.amount
                && stripePaymentInstrument.paymentTransaction.amount.value === 0) {
                responsePayload = {
                    success: true
                };

                return responsePayload;
            }

            if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'CREDIT_CARD') {
                var paymentIntent;
                var paymentIntentId = (stripePaymentInstrument.paymentTransaction)
                    ? stripePaymentInstrument.paymentTransaction.getTransactionID() : null;
                if (paymentIntentId) {
                    paymentIntent = checkoutHelper.confirmPaymentIntent(paymentIntentId);
                } else {
                    paymentIntent = checkoutHelper.createPaymentIntent(stripePaymentInstrument);

                    Transaction.wrap(function () {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(paymentIntent.id);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    });
                }

                Transaction.wrap(function () {
                    if (paymentIntent.review) {
                        basket.custom.stripeIsPaymentIntentInReview = true;
                    }
                    basket.custom.stripePaymentIntentID = paymentIntent.id;
                    basket.custom.stripePaymentSourceID = '';
                });

                responsePayload = generateCardsPaymentResponse(paymentIntent);
            } else if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'STRIPE_ACH_DEBIT') {
                const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

                const newStripeCustomer = stripeService.customers.create({
                    source: stripePaymentInstrument.custom.stripeBankAccountTokenId
                });

                let stripeCustomerId = newStripeCustomer.id;

                Transaction.wrap(function () {
                    basket.custom.stripeCustomerID = stripeCustomerId;
                    basket.custom.stripeBankAccountToken = stripePaymentInstrument.custom.stripeBankAccountToken;
                    basket.custom.stripeIsPaymentIntentInReview = true;

                    if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction && stripePaymentInstrument.custom.stripeSourceID) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(stripePaymentInstrument.custom.stripeSourceID);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    }

                    if (stripePaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
                        basket.custom.stripePaymentSourceID = stripePaymentInstrument.custom.stripeSourceID;
                        basket.custom.stripePaymentIntentID = '';
                    }
                });

                responsePayload = {
                    success: true
                };
            } else if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'STRIPE_WECHATPAY') {
                Transaction.wrap(function () {
                    basket.custom.stripeWeChatQRCodeURL = stripePaymentInstrument.custom.stripeWeChatQRCodeURL;
                    basket.custom.stripeIsPaymentIntentInReview = true;

                    if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction && stripePaymentInstrument.custom.stripeSourceID) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(stripePaymentInstrument.custom.stripeSourceID);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    }

                    if (stripePaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
                        basket.custom.stripePaymentSourceID = stripePaymentInstrument.custom.stripeSourceID;
                        basket.custom.stripePaymentIntentID = '';
                    }
                });

                responsePayload = {
                    success: true
                };
            } else if (stripePaymentInstrument && stripePaymentInstrument.paymentMethod === 'STRIPE_KLARNA') {
                Transaction.wrap(function () {
                    basket.custom.stripeIsPaymentIntentInReview = true;

                    if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction && stripePaymentInstrument.custom.stripeSourceID) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(stripePaymentInstrument.custom.stripeSourceID);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    }

                    if (stripePaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
                        basket.custom.stripePaymentSourceID = stripePaymentInstrument.custom.stripeSourceID;
                        basket.custom.stripePaymentIntentID = '';
                    }
                });

                responsePayload = {
                    success: true
                };
            } else {
                Transaction.wrap(function () {
                    /*
                     * Check if Stripe payment is based on Payment Intents
                     */
                    if (basket.custom.stripePaymentIntentID && stripePaymentInstrument && stripePaymentInstrument.paymentTransaction) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(basket.custom.stripePaymentIntentID);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    }

                    /*
                     * Check if Stripe payment is based on Sources
                     */
                    if (stripePaymentInstrument && stripePaymentInstrument.paymentTransaction && stripePaymentInstrument.custom.stripeSourceID) {
                        stripePaymentInstrument.paymentTransaction.setTransactionID(stripePaymentInstrument.custom.stripeSourceID);
                        stripePaymentInstrument.paymentTransaction.setType(PaymentTransaction.TYPE_AUTH);
                    }

                    if (stripePaymentInstrument && stripePaymentInstrument.custom.stripeSourceID) {
                        basket.custom.stripePaymentSourceID = stripePaymentInstrument.custom.stripeSourceID;
                        basket.custom.stripePaymentIntentID = '';
                    }
                });

                responsePayload = {
                    success: true
                };
            }
        }
    } catch (e) {
        if (e.callResult) {
            var o = JSON.parse(e.callResult.errorMessage);
            responsePayload = {
                error: {
                    code: o.error.code,
                    message: o.error.message
                }
            };
        } else {
            responsePayload = {
                error: {
                    message: e.message
                }
            };
        }
    }

    return responsePayload;
}

exports.BeforePaymentAuthorization = beforePaymentAuthorization;
exports.BeforePaymentAuthorization.public = true;

/**
 * An entry point to handle returns from alternative payment methods.
 * @param {Object} sfra - .
 * @return {Object} redirectUrl.
 */
function handleAPM(sfra) {
    const URLUtils = require('dw/web/URLUtils');
    const paramsMap = request.httpParameterMap;

    const sourceId = paramsMap.source ? paramsMap.source.stringValue : null;
    const sourceClientSecret = paramsMap.client_secret ? paramsMap.client_secret.stringValue : null;

    const paymentIntentId = paramsMap.payment_intent ? paramsMap.payment_intent.stringValue : null;
    const paymentIntentClientSecret = paramsMap.payment_intent_client_secret ? paramsMap.payment_intent_client_secret.stringValue : null;

    var redirectUrl = '';
    try {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        // handle payments with source id
        // Please Note: for ACH Debit payments, the source id is empty
        if (!empty(sourceId)) {
            const source = stripeService.sources.retrieve(sourceId);

            if (source.client_secret !== sourceClientSecret) {
                throw new Error('Source client secret mismatch');
            }

            if (['chargeable', 'pending'].indexOf(source.status) < 0) {
                throw new Error('Source not authorized.');
            }
        }

        // handle payment intents
        if (!empty(paymentIntentId)) {
            const paymentIntent = stripeService.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.client_secret !== paymentIntentClientSecret) {
                throw new Error('PaymentIntent client secret mismatch');
            }

            if (['requires_source', 'requires_payment_method'].indexOf(paymentIntent.status) >= 0) {
                throw new Error('Payment intent failed.');
            }
        }

        if (sfra) {
            redirectUrl = URLUtils.url('Checkout-Begin', 'stage', 'placeOrder');
        } else {
            redirectUrl = URLUtils.url('COSummary-Start');
        }
    } catch (e) {
        if (sfra) {
            redirectUrl = URLUtils.url('Checkout-Begin', 'stage', 'payment', 'apm_return_error', e.message);
        } else {
            redirectUrl = URLUtils.url('COBilling-Start', 'apm_return_error', e.message);
        }
    }

    return redirectUrl;
}

exports.HandleAPM = handleAPM;
exports.HandleAPM.public = true;

/**
 * Entry point for handling payment intent creation for APMs and Stripe Payment Element
 * @param {string} type - stripe payment method type
 * @param {Object} params - additional parameters
 * @return {Object} responsePayload.
 */
function beforePaymentSubmit(type, params) {
    const supportedTypes = ['alipay', 'au_becs_debit', 'bancontact', 'card', 'card_present',
        'eps', 'giropay', 'ideal', 'interac_present', 'p24', 'sepa_debit', 'sofort', 'paypal', 'paymentelement'];

    if (supportedTypes.indexOf(type) === -1) {
        return {
            error: {
                message: 'Not supported type ' + type
            }
        };
    }

    const BasketMgr = require('dw/order/BasketMgr');
    const Transaction = require('dw/system/Transaction');
    const Locale = require('dw/util/Locale');
    const Money = require('dw/value/Money');
    const basket = BasketMgr.getCurrentBasket();
    const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

    if (!basket) {
        return {
            error: {
                message: 'Empty basket'
            }
        };
    }

    var responsePayload;

    try {
        const basketCurrencyCode = basket.getCurrencyCode();
        const basketTotal = basket.getTotalGrossPrice();

        var basketCurency = dw.util.Currency.getCurrency(basketCurrencyCode);
        var multiplier = Math.pow(10, basketCurency.getDefaultFractionDigits());

        // Iterates over the list of gift certificate payment instruments
        // and updates the total redemption amount.
        var gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments().iterator();
        var orderPI = null;
        var giftCertTotal = new Money(0.0, basket.getCurrencyCode());

        while (gcPaymentInstrs.hasNext()) {
            orderPI = gcPaymentInstrs.next();
            giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
        }

        var totalAmount = basketTotal.subtract(giftCertTotal);

        const amount = Math.round(totalAmount.getValue() * multiplier);

        const locale = Locale.getLocale(request.getLocale());
        const lang = locale.getLanguage();
        const country = locale.getCountry();

        var shippingAddress = null;
        var shipments = basket.getShipments();
        var iter = shipments.iterator();
        while (iter != null && iter.hasNext()) {
            var shipment = iter.next();
            shippingAddress = shipment.getShippingAddress();
            if (shippingAddress) {
                break;
            }
        }

        var createPaymentIntentPayload = null;
        if (type === 'sepa_debit') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode,
                // Verify your integration in the https://stripe.com/docs/payments/sepa-debit/accept-a-payment guide by including this parameter
                metadata: {
                    integration_check: 'sepa_debit_accept_a_payment'
                }
            };
        } else if (type === 'bancontact') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };

            if (['en', 'de', 'fr', 'nl'].indexOf(lang) !== -1) {
                createPaymentIntentPayload.payment_method_options = {};
                createPaymentIntentPayload.payment_method_options.bancontact = {};
                createPaymentIntentPayload.payment_method_options.bancontact.preferred_language = lang;
            }
        } else if (type === 'giropay') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };
        } else if (type === 'paypal') {
            createPaymentIntentPayload = {
                amount: amount,
                currency: basketCurrencyCode,
                payment_method_types: [type]
            };

            if (lang && country) {
                const preferredLocale = lang + '_' + country;

                createPaymentIntentPayload.payment_method_options = {
                    paypal: {
                        preferred_locale: preferredLocale
                    }
                };
            }

            if (shippingAddress) {
                createPaymentIntentPayload.shipping = {};

                createPaymentIntentPayload.shipping.name = shippingAddress.getFirstName() + ' ' + shippingAddress.getLastName();

                createPaymentIntentPayload.shipping.phone = shippingAddress.getPhone();

                createPaymentIntentPayload.shipping.address = {};
                createPaymentIntentPayload.shipping.address.line1 = shippingAddress.getAddress1();
                createPaymentIntentPayload.shipping.address.line2 = shippingAddress.getAddress2();
                createPaymentIntentPayload.shipping.address.city = shippingAddress.getCity();
                createPaymentIntentPayload.shipping.address.state = shippingAddress.getStateCode();
                createPaymentIntentPayload.shipping.address.country = shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().value.toUpperCase() : '';
                createPaymentIntentPayload.shipping.address.postal_code = shippingAddress.getPostalCode();
            }
        } else if (type === 'sofort') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };

            if (['de', 'en', 'es', 'it', 'fr', 'nl', 'pl'].indexOf(lang) !== -1) {
                createPaymentIntentPayload.payment_method_options = {};
                createPaymentIntentPayload.payment_method_options.sofort = {};
                createPaymentIntentPayload.payment_method_options.sofort.preferred_language = lang;
            }
        } else if (type === 'eps') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };
        } else if (type === 'p24') {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };
        } else if (type === 'paymentelement') {
            createPaymentIntentPayload = {
                amount: amount,
                currency: basketCurrencyCode,
                automatic_payment_methods: {
                    enabled: true
                }
            };
        } else {
            createPaymentIntentPayload = {
                payment_method_types: [type],
                amount: amount,
                currency: basketCurrencyCode
            };
        }

        if (customer.authenticated && customer.profile) {
            /*
             * Check if registered customer has an associated Stripe customer ID
             * if not, make a call to Stripe to create such id and save it as customer profile custom attribute
             */
            if (!customer.profile.custom.stripeCustomerID) {
                const newStripeCustomer = stripeService.customers.create({
                    email: customer.profile.email,
                    name: customer.profile.firstName + ' ' + customer.profile.lastName
                });

                Transaction.wrap(function () {
                    customer.profile.custom.stripeCustomerID = newStripeCustomer.id;
                });
            }

            createPaymentIntentPayload.customer = customer.profile.custom.stripeCustomerID;

            /*
             * Save the SEPA Direct Debit account for reuse by setting the setup_future_usage parameter to off_session
             */
            if (type === 'sepa_debit' && params.saveSepaCard) {
                createPaymentIntentPayload.setup_future_usage = 'off_session';
            }

            /*
             * Save the Stripe Payment Element for reuse by setting the setup_future_usage parameter to off_session
             */
            var stripeHelper = require('*/cartridge/scripts/stripe/helpers/stripeHelper');
            if (type === 'paymentelement' && stripeHelper.isStripePaymentElementsSavePaymentsEnabled()) {
                createPaymentIntentPayload.setup_future_usage = 'off_session';
            }

            if (params.savedSepaDebitCardId) {
                createPaymentIntentPayload.payment_method = params.savedSepaDebitCardId;
            }
        }

        const paymentIntent = stripeService.paymentIntents.create(createPaymentIntentPayload);

        Transaction.wrap(function () {
            basket.custom.stripePaymentIntentID = paymentIntent.id;
            basket.custom.stripePaymentSourceID = '';
        });

        responsePayload = {
            success: true,
            clientSecret: paymentIntent.client_secret
        };
    } catch (e) {
        if (e.callResult) {
            var o = JSON.parse(e.callResult.errorMessage);
            responsePayload = {
                error: {
                    code: o.error.code,
                    message: o.error.message
                }
            };
        } else {
            responsePayload = {
                error: {
                    message: e.message
                }
            };
        }
    }

    return responsePayload;
}

exports.BeforePaymentSubmit = beforePaymentSubmit;
exports.BeforePaymentSubmit.public = true;

/* eslint-env es6 */
/* global request */

'use strict';

const Transaction = require('dw/system/Transaction');
const PaymentInstrument = require('dw/order/PaymentInstrument');
const PaymentMgr = require('dw/order/PaymentMgr');
const Order = require('dw/order/Order');
const PaymentTransaction = require('dw/order/PaymentTransaction');

/**
* Handle credit card payment
*
* @param {array} args with paramenters
* @returns {array} - array with result info
*/
function Handle(args) {
    const checkoutHelper = require('*/cartridge/scripts/stripe/helpers/checkoutHelper');
    const paramsMap = request.httpParameterMap;
    const cardType = require('*/cartridge/scripts/stripe/helpers/cardsHelper').getCardType();

    var prUsed = false;
    if (request.httpParameterMap.get('stripe_pr_used').value === 'true') {
        prUsed = true;
    }

    const params = {
        sourceId: paramsMap.stripe_source_id.stringValue,
        cardNumber: paramsMap.stripe_card_number.stringValue,
        cardHolder: paramsMap.stripe_card_holder.stringValue,
        cardType: cardType,
        cardExpMonth: paramsMap.stripe_card_expiration_month.stringValue,
        cardExpYear: paramsMap.stripe_card_expiration_year.stringValue,
        saveCard: paramsMap.stripe_save_card.value,
        prUsed: prUsed,
        saveGuessCard: paramsMap.stripe_save_guess_card.value
    };

    try {
        Transaction.begin();
        checkoutHelper.createStripePaymentInstrument(args.Basket, PaymentInstrument.METHOD_CREDIT_CARD, params);
        Transaction.commit();
        return {
            success: true
        };
    } catch (e) {
        Transaction.rollback();
        return {
            success: false,
            error: true,
            errorMessage: e.message
        };
    }
}

/**
* Authorize credit card payment
*
* @param {array} args with paramenters
* @returns {Object} - object with result info
*/
function Authorize(args) {
    let responsePayload;
    const Site = require('dw/system/Site');
    const orderNo = args.OrderNo;
    const paymentInstrument = args.PaymentInstrument;
    const paymentIntentId = paymentInstrument.paymentTransaction.getTransactionID();
    const stripeChargeCapture = Site.getCurrent().getCustomPreferenceValue('stripeChargeCapture');

    /**
     * Handle Authorize for zero orders i.e. after full gift cert redeem
     */
    if (paymentInstrument && paymentInstrument.paymentTransaction
        && paymentInstrument.paymentTransaction.amount
        && paymentInstrument.paymentTransaction.amount.value === 0) {
        responsePayload = {
            authorized: true,
            error: false
        };

        return responsePayload;
    }

    if (!paymentIntentId) {
        responsePayload = {
            authorized: false,
            error: true
        };
    } else {
        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        try {
            const paymentIntent = stripeService.paymentIntents.update(paymentIntentId, {
                metadata: {
                    order_id: orderNo,
                    site_id: Site.getCurrent().getID()
                }
            });

            if ((!stripeChargeCapture && paymentIntent.status !== 'requires_capture') || (stripeChargeCapture && paymentIntent.status !== 'succeeded')) {
                throw new Error('Payment was not successful, payment intent status is ' + paymentIntent.status);
            }

            const charges = paymentIntent.charges;
            if (!(charges && charges.total_count && charges.data)) {
                throw new Error('Payment was not successful, no charges found');
            }

            const charge = paymentIntent.charges.data[0];
            if (!(charge && charge.id)) {
                throw new Error('Payment was not successful, no valid charge found');
            }

            const paymentProcessor = args.PaymentProcessor || PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
            Transaction.wrap(function () {
                paymentInstrument.custom.stripeChargeID = charge.id;

                if (charge.balance_transaction) {
                    paymentInstrument.paymentTransaction.transactionID = charge.balance_transaction;
                    paymentInstrument.paymentTransaction.type = PaymentTransaction.TYPE_CAPTURE;
                }

                paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
                if (paymentIntent.status === 'succeeded') {
                    args.Order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
                }
            });

            responsePayload = {
                authorized: true,
                error: false
            };
        } catch (e) {
            responsePayload = {
                authorized: false,
                error: true,
                errorMessage: e.message
            };
        }
    }

    return responsePayload;
}

exports.Handle = Handle;
exports.Authorize = Authorize;

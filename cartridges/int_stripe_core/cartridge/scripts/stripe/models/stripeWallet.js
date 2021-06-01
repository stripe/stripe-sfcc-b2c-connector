/* eslint-env es6 */

'use strict';

/**
 * Retrieves the Stripe customer ID from SFCC customer profile.
 *
 * @param {dw.customer.Customer} apiCustomer - Customer to retrieve the Stripe ID for.
 * @return {string} - Stripe customer ID or null if not set.
 */
function getStripeCustomerId(apiCustomer) {
    if (apiCustomer.authenticated
        && apiCustomer.profile
        && 'stripeCustomerID' in apiCustomer.profile.custom) {
        return apiCustomer.profile.custom.stripeCustomerID;
    }

    return null;
}

/**
 * Saves Stripe customer ID with SFCC customer profile, thus linking the two.
 *
 * @param {dw.customer.Customer} apiCustomer - Customer to save the Stripe ID to.
 * @param {string} stripeCustomerId - The ID of the customer on Stripe end
 */
function setStripeCustomerId(apiCustomer, stripeCustomerId) {
    if (apiCustomer.authenticated && apiCustomer.profile) {
        apiCustomer.profile.custom.stripeCustomerID = stripeCustomerId; // eslint-disable-line
    }
}

/**
 * Retrieves a list of payment instruments (Stripe Payment Methods or Sources)
 * attached to a Stripe customer. Default instrument is placed first.
 *
 * @param {string} stripeCustomerId - ID of Stripe customer
 * @return {ArrayList<customerPaymentInstruments>} - Saved instruments attached
 * to a Stripe customer
 */
function fetchSavedPaymentInstruments(stripeCustomerId) {
    const ArrayList = require('dw/util/ArrayList');
    const savedPaymentInstruments = new ArrayList();

    if (stripeCustomerId) {
        try {
            const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

            const stripeCustomer = stripeService.customers.retrieve(stripeCustomerId);
            const defaultPaymentMethodId = stripeCustomer.invoice_settings && stripeCustomer.invoice_settings.default_payment_method;
            const defaultSourceId = stripeCustomer.default_source;
            const defaultCardId = defaultPaymentMethodId || defaultSourceId;

            const stripePaymentInstrumentsResponse = stripeService.paymentMethods.list(stripeCustomerId, 'card');
            const stripePaymentInstruments = stripePaymentInstrumentsResponse && stripePaymentInstrumentsResponse.data;

            if (stripePaymentInstruments && stripePaymentInstruments.length) {
                const CustomerPaymentInstrument = require('./customerPaymentInstrument');

                stripePaymentInstruments.forEach(function (stripePaymentMethod) {
                    const isDefault = stripePaymentMethod.id === defaultCardId;
                    const savedPaymentInstrument = new CustomerPaymentInstrument(stripePaymentMethod, isDefault);

                    if (savedPaymentInstrument) {
                        savedPaymentInstruments[isDefault ? 'unshift' : 'add1'](savedPaymentInstrument);
                    }
                });
            }
        } catch (e) {
            require('dw/system/Logger').error(e.message);
            throw e;
        }
    }

    return savedPaymentInstruments;
}

/**
 * Retrieves a list of Sepa Direct Debit payment instruments (Stripe Payment Methods or Sources)
 * attached to a Stripe customer. Default instrument is placed first.
 *
 * @param {string} stripeCustomerId - ID of Stripe customer
 * @return {ArrayList<Object>} - Saved instruments attached
 * to a Stripe customer
 */
function fetchSavedSepaDirectDebitPaymentInstruments(stripeCustomerId) {
    var result = [];

    if (stripeCustomerId) {
        try {
            const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

            const stripePaymentInstrumentsResponse = stripeService.paymentMethods.list(stripeCustomerId, 'sepa_debit');
            const stripePaymentInstruments = stripePaymentInstrumentsResponse && stripePaymentInstrumentsResponse.data;

            if (stripePaymentInstruments && stripePaymentInstruments.length) {
                stripePaymentInstruments.forEach(function (stripePaymentMethod) {
                    if (stripePaymentMethod.id && stripePaymentMethod.sepa_debit && stripePaymentMethod.sepa_debit.last4) {
                        var savedSepaDebit = [];
                        savedSepaDebit.id = stripePaymentMethod.id;
                        savedSepaDebit.last4 = stripePaymentMethod.sepa_debit.last4;

                        result.push({
                            id: stripePaymentMethod.id,
                            last4: stripePaymentMethod.sepa_debit.last4
                        });
                    }
                });
            }
        } catch (e) {
            require('dw/system/Logger').error(e.message);
            throw e;
        }
    }

    return result;
}

/**
 * A wrapper for SFCC API customer object to provided functionality for managing
 * Stripe saved cards.
 *
 * @constructor
 * @param {dw.customer.Customer} apiCustomer - SFCC API customer object to wrap
 */
function StripeWallet(apiCustomer) {
    var stripeCustomerId = getStripeCustomerId(apiCustomer);

    this.getPaymentInstruments = function () {
        return fetchSavedPaymentInstruments(stripeCustomerId);
    };

    this.attachPaymentInstrument = function (stripePaymentMethodId) {
        if (!apiCustomer.authenticated) {
            throw new Error('Authenticated customer expected');
        }

        if (!stripePaymentMethodId) {
            throw new Error('Missing Stripe payment method ID');
        }

        const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

        try {
            let newStripeCustomer;
            if (!stripeCustomerId) {
                newStripeCustomer = stripeService.customers.create({
                    email: apiCustomer.profile.email,
                    name: apiCustomer.profile.firstName + ' ' + apiCustomer.profile.lastName
                });

                stripeCustomerId = newStripeCustomer.id;
            }

            if (!stripeCustomerId) {
                throw new Error('Failed to get Stripe customer ID');
            }

            stripeService.paymentMethods.attach(stripePaymentMethodId, stripeCustomerId);

            // In case a new Stripe customer was created and all good so far
            if (newStripeCustomer) {
                require('dw/system/Transaction').wrap(function () {
                    setStripeCustomerId(apiCustomer, stripeCustomerId);
                });
            }
        } catch (e) {
            require('dw/system/Logger').error(e.message);
            throw e;
        }
    };

    this.removePaymentInstrument = function (paymentInstrument) {
        const stripeId = paymentInstrument && paymentInstrument.custom && paymentInstrument.custom.stripeId;

        if (stripeCustomerId && stripeId) {
            const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

            try {
                stripeService.paymentMethods.detach(stripeId);
            } catch (e) {
                require('dw/system/Logger').error(e.message);
            }
        }
    };

    this.makeDefault = function (stripeId) {
        if (stripeCustomerId && stripeId) {
            const stripeService = require('*/cartridge/scripts/stripe/services/stripeService');

            stripeService.customers.update(stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: stripeId
                }
            });
        }
    };

    this.getSepaDirectDebitPaymentInstruments = function () {
        return fetchSavedSepaDirectDebitPaymentInstruments(stripeCustomerId);
    };
}

module.exports = function (apiCustomer) {
    return new StripeWallet(apiCustomer);
};

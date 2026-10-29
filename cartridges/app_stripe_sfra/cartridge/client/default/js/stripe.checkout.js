/* eslint-env es6 */
/* eslint-disable require-jsdoc */
/* globals Stripe, $ */

'use strict';

var helpers = require('./helpers');
var stripeConfig = require('./stripe/config');
var baseConfig = stripeConfig.get('base');
var checkoutConfig = stripeConfig.get('checkout');
var stripeOptions = {};

var STRIPE_CONSTANTS = {
    paymentElement: {
        ismlElementID: '#payment-element',
        instanceName: 'paymentElementInstance',
        elementsName: 'stripePaymentElements'
    },
    bankTransferElement: {
        ismlElementID: '#stripe-bank-transfer-element',
        instanceName: 'bankTransferElementInstance',
        elementsName: 'stripeBankTransferElements'
    }
};

if (baseConfig.betas && baseConfig.betas.length) {
    stripeOptions.betas = baseConfig.betas;
}

// Site locale, inherited by every Element
if (baseConfig.locale) {
    stripeOptions.locale = baseConfig.locale;
}

var stripe = Stripe(baseConfig.publicKey, stripeOptions);

var forceSubmit = false;

document.querySelector('button.submit-payment').addEventListener('click', function () {
    var methodId = $('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val();

    if (methodId !== 'STRIPE_PAYMENT_ELEMENT' && methodId !== 'STRIPE_BANK_TRANSFER') {
        // Any other payment method is submitted by the SFRA billing handler
        window.localStorage.setItem('stripe_payment_method', '');
        return;
    }

    window.localStorage.setItem('stripe_payment_method', methodId);
    $('.payment-details')
        .text($('*[data-method-id="' + methodId + '"] > a').text())
        .removeClass('payment-details')
        .addClass('payment-details-stripe');
});

function initStripeElement(customerEmail, scope) {
    var names = STRIPE_CONSTANTS[scope];

    if (window[names.instanceName]) {
        try {
            window[names.instanceName].destroy();
        } catch (e) {
            // already destroyed by a concurrent re-init
        }
        window[names.instanceName] = null;
    }

    if (window[names.elementsName]) {
        window[names.instanceName] = window[names.elementsName].create('payment', {
            defaultValues: { billingDetails: helpers.getFormatedBillingAddress(customerEmail) },
            fields: {
                billingDetails: checkoutConfig.billingDetailsCollection
            }
        });
        window[names.instanceName].mount(names.ismlElementID);
    }
}

/**
 * Mounts the Checkout Session Payment Element and currency selector.
 * @param {string} checkoutSessionClientSecret - Checkout Session client secret
 * @param {string} scope - STRIPE_CONSTANTS key
 */
function initStripeCheckoutSession(checkoutSessionClientSecret, scope) {
    // Replace the Elements of a previous session (e.g. after a shipping change)
    ['stripeCheckoutPaymentElement', 'stripeCheckoutCurrencySelector'].forEach(function (name) {
        if (window[name]) {
            try {
                window[name].destroy();
            } catch (e) {
                // already destroyed
            }
            window[name] = null;
        }
    });
    window.stripeCheckoutSessionActions = null;
    window.stripeCheckoutPaymentElementComplete = false;

    var checkoutSession = stripe.initCheckoutElementsSdk({
        clientSecret: checkoutSessionClientSecret,
        adaptivePricing: { allowed: true }
    });
    window.stripeCheckoutSession = checkoutSession;

    checkoutSession.loadActions().then(function (result) {
        if (checkoutSession !== window.stripeCheckoutSession) {
            return; // a newer session was initialized meanwhile
        }

        if (result.type === 'success') {
            window.stripeCheckoutSessionActions = result.actions;
            // Name and address come from the SFCC billing form and are passed to confirm()
            window.stripeCheckoutPaymentElement = checkoutSession.createPaymentElement({
                fields: { billingDetails: { name: 'never', address: 'never' } }
            });
            window.stripeCheckoutPaymentElement.on('change', function (event) {
                window.stripeCheckoutPaymentElementComplete = event.complete;
            });
            window.stripeCheckoutPaymentElement.mount(STRIPE_CONSTANTS[scope].ismlElementID);
            window.stripeCheckoutCurrencySelector = checkoutSession.createCurrencySelectorElement();
            window.stripeCheckoutCurrencySelector.mount('#stripe-currency-selector-container');
        } else {
            helpers.showCheckoutError(result.error.message || 'Payment initialization failed. Please refresh.');
        }
    });
}

function initNewStripeIntent(scope) {
    var getElementOptionsURL = scope === 'paymentElement' ? checkoutConfig.urls.paymentElementOptions : checkoutConfig.urls.bankTransferElementOptions;

    $.ajax({
        url: getElementOptionsURL,
        method: 'GET',
        dataType: 'json'
    }).done(function (response) {
        if (scope === 'paymentElement' && response.useCheckoutSessions) {
            initStripeCheckoutSession(response.checkoutSessionClientSecret, scope);
        } else {
            window[STRIPE_CONSTANTS[scope].elementsName] = stripe.elements(response.paymentElementOptions);
            initStripeElement(response.customerEmail, scope);
        }
    });
}

/**
 * Re-creates the Element, or fully initializes it if needed.
 * @param {string} scope - STRIPE_CONSTANTS key
 */
function reinitStripeElement(scope) {
    if (!$(STRIPE_CONSTANTS[scope].ismlElementID).length) {
        return;
    }

    if (window[STRIPE_CONSTANTS[scope].elementsName]) {
        initStripeElement(null, scope);
    } else if (!window.stripeCheckoutSession) {
        initNewStripeIntent(scope);
    }
}

function initAvailableElements() {
    reinitStripeElement('paymentElement');
    reinitStripeElement('bankTransferElement');
}

// fix issue with SFRA select payment method when edit payment from Order confirmation
helpers.ready(() => {
    helpers.showStoredCheckoutError();

    document.querySelector('.payment-summary .edit-button').addEventListener('click', () => {
        if (!window.stripePaymentElements && !window.stripeCheckoutSession) {
            reinitStripeElement('paymentElement');
        }
        if (!window.stripeBankTransferElements) {
            reinitStripeElement('bankTransferElement');
        }
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');
        helpers.showSelectedPaymentTab();
    });

    document.querySelector('.shipping-summary .edit-button').addEventListener('click', helpers.showSelectedPaymentTab);
});

/**
 * Unlocks Place Order after a failed submit.
 */
function resetSubmitState() {
    forceSubmit = false;
    $.spinner().stop();
    $('body').trigger('checkout:enableButton', '.next-step-button button');
}

/**
 * Returns to the payment stage without reloading the page.
 */
function returnToPaymentStage() {
    resetSubmitState();

    var editPaymentButton = document.querySelector('.payment-summary .edit-button');
    if (editPaymentButton && $('.payment-summary').is(':visible')) {
        editPaymentButton.click();
    }
}

function elementSubmitControllerCallback(data) {
    helpers.storeOrderDetails(data);

    if (data.error) {
        helpers.redirectToBillingPageWithError(data.errorMessage);
    } else if (data.status === 'requires_action') {
        stripe.handleNextAction({
            clientSecret: data.clientSecret
        }).then(function (handleNextActionResult) {
            if (handleNextActionResult.error) {
                $.spinner().start();

                $.ajax({
                    url: checkoutConfig.urls.failOrder,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val(),
                        errorMessage: handleNextActionResult.error.message
                    },
                    success: function (result) {
                        if (result.success === false) {
                            window.location.replace(result.redirectUrl);
                        } else {
                            helpers.redirectToBillingPageWithError($('#payment-element').data('errormsg'));
                        }
                    },
                    error: function () {
                        helpers.redirectToBillingPageWithError($('#payment-element').data('errormsg'));
                    }
                });
            } else {
                helpers.redirectToCheckoutSummaryPage();
            }
        });
    } else {
        helpers.redirectToCheckoutSummaryPage();
    }
    // enable the placeOrder button here
    $('body').trigger('checkout:enableButton', '.next-step-button button');
}

function handleStripeBankTransferSubmitOrder() {
    window.stripeBankTransferElements.submit().then(function (result) {
        if (result.error) {
            returnToPaymentStage();
            return;
        }

        $('body').trigger('checkout:disableButton', '.next-step-button button');
        $.spinner().start();

        stripe.createPaymentMethod({
            elements: window.stripeBankTransferElements,
            params: {
                billing_details: helpers.getConfirmationBillingDetails()
            }
        }).then(function (paymentMethodCreationResult) {
            if (paymentMethodCreationResult.error) {
                helpers.redirectToBillingPage();
                return;
            }

            $.ajax({
                url: checkoutConfig.urls.submitOrder,
                method: 'POST',
                data: {
                    csrf_token: $('[name="csrf_token"]').val(),
                    bankTransferPaymentMethod: JSON.stringify(paymentMethodCreationResult.paymentMethod)
                },
                success: function (data) {
                    elementSubmitControllerCallback(data);
                },
                error: resetSubmitState
            });
        });
    });
}

function handleStripePaymentElementSubmitOrder() {
    window.stripePaymentElements.submit().then(function (result) {
        if (result.error) {
            returnToPaymentStage();
            return;
        }

        $('body').trigger('checkout:disableButton', '.next-step-button button');
        $.spinner().start();

        stripe.createConfirmationToken({
            elements: window.stripePaymentElements,
            params: {
                return_url: checkoutConfig.urls.returnUrl,
                payment_method_data: {
                    billing_details: helpers.getConfirmationBillingDetails()
                }
            }
        }).then(function (createConfirmationTokenResult) {
            if (createConfirmationTokenResult.error) {
                $.ajax({
                    url: checkoutConfig.urls.logError,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val(),
                        msg: 'UPE stripe.createConfirmationToken Error ' + JSON.stringify(createConfirmationTokenResult.error)
                    }
                });

                helpers.redirectToBillingPage();
                return;
            }

            $.ajax({
                url: checkoutConfig.urls.submitOrder,
                method: 'POST',
                data: {
                    csrf_token: $('[name="csrf_token"]').val(),
                    confirmationToken: JSON.stringify(createConfirmationTokenResult.confirmationToken)
                },
                success: function (data) {
                    elementSubmitControllerCallback(data);
                },
                error: resetSubmitState
            });
        });
    });
}

/**
 * Refreshes the Element's pre-filled billing details.
 */
function refreshElementDefaultValues() {
    if (helpers.isBillingDetailsCollectedByElement()) {
        initAvailableElements();
    }
}

/**
 * Creates a new intent for every Element on the page.
 */
function initNewStripeIntents() {
    Object.keys(STRIPE_CONSTANTS).forEach(function (scope) {
        if ($(STRIPE_CONSTANTS[scope].ismlElementID).length) {
            initNewStripeIntent(scope);
        }
    });
}

/* Stripe Payment Element */
helpers.ready(() => {
    if (!$('.payment-summary').is(':visible')) {
        initNewStripeIntents();
    }
});

// Update stored order amount on shipping method change
$('body').on('checkout:updateCheckoutView', function () {
    $.ajax({
        url: checkoutConfig.urls.orderItems,
        method: 'GET',
        dataType: 'json'
    }).done(function (json) {
        // check if order amount has been changed
        // eslint-disable-next-line
        if (checkoutConfig.order && checkoutConfig.order.amount != json.amount) {
            initNewStripeIntents();
            checkoutConfig.order.amount = json.amount;
        }
    });
});

helpers.ready(() => {
    document.querySelector('.submit-shipping').addEventListener('click', () => {
        initAvailableElements();
    });

    ['_email', '_firstName', '_lastName', '_phone', '_postalCode', '_country'].forEach(function (suffix) {
        var field = document.querySelector('#dwfrm_billing [name$="' + suffix + '"]');
        if (field) {
            field.addEventListener('change', refreshElementDefaultValues);
        }
    });
});

/**
 * Creates the order and confirms the Checkout Session.
 */
function handleStripeCheckoutSessionSubmitOrder() {
    var checkoutSessionActions = window.stripeCheckoutSessionActions;

    // Validate before the SFCC order is created
    if (!checkoutSessionActions || !window.stripeCheckoutPaymentElementComplete) {
        returnToPaymentStage();
        helpers.showCheckoutError($('#payment-element').data('incompletemsg'));
        return;
    }

    $('body').trigger('checkout:disableButton', '.next-step-button button');
    $.spinner().start();

    $.ajax({
        url: checkoutConfig.urls.submitOrder,
        method: 'POST',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            checkoutSessionId: checkoutSessionActions.getSession().id
        },
        success: function (data) {
            helpers.storeOrderDetails(data);

            if (data.error) {
                helpers.redirectToBillingPageWithError(data.errorMessage);
                return;
            }

            var confirmOptions = {};
            if (!checkoutSessionActions.getSession().email) {
                confirmOptions.email = helpers.getCustomerEmail();
            }
            if (data.billingAddress) {
                confirmOptions.billingAddress = data.billingAddress;
            }
            if (data.shippingAddress) {
                confirmOptions.shippingAddress = data.shippingAddress;
            }

            var confirmPromise = checkoutSessionActions.confirm(confirmOptions);

            // On success Stripe redirects to the return URL, so only errors are handled here
            confirmPromise.then(function (result) {
                if (result.type === 'error') {
                    helpers.failCheckoutSessionOrder(result.error);
                }
            }, helpers.failCheckoutSessionOrder);
        },
        error: resetSubmitState
    });
}

document.querySelector('button.place-order').addEventListener('click', function (event) {
    var method = window.localStorage.getItem('stripe_payment_method');
    if (method !== 'STRIPE_PAYMENT_ELEMENT' && method !== 'STRIPE_BANK_TRANSFER') {
        return true;
    }

    event.stopImmediatePropagation();
    if (forceSubmit) {
        return false;
    }

    forceSubmit = true;
    if (method === 'STRIPE_BANK_TRANSFER') {
        handleStripeBankTransferSubmitOrder();
    } else if (checkoutConfig.useCheckoutSessions) {
        handleStripeCheckoutSessionSubmitOrder();
    } else {
        handleStripePaymentElementSubmitOrder();
    }
    return false;
});

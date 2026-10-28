/* eslint-env es6 */
/* eslint-disable no-console */
/* eslint-disable no-alert */
/* eslint-disable no-param-reassign */
/* eslint-disable dot-notation */
/* eslint-disable no-plusplus */
/* eslint-disable require-jsdoc */
/* globals Stripe, $ */

'use strict';
var helpers = require('./helpers')
var stripeOptions = {};

var CHECKOUT_ERROR_STORAGE_KEY = 'stripe_checkout_error';
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
}

var betas = document.getElementById('stripePaymentMethodsInBeta').value;
if (betas) {
    stripeOptions.betas = betas.split(',');
}

// Site locale, inherited by every Element
var stripeLocaleInput = document.getElementById('stripeLocale');
if (stripeLocaleInput && stripeLocaleInput.value) {
    stripeOptions.locale = stripeLocaleInput.value;
}

var stripe = Stripe(document.getElementById('stripePublicKey').value, stripeOptions);


var forceSubmit = false;

document.querySelector('button.submit-payment').addEventListener('click', function () {
    var paymentMethodName;
    // skip event handler for Stripe Payment Elements
    // eslint-disable-next-line
    if ($('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val() == 'STRIPE_PAYMENT_ELEMENT') {
        window.localStorage.setItem('stripe_payment_method', 'STRIPE_PAYMENT_ELEMENT');
        paymentMethodName = $('*[data-method-id="STRIPE_PAYMENT_ELEMENT"] > a').text();
        $('.payment-details').text(paymentMethodName);
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');

        return;
    }

    if ($('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val() == 'STRIPE_BANK_TRANSFER') {
        window.localStorage.setItem('stripe_payment_method', 'STRIPE_BANK_TRANSFER');
        paymentMethodName = $('*[data-method-id="STRIPE_BANK_TRANSFER"] > a').text();
        $('.payment-details').text(paymentMethodName);
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');

        return;
    }

    // Any other payment method is submitted by the SFRA billing handler
    window.localStorage.setItem('stripe_payment_method', '');
});

// fix issue with SFRA select payment method when edit payment from Order confirmation
var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(() => {
    try {
        var stashedError = window.sessionStorage.getItem(CHECKOUT_ERROR_STORAGE_KEY);
        if (stashedError) {
            window.sessionStorage.removeItem(CHECKOUT_ERROR_STORAGE_KEY);
            helpers.showCheckoutError(stashedError);
        }
    } catch (e) {
        // sessionStorage unavailable: nothing was stashed
    }

    // eslint-disable-next-line no-unused-vars
    document.querySelector('.payment-summary .edit-button').addEventListener('click', (e) => {
        if (!window.stripePaymentElements && !window.stripeCheckoutSession) {
            reinitStripeElement('paymentElement');
        }
        if (!window.stripeBankTransferElements) {
            reinitStripeElement('bankTransferElement');
        }
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');
        var list = document.querySelector('.payment-form').querySelectorAll('.tab-pane');
        for (var i = 0; i < list.length; ++i) {
            list[i].classList.remove('active');
        }

        var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
        if (activePaymentMethod.length) {
            var selectedPaymentContent = document.getElementById(activePaymentMethod[0].attributes['href'].value.replace('#', ''));

            if (selectedPaymentContent) {
                selectedPaymentContent.classList.add('active');
            }
        }
    });

    // eslint-disable-next-line no-unused-vars
    document.querySelector('.shipping-summary .edit-button').addEventListener('click', (e) => {
        var list = document.querySelector('.payment-form').querySelectorAll('.tab-pane');
        for (var i = 0; i < list.length; ++i) {
            list[i].classList.remove('active');
        }

        var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
        if (activePaymentMethod.length) {
            var selectedPaymentContent = document.getElementById(activePaymentMethod[0].attributes['href'].value.replace('#', ''));

            if (selectedPaymentContent) {
                selectedPaymentContent.classList.add('active');
            }
        }
    });
});

/**
 * Returns to the payment stage without reloading the page.
 */
function returnToPaymentStage() {
    forceSubmit = false;
    $.spinner().stop();
    $('body').trigger('checkout:enableButton', '.next-step-button button');

    var editPaymentButton = document.querySelector('.payment-summary .edit-button');
    if (editPaymentButton && $('.payment-summary').is(':visible')) {
        editPaymentButton.click();
    }
}

function elementSubmitControllerCallback(data) {
    window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl);
    window.localStorage.setItem('stripe_pe_orderid', data.orderID);
    window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken);

    if (data.error) {
        helpers.redirectToBillingPageWithError(data.errorMessage, CHECKOUT_ERROR_STORAGE_KEY);
    } else {
        if (data.status === 'requires_action') {
            stripe.handleNextAction({
                clientSecret: data.clientSecret
            }).then(function (handleNextActionResult) {
                if (handleNextActionResult.error) {
                    $.spinner().start();

                    $.ajax({
                        url: document.getElementById('stripeFailOrderURL').value,
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
                                helpers.redirectToBillingPageWithError($('#payment-element').data('errormsg'), CHECKOUT_ERROR_STORAGE_KEY);
                            }
                        }
                    });
                } else {
                    helpers.redirectToCheckoutSummaryPage();
                }
            })
        } else {
            helpers.redirectToCheckoutSummaryPage();
        }
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

        var stripeBankTransferPaymentData = {
            elements: window.stripeBankTransferElements,
            params: {
                billing_details: helpers.getConfirmationBillingDetails()
            }
        }

        stripe.createPaymentMethod(stripeBankTransferPaymentData).then(function(paymentMethodCreationResult) {
            if (paymentMethodCreationResult.error) {
                helpers.redirectToBillingPage();
                return;
            } else {

                $.ajax({
                    url: document.getElementById('paymentElementSubmitOrderURL').value,
                    method: 'POST',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val(),
                        bankTransferPaymentMethod: JSON.stringify(paymentMethodCreationResult.paymentMethod)
                    },
                    success: function (data) {
                        elementSubmitControllerCallback(data);
                    },
                    error: function () {
                        forceSubmit = false;
                        $.spinner().stop();
                        // enable the placeOrder button here
                        $('body').trigger('checkout:enableButton', $('.next-step-button button'));
                    }
                });
            }
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

        var stripeReturnURL = document.getElementById('stripe_return_url').value;

        stripe.createConfirmationToken({
            elements: window.stripePaymentElements,
            params: {
                return_url: stripeReturnURL,
                payment_method_data: {
                    billing_details: helpers.getConfirmationBillingDetails()
                }
            }
        }).then(function (createConfirmationTokenResult) {
            if (createConfirmationTokenResult.error) {
                $.ajax({
                    url: document.getElementById('logStripeErrorMessageURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val(),
                        msg: 'UPE stripe.createConfirmationToken Error ' + JSON.stringify(createConfirmationTokenResult.error)
                    }
                })

                helpers.redirectToBillingPage();
                return;
            }

            $.ajax({
                url: document.getElementById('paymentElementSubmitOrderURL').value,
                method: 'POST',
                data: {
                    csrf_token: $('[name="csrf_token"]').val(),
                    confirmationToken: JSON.stringify(createConfirmationTokenResult.confirmationToken)
                },
                success: function (data) {
                    elementSubmitControllerCallback(data);
                },
                error: function () {
                    forceSubmit = false;
                    $.spinner().stop();
                    // enable the placeOrder button here
                    $('body').trigger('checkout:enableButton', $('.next-step-button button'));
                }
            });

        })
    });
}




function initStripeElement(customerEmail, scope) {
    var stripeCollectBillingDetailsOnPaymentElement = document.getElementById('stripeCollectBillingDetailsOnPaymentElement').value;

    if (window[STRIPE_CONSTANTS[scope].instanceName]) {
        try {
            window[STRIPE_CONSTANTS[scope].instanceName].destroy();
        } catch (e) {
            // already destroyed by a concurrent re-init
        }
        window[STRIPE_CONSTANTS[scope].instanceName] = null;
    }

    if (window[STRIPE_CONSTANTS[scope].elementsName]) {
        window[STRIPE_CONSTANTS[scope].instanceName] = window[STRIPE_CONSTANTS[scope].elementsName].create('payment', {
            defaultValues: { billingDetails: helpers.getFormatedBillingAddress(customerEmail) },
            fields: {
                billingDetails: stripeCollectBillingDetailsOnPaymentElement
            }
        });
        window[STRIPE_CONSTANTS[scope].instanceName].mount(STRIPE_CONSTANTS[scope].ismlElementID);
    }
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

/**
 * Refreshes the Element's pre-filled billing details.
 */
function refreshElementDefaultValues() {
    if (helpers.isBillingDetailsCollectedByElement()) {
        initAvailableElements();
    }
}

function initNewStripeIntent(scope) {
    var getElementOptionsURL = scope === 'paymentElement' ? document.getElementById('getPaymentElementOptions').value : document.getElementById('getBankTransferElementOptions').value;

    $.ajax({
        url: getElementOptionsURL,
        method: 'GET',
        dataType: 'json',
    }).done(function (response) {
        if (scope === 'paymentElement' && response.useCheckoutSessions) {
            initStripeCheckoutSession(response.checkoutSessionClientSecret, scope, response.customerEmail);
        } else {
            window[STRIPE_CONSTANTS[scope].elementsName] = stripe.elements(response.paymentElementOptions);
            initStripeElement(response.customerEmail, scope);
        }
    });
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

/* Stripe Payment Element */
ready(() => {
    if ($('#payment-element').length && !$('.payment-summary').is(':visible')) {
        initNewStripeIntent('paymentElement');
    }

    if ($('#stripe-bank-transfer-element').length && !$('.payment-summary').is(':visible')) {
        initNewStripeIntent('bankTransferElement');
    }
});

// Update stored order amount on shipping method change
$('body').on('checkout:updateCheckoutView', function () {
    $.ajax({
        url: document.getElementById('getStripeOrderItemsURL').value,
        method: 'GET',
        dataType: 'json'
    }).done(function (json) {
        var stripeOrderAmountInput = document.getElementById('stripe_order_amount');

        // check if order amount has been changed
        // eslint-disable-next-line
        if (stripeOrderAmountInput && stripeOrderAmountInput.value != json.amount) {
            if ($('#payment-element').length) {
                initNewStripeIntent('paymentElement');
            }

            if ($('#stripe-bank-transfer-element').length) {
                initNewStripeIntent('bankTransferElement');
            }

            stripeOrderAmountInput.value = json.amount;
        }
    });
});

ready(() => {
    // eslint-disable-next-line no-unused-vars
    document.querySelector('.submit-shipping').addEventListener('click', (e) => {
        initAvailableElements();
    });

    if (document.querySelector('#dwfrm_billing input[name$="_email"]')) {
        document.querySelector('#dwfrm_billing input[name$="_email"]').addEventListener('change', refreshElementDefaultValues);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_firstName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_firstName"]').addEventListener('change', refreshElementDefaultValues);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_lastName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_lastName"]').addEventListener('change', refreshElementDefaultValues);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_phone"]')) {
        document.querySelector('#dwfrm_billing input[name$="_phone"]').addEventListener('change', refreshElementDefaultValues);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_postalCode"]')) {
        document.querySelector('#dwfrm_billing input[name$="_postalCode"]').addEventListener('change', refreshElementDefaultValues);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_country"]')) {
        document.querySelector('#dwfrm_billing input[name$="_country"]').addEventListener('change', refreshElementDefaultValues);
    }
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
        url: document.getElementById('paymentElementSubmitOrderURL').value,
        method: 'POST',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            checkoutSessionId: checkoutSessionActions.getSession().id
        },
        success: function (data) {
            window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl || '');
            window.localStorage.setItem('stripe_pe_orderid', data.orderID || '');
            window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken || '');

            if (data.error) {
                helpers.redirectToBillingPageWithError(data.errorMessage, CHECKOUT_ERROR_STORAGE_KEY);
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
        error: function () {
            forceSubmit = false;
            $.spinner().stop();
            $('body').trigger('checkout:enableButton', $('.next-step-button button'));
        }
    });
}

// v1
// eslint-disable-next-line consistent-return
document.querySelector('button.place-order').addEventListener('click', function (event) {
    if (window.localStorage.getItem('stripe_payment_method') !== 'STRIPE_PAYMENT_ELEMENT' && window.localStorage.getItem('stripe_payment_method') !== 'STRIPE_BANK_TRANSFER') {
        return true;
    }

    event.stopImmediatePropagation();

    // eslint-disable-next-line no-empty
    if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_PAYMENT_ELEMENT') {
        if (forceSubmit) return false;

        forceSubmit = true;
        var useCheckoutSessionsInput = document.getElementById('stripeUseCheckoutSessions');
        if (useCheckoutSessionsInput && useCheckoutSessionsInput.value === 'true') {
            handleStripeCheckoutSessionSubmitOrder();
        } else {
            handleStripePaymentElementSubmitOrder();
        }
        return false;
    }

    if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_BANK_TRANSFER') {
         if (forceSubmit) return false;

        forceSubmit = true;
        handleStripeBankTransferSubmitOrder();
        return false;
    }

    if (forceSubmit) return true;
});

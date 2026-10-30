/* eslint-disable no-alert */
/* globals $ */

'use strict';

var stripeConfig = require('./stripe/config');

var CHECKOUT_ERROR_STORAGE_KEY = 'stripe_checkout_error';

/**
 * Stores the order details read by redirectToCheckoutSummaryPage.
 * @param {Object} data - PaymentElementSubmitOrder response
 */
function storeOrderDetails(data) {
    window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl || '');
    window.localStorage.setItem('stripe_pe_orderid', data.orderID || '');
    window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken || '');
}

/**
 * Posts the stored order details to the order confirmation page.
 */
function redirectToCheckoutSummaryPage() {
    var continueUrl = window.localStorage.getItem('stripe_pe_continueurl');
    var orderId = window.localStorage.getItem('stripe_pe_orderid');
    var orderToken = window.localStorage.getItem('stripe_pe_ordertoken');

    if (continueUrl && orderId && orderToken) {
        var form = document.createElement('form');
        form.style.display = 'none';

        document.body.appendChild(form);

        form.method = 'POST';
        form.action = continueUrl;

        var orderIdInput = document.createElement('input');
        orderIdInput.name = 'orderID';
        orderIdInput.value = orderId;
        form.appendChild(orderIdInput);

        var orderTokenInput = document.createElement('input');
        orderTokenInput.name = 'orderToken';
        orderTokenInput.value = orderToken;
        form.appendChild(orderTokenInput);

        form.submit();
    }
}

/**
 * Returns the given email, or the one from the checkout summary or form.
 * @param {string} ownerEmail - known email, may be empty
 * @returns {string} customer email
 */
function getCustomerEmail(ownerEmail) {
    if (ownerEmail && ownerEmail !== 'null') {
        return ownerEmail;
    }

    var summaryEmail = $('.customer-summary-email').length ? $('.customer-summary-email').text().trim() : '';
    if (summaryEmail && summaryEmail !== 'null') {
        return summaryEmail;
    }

    var emailInput = document.querySelector('#dwfrm_billing input[name$="_email"]')
        || document.querySelector('input[name$="_email"]');
    return emailInput ? emailInput.value : '';
}

/**
 * Reads the billing details from the SFRA billing form.
 * @param {string} ownerEmail - known email, may be empty
 * @returns {Object} { billingDetails }
 */
function getBillingDetails(ownerEmail) {
    return {
        billingDetails: {
            email: getCustomerEmail(ownerEmail),
            name: (document.querySelector('#dwfrm_billing input[name$="_firstName"]') && document.querySelector('#dwfrm_billing input[name$="_lastName"]')) ? document.querySelector('#dwfrm_billing input[name$="_firstName"]').value + ' ' + document.querySelector('#dwfrm_billing input[name$="_lastName"]').value : '',
            phone: document.querySelector('#dwfrm_billing input[name$="_phone"]') ? document.querySelector('#dwfrm_billing input[name$="_phone"]').value : '',
            address: {
                postal_code: document.querySelector('#dwfrm_billing input[name$="_postalCode"]') ? document.querySelector('#dwfrm_billing input[name$="_postalCode"]').value : '',
                country: document.querySelector('#dwfrm_billing select[name$="_country"]') ? document.querySelector('#dwfrm_billing select[name$="_country"]').value : '',
                state: document.querySelector('#dwfrm_billing select[name$="_stateCode"]') ? document.querySelector('#dwfrm_billing select[name$="_stateCode"]').value : '',
                city: document.querySelector('#dwfrm_billing input[name$="_city"]') ? document.querySelector('#dwfrm_billing input[name$="_city"]').value : '',
                line1: document.querySelector('.billing-address input[name$="_address1"]') ? document.querySelector('.billing-address input[name$="_address1"]').value : '',
                line2: document.querySelector('.billing-address input[name$="_address2"]') ? document.querySelector('.billing-address input[name$="_address2"]').value : ''
            }
        }
    };
}

/**
 * @returns {boolean} true when the Element collects billing details ('auto')
 */
function isBillingDetailsCollectedByElement() {
    return stripeConfig.get('checkout').billingDetailsCollection !== 'never';
}

/**
 * Removes empty billing values.
 * @param {Object} details - billing details
 * @returns {Object} billing details without empty values
 */
function removeEmptyBillingValues(details) {
    var result = {};
    Object.keys(details).forEach(function (key) {
        var value = details[key];
        if (value && typeof value === 'object') {
            value = removeEmptyBillingValues(value);
            if (Object.keys(value).length) {
                result[key] = value;
            }
        } else if (value) {
            result[key] = value;
        }
    });
    return result;
}

/**
 * Returns Billing Details without empty values
 * @param {string} customerEmail - customer email
 * @returns {Object} billing details without empty values
 */
function getFormatedBillingAddress(customerEmail) {
    return removeEmptyBillingValues(getBillingDetails(customerEmail).billingDetails);
}

/**
 * Billing details to pass on confirmation.
 * @returns {Object} billing details
 */
function getConfirmationBillingDetails() {
    var billingDetails = getBillingDetails(null).billingDetails;

    // 'never': Stripe requires every field on confirm, so keep empty values
    // 'auto': drop empty values so they don't override what the Element collected
    if (!isBillingDetailsCollectedByElement()) {
        return billingDetails;
    }

    return removeEmptyBillingValues(billingDetails);
}

/**
 * Redirects to the billing page (same-origin http(s) URLs only).
 */
function redirectToBillingPage() {
    var billingPageUrl = (stripeConfig.get('checkout').urls || {}).billingPage;
    var safeUrl = null;

    if (billingPageUrl) {
        try {
            var parsedUrl = new URL(billingPageUrl, window.location.href);
            if ((parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:')
                && parsedUrl.origin === window.location.origin) {
                safeUrl = parsedUrl.href;
            }
        } catch (e) {
            safeUrl = null;
        }
    }

    if (safeUrl) {
        window.location.replace(safeUrl);
    } else {
        window.location.reload();
    }
}

/**
 * Shows an error in the checkout error banner.
 * @param {string} message - error message
 */
function showCheckoutError(message) {
    if (!message) {
        return;
    }

    var $errorBlock = $('.error-message');
    if ($errorBlock.length) {
        $errorBlock.find('.error-message-text').text(message);
        $errorBlock.show();
        $errorBlock.get(0).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        alert(message);
    }
}

/**
 * Redirects to the billing page and shows the error there.
 * @param {string} message - error message
 */
function redirectToBillingPageWithError(message) {
    if (message) {
        try {
            window.sessionStorage.setItem(CHECKOUT_ERROR_STORAGE_KEY, message);
        } catch (e) {
            alert(message);
        }
    }

    redirectToBillingPage();
}

/**
 * Shows the error stored by redirectToBillingPageWithError, once.
 */
function showStoredCheckoutError() {
    try {
        var storedError = window.sessionStorage.getItem(CHECKOUT_ERROR_STORAGE_KEY);
        if (storedError) {
            window.sessionStorage.removeItem(CHECKOUT_ERROR_STORAGE_KEY);
            showCheckoutError(storedError);
        }
    } catch (e) {
        // sessionStorage unavailable: nothing was stored
    }
}

/**
 * Fails the SFCC order created for a Checkout Session that could not be confirmed, then
 * sends the shopper back to the billing step, which creates a new session.
 * @param {Object} error - Error returned by Stripe.js
 */
function failCheckoutSessionOrder(error) {
    var errorMessage = (error && error.message) || $('#payment-element').data('errormsg');

    $.ajax({
        url: stripeConfig.get('checkout').urls.failOrder,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            errorMessage: errorMessage
        }
    }).always(function () {
        redirectToBillingPageWithError(errorMessage);
    });
}

/**
 * Runs the callback once the DOM is ready.
 * @param {Function} callback - callback
 */
function ready(callback) {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
}

/**
 * Shows only the tab pane of the active payment method.
 */
function showSelectedPaymentTab() {
    var list = document.querySelector('.payment-form').querySelectorAll('.tab-pane');
    for (var i = 0; i < list.length; i += 1) {
        list[i].classList.remove('active');
    }

    var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
    if (activePaymentMethod.length) {
        var selectedPaymentContent = document.getElementById(activePaymentMethod[0].getAttribute('href').replace('#', ''));
        if (selectedPaymentContent) {
            selectedPaymentContent.classList.add('active');
        }
    }
}

module.exports = {
    CHECKOUT_ERROR_STORAGE_KEY: CHECKOUT_ERROR_STORAGE_KEY,
    ready: ready,
    storeOrderDetails: storeOrderDetails,
    redirectToCheckoutSummaryPage: redirectToCheckoutSummaryPage,
    getBillingDetails: getBillingDetails,
    getFormatedBillingAddress: getFormatedBillingAddress,
    getConfirmationBillingDetails: getConfirmationBillingDetails,
    isBillingDetailsCollectedByElement: isBillingDetailsCollectedByElement,
    redirectToBillingPageWithError: redirectToBillingPageWithError,
    showCheckoutError: showCheckoutError,
    showStoredCheckoutError: showStoredCheckoutError,
    showSelectedPaymentTab: showSelectedPaymentTab,
    getCustomerEmail: getCustomerEmail,
    failCheckoutSessionOrder: failCheckoutSessionOrder
};

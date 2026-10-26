/* eslint-env es6 */
/* eslint-disable no-console */
/* eslint-disable no-plusplus */

'use strict';

var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

/**
 * Submits a refund / capture form via AJAX.
 * @param {HTMLButtonElement} button - Submit button
 * @param {string} resultElementId - ID of the element displaying the result
 */
var submitPaymentOperationForm = (button, resultElementId) => {
    var form = document.getElementById('stripe-payments-setup-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (button.disabled) {
        return;
    }
    button.disabled = true; // eslint-disable-line no-param-reassign

    var httpRequest = new XMLHttpRequest();
    var formData = form.serialize();

    httpRequest.onreadystatechange = function () {
        if (this.readyState !== 4) {
            return;
        }

        button.disabled = false; // eslint-disable-line no-param-reassign

        if (this.status === 200) {
            var response = JSON.parse(this.responseText);
            var result = document.getElementById(resultElementId);
            result.style.color = response.error ? '#ff0000' : '';
            result.innerHTML = response.message;

            if (!response.error) {
                // New nonce only after success: retries reuse the same idempotency key
                form.elements.stripe_request_nonce.value = (window.crypto && window.crypto.randomUUID)
                    ? window.crypto.randomUUID()
                    : Date.now().toString(36) + Math.random().toString(36).substring(2);
            }
        }
    };

    httpRequest.open('POST', form.action, true);
    httpRequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    httpRequest.send(formData);
};

ready(() => {
    if (document.querySelector('button.stripe-quick-setup-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-quick-setup-submit').addEventListener('click', (e) => {
            e.preventDefault();
            var siteIDs = [];

            var siteIDCheckboxes = document.getElementsByName('siteid');
            for (var i = 0; i < siteIDCheckboxes.length; ++i) {
                if (siteIDCheckboxes[i].checked) {
                    siteIDs.push(siteIDCheckboxes[i].dataset.siteid);
                }
            }

            document.getElementById('stripe_site_ids').value = siteIDs.join(',');

            document.getElementById('quick-setup-sites-error-msg').style.display = siteIDs.length ? 'none' : 'block';

            if (!siteIDs.length) {
                return;
            }

            var stripeQuickSetupForm = document.getElementById('stripe-quick-setup-form');
            var isStripeQuickSetupFormValid = stripeQuickSetupForm.checkValidity();
            if (!isStripeQuickSetupFormValid) {
                stripeQuickSetupForm.reportValidity();
                return;
            }

            var httpRequest = new XMLHttpRequest();
            var formData = document.getElementById('stripe-quick-setup-form').serialize();

            httpRequest.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    var response = JSON.parse(this.responseText);
                    var result = document.getElementById('quick-setup-result');
                    result.style.color = response.error ? '#ff0000' : '';
                    result.innerHTML = response.message;
                }
            };

            httpRequest.open('POST', document.getElementById('stripe-quick-setup-form').action, true);
            httpRequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            httpRequest.send(formData);
        });
    }

    if (document.querySelector('button.stripe-payment-setup-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-payment-setup-submit').addEventListener('click', (e) => {
            e.preventDefault();

            var httpRequest = new XMLHttpRequest();
            var formData = document.getElementById('stripe-payments-setup-form').serialize();

            httpRequest.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    var response = JSON.parse(this.responseText);

                    if (response.error) {
                        var result = document.getElementById('payment-setup-result');
                        result.style.color = '#ff0000';
                        result.innerHTML = response.message;
                    } else {
                        var a = document.createElement('a');
                        a.href = 'data:text/html;charset=utf-8,' + response.content;
                        a.download = 'payment-methods.xml';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }
                }
            };

            httpRequest.open('POST', document.getElementById('stripe-payments-setup-form').action, true);
            httpRequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            httpRequest.send(formData);
        });
    }

    if (document.querySelector('button.stripe-payment-refund-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-payment-refund-submit').addEventListener('click', (e) => {
            e.preventDefault();
            submitPaymentOperationForm(e.currentTarget, 'payment-refund-result');
        });
    }

    if (document.querySelector('button.stripe-payment-capture-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-payment-capture-submit').addEventListener('click', (e) => {
            e.preventDefault();
            submitPaymentOperationForm(e.currentTarget, 'payment-capture-result');
        });
    }
});

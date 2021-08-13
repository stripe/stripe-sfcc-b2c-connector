/* eslint-disable no-alert */
/* eslint-disable no-plusplus */
/* eslint-disable require-jsdoc */
/* globals Stripe, $ */

'use strict';

// v1
var $form = $('.payment-form');
var stripe = Stripe(document.getElementById('stripePublicKey').value);
var elements = stripe.elements();

function setCustomCardOutcome(result) {
    var displayError = document.getElementById('card-errors');
    if (result.error) {
        displayError.textContent = result.error.message;
    } else {
        displayError.textContent = '';
    }
}

var cardBrandToPfClass = {
    visa: 'pf-visa',
    mastercard: 'pf-mastercard',
    amex: 'pf-american-express',
    discover: 'pf-discover',
    diners: 'pf-diners',
    jcb: 'pf-jcb',
    unknown: 'pf-credit-card'
};

function setCustomCardBrandIcon(brand) {
    var brandIconElement = document.getElementById('brand-icon');
    var pfClass = 'pf-credit-card';
    if (brand in cardBrandToPfClass) {
        pfClass = cardBrandToPfClass[brand];
    }

    for (var i = brandIconElement.classList.length - 1; i >= 0; i--) {
        brandIconElement.classList.remove(brandIconElement.classList[i]);
    }
    brandIconElement.classList.add('pf');
    brandIconElement.classList.add(pfClass);
}

var cardElement = null;
var cardNumberElement = null;

if (document.getElementById('card-element')) {
    cardElement = elements.create('card', { style: $form.data('element-style') });
    cardElement.mount('#card-element');
} else if (document.getElementById('stripe-custom-card-group')) {
    var style = JSON.parse(document.getElementById('stripe-custom-card-group').dataset.elementstyle);

    cardNumberElement = elements.create('cardNumber', {
        style: style
    });
    cardNumberElement.mount('#card-number-element');

    var cardExpiryElement = elements.create('cardExpiry', {
        style: style
    });
    cardExpiryElement.mount('#card-expiry-element');

    var cardCvcElement = elements.create('cardCvc', {
        style: style
    });
    cardCvcElement.mount('#card-cvc-element');

    cardNumberElement.on('change', function (event) {
        // Switch brand logo
        if (event.brand) {
            setCustomCardBrandIcon(event.brand);
        }

        setCustomCardOutcome(event);
    });
}

$('button[type="submit"]').on('click', function (e) {
    e.preventDefault();
    var stripeCardEl = (!cardElement) ? cardNumberElement : cardElement;
    stripe.createPaymentMethod('card', stripeCardEl, {
        billing_details: {
            name: $('#cardOwner').val()
        }
    }).then(function (result) {
        if (result.error) {
            alert(result.error.message);
        } else {
            var paymentMethodId = result.paymentMethod.id;
            $.ajax({
                url: $form.attr('action'),
                method: 'POST',
                data: {
                    payment_method_id: paymentMethodId,
                    csrf_token: $('[name="csrf_token"]').val()
                }
            }).done(function (msg) {
                if (msg.success) {
                    window.location.href = $form.data('wallet-url');
                } else {
                    alert(msg.error);
                }
            }).fail(function (msg) {
                if (msg.responseJSON.redirectUrl) {
                    window.location.href = msg.responseJSON.redirectUrl;
                } else {
                    alert(msg);
                }
            });
        }
    });
});

/* eslint-disable no-alert */
/* globals cardElement, cardNumberElement, Stripe */
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

window.cardElement = null;
window.cardNumberElement = null;

if (document.getElementById('card-element')) {
	window.cardElement = elements.create('card', { style: $form.data('element-style') });
	window.cardElement.mount('#card-element');
} else if (document.getElementById('stripe-custom-card-group')) {
    var style = JSON.parse(document.getElementById('stripe-custom-card-group').dataset.elementstyle);

    window.cardNumberElement = elements.create('cardNumber', {
        style: style
    });
    window.cardNumberElement.mount('#card-number-element');

    var cardExpiryElement = elements.create('cardExpiry', {
        style: style
    });
    cardExpiryElement.mount('#card-expiry-element');

    var cardCvcElement = elements.create('cardCvc', {
        style: style
    });
    cardCvcElement.mount('#card-cvc-element');

    window.cardNumberElement.on('change', function (event) {
        // Switch brand logo
        if (event.brand) {
            setCustomCardBrandIcon(event.brand);
        }

        setCustomCardOutcome(event);
    });
}

var $cardHolderNameInput = $('#stripe-cardholder-name');

function closeDialog() {
    var $dialogContainer = $('#dialog-container');
    if ($dialogContainer.length) {
        $dialogContainer.dialog('close');
    }
}

var cancelBtn = document.getElementById('stripeCancelBtn');
cancelBtn.addEventListener('click', function () {
    closeDialog();
});

var $addCardBtn = $('#stripeApplyBtn');
$addCardBtn.on('click', function () {
    // https://stripe.com/docs/payments/payment-methods/saving

    var stripeCardEl = (!window.cardElement) ? window.cardNumberElement : window.cardElement;
    stripe.createPaymentMethod('card', stripeCardEl, {
        billing_details: {
            name: $cardHolderNameInput.val()
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
                    // eslint-disable-next-line no-restricted-globals
                    location.reload();
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
    closeDialog();
});

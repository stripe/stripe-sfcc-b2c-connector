/* eslint-disable no-alert */
/* globals Stripe */
// v1
var $form = $('.payment-form');
var stripe = Stripe(document.getElementById('stripePublicKey').value);
var elements = stripe.elements();
var cardElement = elements.create('card', { style: $form.data('element-style') });
cardElement.mount('#card-element');

$('button[type="submit"]').on('click', function (e) {
    e.preventDefault();
    stripe.createPaymentMethod('card', cardElement, {
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

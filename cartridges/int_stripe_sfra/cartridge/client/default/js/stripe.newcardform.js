/* eslint-disable no-alert */
/* globals elements, stripe, cardElementStyle, walletURL */
// v1
var cardElement = elements.create('card', { style: cardElementStyle });
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
                url: URL,
                method: 'POST',
                data: {
                    payment_method_id: paymentMethodId
                }
            }).done(function (msg) {
                if (msg.success) {
                    window.location.href = walletURL;
                } else {
                    alert(msg.error);
                }
            }).fail(function (msg) {
                alert(msg);
            });
        }
    });
});

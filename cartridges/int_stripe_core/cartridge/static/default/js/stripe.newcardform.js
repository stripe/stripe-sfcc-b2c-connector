/* eslint-disable no-alert */
/* globals elements, style, cardElement, stripe */
// v1
window.cardElement = window.cardElement || elements.create('card', { style: style });
cardElement.mount('#card-element');

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

    stripe.createPaymentMethod('card', cardElement, {
        billing_details: {
            name: $cardHolderNameInput.val()
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
                    // eslint-disable-next-line no-restricted-globals
                    location.reload();
                } else {
                    alert(msg.error);
                }
            }).error(function (msg) {
                alert(msg);
            });
        }
    });
    closeDialog();
});

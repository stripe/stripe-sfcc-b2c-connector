/* eslint-disable no-console */
/* globals stripe, stripeAccountCountry, stripeShippingOptions, elements */
// v1
function initPRB() {
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    var paymentRequest = stripe.paymentRequest({
        country: stripeAccountCountry,
        currency: currencyCode,
        total: {
            label: 'Order total',
            amount: amountToPay
        },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
        requestShipping: true,
        shippingOptions: stripeShippingOptions
    });

    var prButton = elements.create('paymentRequestButton', {
        paymentRequest: paymentRequest
    });

    // Check the availability of the Payment Request API first.
    paymentRequest.canMakePayment().then(function (result) {
        if (result) {
            prButton.mount('#payment-request-button');
        } else {
            document.getElementById('payment-request-button').style.display = 'none';
        }
    });
    paymentRequest.on('paymentmethod', function (ev) {
        console.log(ev);
        try {
            document.querySelector('input[name$="_email"]').value = ev.payerEmail;
            // v1
            // eslint-disable-next-line no-undef
            copyNewCardDetails(ev.paymentMethod);
            ev.complete('success');
            $('.submit-payment').click();
        } catch (error) {
            console.log(error);
            ev.complete('fail');
        }
    });
}

var prbPlaceholder = document.getElementById('payment-request-button');
if (prbPlaceholder) {
    initPRB();
}

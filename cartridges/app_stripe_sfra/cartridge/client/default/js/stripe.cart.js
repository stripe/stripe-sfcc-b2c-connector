/* global stripe, stripeAccountCountry, stripeShippingOptions, elements, serviceUrl, $ */

'use strict';

/**
 * Init Payment Request Button
 */
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
        $.ajax({
            url: serviceUrl,
            type: 'POST',
            dataType: 'json',
            data: ev
        }).done(function (result) {
            ev.complete('success');
            if (result.redirectUrl) {
                window.location.href = result.redirectUrl;
            }
        }).error(function (error) {
            ev.complete('fail');
            // v1
            // eslint-disable-next-line no-console
            console.log(error);
        });
        // console.log(ev);
        try {
            document.querySelector('input[name$="_email"]').value = ev.payerEmail;
            // v1
            // eslint-disable-next-line no-undef
            copyNewCardDetails(ev.paymentMethod);
            ev.complete('success');
            $('.submit-payment').click();
        } catch (error) {
            // v1
            // eslint-disable-next-line no-console
            console.log(error);
            ev.complete('fail');
        }
    });
}

var prbPlaceholder = document.getElementById('payment-request-button');
if (prbPlaceholder) {
    initPRB();
}

'use strict';

var stripeOptions = {};
var expressCheckoutElement;
var stripeApiVersion = document.getElementById('stripeApiVersion').value;

var stripe = Stripe(document.getElementById('stripePublicKey').value, stripeApiVersion);

var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency') ? document.getElementById('stripe_order_currency').value.toLowerCase() : null;

if ($('#express-checkout-element').length) {
    var elements = stripe.elements({
        mode: 'setup',
        currency: stripeOrderCurrencyInput,
        appearance: JSON.parse(document.getElementById('stripeExpressCheckoutAppearance').value),
        capture_method: $('#stripeCaptureMethod').val(),
    });
}

/**
 * Populates an object with add to cart details of the product
 * @param {Object} payload - Payload object to be populater or null
 * @returns {Object} The populated objec
 */
function getProductData() {
    if ($('.product-detail').length > 0) {
        var $form = $('.pdpForm');
        var $qty = $form.find('input[name="Quantity"]');
        if ($qty.length === 0 || isNaN($qty.val()) || parseInt($qty.val(), 10) === 0) {
            $qty.val('1');
        }

        return $form.serialize();
    }

    return '';
}

/**
 * Estimtes The amount to be displayed when initialising the ECE
 * @param {Object} product - Product Data
 * @returns {number} The initial estimated basket value
 */
function getAmountToDisplay(product) {
    if ($('#express-checkout-element').hasClass('isProductPage')) {
        return !product ? document.getElementById('stripeProductPrice').value * 100 : product.price.sales.value * 100;
    }

    var basketValue = parseInt(document.getElementById('stripe_order_amount').value, 10);

    return basketValue;
}

/**
 * Mounts Express Checkout Element
 * @param {Object} product - Product Data
 */
function mountExpressCheckoutButton() {
    expressCheckoutElement = elements.create('expressCheckout', stripeOptions);
    expressCheckoutElement.mount('#express-checkout-element');
}

/**
 * Updates Express Checkout element amount and availability
 * @param {Object} product - Product Data
 */
function updateExpressCheckoutElement(product) {
    if (product) {
        elements.update({
            mode: 'payment', amount: getAmountToDisplay(product)
        });

        if (product.readyToOrder && product.available) {
            $('#express-checkout-element').removeClass('d-none');
        } else {
            $('#express-checkout-element').addClass('d-none');
        }
    }
}

/**
 * Handles Stripe Express Checkout Events
 */
function initStripeCheckoutExpress() {
    if ($('#express-checkout-element').length) {
        mountExpressCheckoutButton();
        elements.update({
            mode: 'payment', amount: getAmountToDisplay()
        });

        expressCheckoutElement.on('click', function (event) {
            var bodyData = getProductData();

            $.ajax({
                url: $('#stripe_get_shipping_options').val(),
                method: 'GET',
                data: bodyData,
                success: function(data) {
                    elements.update({
                        mode: 'payment', amount: data.cartTotal
                    });

                    event.resolve({
                        emailRequired: true,
                        phoneNumberRequired: true,
                        shippingAddressRequired: true,
                        shippingRates: data.shippingMethods
                    });
                }
            });
        });

        expressCheckoutElement.on('shippingratechange', function (event) {
            var bodyData = getProductData();

            bodyData.selectedShippingRateId = event.shippingRate.id;

            $.ajax({
                url: $('#stripe_get_shipping_options').val(),
                method: 'GET',
                data: bodyData,
                success: function(data) {
                    elements.update({
                        amount: data.cartTotal
                    });

                    event.resolve();
                }
            });
        });

        expressCheckoutElement.on('confirm', function (event) {
            var stripeReturnURLInput = $('#stripe_return_url');
            var stripeReturnURL = stripeReturnURLInput.val();
            var payloadData = getProductData();
            payloadData += '&billingAddress=' + JSON.stringify(event.billingDetails.address) +
                '&shippingAddress=' +  JSON.stringify(event.shippingAddress.address) +
                '&csrf_token=' + $('[name="csrf_token"]').val() +
                '&billingName=' + event.billingDetails.name +
                '&shippingName=' + event.shippingAddress.name +
                '&email=' + event.billingDetails.email+
                '&phone=' + event.billingDetails.phone;

            elements.submit().then(function (result) {
                if (result.error) {
                    return;
                }
                $.ajax({
                    url: $('#stripe_express_checkout_url').val(),
                    method: 'POST',
                    data: payloadData,
                    success: function (data) {
                        window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl);
                        window.localStorage.setItem('stripe_pe_orderid', data.orderID);
                        window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken);
                        stripe.confirmPayment({
                            elements: elements,
                            clientSecret: data.clientSecret,
                            confirmParams: {
                                // Make sure to change this to your payment completion page
                                return_url: stripeReturnURL
                            }
                        }
                        ).then(function (response) {
                            if (response.error) {
                                $.ajax({
                                    url: document.getElementById('logStripeErrorMessageURL').value,
                                    method: 'POST',
                                    dataType: 'json',
                                    data: {
                                        csrf_token: $('[name="csrf_token"]').val(),
                                        msg: 'UPE stripe.confirmPayment Error ' + JSON.stringify(response.error)
                                    }
                                }).done(function () {
                                    $.ajax({
                                        url: document.getElementById('stripeFailOrderURL').value,
                                        method: 'POST',
                                        dataType: 'json',
                                        data: {
                                            csrf_token: $('[name="csrf_token"]').val()
                                        }
                                    }).done(function () {
                                        window.location.reload();
                                    });
                                });
                            }
                        });
                    }
                });
            });
        });
    }
}

var ready = function (callback) {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(function () {
    initStripeCheckoutExpress();
});

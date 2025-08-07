'use strict';

var baseDetail = require('base/product/detail');
var stripeOptions = {};
var expressCheckoutElement;
var stripeApiVersion = document.getElementById('stripeApiVersion').value;

var stripe = Stripe(document.getElementById('stripePublicKey').value, stripeApiVersion);

var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency').value.toLowerCase();

var elements = stripe.elements({
    mode: 'setup',
    currency: stripeOrderCurrencyInput,
    appearance: JSON.parse(document.getElementById('stripeExpressCheckoutAppearance').value),
    capture_method: $('#stripeCaptureMethod').val(),
});

/**
 * Estimtes The amount to be displayed when initialising the ECE
 * @param {Object} product - Product Data
 * @param {string} shippingCost - Shipping cost
 * @returns {number} The initial estimated basket value
 */
function getAmountToDisplay(product, shippingCost) {
    if ($('#express-checkout-element').hasClass('isProductPage')) {
        var shippingAmount = shippingCost || 0;
        var quantitySelected = parseInt($('button.add-to-cart').closest('.product-detail').find('.quantity-select').val(), 10);
        var productTotalPrice = !product ? document.getElementById('stripeProductPrice').value * 100 : product.price.sales.value * 100;

        return productTotalPrice * quantitySelected + shippingAmount;
    }

    var basketValue = parseInt(document.getElementById('stripe_order_amount').value, 10);

    return basketValue;
}

/**
 * Mounts ECE Element
 */
function mountExpressCheckoutButton() {
    expressCheckoutElement = elements.create('expressCheckout', stripeOptions);
    expressCheckoutElement.mount('#express-checkout-element');
}

/**
 * Retrieve product options
 *
 * @param {jQuery} $productContainer - DOM element for current product
 * @return {string} - Product options and their selected values
 */
function getOptions($productContainer) {
    var options = $productContainer
        .find('.product-option')
        .map(function () {
            var $elOption = $(this).find('.options-select');
            var urlValue = $elOption.val();
            var selectedValueId = $elOption.find('option[value="' + urlValue + '"]')
                .data('value-id');
            return {
                optionId: $(this).data('option-id'),
                selectedValueId: selectedValueId
            };
        }).toArray();

    return JSON.stringify(options);
}

/**
 * Retrieves the bundle product item ID's for the Controller to replace bundle master product
 * items with their selected variants
 *
 * @return {string[]} - List of selected bundle product item ID's
 */
function getChildProducts() {
    var childProducts = [];
    $('.bundle-item').each(function () {
        childProducts.push({
            pid: $(this).find('.product-id').text(),
            quantity: parseInt($(this).find('label.quantity').data('quantity'), 10)
        });
    });

    return childProducts.length ? JSON.stringify(childProducts) : [];
}

/**
 * Updates Express Checkout Element Visibility
 * @param {Object} product - Product data
 */
function updateExpressCheckoutElement(product) {
    if (product) {
        if (product.readyToOrder && product.available) {
            $('#express-checkout-element').removeClass('d-none');
        } else {
            $('#express-checkout-element').addClass('d-none');
        }
    }
}

/**
 * Populates an object with add to cart details of the product
 * @param {Object} payload - Payload object to be populater or null
 * @returns {Object} The populated objec
 */
function getProductData(payload) {
    var returnObj = payload || {};

    if ($('.product-detail').length > 0) {
        returnObj.pid = $('button.add-to-cart').closest('.product-detail').find('.product-id').text();
        returnObj.quantity = $('button.add-to-cart').closest('.product-detail').find('.quantity-select').val();
        returnObj.childProducts = getChildProducts();
        var $productContainer = $('button.add-to-cart').closest('.product-detail');
        returnObj.options = getOptions($productContainer);
    }

    return returnObj;
}

/**
 * Initialise Stripe ECE events
 */
function initStripeCheckoutExpress() {
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

        payloadData.billingAddress = JSON.stringify(event.billingDetails.address);
        payloadData.shippingAddress = JSON.stringify(event.shippingAddress.address);
        payloadData.csrf_token = $('[name="csrf_token"]').val();
        payloadData.billingName = event.billingDetails.name;
        payloadData.shippingName = event.shippingAddress.name;
        payloadData.email = event.billingDetails.email;
        payloadData.phone = event.billingDetails.phone;
        payloadData.selectedShippingRateId = event.shippingRate.id;

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
                                $.spinner().start();

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
                                $.spinner().stop();
                            });
                        }
                    });
                }
            });
        });
    });
}

/**
 * Updates Add To Cart Button and ECE
 */
function updateAddToCart() {
    $('body').on('product:updateAddToCart', function (e, response) {
        // update local add to cart (for sets)
        $('button.add-to-cart', response.$productContainer).attr('disabled',
            (!response.product.readyToOrder || !response.product.available));

        var enable = $('.product-availability').toArray().every(function (item) {
            return $(item).data('available') && $(item).data('ready-to-order');
        });

        updateExpressCheckoutElement(response.product);

        baseDetail.methods.updateAddToCartEnableDisableOtherElements(!enable);
    });
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
    updateAddToCart();
});

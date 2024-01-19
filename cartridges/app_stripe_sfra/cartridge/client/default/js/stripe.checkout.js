/* eslint-env es6 */
/* eslint-disable no-console */
/* eslint-disable no-alert */
/* eslint-disable no-param-reassign */
/* eslint-disable dot-notation */
/* eslint-disable no-plusplus */
/* eslint-disable require-jsdoc */
/* globals Stripe, $ */

'use strict';

var stripeOptions = [];
var betas = document.getElementById('stripePaymentMethodsInBeta').value;
if (betas) {
    stripeOptions.betas = betas.split(',');
}

var stripeApiVersion = document.getElementById('stripeApiVersion').value;
if (stripeApiVersion) {
    stripeOptions.apiVersion = stripeApiVersion;
}

var stripe = Stripe(document.getElementById('stripePublicKey').value, stripeOptions);
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
    cardElement = elements.create('card');
    cardElement.mount('#card-element');
    cardElement.addEventListener('change', function (event) {
        var displayError = document.getElementById('card-errors');
        if (event.error) {
            displayError.textContent = event.error.message;
        } else {
            displayError.textContent = '';
        }
    });
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

var newCardFormContainer = document.getElementById('new-card-form-container');
var savedCardsFormContainer = document.getElementById('saved-cards-container');
var cardIdInput = document.getElementsByName('stripe_source_id');
var cardNumberInput = document.getElementById('stripe_card_number');
var cardHolderInput = document.getElementById('stripe_card_holder');
var cardTypeInput = document.getElementById('stripe_card_type');
var cardTypeInputSFCC = document.getElementById('cardType');
var cardBrandInput = document.getElementById('stripe_card_brand');
var cardExpMonthInput = document.getElementById('stripe_card_expiration_month');
var cardExpYearInput = document.getElementById('stripe_card_expiration_year');
var prUsedInput = document.getElementById('stripe_pr_used');

var prbPlaceholder = document.getElementById('payment-request-button');

var forceSubmit = false;
var prUsed = false;

var switchToSavedCardsLink = document.getElementById('switch-to-saved-cards');
if (switchToSavedCardsLink) {
    switchToSavedCardsLink.addEventListener('click', function () {
        newCardFormContainer.style.display = 'none';
        savedCardsFormContainer.style.display = 'block';
    });
}

var switchToNewCardLink = document.getElementById('switch-to-add-card');
if (switchToNewCardLink) {
    switchToNewCardLink.addEventListener('click', function () {
        newCardFormContainer.style.display = 'block';
        savedCardsFormContainer.style.display = 'none';
    });
}

if (savedCardsFormContainer) {
    newCardFormContainer.style.display = 'none';
}

function isSavedCard() {
    return document.getElementById('saved-cards-container') && (document.getElementById('saved-cards-container').style.display === 'block') && newCardFormContainer && newCardFormContainer.style.display === 'none';
}

function capitalize(text) {
    return text.replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
    });
}

function copySelectedSaveCardDetails() {
    var savedCard = document.querySelector('input[name=saved_card_id]:checked');
    cardIdInput.forEach(function (input) {
        input.value = savedCard.value;
    });
    cardNumberInput.value = savedCard.dataset.cardnumber;
    cardHolderInput.value = savedCard.dataset.cardholder;
    cardTypeInput.value = savedCard.dataset.cardtype;
    cardTypeInputSFCC.value = capitalize(savedCard.dataset.cardtype);
    cardExpMonthInput.value = savedCard.dataset.cardexpmonth;
    cardExpYearInput.value = savedCard.dataset.cardexpyear;
    prUsedInput.value = '';
}

function copyNewCardDetails(paymentMethod) {
    cardIdInput.forEach(function (input) {
        input.value = paymentMethod.id;
    });

    if (paymentMethod.card) {
        cardNumberInput.value = '************' + paymentMethod.card.last4;
        cardTypeInput.value = '';
        cardTypeInputSFCC.value = capitalize(paymentMethod.card.brand);
        cardBrandInput.value = paymentMethod.card.brand;
        cardExpMonthInput.value = paymentMethod.card.exp_month;
        cardExpYearInput.value = paymentMethod.card.exp_year;
    }
    cardHolderInput.value = paymentMethod.billing_details && paymentMethod.billing_details.name;
    prUsedInput.value = '';
}

function getOwnerDetails() {
    var stateElement = document.querySelector('.billing-address select[name$="_stateCode"]') || document.querySelector('.billing-address input[name$="_stateCode"]')
        || document.querySelector('select[name$="_stateCode"]') || document.querySelector('input[name$="_stateCode"]');

    var ownerNames = (document.querySelector('.billing-address input[name$="_firstName"]') && document.querySelector('.billing-address input[name$="_lastName"]'))
        ? document.querySelector('.billing-address input[name$="_firstName"]').value + ' ' + document.querySelector('.billing-address input[name$="_lastName"]').value
        : document.querySelector('input[name$="_firstName"]').value + ' ' + document.querySelector('input[name$="_lastName"]').value;

    var addrLine1 = document.querySelector('.billing-address input[name$="_address1"]')
        ? document.querySelector('.billing-address input[name$="_address1"]').value : document.querySelector('input[name$="_address1"]').value;

    var addrLine2 = document.querySelector('.billing-address input[name$="_address2"]')
        ? document.querySelector('.billing-address input[name$="_address2"]').value : document.querySelector('input[name$="_address2"]').value;

    var addrCity = document.querySelector('.billing-address input[name$="_city"]')
        ? document.querySelector('.billing-address input[name$="_city"]').value : document.querySelector('input[name$="_city"]').value;

    var addrPostalCode = document.querySelector('.billing-address input[name$="_postalCode"]')
        ? document.querySelector('.billing-address input[name$="_postalCode"]').value : document.querySelector('input[name$="_postalCode"]').value;

    var addrCountry = document.querySelector('.billing-address select[name$="_country"]')
        ? document.querySelector('.billing-address select[name$="_country"]').value : document.querySelector('select[name$="_country"]').value;

    var ownerEmail = '';
    if ($('.customer-summary-email').length && $('.customer-summary-email').text()) {
        ownerEmail = $('.customer-summary-email').text();
    } else {
        ownerEmail = document.querySelector('#dwfrm_billing input[name$="_email"]')
            ? document.querySelector('#dwfrm_billing input[name$="_email"]').value
            : document.querySelector('input[name$="_email"]').value;
    }

    // SFRA 6 issue with email not presented on checkout
    if (!ownerEmail || ownerEmail === 'null') {
        $.ajax({
            url: document.getElementById('getCustomerEmailURL').value,
            method: 'GET',
            dataType: 'json',
            async: false
        }).done(function (json) {
            ownerEmail = json.email;
            $('.customer-summary-email').text(json.email);
        });
    }

    var ownerPhone = document.querySelector('#dwfrm_billing input[name$="_phone"]')
        ? document.querySelector('#dwfrm_billing input[name$="_phone"]').value : document.querySelector('input[name$="_phone"]').value;

    return {
        name: ownerNames,
        address: {
            line1: addrLine1,
            line2: addrLine2,
            city: addrCity,
            postal_code: addrPostalCode,
            country: addrCountry,
            state: stateElement ? stateElement.value : ''
        },
        email: ownerEmail,
        phone: ownerPhone
    };
}

function populateBillingData(pr) {
    var form = document.getElementById('dwfrm_billing');

    var payerName = pr.payerName;
    if (payerName) {
        var payerNameSplit = payerName.split(' ');

        if (payerNameSplit.length > 1) {
            var firstName = payerNameSplit[0];
            var lastName = payerNameSplit[1];

            form.querySelector('input[name$="_firstName"]').value = firstName;
            form.querySelector('input[name$="_lastName"]').value = lastName;
        } else {
            form.querySelector('input[name$="_firstName"]').value = payerName;
            form.querySelector('input[name$="_lastName"]').value = payerName;
        }
    }

    form.querySelector('input[name$="_email"]').value = pr.payerEmail;
    form.querySelector('input[name$="_phone"]').value = pr.payerPhone;

    var selectCountryElement = form.querySelector('select[name$="_country"]');
    var prCountry = pr.paymentMethod.billing_details.address.country.toLowerCase();
    var prCountryExists = ($('#' + selectCountryElement.id + ' option[value=' + prCountry + ']').length > 0);

    if (prCountryExists) {
        selectCountryElement.value = prCountry;
    }

    form.querySelector('input[name$="_city"]').value = pr.paymentMethod.billing_details.address.city;
    form.querySelector('input[name$="_postalCode"]').value = pr.paymentMethod.billing_details.address.postal_code;
    form.querySelector('input[name$="_address1"]').value = pr.paymentMethod.billing_details.address.line1;
    form.querySelector('input[name$="_address2"]').value = pr.paymentMethod.billing_details.address.line2;

    var stateElement = form.querySelector('select[name$="_stateCode"]') || form.querySelector('input[name$="_stateCode"]');
    stateElement.value = pr.paymentMethod.billing_details.address.state;
}

function updateBillingAddressAjax(billingAddress) {
    var url = $('#updateBillingAddress').val();
    $.ajax({
        type: 'post',
        url: url,
        data: JSON.stringify(billingAddress),
        contentType: 'application/json; charset=utf-8',
        traditional: true,
        success: function (data) {
            if (data.success) {
                console.log('User billing address updated successfully.');
            } else {
                console.log('billing address update failed.');
            }
        }
    });
}

function updateUserProfileBillingAddress() {
    if ($('#billingAddressSelector').length) {
        var selectedBillingAddress = $('#billingAddressSelector').find(':selected');
        if (selectedBillingAddress.hasClass('isBillingAddress')) {
            var billingAddress = {};
            billingAddress.addressId = selectedBillingAddress.val();
            billingAddress.firstName = $('#billingFirstName').val();
            billingAddress.lastName = $('#billingLastName').val();
            billingAddress.address1 = $('#billingAddressOne').val();
            billingAddress.address2 = $('#billingAddressTwo').val();
            billingAddress.city = $('#billingAddressCity').val();
            billingAddress.states = {};
            billingAddress.states.stateCode = $('#billingState').val();
            billingAddress.postalCode = $('#billingZipCode').val();
            billingAddress.countryCode = $('#billingCountry').val();
            billingAddress.phone = $('#phoneNumber').val();

            updateBillingAddressAjax(billingAddress);
        }
    }
}

document.querySelector('button.submit-payment').addEventListener('click', function (event) {
    // skip event handler for Stripe Payment Elements
    // eslint-disable-next-line
    if ($('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val() == 'STRIPE_PAYMENT_ELEMENT') {
        window.localStorage.setItem('stripe_payment_method', 'STRIPE_PAYMENT_ELEMENT');
        var paymentMethodName = $('*[data-method-id="STRIPE_PAYMENT_ELEMENT"] > a').text();
        $('.payment-details').text(paymentMethodName);
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');

        return;
    }

    if ($('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val() === 'CREDIT_CARD') {
        window.localStorage.setItem('stripe_payment_method', 'CREDIT_CARD');
    } else if ($('#dwfrm_billing .' + $('.tab-pane.active').attr('id') + ' .payment-form-fields input.form-control').val() === 'STRIPE_PAYMENT_REQUEST_BTN') {
        window.localStorage.setItem('stripe_payment_method', 'STRIPE_PAYMENT_REQUEST_BTN');
    } else {
        window.localStorage.setItem('stripe_payment_method', '');
        return;
    }

    let billingForm = document.getElementById('dwfrm_billing');
    $(billingForm).find('.form-control.is-invalid').removeClass('is-invalid');
    if (!billingForm.reportValidity()) {
        billingForm.focus();
        billingForm.scrollIntoView();
        return;
    }

    event.stopImmediatePropagation();
    updateUserProfileBillingAddress();
    var activeTabId = $('.tab-pane.active').attr('id');
    var paymentInfoSelector = '#dwfrm_billing .' + activeTabId + ' .payment-form-fields input.form-control';
    var selectedPaymentMethod = $(paymentInfoSelector).val();

    window.localStorage.setItem('stripe_payment_method', selectedPaymentMethod);

    switch (selectedPaymentMethod) {
        case 'CREDIT_CARD':
            if (prUsed) {
                console.log('submit prUsed');
            } else if (isSavedCard()) {
                copySelectedSaveCardDetails();
                $('.submit-payment').click();
            } else {
                var owner = getOwnerDetails();
                var stripeCardEl = (!cardElement) ? cardNumberElement : cardElement;
                stripe.createPaymentMethod('card', stripeCardEl, {
                    billing_details: {
                        name: owner.name,
                        address: owner.address,
                        email: owner.email,
                        phone: owner.phone
                    }
                }).then(function (result) {
                    if (result.error) {
                        alert(result.error.message);
                    } else {
                        copyNewCardDetails(result.paymentMethod);
                        $('.submit-payment').click();
                    }
                });
            }
            break;
        default:
            break;
    }
});

function initPRB() {
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    var paymentRequest = stripe.paymentRequest({
        country: document.getElementById('stripeAccountCountry').value,
        currency: currencyCode,
        total: {
            label: 'Order Total',
            amount: amountToPay
        },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true
    });

    var prButton = elements.create('paymentRequestButton', {
        paymentRequest: paymentRequest,
        style: {
            paymentRequestButton: JSON.parse(document.getElementById('stripePaymentButtonStyle').value)
        }
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
        try {
            prUsed = true;
            prUsedInput.value = 'true';

            populateBillingData(ev);
            copyNewCardDetails(ev.paymentMethod);

            $('li.nav-item[data-method-id="CREDIT_CARD"] a').click();
            $('.submit-payment').click();

            ev.complete('success');
        } catch (e) {
            prUsed = false;
            prUsedInput.value = '';

            ev.complete('fail');
        }
    });

    // Update request button totals - should be done on 'click' event
    prButton.on('click', function () {
        var stripeInputOrderAmount = document.getElementById('stripe_order_amount');
        var amount = parseFloat(stripeInputOrderAmount.value);

        paymentRequest.update({
            total: {
                label: 'Order Total',
                amount: amount
            }
        });
    });
}

if (prbPlaceholder) {
    initPRB();
}

// fix issue with SFRA select payment method when edit payment from Order confirmation
var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(() => {
    // eslint-disable-next-line no-unused-vars
    document.querySelector('.payment-summary .edit-button').addEventListener('click', (e) => {
        $('.payment-details').removeClass('payment-details').addClass('payment-details-stripe');
        var list = document.querySelector('.payment-form').querySelectorAll('.tab-pane');
        for (var i = 0; i < list.length; ++i) {
            list[i].classList.remove('active');
        }

        var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
        if (activePaymentMethod.length) {
            var selectedPaymentContent = document.getElementById(activePaymentMethod[0].attributes['href'].value.replace('#', ''));

            if (selectedPaymentContent) {
                selectedPaymentContent.classList.add('active');
            }
        }
    });

    // eslint-disable-next-line no-unused-vars
    document.querySelector('.shipping-summary .edit-button').addEventListener('click', (e) => {
        var list = document.querySelector('.payment-form').querySelectorAll('.tab-pane');
        for (var i = 0; i < list.length; ++i) {
            list[i].classList.remove('active');
        }

        var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
        if (activePaymentMethod.length) {
            var selectedPaymentContent = document.getElementById(activePaymentMethod[0].attributes['href'].value.replace('#', ''));
            if (selectedPaymentContent) {
                selectedPaymentContent.classList.add('active');
            }
        }
    });
});

function handleStripePaymentElementSubmitOrder() {
    window.stripePaymentElements.submit().then(function (result) {
        if (result.error) {
            window.location.replace(document.getElementById('billingPageUrl').value);
            return;
        }

        $('body').trigger('checkout:disableButton', '.next-step-button button');
        $.spinner().start();
        $.ajax({
            url: document.getElementById('paymentElementSubmitOrderURL').value,
            method: 'POST',
            data: {
                csrf_token: $('[name="csrf_token"]').val()
            },
            success: function (data) {
                // enable the placeOrder button here
                $('body').trigger('checkout:enableButton', '.next-step-button button');
                if (data.error) {
                    if (data.errorMessage) {
                        alert(data.errorMessage);
                    }
                    window.location.replace(document.getElementById('billingPageUrl').value);
                } else {
                    window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl);
                    window.localStorage.setItem('stripe_pe_orderid', data.orderID);
                    window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken);

                    var stripeReturnURL = document.getElementById('stripe_return_url').value;
                    stripe.confirmPayment({
                        elements: window.stripePaymentElements,
                        clientSecret: data.clientSecret,
                        confirmParams: {
                            // Make sure to change this to your payment completion page
                            return_url: stripeReturnURL
                        }
                    }).then(function (result) {
                        if (result.error) {
                            $.ajax({
                                url: document.getElementById('logStripeErrorMessageURL').value,
                                method: 'POST',
                                dataType: 'json',
                                data: {
                                    csrf_token: $('[name="csrf_token"]').val(),
                                    msg: 'UPE stripe.confirmPayment Error ' + JSON.stringify(result.error)
                                }
                            }).done(function () {
                                $.spinner().start();

                                $.ajax({
                                    url: document.getElementById('stripeFailOrderURL').value,
                                    method: 'POST',
                                    dataType: 'json',
                                    data: {
                                        csrf_token: $('[name="csrf_token"]').val()
                                    },
                                    success: function (result) {
                                        if (result.success === false) {
                                            window.location.replace(result.redirectUrl);
                                        } else {
                                            alert($('#payment-element').data('errormsg'));
                                            window.location.replace(document.getElementById('billingPageUrl').value);
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
            },
            error: function () {
                // enable the placeOrder button here
                $('body').trigger('checkout:enableButton', $('.next-step-button button'));
            }
        });
    });
}

function initStripePaymentElement() {
    var ownerEmail = '';
    if ($('.customer-summary-email').length && $('.customer-summary-email').text()) {
        ownerEmail = $('.customer-summary-email').text();
    } else {
        ownerEmail = document.querySelector('#dwfrm_billing input[name$="_email"]')
            ? document.querySelector('#dwfrm_billing input[name$="_email"]').value
            : document.querySelector('input[name$="_email"]').value;
    }

    // SFRA 6 issue with email not presented on checkout
    if (ownerEmail && ownerEmail !== 'null') {
        if (window.paymentElementInstance) {
            window.paymentElementInstance.destroy();
        }

        if (window.stripePaymentElements) {
            window.paymentElementInstance = window.stripePaymentElements.create('payment', {
                defaultValues: {
                    billingDetails: {
                        email: ownerEmail,
                        name: (document.querySelector('#dwfrm_billing input[name$="_firstName"]') && document.querySelector('#dwfrm_billing input[name$="_lastName"]')) ? document.querySelector('#dwfrm_billing input[name$="_firstName"]').value + ' ' + document.querySelector('#dwfrm_billing input[name$="_lastName"]').value : '',
                        phone: document.querySelector('#dwfrm_billing input[name$="_phone"]') ? document.querySelector('#dwfrm_billing input[name$="_phone"]').value : '',
                        address: {
                            postal_code: document.querySelector('#dwfrm_billing input[name$="_postalCode"]') ? document.querySelector('#dwfrm_billing input[name$="_postalCode"]').value : '',
                            country: document.querySelector('#dwfrm_billing select[name$="_country"]') ? document.querySelector('#dwfrm_billing select[name$="_country"]').value : ''
                        }
                    }
                }
            });
            window.paymentElementInstance.mount('#payment-element');
        }
    } else {
        $.ajax({
            url: document.getElementById('getCustomerEmailURL').value,
            method: 'GET',
            dataType: 'json',
            async: false
        }).done(function (json) {
            ownerEmail = json.email;
            if (ownerEmail && ownerEmail !== 'null') {
                if (window.paymentElementInstance) {
                    window.paymentElementInstance.destroy();
                }

                window.paymentElementInstance = window.stripePaymentElements.create('payment', {
                    defaultValues: {
                        billingDetails: {
                            email: ownerEmail,
                            name: (document.querySelector('#dwfrm_billing input[name$="_firstName"]') && document.querySelector('#dwfrm_billing input[name$="_lastName"]')) ? document.querySelector('#dwfrm_billing input[name$="_firstName"]').value + ' ' + document.querySelector('#dwfrm_billing input[name$="_lastName"]').value : '',
                            phone: document.querySelector('#dwfrm_billing input[name$="_phone"]') ? document.querySelector('#dwfrm_billing input[name$="_phone"]').value : '',
                            address: {
                                postal_code: document.querySelector('#dwfrm_billing input[name$="_postalCode"]') ? document.querySelector('#dwfrm_billing input[name$="_postalCode"]').value : '',
                                country: document.querySelector('#dwfrm_billing select[name$="_country"]') ? document.querySelector('#dwfrm_billing select[name$="_country"]').value : ''
                            }
                        }
                    }
                });
                window.paymentElementInstance.mount('#payment-element');
            }
        });
    }
}

function initNewStripePaymentIntent() {
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    if (!stripeOrderAmountInput || !stripeOrderAmountInput.value) {
        return;
    }

    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
    if (!stripeOrderCurrencyInput || !stripeOrderCurrencyInput.value) {
        return;
    }

    const appearance = {
        theme: 'stripe'
    };

    const stripePaymentElementStyleObject = JSON.parse(document.getElementById('stripePaymentElementStyle').value);
    appearance.variables = stripePaymentElementStyleObject.variables;

    const options = {
        mode: 'payment',
        amount: parseInt(stripeOrderAmountInput.value, 10),
        currency: stripeOrderCurrencyInput.value,
        appearance: appearance,
        capture_method: document.getElementById('stripeCaptureMethod').value
    };

    if (document.getElementById('isStripePaymentElementsSavePaymentsEnabled').value === 'true') {
        options.setup_future_usage = 'off_session';
    }

    window.stripePaymentElements = stripe.elements(options);

    initStripePaymentElement();
}

/* Stripe Payment Element */
ready(() => {
    if ($('#payment-element').length && !$('.payment-summary').is(':visible')) {
        initNewStripePaymentIntent();
    }
});

// Update stored order amount on shipping method change
$('body').on('checkout:updateCheckoutView', function () {
    $.ajax({
        url: document.getElementById('getStripeOrderItemsURL').value,
        method: 'GET',
        dataType: 'json'
    }).done(function (json) {
        var stripeOrderAmountInput = document.getElementById('stripe_order_amount');

        // check if order amount has been changed
        // eslint-disable-next-line
        if (stripeOrderAmountInput && stripeOrderAmountInput.value != json.amount) {
            if ($('#payment-element').length) {
                initNewStripePaymentIntent();
            }
        }

        if (stripeOrderAmountInput) {
            stripeOrderAmountInput.value = json.amount;
        }

        var stripeOrderItems = document.getElementById('stripe_order_items');
        if (stripeOrderItems) {
            stripeOrderItems.value = json.orderItems;
        }

        var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
        if (stripeOrderCurrencyInput) {
            stripeOrderCurrencyInput.value = json.currency;
        }

        var stripeOrderPurchaseCoutry = document.getElementById('stripe_purchase_country');
        if (stripeOrderPurchaseCoutry) {
            stripeOrderPurchaseCoutry.value = json.purchase_country;
        }

        var stripeOrderShippingInput = document.getElementById('stripe_order_shipping');
        if (stripeOrderShippingInput) {
            stripeOrderShippingInput.value = json.order_shipping;
        }

        var stripeShippingFirstName = document.getElementById('stripe_shipping_first_name');
        if (stripeShippingFirstName) {
            stripeShippingFirstName.value = json.shipping_first_name;
        }

        var stripeShippingLastName = document.getElementById('stripe_shipping_last_name');
        if (stripeShippingLastName) {
            stripeShippingLastName.value = json.shipping_last_name;
        }
    });
});

ready(() => {
    // eslint-disable-next-line no-unused-vars
    document.querySelector('.submit-shipping').addEventListener('click', (e) => {
        initStripePaymentElement();
    });

    if (document.querySelector('#dwfrm_billing input[name$="_email"]')) {
        document.querySelector('#dwfrm_billing input[name$="_email"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_firstName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_firstName"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_lastName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_lastName"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_phone"]')) {
        document.querySelector('#dwfrm_billing input[name$="_phone"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_postalCode"]')) {
        document.querySelector('#dwfrm_billing input[name$="_postalCode"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_country"]')) {
        document.querySelector('#dwfrm_billing input[name$="_country"]').addEventListener('change', initStripePaymentElement);
    }
});

function redirectToCheckoutSummaryPage() {
    var continueUrl = window.localStorage.getItem('stripe_pe_continueurl');
    var orderId = window.localStorage.getItem('stripe_pe_orderid');
    var orderToken = window.localStorage.getItem('stripe_pe_ordertoken');

    if (continueUrl && orderId && orderToken) {
        var form = document.createElement('form');
        form.style.display = 'none';

        document.body.appendChild(form);

        form.method = 'POST';
        form.action = continueUrl;

        var orderIdInput = document.createElement('input');
        orderIdInput.name = 'orderID';
        orderIdInput.value = orderId;
        form.appendChild(orderIdInput);

        var orderTokenInput = document.createElement('input');
        orderTokenInput.name = 'orderToken';
        orderTokenInput.value = orderToken;
        form.appendChild(orderTokenInput);

        form.submit();
    }
}

function handleStripeRequiresActionResponse(response) {
	if (response.error) {
        $.ajax({
            url: document.getElementById('stripeFailOrderURL').value,
            method: 'POST',
            dataType: 'json',
            data: {
                csrf_token: $('[name="csrf_token"]').val()
            }
        });
        if (response.error.message) {
            alert(response.error.message);
        }
        window.location.replace(document.getElementById('billingPageUrl').value);
    } else if (response.requires_action) {
        // Use Stripe.js to handle required card action
        stripe.handleCardAction(response.payment_intent_client_secret).then(function (result) {
            if (result.error) {
                $.ajax({
                    url: document.getElementById('stripeFailOrderURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val()
                    }
                });
                alert(result.error.message);
                window.location.replace(document.getElementById('billingPageUrl').value);
            } else {
                // The card action has been handled
                // The PaymentIntent can be confirmed again on the server
                $.ajax({
                    url: document.getElementById('cardPaymentHandleRequiresActionURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val()
                    }
                }).done(function (json) {
                    handleStripeRequiresActionResponse(json);
                }).fail(function (msg) {
                    $.ajax({
                        url: document.getElementById('stripeFailOrderURL').value,
                        method: 'POST',
                        dataType: 'json',
                        data: {
                            csrf_token: $('[name="csrf_token"]').val()
                        }
                    });
                    if (msg.responseJSON.redirectUrl) {
                        window.location.href = msg.responseJSON.redirectUrl;
                    } else {
                        alert(msg);
                    }
                });
            }
        });
    } else {
        forceSubmit = true;
        redirectToCheckoutSummaryPage();
    }
}

// eslint-disable-next-line
function handleStripeCardSubmitOrder() {
    $('body').trigger('checkout:disableButton', '.next-step-button button');
    $.spinner().start();

    $.ajax({
        url: document.getElementById('cardPaymentSubmitOrderURL').value,
        method: 'POST',
        data: {
            csrf_token: $('[name="csrf_token"]').val()
        },
        success: function (data) {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', '.next-step-button button');

            if (data.error) {
                if (data.errorMessage) {
                    alert(data.errorMessage);
                }
                window.location.replace(document.getElementById('billingPageUrl').value);
            } else {
                window.localStorage.setItem('stripe_pe_continueurl', data.continueUrl);
                window.localStorage.setItem('stripe_pe_orderid', data.orderID);
                window.localStorage.setItem('stripe_pe_ordertoken', data.orderToken);

                if (data.requires_action) {
                    handleStripeRequiresActionResponse(data);
                } else {
                    redirectToCheckoutSummaryPage();
                }
            }
        },
        error: function () {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', $('.next-step-button button'));
        }
    });
}

// v1
// eslint-disable-next-line consistent-return
document.querySelector('button.place-order').addEventListener('click', function (event) {
    if (window.localStorage.getItem('stripe_payment_method') !== 'STRIPE_PAYMENT_ELEMENT' && window.localStorage.getItem('stripe_payment_method') !== 'CREDIT_CARD' && window.localStorage.getItem('stripe_payment_method') !== 'STRIPE_PAYMENT_REQUEST_BTN') {
        return true;
    }

    event.stopImmediatePropagation();

    // eslint-disable-next-line no-empty
    if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_PAYMENT_ELEMENT') {
        if (forceSubmit) return false;

        forceSubmit = true;
        handleStripePaymentElementSubmitOrder();
        return false;
    }

    if (forceSubmit) return true;

    handleStripeCardSubmitOrder();
});

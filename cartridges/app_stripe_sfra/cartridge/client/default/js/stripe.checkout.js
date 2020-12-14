/* eslint-env es6 */
/* eslint-disable no-console */
/* eslint-disable no-alert */
/* eslint-disable no-param-reassign */
/* eslint-disable dot-notation */
/* eslint-disable no-plusplus */
/* eslint-disable require-jsdoc */
/* globals Stripe, $ */
// vб1
var idealBankElement;
var sepaIbanElement;

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

var idealPlaceholder = document.getElementById('ideal-bank-element');
var sepaDebitPlaceholder = document.getElementById('sepa-iban-element');
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
    return newCardFormContainer && newCardFormContainer.style.display === 'none';
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

    var addrLine1 = document.querySelector('.billing-address input[name$="_address1"]') ?
        document.querySelector('.billing-address input[name$="_address1"]').value : document.querySelector('input[name$="_address1"]').value;

    var addrLine2 = document.querySelector('.billing-address input[name$="_address2"]') ?
        document.querySelector('.billing-address input[name$="_address2"]').value : document.querySelector('input[name$="_address2"]').value;

    var addrCity = document.querySelector('.billing-address input[name$="_city"]') ?
        document.querySelector('.billing-address input[name$="_city"]').value : document.querySelector('input[name$="_city"]').value;

    var addrPostalCode = document.querySelector('.billing-address input[name$="_postalCode"]') ?
        document.querySelector('.billing-address input[name$="_postalCode"]').value : document.querySelector('input[name$="_postalCode"]').value;

    var addrCountry = document.querySelector('.billing-address select[name$="_country"]') ?
        document.querySelector('.billing-address select[name$="_country"]').value : document.querySelector('select[name$="_country"]').value;

    var ownerEmail = document.querySelector('.billing-address input[name$="_email"]') ?
        document.querySelector('.billing-address input[name$="_email"]').value : document.querySelector('input[name$="_email"]').value;

    var ownerPhone = document.querySelector('.billing-address input[name$="_phone"]') ?
        document.querySelector('.billing-address input[name$="_phone"]').value : document.querySelector('input[name$="_phone"]').value;

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

function getSourceType(selectedPaymentMethod) {
    return {
        STRIPE_ACH_DEBIT: 'ach_debit',
        STRIPE_ALIPAY: 'alipay',
        STRIPE_BANCONTACT: 'bancontact',
        STRIPE_EPS: 'eps',
        STRIPE_GIROPAY: 'giropay',
        STRIPE_IDEAL: 'ideal',
        STRIPE_MULTIBANCO: 'multibanco',
        STRIPE_P24: 'p24',
        STRIPE_SEPA_DEBIT: 'sepa_debit',
        STRIPE_SOFORT: 'sofort',
        STRIPE_WECHATPAY: 'wechat',
        STRIPE_KLARNA: 'klarna'
    }[selectedPaymentMethod];
}

function getCreateSourcePayload(selectedPaymentMethod) {
    var stripeSiteIdInput = document.getElementById('stripe_site_id');
    var stripeOrderNumberInput = document.getElementById('stripe_order_number');
    var stripeReturnURLInput = document.getElementById('stripe_return_url');
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');

    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();
    var returnURL = stripeReturnURLInput.value;

    return {
        type: getSourceType(selectedPaymentMethod),
        amount: amountToPay,
        currency: currencyCode,
        redirect: {
            return_url: returnURL
        },
        metadata: {
            site_id: stripeSiteIdInput.value,
            order_id: stripeOrderNumberInput.value
        },
        owner: getOwnerDetails()
    };
}

function processCreateSourceResult(result) {
    if (result.error) {
        alert(result.error.message);
    } else {
        var sourceIdInputs = document.getElementsByName('stripe_source_id');
        var sourceClientSecretInput = document.getElementById('stripe_source_client_secret');
        var redirectURLInput = document.getElementById('stripe_redirect_url');

        sourceIdInputs.forEach(function (input) {
            input.value = result.source.id;
        });

        sourceClientSecretInput.value = result.source.client_secret;
        if (result.source.redirect) {
            redirectURLInput.value = result.source.redirect.url;
        }

        // window.location.replace(result.source.redirect.url);
        // v1
        // eslint-disable-next-line no-unused-vars
        $('body').on('checkout:updateCheckoutView', function (e, data) {
            window.location.replace(result.source.redirect.url);
        });

        $('.submit-payment').click();
        $.spinner().start();
    }
}

function handleServerResponse(response) {
    if (response.error) {
        alert(response.error.message);
        window.location.replace(document.getElementById('billingPageUrl').value);
    } else if (response.requires_action) {
        // Use Stripe.js to handle required card action
        stripe.handleCardAction(response.payment_intent_client_secret).then(function (result) {
            if (result.error) {
                alert(result.error.message);
                window.location.replace(document.getElementById('billingPageUrl').value);
            } else {
                // The card action has been handled
                // The PaymentIntent can be confirmed again on the server
                $.ajax({
                    url: document.getElementById('beforePaymentAuthURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val()
                    }
                }).done(function (json) {
                    handleServerResponse(json);
                }).fail(function (msg) {
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
        $('button.place-order').click();
    }
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

function processWeChatCreateSourceResult(result) {
    if (result.error) {
        alert(result.error.message);
    } else {
        var sourceIdInputs = document.getElementsByName('stripe_source_id');
        var sourceClientSecretInput = document.getElementById('stripe_source_client_secret');
        var sourceWeChatQRCodeURL = document.getElementById('stripe_wechat_qrcode_url');

        sourceIdInputs.forEach(function (input) {
            input.value = result.source.id;
        });

        sourceClientSecretInput.value = result.source.client_secret;
        sourceWeChatQRCodeURL.value = result.source.wechat.qr_code_url;

        var stripeReturnURL = document.getElementById('stripe_return_url').value;

        // eslint-disable-next-line no-unused-vars
        $('body').on('checkout:updateCheckoutView', function (e, data) {
            window.location.replace(stripeReturnURL);
        });

        $('.submit-payment').click();
        $.spinner().start();
    }
}

function getCreateWeChatSourcePayload() {
    var stripeSiteIdInput = document.getElementById('stripe_site_id');
    var stripeOrderNumberInput = document.getElementById('stripe_order_number');
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');

    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    return {
        type: 'wechat',
        amount: amountToPay,
        currency: currencyCode,
        statement_descriptor: stripeOrderNumberInput.value,
        metadata: {
            site_id: stripeSiteIdInput.value,
            order_id: stripeOrderNumberInput.value
        },
        owner: getOwnerDetails()
    };
}

function getCreateKlarnaSourcePayload() {
    var stripeSiteIdInput = document.getElementById('stripe_site_id');
    var stripeOrderNumberInput = document.getElementById('stripe_order_number');
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
    var stripeOrderItemsInput = document.getElementById('stripe_order_items');
    var stripeOrderShippingInput = document.getElementById('stripe_order_shipping');

    var stripeShippingFirstName = document.getElementById('stripe_shipping_first_name').value;
    var stripeShippingLastName = document.getElementById('stripe_shipping_last_name').value;

    var stripeSiteLocale = document.getElementById('stripe_site_locale').value;

    var stripeOrderPurchaseCoutry = document.getElementById('stripe_purchase_country').value ?
        document.getElementById('stripe_purchase_country').value :
        document.getElementById('billingCountry').value;
    var stripeOrderItems = JSON.parse(stripeOrderItemsInput.value);

    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    var firstName = document.querySelector('input[name$="_firstName"]').value;
    var lastName = document.querySelector('input[name$="_lastName"]').value;

    var stripeOrderShipping = JSON.parse(stripeOrderShippingInput.value);

    // update values with shipping form
    var form = document.getElementById('dwfrm_shipping');
    if ($(form).length > 0) {
        var phone = $('input[name$=_phone]', form).val();
        if (phone) {
            stripeOrderShipping.phone = phone;
        }

        var line1 = $('input[name$=_address1]', form).val();
        if (line1) {
            stripeOrderShipping.address.line1 = line1;
        }

        var line2 = $('input[name$=_address2]', form).val();
        if (line2) {
            stripeOrderShipping.address.line2 = line2;
        }

        var city = $('input[name$=_city]', form).val();
        if (city) {
            stripeOrderShipping.address.city = city;
        }

        var postalCode = $('input[name$=_postalCode]', form).val();
        if (postalCode) {
            stripeOrderShipping.address.postal_code = postalCode;
        }

        var country = $('input[name$=_country]', form).val();

        if (country) {
            stripeOrderShipping.address.country = country;
        }

        var state = $('select[name$=_stateCode],input[name$=_stateCode]', form).val();
        if (state) {
            stripeOrderShipping.address.state = state;
        }
    }

    return {
        type: 'klarna',
        amount: amountToPay,
        currency: currencyCode,
        klarna: {
            product: 'payment',
            purchase_country: stripeOrderPurchaseCoutry.toUpperCase(),
            first_name: firstName,
            last_name: lastName,
            shipping_first_name: stripeShippingFirstName,
            shipping_last_name: stripeShippingLastName,
            locale: stripeSiteLocale
        },
        order: {
            items: stripeOrderItems,
            shipping: stripeOrderShipping
        },
        metadata: {
            site_id: stripeSiteIdInput.value,
            order_id: stripeOrderNumberInput.value
        },
        owner: getOwnerDetails()
    };
}

function processKlarnaCreateSourceResult(result) {
    if (result.error) {
        alert(result.error.message);
    } else {
        var sourceIdInputs = document.getElementsByName('stripe_source_id');

        sourceIdInputs.forEach(function (input) {
            input.value = result.source.id;
        });

        // Initialize the SDK
        window.Klarna.Payments.init({
            client_token: result.source.klarna.client_token
        });

        // Load the widget for each payment method category:
        // - pay_later
        // - pay_over_time
        // - pay_now
        var availableCategories = result.source.klarna.payment_method_categories.split(',');
        var paymentMethodSelected = false;
        for (let i = 0; i < availableCategories.length; ++i) {
            var category = availableCategories[i];

            var klarnaPaymentMethodWrapper = document.getElementById('klarna_' + category + '-wrapper');
            if (klarnaPaymentMethodWrapper) {
                klarnaPaymentMethodWrapper.style.display = 'block';

                var klarnaLabel = document.getElementById('klarna_' + category + '_label');
                if (klarnaLabel && result.source.klarna[category + '_name']) {
                    klarnaLabel.innerHTML = result.source.klarna[category + '_name'];
                }

                var klarnaImgWrapper = document.getElementById('klarna_' + category + '_img_wrapper');
                if (klarnaImgWrapper && result.source.klarna[category + '_asset_urls_standard']) {
                    klarnaImgWrapper.innerHTML = "<img src='" + result.source.klarna[category + '_asset_urls_standard'] + "' />";
                }
            }

            if (!paymentMethodSelected) {
                document.getElementById('klarna_' + category).checked = true;
                paymentMethodSelected = true;
            }

            window.Klarna.Payments.load({
                container: '#klarna_' + category + '_container',
                payment_method_category: category
            }, function (res) {
                if (res.show_form) {
                    /*
                     * this payment method category can be used, allow the customer
                     * to choose it in your interface.
                     */
                } else {
                    // this payment method category is not available
                }
            });
        }
    }
}

/**
 * Validates the ACH Debit form.
 * @returns {boolean} Returns true if the ACH Debit form is valid. Returns false if the ACH Debit form is invalid.
 */
function validateAchDebitForm() {
    // validate Account Holder Name
    var accountHolderName = document.getElementById('ach-account-holdername');

    if (!accountHolderName.value) {
        alert(accountHolderName.dataset.emptyerrormsg);
        return false;
    }

    // validate Account Type
    var accountType = document.getElementById('ach-account-type');

    if (!accountType.value) {
        alert(accountType.dataset.emptyerrormsg);
        return false;
    }

    // validate Account Number
    var accountNumber = document.getElementById('ach-account-number');

    if (!accountNumber.value) {
        alert(accountNumber.dataset.emptyerrormsg);
        return false;
    }

    // validate Routing Number
    var routingNumber = document.getElementById('ach-routing-number');

    if (!routingNumber.value) {
        alert(routingNumber.dataset.emptyerrormsg);
        return false;
    }

    return true;
}

function getBankAccountRequestParamsForAchDebit() {
    var stripeOrderCurrencyInput = document.getElementById('stripe_order_currency');
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    return {
        country: document.getElementById('stripeAccountCountry').value,
        currency: currencyCode,
        routing_number: document.getElementById('ach-routing-number').value,
        account_number: document.getElementById('ach-account-number').value,
        account_holder_name: document.getElementById('ach-account-holdername').value,
        account_holder_type: document.getElementById('ach-account-type').value
    };
}

function processBankAccountRequestResult(result) {
    if (result.error) {
        alert(result.error.message);
    } else {
        // init bank account token id
        var bankAccountTokenIDInputs = document.getElementsByName('stripe_bank_account_token_id');
        bankAccountTokenIDInputs.forEach(function (input) {
            input.value = result.token.id;
        });

        // init bank account token
        var bankAccountTokenInputs = document.getElementsByName('stripe_bank_account_token');
        bankAccountTokenInputs.forEach(function (input) {
            input.value = result.token.bank_account.id;
        });

        var stripeReturnURL = document.getElementById('stripe_return_url').value;

        // eslint-disable-next-line no-unused-vars
        $('body').on('checkout:updateCheckoutView', function (e, data) {
            window.location.replace(stripeReturnURL);
        });

        $('.submit-payment').click();
        $.spinner().start();
    }
}

// v1
// eslint-disable-next-line consistent-return
document.querySelector('button.place-order').addEventListener('click', function (event) {
    event.stopImmediatePropagation();

    if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_KLARNA') {
        var klarnaPaymentOption = window.localStorage.getItem('stripe_klarna_payment_option');

        window.Klarna.Payments.authorize({
            payment_method_category: klarnaPaymentOption
        }, function (res) {
            if (res.approved) {
                // success
                $.ajax({
                    url: document.getElementById('beforePaymentAuthURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val()
                    }
                }).done(function (json) {
                    handleServerResponse(json);
                }).fail(function (msg) {
                    if (msg.responseJSON.redirectUrl) {
                        window.location.href = msg.responseJSON.redirectUrl;
                    } else {
                        alert(msg.error);
                    }
                });
            } else if (res.error) {
                // Payment not authorized or an error has occurred
                alert(res.error);
                $('.payment-summary .edit-button').click();
            } else {
                // handle other states
                alert('Order not approved');
                $('.payment-summary .edit-button').click();
            }
        });
    } else {
        if (forceSubmit) return true;

        $.ajax({
            url: document.getElementById('beforePaymentAuthURL').value,
            method: 'POST',
            dataType: 'json',
            data: {
                csrf_token: $('[name="csrf_token"]').val()
            }
        }).done(function (json) {
            handleServerResponse(json);
        }).fail(function (msg) {
            if (msg.responseJSON.redirectUrl) {
                window.location.href = msg.responseJSON.redirectUrl;
            } else {
                alert(msg.error);
            }
        });
    }
});

document.querySelector('button.submit-payment').addEventListener('click', function (event) {
    let billingForm = document.getElementById('dwfrm_billing');
    $(billingForm).find('.form-control.is-invalid').removeClass('is-invalid');
    if (!billingForm.reportValidity()) {
        billingForm.focus();
        billingForm.scrollIntoView();
        return;
    }

    event.stopImmediatePropagation();

    var activeTabId = $('.tab-pane.active').attr('id');
    var paymentInfoSelector = '#dwfrm_billing .' + activeTabId + ' .payment-form-fields input.form-control';
    var selectedPaymentMethod = $(paymentInfoSelector).val();
    var createSourcePayload;

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
        case 'STRIPE_ACH_DEBIT':
            var form = document.getElementById('dwfrm_billing');
            if (!form.reportValidity()) {
                form.focus();
                form.scrollIntoView();
                break;
            }

            if (!validateAchDebitForm()) {
                break;
            }

            var achDebitParams = getBankAccountRequestParamsForAchDebit();
            stripe.createToken('bank_account', achDebitParams).then(processBankAccountRequestResult);
            break;
        case 'STRIPE_WECHATPAY':
            createSourcePayload = getCreateWeChatSourcePayload();
            stripe.createSource(createSourcePayload).then(processWeChatCreateSourceResult);
            break;
        case 'STRIPE_KLARNA':
            var selectedCategory = document.querySelector('.klarna-payment-method:checked').value;
            window.localStorage.setItem('stripe_klarna_payment_option', selectedCategory);

            var stripeReturnURL = document.getElementById('stripe_return_url').value;

            // eslint-disable-next-line no-unused-vars
            $('body').on('checkout:updateCheckoutView', function (e, data) {
                window.location.replace(stripeReturnURL);
            });

            $('.submit-payment').click();
            $.spinner().start();
            break;
        case 'STRIPE_ALIPAY':
        case 'STRIPE_BANCONTACT':
        case 'STRIPE_EPS':
        case 'STRIPE_GIROPAY':
        case 'STRIPE_MULTIBANCO':
        case 'STRIPE_P24':

            createSourcePayload = getCreateSourcePayload(selectedPaymentMethod);
            stripe.createSource(createSourcePayload).then(processCreateSourceResult);
            break;

        case 'STRIPE_IDEAL':

            var idealOwnerNameInput = document.getElementById('ideal-name');
            var idealPayload = getCreateSourcePayload(selectedPaymentMethod);

            idealPayload.owner = idealPayload.owner || {};
            idealPayload.owner.name = idealOwnerNameInput.value;

            stripe.createSource(idealBankElement, idealPayload).then(processCreateSourceResult);
            break;
        case 'STRIPE_SOFORT':

            var sofortCountryCodeSelect = document.getElementById('sofort_country_code');
            var sofortCountryCode = sofortCountryCodeSelect && sofortCountryCodeSelect.selectedOptions && sofortCountryCodeSelect.selectedOptions.length && sofortCountryCodeSelect.selectedOptions[0] && sofortCountryCodeSelect.selectedOptions[0].value;

            var sofortPayload = getCreateSourcePayload(selectedPaymentMethod);
            sofortPayload.type = 'sofort';
            sofortPayload.sofort = {
                country: sofortCountryCode
            };

            stripe.createSource(sofortPayload).then(processCreateSourceResult);
            break;
        case 'STRIPE_SEPA_DEBIT':

            var sepaNameInput = document.getElementById('sepa-name');

            var sepaPayload = getCreateSourcePayload(selectedPaymentMethod);
            sepaPayload.type = 'sepa_debit';
            sepaPayload.owner = sepaPayload.owner || {};
            sepaPayload.owner.name = sepaNameInput.value;

            sepaPayload.mandate = {
                // Automatically send a mandate notification email to your customer
                // once the source is charged.
                notification_method: 'email'
            };

            stripe.createSource(sepaIbanElement, sepaPayload).then(processCreateSourceResult);
            break;
        default:
            break;
    }
});

function initIdeal() {
    idealBankElement = elements.create('idealBank', { style: JSON.parse(document.getElementById('stripeIdealElementStyle').value) });
    idealBankElement.mount('#ideal-bank-element');
}

function initSepaDebit() {
    sepaIbanElement = elements.create('iban', {
        style: JSON.parse(document.getElementById('stripeSepaDebitStyle').value),
        supportedCountries: ['SEPA']
    });

    // Add an instance of the iban Element into the `iban-element` <div>.
    sepaIbanElement.mount('#sepa-iban-element');

    var errorMessage = document.getElementById('sepa-error-message');
    var bankName = document.getElementById('sepa-bank-name');

    sepaIbanElement.on('change', function (event) {
        // Handle real-time validation errors from the iban Element.
        if (event.error) {
            errorMessage.textContent = event.error.message;
            errorMessage.classList.add('visible');
        } else {
            errorMessage.classList.remove('visible');
        }

        // Display bank name corresponding to IBAN, if available.
        if (event.bankName) {
            bankName.textContent = event.bankName;
            bankName.classList.add('visible');
        } else {
            bankName.classList.remove('visible');
        }
    });
}

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

if (idealPlaceholder) {
    initIdeal();
}

if (sepaDebitPlaceholder) {
    initSepaDebit();
}

if (prbPlaceholder) {
    initPRB();
}

function refreshKlarnaWhenIsActive() {
    // check if Klarna is active
    var activePaymentMethod = document.getElementsByClassName('nav-link credit-card-tab active');
    if (!activePaymentMethod.length || !activePaymentMethod[0].attributes['href'].value.includes('KLARNA')) {
        return;
    }

    // validate Billing Form
    let billingForm = document.getElementById('dwfrm_billing');
    $(billingForm).find('.form-control.is-invalid').removeClass('is-invalid');
    if (!billingForm.reportValidity()) {
        billingForm.focus();
        billingForm.scrollIntoView();
        return;
    }

    // create source and load Klarna widget
    var createSourcePayload = getCreateKlarnaSourcePayload();
    stripe.createSource(createSourcePayload).then(processKlarnaCreateSourceResult);
}

// Update stored order amount on shipping method change
$('body').on('checkout:updateCheckoutView', function () {
    $.ajax({
        url: document.getElementById('getStripeOrderItemsURL').value,
        method: 'GET',
        dataType: 'json'
    }).done(function (json) {
        var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
        if (stripeOrderAmountInput) {
            stripeOrderAmountInput.value = json.amount;
        }

        var stripeOrderItems = document.getElementById('stripe_order_items');
        if (stripeOrderItems) {
            stripeOrderItems.value = json.orderItems;
        }

        refreshKlarnaWhenIsActive();
    });
});

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

            if (activePaymentMethod[0].attributes['href'].value.includes('KLARNA')) {
                // create source and load Klarna widgets
                var createSourcePayload = getCreateKlarnaSourcePayload();
                stripe.createSource(createSourcePayload).then(processKlarnaCreateSourceResult);
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

    var klarnaLiEl = document.querySelectorAll("li.nav-item[data-method-id='STRIPE_KLARNA']");
    if (klarnaLiEl.length > 0) {
        klarnaLiEl[0].addEventListener('click', function (event) {
            if (!document.querySelector('input[name$="_address1"]').value
                || !document.querySelector('input[name$="_city"]').value
                || !document.querySelector('input[name$="_postalCode"]').value
                || !document.querySelector('select[name$="_country"]').value
                || !document.querySelector('input[name$="_email"]').value
                || !document.querySelector('input[name$="_phone"]').value) {
                alert(document.getElementById('klarna-widget-wrapper').dataset.errormsg);

                event.stopPropagation();
                $('.nav-item a.active').click();
                return false;
            }

            let billingForm = document.getElementById('dwfrm_billing');
            $(billingForm).find('.form-control.is-invalid').removeClass('is-invalid');
            if (!billingForm.reportValidity()) {
                billingForm.focus();
                billingForm.scrollIntoView();
                event.stopPropagation();
                $('.nav-item a.active').click();
                return false;
            }

            // create source and load Klarna widgets
            var createSourcePayload = getCreateKlarnaSourcePayload();
            stripe.createSource(createSourcePayload).then(processKlarnaCreateSourceResult);

            return true;
        });
    }

    if (document.querySelector('#dwfrm_billing input[name$="_firstName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_firstName"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_lastName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_lastName"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_address1"]')) {
        document.querySelector('#dwfrm_billing input[name$="_address1"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_address2"]')) {
        document.querySelector('#dwfrm_billing input[name$="_address2"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_city"]')) {
        document.querySelector('#dwfrm_billing input[name$="_city"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_postalCode"]')) {
        document.querySelector('#dwfrm_billing input[name$="_postalCode"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing select[name$="_country"]')) {
        document.querySelector('#dwfrm_billing select[name$="_country"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_email"]')) {
        document.querySelector('#dwfrm_billing input[name$="_email"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_phone"]')) {
        document.querySelector('#dwfrm_billing input[name$="_phone"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    refreshKlarnaWhenIsActive();
});

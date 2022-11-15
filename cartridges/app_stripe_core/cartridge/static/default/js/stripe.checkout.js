/* eslint-disable no-console */
/* eslint-disable no-alert */
/* globals Stripe */
// v1
var cardElement = null;
var cardNumberElement = null;
window.idealBankElement = null;
window.sepaIbanElement = null;
window.epsBankElement= null;
window.p24BankElement= null;

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

var newCardFormContainer = document.getElementById('new-card-form-container');
var savedCardsFormContainer = document.getElementById('saved-cards-container');
var idealPlaceholder = document.getElementById('ideal-bank-element');
var sepaDebitPlaceholder = document.getElementById('sepa-iban-element');
var sepaDebitInput = document.getElementById('is-STRIPE_SEPA_DEBIT');
var prbPlaceholder = document.getElementById('payment-request-button');
var epsPlaceholder = document.getElementById('eps-bank-element');
var p24Placeholder = document.getElementById('p24-bank-element');

var newSepaCardFormContainer = document.getElementById('new-sepa-card-form-container');
var savedSepaCardsFormContainer = document.getElementById('saved-sepa-cards-container');

var paymentMethodOptions = document.querySelectorAll('input[name$="_selectedPaymentMethodID"]');

var submitBillingFormButton = document.querySelector('button[name=dwfrm_billing_save]');
var cardIdInput = document.getElementById('stripe_source_id');
var cardNumberInput = document.getElementById('stripe_card_number');
var cardHolderInput = document.getElementById('stripe_card_holder');
var cardTypeInput = document.getElementById('stripe_card_type');
var cardBrandInput = document.getElementById('stripe_card_brand');
var cardExpMonthInput = document.getElementById('stripe_card_expiration_month');
var cardExpYearInput = document.getElementById('stripe_card_expiration_year');
var prUsedInput = document.getElementById('stripe_pr_used');

var placeOrderButton = document.querySelector('button[name=submit]');
var forceSubmit = false;
var prUsed = false;

function getSelectedPaymentMethod() {
    for (var i = 0; i < paymentMethodOptions.length; i++) {
        var paymentMethodOption = paymentMethodOptions[i];
        if (paymentMethodOption.checked) {
            return paymentMethodOption.value;
        }
    }

    return null;
}

function isSavedCard() {
    return newCardFormContainer && newCardFormContainer.style.display === 'none';
}

function copySelectedSaveCardDetails() {
    var savedCards = document.querySelectorAll('input[name=saved_card_id]');

    for (var i = 0; i < savedCards.length; i++) {
        var savedCard = savedCards[i];
        if (savedCard.checked) {
            cardIdInput.value = savedCard.value;
            cardNumberInput.value = savedCard.dataset.cardnumber;
            cardHolderInput.value = savedCard.dataset.cardholder;
            cardTypeInput.value = savedCard.dataset.cardtype;
            cardExpMonthInput.value = savedCard.dataset.cardexpmonth;
            cardExpYearInput.value = savedCard.dataset.cardexpyear;
            prUsedInput.value = '';

            return true;
        }
    }

    return false;
}

function copyNewCardDetails(paymentMethod) {
    cardIdInput.value = paymentMethod.id;

    if (paymentMethod.card) {
        cardNumberInput.value = '************' + paymentMethod.card.last4;
        cardTypeInput.value = '';
        cardBrandInput.value = paymentMethod.card.brand;
        cardExpMonthInput.value = paymentMethod.card.exp_month;
        cardExpYearInput.value = paymentMethod.card.exp_year;
    }

    cardHolderInput.value = paymentMethod.billing_details && paymentMethod.billing_details.name;
    prUsedInput.value = '';
}

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

function initNewCardForm() {
    if (document.getElementById('card-element')) {
        var postalCodeEl = document.querySelector('input[name$="_postal"]');
        cardElement = elements.create('card', { value: { postalCode: postalCodeEl.value }, style: JSON.parse(document.getElementById('stripeCardFormStyle').value) });
        cardElement.mount('#card-element');

        postalCodeEl.addEventListener('change', function (event) {
            cardElement.update({ value: { postalCode: event.target.value } });
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

    var switchToSavedCardsLink = document.getElementById('switch-to-saved-cards');
    if (switchToSavedCardsLink) {
        switchToSavedCardsLink.addEventListener('click', function () {
            newCardFormContainer.style.display = 'none';
            savedCardsFormContainer.style.display = 'block';
        });
    }
}

function initSavedCards() {
    var switchToNewCardLink = document.getElementById('switch-to-add-card');
    if (switchToNewCardLink) {
        switchToNewCardLink.addEventListener('click', function () {
            newCardFormContainer.style.display = 'block';
            savedCardsFormContainer.style.display = 'none';
        });
    }
}

function initIdeal() {
    window.idealBankElement = elements.create('idealBank', { style: JSON.parse(document.getElementById('stripeIdealElementStyle').value) });
    window.idealBankElement.mount('#ideal-bank-element');
}

function initSepaDebit() {
    window.sepaIbanElement = elements.create('iban', {
        style: JSON.parse(document.getElementById('stripeSepaDebitStyle').value),
        supportedCountries: ['SEPA']
    });

    // Add an instance of the iban Element into the `iban-element` <div>.
    window.sepaIbanElement.mount('#sepa-iban-element');

    var errorMessage = document.getElementById('sepa-error-message');
    var bankName = document.getElementById('sepa-bank-name');

    window.sepaIbanElement.on('change', function (event) {
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

function initEps() {
    window.epsBankElement = elements.create('epsBank', { style: JSON.parse(document.getElementById('stripeEpsElementStyle').value) });
    window.epsBankElement.mount('#eps-bank-element');
}

function initP24() {
    window.p24BankElement = elements.create('p24Bank', { style: JSON.parse(document.getElementById('stripeP24ElementStyle').value) });
    window.p24BankElement.mount('#p24-bank-element');
}

// Saved Sepa Direct Debit Card
var switchToSavedSepaCardsLink = document.getElementById('switch-to-saved-sepa-cards');
if (switchToSavedSepaCardsLink) {
    switchToSavedSepaCardsLink.addEventListener('click', function () {
        newSepaCardFormContainer.style.display = 'none';
        savedSepaCardsFormContainer.style.display = 'block';
    });
}

var switchToNewSepaCardLink = document.getElementById('switch-to-add-sepa-card');
if (switchToNewSepaCardLink) {
    switchToNewSepaCardLink.addEventListener('click', function () {
        newSepaCardFormContainer.style.display = 'block';
        savedSepaCardsFormContainer.style.display = 'none';
    });
}

if (savedSepaCardsFormContainer) {
    newSepaCardFormContainer.style.display = 'none';
}

function isSavedDirectDebitSepaCard() {
    return newSepaCardFormContainer && newSepaCardFormContainer.style.display === 'none';
}

function populateBillingData(pr) {
    var payerName = pr.payerName;
    if (payerName) {
        var payerNameSplit = payerName.split(' ');

        if (payerNameSplit.length > 1) {
            var firstName = payerNameSplit[0];
            var lastName = payerNameSplit[1];

            document.querySelector('input[name$="_firstName"]').value = firstName;
            document.querySelector('input[name$="_lastName"]').value = lastName;
        } else {
            document.querySelector('input[name$="_firstName"]').value = payerName;
            document.querySelector('input[name$="_lastName"]').value = payerName;
        }
    }

    document.querySelector('input[id="cardholder-name"]').value = payerName;
    document.querySelector('input[name$="_email_emailAddress"]').value = pr.payerEmail;
    document.querySelector('input[name$="_phone"]').value = pr.payerPhone;

    var selectCountryElement = document.querySelector('select[name$="_country"]');
    var prCountry = pr.paymentMethod.billing_details.address.country.toLowerCase();
    var prCountryExists = ($('#' + selectCountryElement.id + ' option[value=' + prCountry + ']').length > 0);

    if (prCountryExists) {
        selectCountryElement.value = prCountry;
    }

    document.querySelector('input[name$="_city"]').value = pr.paymentMethod.billing_details.address.city;
    document.querySelector('input[name$="_postal"]').value = pr.paymentMethod.billing_details.address.postal_code;
    document.querySelector('input[name$="_address1"]').value = pr.paymentMethod.billing_details.address.line1;
    document.querySelector('input[name$="_address2"]').value = pr.paymentMethod.billing_details.address.line2;

    var stateElement = document.querySelector('select[name$="_state"]') || document.querySelector('input[name$="_state"]');
    stateElement.value = pr.paymentMethod.billing_details.address.state;
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
            // v1
            // eslint-disable-next-line no-use-before-define
            populateBillingData(ev);
            copyNewCardDetails(ev.paymentMethod);

            if ($('#dwfrm_billing').validate().form()) {
                prUsed = true;
                prUsedInput.value = 'true';
                document.querySelector('input[name$="_billing_save"]').disabled = false;
                document.getElementById('is-CREDIT_CARD').click();
                document.getElementById('dwfrm_billing').submit();

                ev.complete('success');
            } else {
                prUsed = false;
                prUsedInput.value = '';

                ev.complete('fail');
            }
        } catch (e) {
            prUsed = false;
            prUsedInput.value = '';

            ev.complete('fail');
        }
    });
}

function getOwnerDetails() {
    var stateElement = document.querySelector('select[name$="_state"]') || document.querySelector('input[name$="_state"]');
    return {
        name: document.querySelector('input[name$="_firstName"]').value + ' ' + document.querySelector('input[name$="_lastName"]').value,
        address: {
            line1: document.querySelector('input[name$="_address1"]').value,
            line2: document.querySelector('input[name$="_address2"]').value,
            city: document.querySelector('input[name$="_city"]').value,
            postal_code: document.querySelector('input[name$="_postal"]').value,
            country: document.querySelector('select[name$="_country"]').value,
            state: stateElement ? stateElement.value : ''
        },
        email: document.querySelector('input[name$="_email_emailAddress"]').value,
        phone: document.querySelector('input[name$="_phone"]').value
    };
}

function getSourceType(selectedPaymentMethod) {
    return {
        STRIPE_ACH_DEBIT: 'ach_debit',
        STRIPE_ALIPAY: 'alipay',
        STRIPE_MULTIBANCO: 'multibanco',
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
        var sourceIdInput = document.getElementById('stripe_source_id');
        var sourceClientSecretInput = document.getElementById('stripe_source_client_secret');
        var redirectURLInput = document.getElementById('stripe_redirect_url');

        sourceIdInput.value = result.source.id;
        sourceClientSecretInput.value = result.source.client_secret;
        if (result.source.redirect) {
            redirectURLInput.value = result.source.redirect.url;
        }

        document.getElementById('dwfrm_billing').submit();
    }
}

function handleIdealPaymentSubmit() {
    var idealOwnerNameInput = document.getElementById('ideal-name');
    if (!idealOwnerNameInput.value) {
        idealOwnerNameInput.focus();
        return;
    }

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'ideal',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmIdealPayment(
                        json.clientSecret,
                        {
                            payment_method: {
                                ideal: window.idealBankElement,
                                billing_details: {
                                    name: idealOwnerNameInput.value
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleSepaDebitPaymentSubmit() {
	var isSavedSepaCard = isSavedDirectDebitSepaCard();
    var sepaNameInput = document.getElementById('sepa-name');

    // validate sepa card form if not saved card selected
    if (!isSavedSepaCard && !sepaNameInput.value) {
        sepaNameInput.focus();
        return;
    }
    var owner = getOwnerDetails();
    var sepaBillingName = (sepaNameInput.value) ? sepaNameInput.value : owner.name;

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    var beforePaymentSubmitData = {
        csrf_token: $('[name="csrf_token"]').val(),
        type: 'sepa_debit',
        orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
    };

    var savedSepaDebitCardId = isSavedSepaCard ? document.querySelector('input[name="saved_sepa_card_id"]:checked').value : '';
    if (isSavedSepaCard && !savedSepaDebitCardId) {
        return;
    }

    if (isSavedSepaCard) {
        beforePaymentSubmitData.savedSepaDebitCardId = savedSepaDebitCardId;
    }

    var stripeSaveSepaCardInput = document.getElementById('stripe_save_sepa_card');
    if (stripeSaveSepaCardInput && stripeSaveSepaCardInput.checked) {
        beforePaymentSubmitData.saveSepaCard = true;
    }

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: beforePaymentSubmitData
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
        	var paymentMethod = [];
            if (savedSepaDebitCardId) {
                paymentMethod = savedSepaDebitCardId;
            } else {
                paymentMethod = {
                    sepa_debit: window.sepaIbanElement,
                    billing_details: {
                        name: sepaBillingName,
                        email: owner.email
                    }
                };
            }

            // eslint-disable-next-line no-unused-vars
            stripe.confirmSepaDebitPayment(
                json.clientSecret,
                {
                    payment_method: paymentMethod
                }
            ).then(function(result) {
                if (!result.error) {
                  document.getElementById('dwfrm_billing').submit();
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleBancontactPaymentSubmit() {
    var owner = getOwnerDetails();

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'bancontact',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmBancontactPayment(
                        json.clientSecret,
                        {
                            payment_method: {
                                billing_details: {
                                    name: owner.name
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handlePaypalPaymentSubmit() {
    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'paypal',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmPayPalPayment(
                        json.clientSecret,
                        {
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleGiropayPaymentSubmit() {
    var owner = getOwnerDetails();

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'giropay',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmGiropayPayment(
                        json.clientSecret,
                        {
                            payment_method: {
                                billing_details: {
                                    name: owner.name
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleSofortPaymentSubmit() {
    var sofortCountryCodeSelect = document.getElementById('sofort_country_code');
    var sofortCountryCode = sofortCountryCodeSelect && sofortCountryCodeSelect.selectedOptions && sofortCountryCodeSelect.selectedOptions.length && sofortCountryCodeSelect.selectedOptions[0] && sofortCountryCodeSelect.selectedOptions[0].value;

    if (!sofortCountryCode) {
        return;
    }

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'sofort',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmSofortPayment(
                        json.clientSecret,
                        {
                            payment_method: {
                                sofort: {
                                    country: sofortCountryCode
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleEpsPaymentSubmit() {
    var epsOwnerNameInput = document.getElementById('eps-name');
    if (!epsOwnerNameInput.value) {
        epsOwnerNameInput.focus();
        return;
    }

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'eps',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmEpsPayment(
                        json.clientSecret,
                        {
                            payment_method: {
                                eps: window.epsBankElement,
                                billing_details: {
                                    name: epsOwnerNameInput.value
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function handleP24PaymentSubmit() {
    var p24OwnerNameInput = document.getElementById('p24-name');
    if (!p24OwnerNameInput.value) {
        p24OwnerNameInput.focus();
        return;
    }

    var p24OwnerEmailInput = document.getElementById('p24-email');
    if (!p24OwnerEmailInput.value) {
        p24OwnerEmailInput.focus();
        return;
    }

    var stripeReturnURLInput = document.getElementById('stripe_return_url');

    $.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'p24',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            $.ajax({
                type: 'POST',
                url: $("#dwfrm_billing").attr("action"),
                data: $("#dwfrm_billing").serialize(),

                success: function(response) {
                    // eslint-disable-next-line no-unused-vars
                    stripe.confirmP24Payment(
                        json.clientSecret,
                        {
                            payment_method: {
                                p24: window.p24BankElement,
                                billing_details: {
                                    name: p24OwnerNameInput.value,
                                    email: p24OwnerEmailInput.value
                                }
                            },
                            payment_method_options: {
                                p24: {
                                    tos_shown_and_accepted: true
                                }
                            },
                            return_url: stripeReturnURLInput.value
                        }
                    );
                }
            });
        }
    }).fail(function (msg) {
        if (msg.responseJSON.redirectUrl) {
            window.location.href = msg.responseJSON.redirectUrl;
        } else {
            alert(msg);
        }
    });
}

function onSubmitButtonClicked(event) {
    var selectedPaymentMethod = getSelectedPaymentMethod();
    var createSourcePayload;

    if (selectedPaymentMethod == 'STRIPE_PAYMENT_ELEMENT') {
        event.preventDefault();
        window.localStorage.setItem('stripe_payment_method', 'STRIPE_PAYMENT_ELEMENT');
        return false;
    }

    window.localStorage.setItem('stripe_payment_method', selectedPaymentMethod);

    switch (selectedPaymentMethod) {
        case 'CREDIT_CARD':
            if (prUsed) {
                break;
            } else if (isSavedCard()) {
                copySelectedSaveCardDetails();
            } else {
                event.preventDefault();

                var cardholderName = document.getElementById('cardholder-name');
                var owner = getOwnerDetails();

                var stripeCardEl = (!cardElement) ? cardNumberElement : cardElement;
                stripe.createPaymentMethod('card', stripeCardEl, {
                    billing_details: {
                        name: cardholderName.value,
                        address: owner.address,
                        email: owner.email,
                        phone: owner.phone
                    }
                }).then(function (result) {
                    if (result.error) {
                        alert(result.error.message);
                    } else {
                        copyNewCardDetails(result.paymentMethod);
                        document.getElementById('dwfrm_billing').submit();
                    }
                });
            }
            break;
        case 'STRIPE_ACH_DEBIT':
            event.preventDefault();

            var achDebitParams = getBankAccountRequestParamsForAchDebit();
            stripe.createToken('bank_account', achDebitParams).then(processBankAccountRequestResult);

            break;
        case 'STRIPE_WECHATPAY':
            event.preventDefault();

            createSourcePayload = getCreateWeChatSourcePayload();

            stripe.createSource(createSourcePayload).then(processWeChatCreateSourceResult);
            break;
        case 'STRIPE_KLARNA':
            event.preventDefault();

            // get the category the customer chose
            var selectedCategory = document.querySelector('.klarna-payment-method:checked').value;
            window.localStorage.setItem('stripe_klarna_payment_option', selectedCategory);

            document.getElementById('dwfrm_billing').submit();
            break;
        case 'STRIPE_GIROPAY':
            event.preventDefault();
            handleGiropayPaymentSubmit();
            break;
        case 'STRIPE_EPS':
            event.preventDefault();
            handleEpsPaymentSubmit();
            break;
        case 'STRIPE_P24':
            event.preventDefault();
            handleP24PaymentSubmit();
            break;
        case 'STRIPE_ALIPAY':
        case 'STRIPE_MULTIBANCO':
            event.preventDefault();

            createSourcePayload = getCreateSourcePayload(selectedPaymentMethod);

            stripe.createSource(createSourcePayload).then(processCreateSourceResult);
            break;
        case 'STRIPE_IDEAL':
            event.preventDefault();
            handleIdealPaymentSubmit();
            break;
        case 'STRIPE_BANCONTACT':
            event.preventDefault();
            handleBancontactPaymentSubmit();
            break;
        case 'STRIPE_SOFORT':
            event.preventDefault();
            handleSofortPaymentSubmit();
            break;
        case 'STRIPE_SEPA_DEBIT':
            event.preventDefault();
            handleSepaDebitPaymentSubmit();
            break;
        case 'STRIPE_PAYPAL':
            event.preventDefault();
            handlePaypalPaymentSubmit();
            break;
        default:
            event.preventDefault();

            alert('Unknown payment method');
    }
}

function init() {
    if (newCardFormContainer) {
        initNewCardForm();
    }

    if (savedCardsFormContainer) {
        newCardFormContainer.style.display = 'none';
        initSavedCards();
    }

    if (idealPlaceholder) {
        initIdeal();
    }

    if (sepaDebitPlaceholder && sepaDebitInput) {
        initSepaDebit();
    }

    if (prbPlaceholder) {
        initPRB();
    }

    if (epsPlaceholder) {
        initEps();
    }

    if (p24Placeholder) {
        initP24();
    }

    document.addEventListener('DOMContentLoaded', function () {
        submitBillingFormButton.addEventListener('click', onSubmitButtonClicked);
    });
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
                        alert(msg.error);
                    }
                });
            }
        });
    } else {
        forceSubmit = true;
        placeOrderButton.click();
    }
}

function initSummary() {
    // v1
    // eslint-disable-next-line consistent-return
    placeOrderButton.addEventListener('click', function (event) {
        if (forceSubmit) return true;

        event.preventDefault();

		if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_PAYMENT_ELEMENT') {
			forceSubmit = true;
        	placeOrderButton.click();
        } else if (window.localStorage.getItem('stripe_payment_method') === 'STRIPE_KLARNA') {
            var klarnaPaymentOption = window.localStorage.getItem('stripe_klarna_payment_option');

            window.Klarna.Payments.authorize({
                payment_method_category: klarnaPaymentOption
            }, function (res) {
                if (res.approved) {
                    // Payment has been authorized
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
                    if ($('.mini-payment-instrument a').length) {
                        window.location.href = $('.mini-payment-instrument a').attr('href');
                    }
                } else {
                    // handle other states
                    alert('Order not approved');
                    if ($('.mini-payment-instrument a').length) {
                        window.location.href = $('.mini-payment-instrument a').attr('href');
                    }
                }
            });


        } else {
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
}

if (submitBillingFormButton) {
    init();
}

if (placeOrderButton) {
    initSummary();
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
        var bankAccountTokenIdInput = document.getElementById('stripe_bank_account_token_id');
        bankAccountTokenIdInput.value = result.token.id;

        // init bank account token
        var bankAccountTokenInput = document.getElementById('stripe_bank_account_token');
        bankAccountTokenInput.value = result.token.bank_account.id;

        document.getElementById('dwfrm_billing').submit();
    }
}

//t WeChat
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

function processWeChatCreateSourceResult(result) {
    if (result.error) {
        alert(result.error.message);
    } else {
        var sourceIdInput = document.getElementById('stripe_source_id');
        var sourceClientSecretInput = document.getElementById('stripe_source_client_secret');
        var sourceWeChatQRCodeURL = document.getElementById('stripe_wechat_qrcode_url');

        sourceIdInput.value = result.source.id;

        sourceClientSecretInput.value = result.source.client_secret;
        sourceWeChatQRCodeURL.value = result.source.wechat.qr_code_url;

        document.getElementById('dwfrm_billing').submit();
    }
}

//t Klarna
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
            (document.getElementsByClassName('country').length > 0 ?
                    document.getElementsByClassName('country')[0].value : '');
    var stripeOrderItems = JSON.parse(stripeOrderItemsInput.value);

    var amountToPay = parseFloat(stripeOrderAmountInput.value);
    var currencyCode = stripeOrderCurrencyInput.value && stripeOrderCurrencyInput.value.toLowerCase();

    var firstName = document.querySelector('input[name$="_firstName"]').value;
    var lastName = document.querySelector('input[name$="_lastName"]').value;

    var stripeOrderShipping = JSON.parse(stripeOrderShippingInput.value);

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
        source_order: {
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
        var sourceIdInput = document.getElementById('stripe_source_id');
        if (sourceIdInput) {
            sourceIdInput.value = result.source.id;
        }

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
                var klarnaCategory = document.getElementById('klarna_' + category);
                if (klarnaCategory) {
                    document.getElementById('klarna_' + category).checked = true;
                }
                paymentMethodSelected = true;
            }

            // create div for Klarna category when it doesn't exists (used when re-load Klarna widget in Order confirmation page)
            var klarnaCategoryContainerDiv = document.getElementById('klarna_' + category + '_container');
            if (!klarnaCategoryContainerDiv) {
                $('<div id="' + 'klarna_' + category + '_container' + '" style="display:none;"></div>').appendTo('#primary');
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

        if (document.getElementById('klarna_no_payment_methods')) {
            document.getElementById('klarna_no_payment_methods').style.display = paymentMethodSelected ? 'none' : 'block';
        }
    }
}

function refreshKlarnaWhenIsActive() {
    var isOrderConfirmation = $('.checkout-progress-indicator > div.active').hasClass('step-3');
    if (isOrderConfirmation && window.localStorage.getItem('stripe_payment_method') === 'STRIPE_KLARNA') {
        var klarnaSourceObj = window.localStorage.getItem('stripe_klarna_source');
        if (klarnaSourceObj) {
            var klarnaSource = JSON.parse(klarnaSourceObj);
            if (klarnaSource) {
                // create source and load Klarna widget
                stripe.createSource(klarnaSource).then(processKlarnaCreateSourceResult);
            }
        }
        return;
    }

    // check if Klarna is active
    var activePaymentMethod = document.querySelector('.payment-method-options .field-wrapper > input[type=radio]:checked');
    if (!activePaymentMethod || !activePaymentMethod.value.includes('KLARNA')) {
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
    window.localStorage.setItem('stripe_klarna_source', JSON.stringify(createSourcePayload));
    stripe.createSource(createSourcePayload).then(processKlarnaCreateSourceResult);
}

var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(() => {
    $('.payment-method-options .field-wrapper > input[type=radio]').change(function() {
        if (this.value === 'STRIPE_KLARNA') {
            if (!document.querySelector('input[name$="_address1"]').value
                || !document.querySelector('input[name$="_city"]').value
                || !document.querySelector('input[name$="_postal"]').value
                || !document.querySelector('select[name$="_country"]').value
                || !document.querySelector('input[name$="_emailAddress"]').value
                || !document.querySelector('input[name$="_phone"]').value) {

                alert(document.getElementById('klarna-widget-wrapper').dataset.errormsg);

                document.getElementById('is-CREDIT_CARD').click();

                return false;
            }

            // create source and load Klarna widgets
            var createSourcePayload = getCreateKlarnaSourcePayload();
            window.localStorage.setItem('stripe_klarna_source', JSON.stringify(createSourcePayload));
            stripe.createSource(createSourcePayload).then(processKlarnaCreateSourceResult);
        }
    });

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

    if (document.querySelector('#dwfrm_billing input[name$="_postal"]')) {
        document.querySelector('#dwfrm_billing input[name$="_postal"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing select[name$="_country"]')) {
        document.querySelector('#dwfrm_billing select[name$="_country"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_emailAddress"]')) {
        document.querySelector('#dwfrm_billing input[name$="_emailAddress"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_phone"]')) {
        document.querySelector('#dwfrm_billing input[name$="_phone"]').addEventListener('change', refreshKlarnaWhenIsActive);
    }

    refreshKlarnaWhenIsActive();
});

/* Stripe Payment Element */
function onSubmitStripePaymentElement(event) {
    if (getSelectedPaymentMethod() !== 'STRIPE_PAYMENT_ELEMENT')
        return;

    var stripeReturnURLInput = document.getElementById('stripe_return_url');
    var returnURL = stripeReturnURLInput.value;

    $.ajax({
        type: 'POST',
        url: $("#dwfrm_billing").attr("action"),
        data: $("#dwfrm_billing").serialize(),

        success: function(response) {
            // eslint-disable-next-line no-unused-vars
            var error = stripe.confirmPayment({
		        elements: window.stripePaymentElements,
		        confirmParams: {
		            // Make sure to change this to your payment completion page
		            return_url: returnURL
		        }
		    }).then(function (result) {
		    	if (result.error) {
		            let billingForm = document.getElementById('dwfrm_billing');
					billingForm.focus();
			        billingForm.scrollIntoView();

		            $.ajax({
		                url: document.getElementById('logStripeErrorMessageURL').value,
		                method: 'POST',
		                dataType: 'json',
		                data: {
		                    csrf_token: $('[name="csrf_token"]').val(),
		                    msg: 'UPE stripe.confirmPayment Error ' + JSON.stringify(result.error)
		                }
		            });
		  
		            alert($('#payment-element').data('errormsg'));
		        }
		    });
        }
    });
}

function initStripePaymentElement() {
    // validate Billing Form
    let billingForm = document.getElementById('dwfrm_billing');
    $(billingForm).find('.form-control.is-invalid').removeClass('is-invalid');
    if (!billingForm.reportValidity()) {
        billingForm.focus();
        billingForm.scrollIntoView();
        return;
    }

    var ownerEmail = document.querySelector('#dwfrm_billing input[name$="_emailAddress"]') ? document.querySelector('#dwfrm_billing input[name$="_emailAddress"]').value : '';
    if (!ownerEmail) {
        return;
    }
    
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
                    postal_code: document.querySelector('#dwfrm_billing input[name$="_postal"]') ? document.querySelector('#dwfrm_billing input[name$="_postal"]').value : '',
                    country: document.querySelector('#dwfrm_billing select[name$="_country"]') ? document.querySelector('#dwfrm_billing select[name$="_country"]').value : ''
                }
            }
        }
    });
    window.paymentElementInstance.mount('#payment-element');
}

function initNewStripePaymentIntent() {
	$.ajax({
        url: document.getElementById('beforePaymentSubmitURL').value,
        method: 'POST',
        dataType: 'json',
        data: {
            csrf_token: $('[name="csrf_token"]').val(),
            type: 'paymentelement',
            orderid: document.getElementById('stripe_order_number') ? document.getElementById('stripe_order_number').value : ''
        }
    }).done(function (json) {
        if (json && json.error && json.error.message) {
            alert(json.error.message);
        }
        // success client Secret generation
        if (json.clientSecret) {
            const clientSecret = json.clientSecret;
            const stripePaymentElementStyleObject = JSON.parse(document.getElementById('stripePaymentElementStyle').value);
            const appearance = {
                theme: 'stripe'
            };

            appearance.variables = stripePaymentElementStyleObject.variables;

            window.stripePaymentElements = stripe.elements({ appearance, clientSecret });

            initStripePaymentElement();
        }
    });
}

ready(() => {
    if (!submitBillingFormButton)
        return;

    if ($('#payment-element').length) {
    	initNewStripePaymentIntent()
		
        document.querySelector('button[name=dwfrm_billing_save]')
			.addEventListener('click', onSubmitStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_firstName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_firstName"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_lastName"]')) {
        document.querySelector('#dwfrm_billing input[name$="_lastName"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_postal"]')) {
        document.querySelector('#dwfrm_billing input[name$="_postal"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing select[name$="_country"]')) {
        document.querySelector('#dwfrm_billing select[name$="_country"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_emailAddress"]')) {
        document.querySelector('#dwfrm_billing input[name$="_emailAddress"]').addEventListener('change', initStripePaymentElement);
    }

    if (document.querySelector('#dwfrm_billing input[name$="_phone"]')) {
        document.querySelector('#dwfrm_billing input[name$="_phone"]').addEventListener('change', initStripePaymentElement);
    }
});


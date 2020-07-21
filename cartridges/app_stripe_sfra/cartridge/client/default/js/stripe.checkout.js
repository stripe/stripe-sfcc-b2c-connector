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

var cardElement = elements.create('card');
cardElement.mount('#card-element');
cardElement.addEventListener('change', function (event) {
    var displayError = document.getElementById('card-errors');
    if (event.error) {
        displayError.textContent = event.error.message;
    } else {
        displayError.textContent = '';
    }
});

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
    var stateElement = document.querySelector('select[name$="_stateCode"]') || document.querySelector('input[name$="_stateCode"]');
    return {
        name: document.querySelector('input[name$="_firstName"]').value + ' ' + document.querySelector('input[name$="_lastName"]').value,
        address: {
            line1: document.querySelector('input[name$="_address1"]').value,
            line2: document.querySelector('input[name$="_address2"]').value,
            city: document.querySelector('input[name$="_city"]').value,
            postal_code: document.querySelector('input[name$="_postalCode"]').value,
            country: document.querySelector('select[name$="_country"]').value,
            state: stateElement ? stateElement.value : ''
        },
        email: document.querySelector('input[name$="_email"]').value,
        phone: document.querySelector('input[name$="_phone"]').value
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
        STRIPE_WECHATPAY: 'wechat'
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
});

document.querySelector('button.submit-payment').addEventListener('click', function (event) {
    event.stopImmediatePropagation();

    var activeTabId = $('.tab-pane.active').attr('id');
    var paymentInfoSelector = '#dwfrm_billing .' + activeTabId + ' .payment-form-fields input.form-control';
    var selectedPaymentMethod = $(paymentInfoSelector).val();
    var createSourcePayload;

    switch (selectedPaymentMethod) {
        case 'CREDIT_CARD':
            if (prUsed) {
                console.log('submit prUsed');
            } else if (isSavedCard()) {
                copySelectedSaveCardDetails();
                $('.submit-payment').click();
            } else {
                var owner = getOwnerDetails();
                stripe.createPaymentMethod('card', cardElement, {
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

// Update stored order amount on shipping method change
$('body').on('checkout:updateCheckoutView', function (e, data) {
    var stripeOrderAmountInput = document.getElementById('stripe_order_amount');
    stripeOrderAmountInput.value = data.order.totals.grandTotalValue;
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


/* eslint-disable no-console */
/* eslint-disable no-alert */
/* globals Stripe */
// v1
var cardElement;
var idealBankElement;
var sepaIbanElement;

var stripe = Stripe(document.getElementById('stripePublicKey').value);
var elements = stripe.elements();

var newCardFormContainer = document.getElementById('new-card-form-container');
var savedCardsFormContainer = document.getElementById('saved-cards-container');
var idealPlaceholder = document.getElementById('ideal-bank-element');
var sepaDebitPlaceholder = document.getElementById('sepa-iban-element');
var sepaDebitInput = document.getElementById('is-STRIPE_SEPA_DEBIT');
var prbPlaceholder = document.getElementById('payment-request-button');

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

function initNewCardForm() {
    var postalCodeEl = document.querySelector('input[name$="_postal"]');
    cardElement = elements.create('card', { value: { postalCode: postalCodeEl.value }, style: JSON.parse(document.getElementById('stripeCardFormStyle').value) });
    cardElement.mount('#card-element');

    postalCodeEl.addEventListener('change', function (event) {
        cardElement.update({ value: { postalCode: event.target.value } });
    });

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

function onSubmitButtonClicked(event) {
    var selectedPaymentMethod = getSelectedPaymentMethod();
    var createSourcePayload;

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

                stripe.createPaymentMethod('card', cardElement, {
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
        case 'STRIPE_ALIPAY':
        case 'STRIPE_BANCONTACT':
        case 'STRIPE_EPS':
        case 'STRIPE_GIROPAY':
        case 'STRIPE_MULTIBANCO':
        case 'STRIPE_P24':
            event.preventDefault();

            createSourcePayload = getCreateSourcePayload(selectedPaymentMethod);

            stripe.createSource(createSourcePayload).then(processCreateSourceResult);
            break;
        case 'STRIPE_IDEAL':
            event.preventDefault();

            var idealOwnerNameInput = document.getElementById('ideal-name');

            var idealPayload = getCreateSourcePayload(selectedPaymentMethod);

            idealPayload.owner = idealPayload.owner || {};
            idealPayload.owner.name = idealOwnerNameInput.value;

            stripe.createSource(idealBankElement, idealPayload).then(processCreateSourceResult);
            break;
        case 'STRIPE_SOFORT':
            event.preventDefault();

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
            event.preventDefault();

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
                }).error(function (msg) {
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

        $.ajax({
            url: document.getElementById('beforePaymentAuthURL').value,
            method: 'POST',
            dataType: 'json',
            data: {
                csrf_token: $('[name="csrf_token"]').val()
            }
        }).done(function (json) {
            handleServerResponse(json);
        }).error(function (msg) {
            if (msg.responseJSON.redirectUrl) {
                window.location.href = msg.responseJSON.redirectUrl;
            } else {
                alert(msg.error);
            }
        });
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
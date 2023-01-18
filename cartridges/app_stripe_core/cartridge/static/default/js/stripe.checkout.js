/* eslint-disable no-console */
/* eslint-disable no-alert */
/* globals Stripe */
// v1
var cardElement = null;
var cardNumberElement = null;

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

function onSubmitBillingButtonClicked(event) {
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

    if (prbPlaceholder) {
        initPRB();
    }

    document.addEventListener('DOMContentLoaded', function () {
        submitBillingFormButton.addEventListener('click', onSubmitBillingButtonClicked);
    });
}

function handleServerResponse(response) {
    if (response.error) {
        alert(response.error.message);
        $.ajax({
            url: document.getElementById('stripeFailOrderURL').value,
            method: 'POST',
            dataType: 'json',
            data: {
                csrf_token: $('[name="csrf_token"]').val()
            }
        }).done(function () {
            window.location.replace(document.getElementById('billingPageUrl').value);
        });
    } else if (response.requires_action) {
        // Use Stripe.js to handle required card action
        stripe.handleCardAction(response.payment_intent_client_secret).then(function (result) {
            if (result.error) {
                alert(result.error.message);
                $.ajax({
                    url: document.getElementById('stripeFailOrderURL').value,
                    method: 'POST',
                    dataType: 'json',
                    data: {
                        csrf_token: $('[name="csrf_token"]').val()
                    }
                }).done(function () {
                    window.location.replace(document.getElementById('billingPageUrl').value);
                });
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
                    if (msg.error) {
                        alert(msg.error);
                    }
                    $.ajax({
                        url: document.getElementById('stripeFailOrderURL').value,
                        method: 'POST',
                        dataType: 'json',
                        data: {
                            csrf_token: $('[name="csrf_token"]').val()
                        }
                    }).done(function () {
                        window.location.replace(document.getElementById('billingPageUrl').value);
                    });
                });
            }
        });
    } else {
        forceSubmit = true;
        window.location.replace(document.getElementById('stripeCardOrderPlacedURL').value);
    }
}

function handleStripeCardSubmitOrder() {
    $.ajax({
        type: 'POST',
        url: $("form.submit-order").attr("action"),
        data: $("form.submit-order").serialize(),
        success: function(response) {
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
		            $.ajax({
                        url: document.getElementById('stripeFailOrderURL').value,
                        method: 'POST',
                        dataType: 'json',
                        data: {
                            csrf_token: $('[name="csrf_token"]').val()
                        }
                    }).done(function () {
                        window.location.replace(document.getElementById('billingPageUrl').value);
                    });
		        }
		    });
        }
    });
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
        } else {
            handleStripeCardSubmitOrder();
        }
    });
}

if (submitBillingFormButton) {
    init();
}

if (placeOrderButton) {
    initSummary();
}

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
        	var formaction = $('#payment-element').data('formaction');
        	if (!formaction)
        		return;
	
        	var tokenname = $('#payment-element').data('tokenname');
        	if (!tokenname)
        		return;
        
        	var tokenvalue = $('#payment-element').data('tokenvalue');
        	if (!tokenvalue)
        		return;

        	var form = document.createElement("form");
            form.style.display = "none";
            form.classList.add("submit-order");
            document.body.appendChild(form);
            
            form.method = "POST";
            form.action = formaction; 

            var orderIdInput = document.createElement("input");
            orderIdInput.name = tokenname;
            orderIdInput.value = tokenvalue;
            form.appendChild(orderIdInput);
            
            $.ajax({
		        type: 'POST',
		        url: $("form.submit-order").attr("action"),
		        data: $("form.submit-order").serialize(),
		
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
				            $.ajax({
				                url: document.getElementById('logStripeErrorMessageURL').value,
				                method: 'POST',
				                dataType: 'json',
				                data: {
				                    csrf_token: $('[name="csrf_token"]').val(),
				                    msg: 'UPE stripe.confirmPayment Error ' + JSON.stringify(result.error)
				                }
				            }).done(function () {
				            	alert($('#payment-element').data('errormsg'));
				            	
				            	$.ajax({
		                            url: document.getElementById('stripeFailOrderURL').value,
		                            method: 'POST',
		                            dataType: 'json',
		                            data: {
		                                csrf_token: $('[name="csrf_token"]').val()
		                            }
		                        }).done(function () {
		                            window.location.replace(document.getElementById('billingPageUrl').value);
		                        });
				            });
				        }
				    });
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

var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(() => {
    if (!submitBillingFormButton)
        return;

    if ($('#payment-element').length) {
    	initNewStripePaymentIntent()
		
        document.querySelector('button[name=dwfrm_billing_save]')
			.addEventListener('click', onSubmitStripePaymentElement);

		$('button[name=dwfrm_billing_save] span')
			.text($('#payment-element').data('submitordertxt'));
    
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
	}
});


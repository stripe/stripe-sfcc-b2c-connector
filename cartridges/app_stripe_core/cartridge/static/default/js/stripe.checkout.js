var stripeOptions = [];
var betas = document.getElementById('stripePaymentMethodsInBeta').value;
if (betas) {
    stripeOptions.betas = betas.split(',');
}

var stripe = Stripe(document.getElementById('stripePublicKey').value, stripeOptions);

var paymentMethodOptions = document.querySelectorAll('input[name$="_selectedPaymentMethodID"]');

var submitBillingFormButton = document.querySelector('button[name=dwfrm_billing_save]');

function getSelectedPaymentMethod() {
    for (var i = 0; i < paymentMethodOptions.length; i++) {
        var paymentMethodOption = paymentMethodOptions[i];
        if (paymentMethodOption.checked) {
            return paymentMethodOption.value;
        }
    }

    return null;
}

/**
 * Redirects to the billing page (same-origin http(s) URLs only).
 */
function redirectToBillingPage() {
    var billingPageUrlInput = document.getElementById('billingPageUrl');
    var safeUrl = null;

    if (billingPageUrlInput && billingPageUrlInput.value) {
        try {
            var parsedUrl = new URL(billingPageUrlInput.value, window.location.href);
            if ((parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:')
                && parsedUrl.origin === window.location.origin) {
                safeUrl = parsedUrl.href;
            }
        } catch (e) {
            safeUrl = null;
        }
    }

    if (safeUrl) {
        window.location.replace(safeUrl);
    } else {
        window.location.reload();
    }
}

/* Stripe Payment Element */
function onSubmitStripePaymentElement(event) {
    if (getSelectedPaymentMethod() !== 'STRIPE_PAYMENT_ELEMENT')
        return;

    event.preventDefault();

    var stripeReturnURLInput = document.getElementById('stripe_return_url');
    var stripeReturnURL = stripeReturnURLInput.value;
   
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
            
            window.stripePaymentElements.submit().then(function (result) {
                if (result.error) {
                    return;
                }
                
                stripe.createConfirmationToken({
                    elements: window.stripePaymentElements,
                    params: {
                        return_url: stripeReturnURL
                    }
                }).then(function (createConfirmationTokenResult) {
                    if (createConfirmationTokenResult.error) {
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
                        redirectToBillingPage();
                        return;
                    } 
                    $.ajax({
                        url: document.getElementById('paymentElementSubmitOrderURL').value,
                        method: 'POST',
                        data: {
                            csrf_token: $('[name="csrf_token"]').val(),
                            confirmationToken: JSON.stringify(createConfirmationTokenResult.confirmationToken)
                        },
                        success: function (data) {
                            if (data.error) {
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
                                            redirectToBillingPage();
                                        }
                                    }
                                });
                            } else {
                                if (data.status === 'requires_action') {
                                    stripe.handleNextAction({
                                        clientSecret: data.clientSecret
                                    }).then(function (handleNextActionResult) {
                                        if (handleNextActionResult.error) {
                                            $.ajax({
                                                url: document.getElementById('logStripeErrorMessageURL').value,
                                                method: 'POST',
                                                dataType: 'json',
                                                data: {
                                                    csrf_token: $('[name="csrf_token"]').val(),
                                                    msg: 'UPE stripe.confirmPayment Error ' + JSON.stringify(result.error)
                                                }
                                            }).done(function () {
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
                                                            redirectToBillingPage();
                                                        }
                                                    }
                                                });
                                            });
                                        } else {
                                            window.location.replace(document.getElementById('stripeCardOrderPlacedURL').value);
                                        }
                                    });
                                } else {
                                    window.location.replace(document.getElementById('stripeCardOrderPlacedURL').value);
                                }
                            }
                        },
                        error: function () {
                            // enable the placeOrder button here
                            $('body').trigger('checkout:enableButton', $('.next-step-button button'));
                        }
                    });
                });
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


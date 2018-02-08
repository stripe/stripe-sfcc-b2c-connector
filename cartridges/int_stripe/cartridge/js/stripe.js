'use strict';

var ajax = require('./ajax'),
	util = require('./util'),
	dialog = require('./dialog'),
	page = require('./page');

function stripeSourceHandlerAccount(source) {
	var form = document.getElementById('CreditCardForm');
	var $form = $('#CreditCardForm');
	var hiddenInput = document.createElement('input');
	hiddenInput.setAttribute('type', 'hidden');
	hiddenInput.setAttribute('name', 'stripeToken');
	hiddenInput.setAttribute('value', source.id);
	form.appendChild(hiddenInput);

	// Submit the form
	//form.submit();
	var url = util.appendParamToURL($form.attr('action'), 'format', 'ajax');
    var applyName = $form.find('#applyBtn').attr('name');
    var options = {
        url: url,
        data: $form.serialize() + '&' + applyName + '=x',
        type: 'POST'
    };
    $.ajax(options).done(function (data) {
        if (typeof(data) !== 'string') {
            if (data.success) {
                dialog.close();
                page.refresh();
            } else if (data.error) {
                page.redirect(Urls.csrffailed);
            } else {
                window.alert(data.message);
                return false;
            }
        } else {
        	// if success - meaning we have a card list, close the dialog
        	// otherwise, keep it open
        	if($(data).find('.paymentslist').length > 0) {
        		page.refresh();
        	} else {
                $('#dialog-container').html(data);
                initializeMyAccountEvents();
        	}
        }
    });
}
function createSource(card, sourceData) {
	stripe.createSource(card,sourceData).then(function(result) {
	    if (result.error) {
	      // Inform the user if there was an error
	      var errorElement = document.getElementById('card-errors');
	      errorElement.textContent = result.error.message;
	      $form.find('#applyBtn').prop('disabled', false);
	    } else {
	      // Send the token to your server
	      stripeSourceHandlerAccount(result.source);
	    }
	  });
}

/**
 * @function
 * @description Initializes Stripe My Account events
 */
function initializeMyAccountEvents() {
	var $form = $('#CreditCardForm');
	var style = JSON.parse(SitePreferences.STRIPE_CARD_STYLE);

	var card = elements.create('card', {style: style});
	card.mount('#card-element');

	$form.on('click', '.cancel-button', function (e) {
        e.preventDefault();
        dialog.close();
        page.refresh();
    });
	// Handle real-time validation errors from the card Element.
	card.addEventListener('change', function(event) {
	  var displayError = document.getElementById('card-errors');
	  if (event.error) {
	    displayError.textContent = event.error.message;
	    $form.find('#applyBtn').prop('disabled', true);
	  } else {
	    displayError.textContent = '';
	    $form.find('#applyBtn').prop('disabled', false);
	  }
	});



	$form.find('#applyBtn').on('click', function(e) {
		// Prevent the form from being submitted
		e.preventDefault();
		// Disable the submit button to prevent repeated clicks:
		$form.find('#applyBtn').prop('disabled', true);
		//var ownerVal = ;
		var ownerInfo = {
				owner: {
					name: $form.find('input[name$="_owner"]').val()
				}
		};
		createSource(card, ownerInfo);
	});
}

function getOwnerDetails() {
	var $form = $('.checkout-billing');
	return {
	    name: $form.find('input[name$="_firstName"]').val() + ' ' + $form.find('input[name$="_lastName"]').val(),
	    address: {
	      line1: $form.find('input[name$="_address1"]').val(),
	      city: $form.find('input[name$="_city"]').val(),
	      postal_code: $form.find('input[name$="_postal"]').val(),
	      country: $form.find('select[name$="_country"]').val(),
	    },
	    email: $form.find('input[name$="_email_emailAddress"]').val(),
	    phone: $form.find('input[name$="_phone"]').val(),
	  };
	}


/**
 * @function
 * @description Initializes Stripe Billing events
 */
function initializeBillingEvents() {
	// Custom styling can be passed to options when creating an Element.
  	// (Note that this demo uses a wider set of styles than the guide below.)


	var $form = $('.checkout-billing');

	var $selectSourceOptions = $('.selected-sources-payment');
	$selectSourceOptions.on('click', 'input[type="radio"]', function () {
        var $selectSourceOptions = $('.selected-sources-payment');
        $selectSourceOptions.find(':checked').removeAttr('checked');
        $('input[value=' + $(this).val() + ']').prop('checked', 'checked');

    });

	// ***** Form Submit *****

	$form.find('button[name$="_billing_save"]').on('click', function(e) {
		e.preventDefault();
		var $selectPaymentMethod = $('.payment-method-options');
		var sourceType = $selectPaymentMethod.find(':checked').val();
		if (sourceType == 'CREDIT_CARD') {
			if (prToken != "") {
				var $form = $('.checkout-billing');
				// Insert the token ID into the form so it gets submitted to the server:
				$form.find('input[name="stripeToken"]').val(prToken);
				$form.submit();
			}else{

				var $form = $('.checkout-billing');
				if (!$form.validate().form()) {
					return false;
				}
				//Check to see if saved card was selected
				var storedCard = $form.find('input[name="stripeCardStored"]').val();
				if (storedCard === 'true') {
					$form.submit();
				} else {
					var formData = getCCData($form);
	                var $form = $('.checkout-billing');
	                if(!$form.validate().form()) {
	                    return false;
	                }
	                    var formData = getCCData($form);

	                    var ownerInfo = {
	                        owner: {
	                            name: formData['name'],
	                            address: {
	                                line1: formData['address_line1'],
	                                city: formData['city'],
	                                postal_code: formData['address_zip'],
	                                country: formData['address_country'],
	                            },
	                            email: formData['emailAddress']
	                        }
					};

					stripe.createSource(card, ownerInfo).then(function (result) {
						if (result.error) {
							// Inform the user if there was an error
							var errorElement = $('#card-errors');
							errorElement.textContent = result.error.message;
						} else {
							var $form = $('.checkout-billing');
							// Send the source to your server
							$form.find('input[name="stripeToken"]').val(result.source.id);
							$form.submit();
						}
					});
				}
			}
		} else {
			var $selectSourceOptions = $('.selected-sources-payment');
			var selectedSource = $selectSourceOptions.find(':checked').val();

			if (selectedSource != undefined && selectedSource != 'newSource') {
		        //set payment method to stripe APM
		        var $selectPaymentMethod = $('.payment-method-options');
			    $selectPaymentMethod.find(':checked').val('STRIPE_APM_METHODS');
			    var $form = $('.checkout-billing');
		        var button = $form.find('button[name$="_billing_save"]');

			    $('<input/>').attr({
		            type: 'hidden',
		            name: button.attr('name'),
		            value: button.attr('value')
		        }).appendTo($form);

		        // Submit the form:
		        $form.submit();
			} else {
				var sourceDetails = {
					owner: getOwnerDetails(),
				};
				// Handle common inputs that are shared across some payment methods
				switch (sourceType) {
					case "bancontact":
					case "giropay":
					case "ideal":
					case "sofort":
					case "alipay":
					case "wechat":
					case "eps":
					case "p24":
					case "ach_credit_transfer":
						// These redirect flow payment methods need this information to be set at source creation
						sourceDetails.amount = $('#stripeOrderAmount').val();
						sourceDetails.currency = $('#stripeCurrency').val();
						sourceDetails.redirect = { return_url: $('#stripeRedirectUrl').val()};
						break;
				}
				// Handle special inputs that are unique to a payment method
				switch (sourceType) {
					case "sepa_debit":
						sourceDetails.currency = $('#stripeCurrency').val();
						sourceDetails.sepa_debit = { iban: $("#IBAN").val() };
						break;
					case "ideal":
						var idealBank = $("#ideal_bank").val();
						if (idealBank != '') {
							sourceDetails.ideal = { bank: idealBank };
						}
						break;
					case "bancontact":
						var bancontactLanguage = $("#bancontact_language").val();
						sourceDetails.bancontact = { preferred_language: bancontactLanguage };
						break;
					case "sofort":
						sourceDetails.sofort = { country: $("#sofort_country").val() };
						break;
					case "bitcoin":
					case "alipay":
					case "wechat":
						sourceDetails.currency = $('#stripeCurrency').val();
						sourceDetails.amount = $('#stripeOrderAmount').val();
						break;
				}
				sourceDetails.metadata = {orderId:$('#stripeOrderNumber').val()};
				sourceDetails.type = sourceType;
				sourceDetails.statement_descriptor = "Stripe Payments Test";
				stripe.createSource(sourceDetails).then(setOutcome);
			}
		}

	});

	// Saved Card functionality for showing new card form
	$('input[name$="_creditCardList"]').on('change',function(){
		var cardVal = $(this).filter(':checked').val();
		if (cardVal !== undefined && cardVal.length !== 0) {
			if (cardVal === 'newCard') {
	        	clearCCFields();
	        	$('.card-details').show();
	        } else {
	        	$('.card-details').hide();
	    		populateCreditCardForm(cardVal);
	        }
		}
        // remove server side error
        $('.required.error').removeClass('error');
        $('.error-message').remove();
	});

	// ***** init paymentRequestButton *****
	var prToken = "";
	var ordertotal = 0;
	var ordershipping = 0;
	var ordertax = 0;
	ordertotal = Number($('#ordertotalvalue').val());
	ordershipping = Number($('#ordershipvalue').val());
	ordertax = Number($('#ordertaxvalue').val());

	if (!isNaN(ordertotal)) {
		var items = [];
		var tax = {};
		var shipping = {};
		if(SitePreferences.STRIPE_TAX == 'net'){
			tax.label = Resources.STRIPE_TAX_MSG;
			tax.amount = ordertax;
			items.push(tax);
		}
		shipping.label = Resources.STRIPE_SHIPPING_MSG;
		shipping.amount = ordershipping;
		items.push(shipping);

    	var paymentRequest = stripe.paymentRequest({
            country: SitePreferences.STRIPE_COUNTRY,
            currency: SitePreferences.STRIPE_CURRENCY,
            total: {
                label: 'Order total',
                amount: ordertotal,
                pending: false
            },
            displayItems: items
        });
    	var styleObj = JSON.parse(SitePreferences.STRIPE_PR_STYLE);

        var prButton = elements.create('paymentRequestButton', {
            paymentRequest: paymentRequest,
            style: {
                paymentRequestButton: styleObj
            },
        });

        // Check the availability of the Payment Request API first.
        paymentRequest.canMakePayment().then(function(result) {
        	if (result) {
            	prButton.mount('#payment-request-button');
            } else {
            	$('#payment-request-button').hide();
            }
        });

        paymentRequest.on('token', function(ev) {
        	$form.find('input[name="stripeToken"]').val(ev.token.id);
        	$form.find('input[name="stripeCardID"]').val(ev.token.id);
        	$form.find('input[name="stripeCardStored"]').val('false');
        	$form.find('input[name="prUsed"]').val('true');
      		prToken = ev.token.id;
    		ev.complete('success');
    		$form.submit();
        });
	}

	// ***** end init paymentRequestButton *****

	var style = JSON.parse(SitePreferences.STRIPE_CARD_STYLE);

	var card = elements.create('card', {style: style});
	card.mount('#card-element');
	// Handle real-time validation errors from the card Element.
	card.addEventListener('change', function(event) {
	  var displayError = document.getElementById('card-errors');
	  if (event.error) {
	    displayError.textContent = event.error.message;
	  } else {
	    displayError.textContent = '';
	  }
	});


}

function setOutcome(result) {
	  if (result.source) {
		    var $form = $('.checkout-billing');
	        var button = $form.find('button[name$="_billing_save"]');

	        //set payment method to stripe APM
	        var $selectPaymentMethod = $('.payment-method-options');
		    $selectPaymentMethod.find(':checked').val('STRIPE_APM_METHODS');
		    $('#stripeSourceId').val(result.source.id);
		    $('#stripeClientSecret').val(result.source.client_secret);
		    if (result.source.redirect) {
		    	$('#stripeAuthUrl').val(result.source.redirect.url);
		    } else if (result.source.wechat) {
		    	$('#stripeAuthUrl').val(result.source.wechat.qr_code_url);
		    }
		    $('#stripeJsonData').val(JSON.stringify(result.source));

		    $('<input/>').attr({
	            type: 'hidden',
	            name: button.attr('name'),
	            value: button.attr('value')
	        }).appendTo($form);

	        // Submit the form:
	        $form.submit();
	  } else if (result.error) {
		  var errorDisplay = result.error.message;
		  var $selectPaymentMethod = $('.payment-method-options');
		  var sourceType = $selectPaymentMethod.find(':checked').val();
		  switch (sourceType) {
		  	case "sepa_debit":
		  		errorDisplay += ' ' + Resources.SEPA_DEBIT_SRC_INFO;
				break;
			case "bancontact":
				errorDisplay += ' ' + Resources.BANCORT_COUNTRY;
				break;
			case "sofort":
				errorDisplay += ' ' + Resources.SOFORT_SRC_INFO;
				break;
		  }
		  $('#stripe-payment-errors').empty().html(errorDisplay);
	  } else {
	    //spinnerHandler();
	  }
}

/**
 * @function
 * @description Updates the credit card form with the attributes of a given card
 * @param {String} cardID the credit card ID of a given card
 */
function populateCreditCardForm(cardID) {
	var url = util.appendParamToURL(Urls.stripeBillingSelectCC, 'creditCardUUID', cardID);

    ajax.getJson({
        url: url,
        callback: function (data) {
            if (!data) {
                window.alert(Resources.CC_LOAD_ERROR);
                return false;
            }
            setCCFields(data);
        }
    });
}

/**
 * @function
 * @description Fills the Credit Card form with the passed data-parameter and clears the former cvn input
 * As of v3, we no longer have a CC form that needs populating.  We just need the Source ID.
 * @param {Object} data The Credit Card data (holder, type, masked number, expiration month/year)
 */
function setCCFields(data) {
    var $creditCard = $('[data-method="CREDIT_CARD"]');
    $creditCard.find('input[name="stripeCardID"]').val(data.stripeCardID);
    $creditCard.find('input[name="stripeToken"]').val(data.stripeCardID);
    $creditCard.find('input[name="stripeCardStored"]').val('true');
    $creditCard.find('input[name="prUsed"]').val('');
}

/**
 * @function
 * @description Gets the Credit Card data which will be passed to Stripe
 * @param The Credit Card form
 * @return {Object} data The Credit Card data
 */
var getCCData = function ($form) {
	var formData = {};
	formData['name'] = $form.find('input[name$="_owner"]').val();
	formData['number'] = $form.find('input[name*="_number"]').val();
	formData['exp_month'] = $form.find('select[name$="_expiration_month"]').val();
	formData['exp_year'] = $form.find('select[name$="_expiration_year"]').val();
	formData['cvc'] = $form.find('input[name*="_cvn"]').val();
	//send additional information to the Stripe if on the billing form
	if($form.hasClass('checkout-billing')) {
		formData['address_line1'] = $form.find('input[name$="_address1"]').val();
		formData['address_line2'] = $form.find('input[name$="_address2"]').val();
		formData['address_city'] = $form.find('input[name$="_city"]').val();
		formData['address_state'] = $form.find('select[name$="_state"]').val();
		formData['address_zip'] = $form.find('input[name$="_postal"]').val();
		formData['address_country'] = $form.find('select[name$="_country"]').val();
	}

	return formData;
}

/**
 * @function
 * @description Initializes Credit Card events
 */
var initializeCCEvents = function () {
	var $creditCard = $('[data-method="CREDIT_CARD"]');
	var CCObj = {
		owner: $creditCard.find('input[name$="creditCard_owner"]'),
		number: $creditCard.find('input[name*="_creditCard_number"]'),
		type: $creditCard.find('input[name$="_type"]'),
		month: $creditCard.find('[name$="_month"]'),
		year: $creditCard.find('[name$="_year"]')
	};
	$.each(CCObj, function(propertyName, object) {
		object.on('change', function(e) {
			$creditCard.find('input[name="stripeCardID"]').val('');
			$creditCard.find('input[name="stripeToken"]').val('');
			$creditCard.find('input[name="stripeCardStored"]').val('false');
			$creditCard.find('input[name="prUsed"]').val('');
		});
	});
}

/**
 * @function
 * @description Handle Credit Card Type via Stripe's jquery.payment.js library
 */
function stripePaymentTypeCheck($form){
	// gather relevant form fields
	var $type = $form.find('input[name$="_type"]');
	var $number = $form.find('input[name*="_number"]');

	// check for valid payment type
	// if valid, update form field
	// otherwise, submit an error
	if ($.payment.validateCardNumber($number.val())){
		// Update the type field and continue
		$type.val($.payment.cardType($number.val()));

		return true;
	} else {
		// Reset the 'type' field and throw an error
		$type.val('');
		$number.addClass('error');
		$('.payment-errors').html(Resources.VALIDATE_CREDITCARD);
	    // Re-enable form submission
	    $form.find('button[name$="_billing_save"],#applyBtn').prop('disabled', false);

	    return false;
	}
}

var stripeResponseHandlerMyAccount = function(status, response) {
    // Grab the form:
    var $form = $('#CreditCardForm');

	// Check the payment type to make sure it's valid
	if(!stripePaymentTypeCheck($form)){
		return false;
	}

	if (response.error) {
        // Show the errors on the form:
        $form.find('.payment-errors').text(response.error.message);
        // Re-enable form submission
        $form.find('#applyBtn').prop('disabled', false);
    } else {
        // Get the token ID:
        var token = response.id;
        // Insert the token ID into the form so it gets submitted to the server:
        $form.find('input[name="stripeToken"]').val(token);
        // Set triggered action for the form
        var button = $form.find('#applyBtn');
        $('<input/>').attr({
            type: 'hidden',
            name: button.attr('name'),
            value: button.attr('value')
        }).appendTo($form);

        // Submit the form:
        //$form.submit();
        var url = util.appendParamToURL($form.attr('action'), 'format', 'ajax');
        var applyName = $form.find('#applyBtn').attr('name');
        var options = {
            url: url,
            data: $form.serialize() + '&' + applyName + '=x',
            type: 'POST'
        };
        $.ajax(options).done(function (data) {
            if (typeof(data) !== 'string') {
                if (data.success) {
                    dialog.close();
                    page.refresh();
                } else if (data.error) {
                    page.redirect(Urls.csrffailed);
                } else {
                    window.alert(data.message);
                    return false;
                }
            } else {
            	// if success - meaning we have a card list, close the dialog
            	// otherwise, keep it open
            	if($(data).find('.paymentslist').length > 0) {
            		page.refresh();
            	} else {
                    $('#dialog-container').html(data);
                    initializeMyAccountEvents();
            	}
            }
        });
    }
}


var stripeResponseHandlerBilling = function(source) {
	// Grab the form:
	var $form = $('.checkout-billing');
        var sourceId = source.id;
        // Insert the token ID into the form so it gets submitted to the server:
        $form.find('input[name="stripeToken"]').val(sourceId);
        // Set triggered action for the form
        var button = $form.find('button[name$="_billing_save"]');
        $('<input/>').attr({
            type: 'hidden',
            name: button.attr('name'),
            value: button.attr('value')
        }).appendTo($form);

        return true;
}

/**
 * @function
 * @description Clears Credit Card Fields
 */
function clearCCFields() {
    var $creditCard = $('[data-method="CREDIT_CARD"]');
    $creditCard.find('input[name$="creditCard_owner"]').val('');
    $creditCard.find('input[name$="_type"]').val('');
    $creditCard.find('input[name*="_creditCard_number"]').val('');
    $creditCard.find('[name$="_month"]').val('');
    $creditCard.find('[name$="_year"]').val('');
    $creditCard.find('input[name*="_cvn"]').val('');
    $creditCard.find('input[name="stripeCardID"]').val('');
    $creditCard.find('input[name="stripeToken"]').val('');
    $creditCard.find('input[name="stripeCardStored"]').val('false');
    $creditCard.find('input[name="prUsed"]').val('');
}

/**
 * @function
 * @description Initialize the Payment Type Handling Events
 */
function handlePaymentType() {

}


/**
 * @function
 * @description Initializes Stripe My Account events
 */
exports.initMyAccount = function () {
	initializeMyAccountEvents();
};

/**
 * @function
 * @description Initializes Stripe Billing events
 */
exports.initBilling = function () {
	initializeBillingEvents();
};

/**
 * @function
 * @description Clears Credit Card Fields
 */
exports.clearCCFields = function () {
	clearCCFields();
};
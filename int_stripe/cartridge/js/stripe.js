'use strict';

var ajax = require('./ajax'),
	util = require('./util'),
	dialog = require('./dialog');

/**
 * @function
 * @description Initializes Stripe My Account events
 */
function initializeMyAccountEvents() {
	var $form = $('#CreditCardForm');

	$form.on('click', '.cancel-button', function (e) {
        e.preventDefault();
        dialog.close();
    });

	 $form.find('#applyBtn').on('click', function(e) {
		// Prevent the form from being submitted
		e.preventDefault();
		// Disable the submit button to prevent repeated clicks:
		 $form.find('#applyBtn').prop('disabled', true);
	    var formData = getCCData($form);
	    // Request a token from Stripe:
	    Stripe.card.createToken(formData, stripeResponseHandlerMyAccount);
	});
}

/**
 * @function
 * @description Initializes Stripe Billing events
 */
function initializeBillingEvents() {
	var $form = $('.checkout-billing');
	initializeCCEvents();
	$form.find('button[name$="_billing_save"]').on('click', function(e) {
		var token = $form.find('input[name="stripeToken"]').val();
		var cardID = $form.find('input[name="stripeCardID"]').val();
		if (!token && !cardID) {
			// Prevent the form from being submitted
			e.preventDefault();
			// Disable the submit button to prevent repeated clicks:
			$form.find('button[name$="_billing_save"]').prop('disabled', true);
		    var formData = getCCData($form);
		    // Request a token from Stripe:
		    Stripe.card.createToken(formData, stripeResponseHandlerBilling);
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
	$('input[name$="_creditCardList"]:checked').trigger('change');

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
 * @param {Object} data The Credit Card data (holder, type, masked number, expiration month/year)
 */
function setCCFields(data) {
    var $creditCard = $('[data-method="CREDIT_CARD"]');
    $creditCard.find('input[name$="creditCard_owner"]').val(data.holder).trigger('change');
    $creditCard.find('input[name$="_type"]').val(data.type).trigger('change');
    $creditCard.find('input[name*="_creditCard_number"]').val(data.maskedNumber).trigger('change');
    $creditCard.find('[name$="_month"]').val(data.expirationMonth).trigger('change');
    $creditCard.find('[name$="_year"]').val(data.expirationYear).trigger('change');
    $creditCard.find('input[name*="_cvn"]').val('123');
    $creditCard.find('input[name="stripeCardID"]').val(data.stripeCardID);
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
        $form.submit();
    }
}

var stripeResponseHandlerBilling = function(status, response) {
	// Grab the form:
	var $form = $('.checkout-billing');

	// Check the payment type to make sure it's valid
	if(!stripePaymentTypeCheck($form)){
		return false;
	}

    if (response.error) {
        // Show the errors on the form:
        $form.find('.payment-errors').text(response.error.message);
        // Re-enable form submission
        $form.find('button[name$="_billing_save"]').prop('disabled', false);
    } else {
        // Get the token ID:
        var token = response.id;
        // Insert the token ID into the form so it gets submitted to the server:
        $form.find('input[name="stripeToken"]').val(token);
        // Set triggered action for the form
        var button = $form.find('button[name$="_billing_save"]');
        $('<input/>').attr({
            type: 'hidden',
            name: button.attr('name'),
            value: button.attr('value')
        }).appendTo($form);

        // Submit the form:
        $form.submit();
    }
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

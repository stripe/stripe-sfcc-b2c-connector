'use strict';

var util = require('./util'),
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
	//send additional information to the Stripe if AVS enabled
	if (SitePreferences.STRIPE_AVS_ENABLED && $form.hasClass('checkout-billing')) {
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
		type: $creditCard.find('select[name$="_type"]'),
		month: $creditCard.find('[name$="_month"]'),
		year: $creditCard.find('[name$="_year"]')
	};
	$.each(CCObj, function(propertyName, object) {
		object.on('change', function(e) {
			$creditCard.find('input[name="stripeCardID"]').val('');
		});
	});
}

var stripeResponseHandlerMyAccount = function(status, response) {
    // Grab the form:
    var $form = $('#CreditCardForm');
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
    $creditCard.find('select[name$="_type"]').val('');
    $creditCard.find('input[name*="_creditCard_number"]').val('');
    $creditCard.find('[name$="_month"]').val('');
    $creditCard.find('[name$="_year"]').val('');
    $creditCard.find('input[name*="_cvn"]').val('');
    $creditCard.find('input[name="stripeCardID"]').val('');
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

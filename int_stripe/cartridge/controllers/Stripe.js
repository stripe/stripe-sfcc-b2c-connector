'use strict';

/* Script Modules */
var app = require('app_storefront_controllers/cartridge/scripts/app');
var guard = require('app_storefront_controllers/cartridge/scripts/guard');

var stripe = require('~/cartridge/scripts/service/stripe');

/**
 * Selects a customer credit card and returns the details of the credit card as
 * JSON response. Required to fill credit card form with details of selected
 * credit card.
 */
function selectCreditCard() {
    var cart, applicableCreditCards, selectedCreditCard, instrumentsIter, creditCardInstrument;
    cart = app.getModel('Cart').get();

    var stripeCreditCards = stripe.FetchCards();
    selectedCreditCard = null;

    // ensure mandatory parameter 'CreditCardUUID' and 'CustomerPaymentInstruments'
    // in pipeline dictionary and collection is not empty
    if (request.httpParameterMap.creditCardUUID.value && stripeCreditCards && !stripeCreditCards.empty) {

        // find credit card in payment instruments
        instrumentsIter = stripeCreditCards.iterator();
        while (instrumentsIter.hasNext()) {
            creditCardInstrument = instrumentsIter.next();
            if (request.httpParameterMap.creditCardUUID.value.equals(creditCardInstrument.UUID)) {
            	var cardType : String = creditCardInstrument.creditCardType;
            	switch (cardType) {
	                case 'MasterCard':
	                	cardType = 'Master Card';
	                    break;
	                case 'American Express':
	                	cardType = 'Amex';
	                    break;
	                case 'Diners Club':
	                	cardType = 'DinersClub';
	                    break;
	                default:
	                    break;
            	}
            	creditCardInstrument.creditCardType = cardType;
                selectedCreditCard = creditCardInstrument;
            }
        }

        if (selectedCreditCard) {
            app.getForm('billing').object.paymentMethods.creditCard.number.value = selectedCreditCard.maskedCreditCardNumber;
        }
    }

    app.getView({
        SelectedCreditCard: selectedCreditCard
    }).render('checkout/billing/stripecreditcardjson');
}

exports.SelectCreditCard = guard.ensure(['https', 'get'], selectCreditCard);
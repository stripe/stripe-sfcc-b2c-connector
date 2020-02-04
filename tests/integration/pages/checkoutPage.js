import BasePage from './basePage';
import { browser } from 'protractor';

class CheckoutPage extends BasePage {
    constructor() {
        super();

        const shippingForm = $('.shipping-section .single-shipping').$('.shipping-form');
        this.shippingAddress = {
            firstName: shippingForm.$('#shippingFirstNamedefault'),
            lastName: shippingForm.$('#shippingLastNamedefault'),
            address1: shippingForm.$('#shippingAddressOnedefault'),
            address2: shippingForm.$('#shippingAddressTwodefault'),
            country: shippingForm.$('#shippingCountrydefault'),
            state: shippingForm.$('#shippingStatedefault'),
            city: shippingForm.$('#shippingAddressCitydefault'),
            zip: shippingForm.$('#shippingZipCodedefault'),
            phone: shippingForm.$('#shippingPhoneNumberdefault')
        };
        const billingForm = $('.payment-form');

        this.billing = {
            email: billingForm.$('#email'),
            phone: billingForm.$('#phoneNumber')
        };
        this.shippingSummary = $('.shipping-summary');
        this.paymentSummary = $('.payment-summary');
        this.paymentMethodOptions = $('.payment-options');
        this.buttonSubmitShipping = $('button[value="submit-shipping"]');
        this.buttonSubmitPayment = $('button[value="submit-payment"]');
        this.buttonPlaceOrder = $('button[value="place-order"]');
        this.url = browser.baseUrl + 'Checkout-Begin';
        this.pageLoaded = this.inDom($('.place-order'));
    }

    // eslint-disable-next-line class-methods-use-this
    async fillInputField(field, value) {
        let EC = await protractor.ExpectedConditions;
        await field.clear();
        browser.wait(EC.textToBePresentInElementValue(field, ''), this.timeout);
        await field.sendKeys(value);
        return browser.wait(EC.textToBePresentInElementValue(field, value), this.timeout);
    }
    // eslint-disable-next-line class-methods-use-this
    async fillSelectField(field, value) {
        const options = field.$$('option');

        await options.filter((elem) => {
            return elem.getAttribute('value').then(val => {
                return val === value;
            });
        }).first().click();
        // browser.wait(EC.textToBePresentInElementValue(field, ''), this.timeout);
        await options;
        let EC = await protractor.ExpectedConditions;
        await browser.wait(EC.stalenessOf(field.$('.vail')), this.timeout);
    }

    async fillShippingAddress(address) {
        await this.shippingAddress.phone.clear();
        await this.fillInputField(this.shippingAddress.firstName, address.firstName);
        await this.fillInputField(this.shippingAddress.lastName, address.lastName);
        await this.fillInputField(this.shippingAddress.address1, address.address1);
        await this.fillInputField(this.shippingAddress.address2, address.address2);
        await this.fillInputField(this.shippingAddress.city, address.city);
        await this.fillInputField(this.shippingAddress.zip, address.zip);
        await this.fillInputField(this.shippingAddress.phone, address.phone);
        await this.fillSelectField(this.shippingAddress.country, address.country);
        await this.fillSelectField(this.shippingAddress.state, address.state);
        return this.buttonSubmitShipping.click();
    }

    async fillBillingData(billingData) {
        await browser.sleep(this.baseSleep);
        await this.fillInputField(this.billing.email, billingData.contact.email);
        await this.fillInputField(this.billing.phone, billingData.contact.phone);
    }

    async changePaymentMethod(method) {
        await this.paymentMethodOptions.$('li[data-method-id="' + method + '"] a').click();
        let EC = await protractor.ExpectedConditions;
        await browser.wait(EC.presenceOf($('.' + method + '-content.active')), this.timeout, 'timeout: on change payment method');
    }

    async fillBillingDataWithPaymentMethod(billingData, method) {
        await this.fillBillingData(billingData);
        await this.changePaymentMethod(method);
        await this.buttonSubmitPayment.click();
    }

    async fillBillingDataAndCard(billingData, card) {
        await this.changePaymentMethod('CREDIT_CARD');
        await browser.switchTo().frame(await $('#card-element').$('iframe').getWebElement());

        let cardNumber = $('input[name="cardnumber"]');
        let cartExpDate = $('input[name="exp-date"]');
        let cvc = $('input[name="cvc"]');
        let postal = $('input[name="postal"]');

        await this.fillInputField(cardNumber, card.number);
        await this.fillInputField(cartExpDate, card.date);
        await this.fillInputField(cvc, card.cvc);
        await this.fillInputField(postal, card.zip);
        await browser.switchTo().defaultContent();

        await browser.sleep(this.baseSleep);

        await this.fillBillingData(billingData);

        await this.buttonSubmitPayment.click();
    }

    async shippingSummaryDisplayed() {
        await browser.sleep(this.baseSleep);
        let EC = await protractor.ExpectedConditions;
        return browser.wait(EC.visibilityOf(this.shippingSummary), this.timeout);
    }

    async paymentSummaryDisplayed() {
        let EC = await protractor.ExpectedConditions;
        return browser.wait(EC.visibilityOf(this.paymentSummary), this.timeout);
    }

    async submitPlaceOrder() {
        return this.buttonPlaceOrder.click();
    }

    // eslint-disable-next-line class-methods-use-this
    async checkStage(stage) {
        return browser.getCurrentUrl().then(async url => {
            return url.indexOf('stage=' + stage) !== -1;
        });
    }
}
export default CheckoutPage;

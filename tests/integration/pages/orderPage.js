import BasePage from './basePage';

class OrderPage extends BasePage {
    constructor() {
        super();
        this.paymentDetails = $('.credit-card-type');
        this.url = browser.baseUrl + 'Order-Confirm';
        this.pageLoaded = this.inDom($('.order-confirmation-continue-shopping'));
    }

    async getPaymentDetails() {
        return this.paymentDetails.getText();
    }
}
export default OrderPage;

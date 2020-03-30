import BasePage from './basePage';

class StripeAlipayPage extends BasePage {
    constructor() {
        super();
        this.authorize = $('section.source').element(by.partialButtonText('Authorize'));
        this.fail = $('section.source').element(by.partialButtonText('Fail'));
        this.url = 'https://stripe.com/sources/test_source';
        this.pageLoaded = this.inDom($('.object'));
    }

    async clickAuthorize() {
        return this.authorize.click();
    }

    async clickFail() {
        return this.fail.click();
    }
}
export default StripeAlipayPage;

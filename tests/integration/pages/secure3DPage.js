import BasePage from './basePage';

class Secure3DPage extends BasePage {
    constructor() {
        super();
        this.completeButton = $('#test-source-authorize-3ds');
        this.failButton = $('#test-source-fail-3ds');
        this.pageLoaded = this.inDom($('iframe[name="__privateStripeFrame8"]'));
    }

    async clickAuthorize() {
        await browser.sleep(this.baseSleep);
        await browser.switchTo().frame($('iframe[name="__privateStripeFrame8"]').getWebElement());
        await browser.wait(await protractor.ExpectedConditions.presenceOf($('iframe')), this.timeout, 'timeout: waiting for load 3D Secure modal frame');
        await browser.sleep(this.baseSleep);
        await browser.switchTo().frame($('iframe').getWebElement());
        await browser.wait(await protractor.ExpectedConditions.presenceOf(this.completeButton), this.timeout, 'timeout: waiting for load 3D Secure modal complate button');
        await browser.sleep(this.baseSleep);
        await this.completeButton.click();
        await browser.switchTo().defaultContent();
    }
}
export default Secure3DPage;

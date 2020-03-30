import { browser } from 'protractor';

export default class BasePage {
    constructor() {
        this.timeout = 20000;
        // increase this value if tests are failing
        this.baseSleep = 2000;
    }

    // eslint-disable-next-line valid-jsdoc
    /**
     * navigate to a page via it's `url` var
     * @requires page have both `url`
     */
    async goto() {
        await browser.get(this.url);
        if (await $('#consent-tracking').isPresent()) {
            let EC = protractor.ExpectedConditions;
            await $('.button-wrapper .affirm').click();
            await browser.wait(EC.invisibilityOf($('#consent-tracking')), this.timeout);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    inDom(locator) {
        return protractor.ExpectedConditions.presenceOf(locator);
    }

    async loaded() {
        return browser.wait(async () => {
            return this.pageLoaded();
        }, this.timeout, 'timeout: waiting for page to load. The url is: ' + this.url);
    }
}

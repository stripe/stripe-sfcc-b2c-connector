import BasePage from './basePage';
import { browser } from 'protractor';

class ProductPage extends BasePage {
    constructor(productId) {
        super();
        this.productName = $$('.product-name');
        this.attributeColorButtons = $$('.attributes div[data-attr="color"] button');
        this.attributeSizeOptions = $('.attributes div[data-attr="size"] .select-size').$$('option');
        this.addToCartButton = $('.prices-add-to-cart-actions button');
        this.total = $$('.minicart-quantity').first();
        this.url = browser.baseUrl + 'Product-Show?pid=' + productId;
    }

    async addProductToCart() {
        let EC = await protractor.ExpectedConditions;
        this.attributeColorButtons.get(0).click();
        await browser.wait(EC.presenceOf(this.attributeColorButtons.get(0).$('.selected')), this.timeout);
        this.attributeSizeOptions.get(1).click();
        await browser.wait(EC.elementToBeClickable(this.addToCartButton), this.timeout);
        this.addToCartButton.click();
        await browser.wait(EC.textToBePresentInElement(this.total, '1'), this.timeout);
    }
}
export default ProductPage;

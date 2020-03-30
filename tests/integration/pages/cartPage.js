import BasePage from './basePage';
import { browser } from 'protractor';

class CartPage extends BasePage {
    constructor() {
        super();
        this.removeButtons = $$('button[data-target=".cart.cart-page #removeProductModal"]');
        this.removeModalButtonYes = $('#removeProductModal').element(by.buttonText('Yes'));
        this.total = $$('.minicart-quantity').first();
        this.url = browser.baseUrl + 'Cart-Show';
    }

    async deleteProductFromCart() {
        let EC = await protractor.ExpectedConditions;
        this.removeButtons.each(async (btn) => {
            if (await btn.isDisplayed()) {
                await btn.click();
                await browser.wait(EC.elementToBeClickable(this.removeModalButtonYes), 10000);
                await this.removeModalButtonYes.click();
            }
        });

        await browser.wait(EC.textToBePresentInElement(this.total, '0'), 10000);
    }
}
export default CartPage;

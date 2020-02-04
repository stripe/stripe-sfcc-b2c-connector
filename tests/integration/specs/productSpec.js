import ProductPage from '../pages/productPage';
import CartPage from '../pages/cartPage';

describe('Login', () => {
    const productPage = new ProductPage('25519318M');
    const cartPage = new CartPage();

    beforeEach(async () => {
        await productPage.goto();
    });

    it('should display product name', async () => {
        const productNames = await productPage.productName.getText();
        let productName = (productNames[0]) ? productNames[0] : productNames[1];
        expect(productName).toEqual('3/4 Sleeve V-Neck Top');
    });

    it('should add to cart product', async () => {
        await productPage.addProductToCart();
        expect(await productPage.total.getText()).toBe('1');
    });

    it('should add and remove product from to cart', async () => {
        await productPage.addProductToCart();
        expect(await productPage.total.getText()).toBe('1');
        await cartPage.goto();
        await cartPage.deleteProductFromCart();
        expect(await cartPage.total.getText()).toBe('0');
    });
});

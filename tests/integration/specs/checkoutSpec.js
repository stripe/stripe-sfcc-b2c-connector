import ProductPage from '../pages/productPage';
import CartPage from '../pages/cartPage';
import CheckoutPage from '../pages/checkoutPage';
import Data from '../data/addresses';
import OrderPage from '../pages/orderPage';
import StripeAlipayPage from '../pages/stripeAlipayPage';
import Secure3DPage from '../pages/secure3DPage';

describe('Checkout', () => {
    const productPage = new ProductPage('25519318M');
    const checkoutPage = new CheckoutPage();
    const orderPage = new OrderPage();
    const alipayPage = new StripeAlipayPage();
    const secure3DPage = new Secure3DPage();

    beforeEach(async () => {
        await productPage.goto();
        await productPage.addProductToCart();
        await checkoutPage.goto();
    });

    afterEach(async () => {
        const cartPage = new CartPage();
        await cartPage.goto();
        await cartPage.deleteProductFromCart();
    });

    it('should checkout product with credit card - Visa', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.visa);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Visa');
    });

    it('should checkout product with credit card - Visa Debit', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.visaDebit);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Visa');
    });

    it('should checkout product with credit card - Mastercard', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.mastercard);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Master');
    });

    it('should checkout product with credit card - Mastercard 2', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.mastercard2);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Master');
    });

    it('should checkout product with credit card - mastercardDebit', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.mastercardDebit);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Master');
    });

    it('should checkout product with credit card - mastercardPrepaid', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.mastercardPrepaid);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Master');
    });

    it('should checkout product with credit card - americanExpress', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.americanExpress);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Amex');
    });

    it('should checkout product with credit card - americanExpress 2', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.americanExpress2);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Amex');
    });

    it('should checkout product with credit card - VISA 3D secure', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataAndCard(Data.billing, Data.cards.visa3Dsequre);
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await secure3DPage.loaded()).toBe(true);
        await secure3DPage.clickAuthorize();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Credit Visa');
    });

    it('should checkout product with credit transfer', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataWithPaymentMethod(Data.billing, 'STRIPE_ACH');
        await checkoutPage.paymentSummaryDisplayed();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.loaded()).toBe(true);
        expect(await orderPage.getPaymentDetails()).toEqual('Pay with ACH Credit Transfer');
    });

    it('should checkout product with Alipay', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataWithPaymentMethod(Data.billing, 'STRIPE_ALIPAY');
        expect(await alipayPage.loaded()).toBe(true);
        await alipayPage.clickAuthorize();
        await checkoutPage.loaded();
        await checkoutPage.submitPlaceOrder();
        expect(await orderPage.getPaymentDetails()).toEqual('Pay with Alipay');
    });

    it('should fail checkout product with Alipay', async () => {
        await checkoutPage.fillShippingAddress(Data.shippingAddress);
        await checkoutPage.shippingSummaryDisplayed();
        await checkoutPage.fillBillingDataWithPaymentMethod(Data.billing, 'STRIPE_ALIPAY');
        expect(await alipayPage.loaded()).toBe(true);
        await alipayPage.clickFail();
        await checkoutPage.loaded();
        // Should back to payment stage.
        expect(await checkoutPage.checkStage('payment')).toBe(true);
    });
});

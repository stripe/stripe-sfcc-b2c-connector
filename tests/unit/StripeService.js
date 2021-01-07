/* eslint-disable no-unused-expressions */

const { expect, assert } = require('chai');
const stripeService = require('../mocks/int_stripe_core/cartridge/scripts/stripe/services/StripeService');
const LocalServiceRegistry = require('../mocks/dw-mocks/dw/svc/LocalServiceRegistry');

describe('Stripe Service', () => {
    describe('service creation', () => {
        it('Should create a configuration for the Stripe service', () => {
            assert.equal(stripeService.exports.getStripeServiceDefinition().serviceId, 'stripe.http.service');
        });
    });

    describe('createRequest', ()=> {
        it('Should prepare the request method and parameters with empty response body', () => {
            const svc = {
                requestMethod: null,
                params: {},
                headers: {},
                configuration: {
                    credential: { URL: 'someUrl' }
                },
                getURL() {
                    return this.URL;
                },
                setURL(url) {
                    this.URL = url;
                },
                setRequestMethod(method) {
                    this.requestMethod = method;
                },
                addParam(name, value) {
                    if (name.endsWith('[]')) {
                        this.params[name] = this.params[name] || [];
                        this.params[name].push(value);
                    } else {
                        this.params[name] = value;
                    }
                },
                addHeader(name, value) {
                    this.headers[name] = value;
                }
            };
            let response = stripeService.exports.getStripeServiceDefinition().callback.createRequest(svc, {
                endpoint: '/customers/testCustomerId',
                httpMethod: 'GET',
                queryString: {
                    x: 123,
                    s: {
                        s1: 1
                    },
                    p: ['q1', 'q2']
                }
            });

            assert.equal(svc.requestMethod, 'GET');
            assert.equal(svc.URL, 'someUrl/customers/testCustomerId');
            assert.equal(svc.headers.apiKey, 'stripeApiKey');
            assert.equal(svc.headers.Authorization, 'Bearer stripeApiKey');
            assert.equal(svc.headers['User-Agent'], 'Stripe-SFCC-LINK/19.6.0');
            assert.deepEqual(svc.params, {
                x: 123,
                's[s1]': 1,
                'p[]': ['q1', 'q2']
            });
            assert.equal(response, null);
        });

        it('Should prepare the request method and parameters with empty response body', () => {
            const svc = {
                requestMethod: null,
                params: {},
                headers: {},
                configuration: {
                    credential: { URL: 'someUrl' }
                },
                getURL() {
                    return this.URL;
                },
                setURL(url) {
                    this.URL = url;
                },
                setRequestMethod(method) {
                    this.requestMethod = method;
                },
                addParam(name, value) {
                    if (name.endsWith('[]')) {
                        this.params[name] = this.params[name] || [];
                        this.params[name].push(value);
                    } else {
                        this.params[name] = value;
                    }
                },
                addHeader(name, value) {
                    this.headers[name] = value;
                }
            };
            let response = stripeService.exports.getStripeServiceDefinition().callback.createRequest(svc, {
                endpoint: '/customers/testCustomerId',
                httpMethod: 'GET',
                payload: {
                    x: 123,
                    s: 'qwe'
                }
            });

            assert.equal(svc.requestMethod, 'GET');
            assert.equal(svc.URL, 'someUrl/customers/testCustomerId');
            assert.equal(svc.headers.apiKey, 'stripeApiKey');
            assert.equal(svc.headers.Authorization, 'Bearer stripeApiKey');
            assert.equal(svc.headers['User-Agent'], 'Stripe-SFCC-LINK/19.6.0');
            assert.deepEqual(response, 'x=123&s=qwe');
        });
    });

    describe('filterLogMessage', () => {
        it('Should filter the card number and cvc', () => {
            const msg = stripeService.exports.getStripeServiceDefinition().callback.filterLogMessage('card-number=1234567890card-cvc=213');
            assert.equal(msg, 'card-number=******7890card-cvc=***');
        });
    });
});

describe('call()', () => {
    it('Should throw error for missing request object.', () => {
        expect(stripeService.exports.call).to.throw('Required requestObject parameter missing or incorrect.');
    });

    it('Should call Stripe service with valid arguments.', () => {
        const testRequestObject = {
            endpoint: '/test',
            httpMethod: 'GET',
            payload: 'test payload'
        };

        LocalServiceRegistry.call.returns({
            ok: true,
            object: {
                response: 'test'
            }
        });

        const result = stripeService.exports.call(testRequestObject);
        const expected = {
            response: 'test'
        };
        expect(result).to.deep.equal(expected);

        LocalServiceRegistry.call.reset();
    });

    it('Should throw Stripe service error.', () => {
        const testRequestObject = {
            endpoint: '/test',
            httpMethod: 'GET',
            payload: 'test payload'
        };

        LocalServiceRegistry.call.returns({
            ok: false
        });

        expect(() => stripeService.exports.call(testRequestObject)).to.throw('Stripe web service call failed');

        LocalServiceRegistry.call.reset();
    });
});

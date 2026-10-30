/* eslint-env es6 */

'use strict';

/* API Includes */
const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/**
 * Traverses a payload object to collect parameters and values to be passed
 * as key/value pairs either as query string or application/x-www-form-urlencoded
 * body.
 *
 * @param {Object} collector - An object to collect key/value pairs. Must provide
 *   addParam(name, value) method. Could be dw.svc.Service.
 * @param {Object} payload - Payload to collect parameters from. Can be acutal
 *   payload or an object containing query string parameters.
 * @param {string} prefix - Prefix to append to parameter names. Used recursively,
 *   not needed for the intial call.
 */
function collectParams(collector, payload, prefix) {
    if (payload && typeof payload === 'object') {
        Object.keys(payload).forEach(function (key) {
            let paramName = prefix && prefix.length ? prefix + '[' + (Array.isArray(payload) ? '' : key) + ']' : key;
            let paramValue = payload[key];

            if (paramValue === null || typeof paramValue === 'undefined') {
                paramValue = '';
            }

            if (paramValue && typeof paramValue === 'object') {
                collectParams(collector, paramValue, paramName);
            } else {
                collector.addParam(paramName, paramValue);
            }
        });
    }
}

/**
 * Converts a payload object into a application/x-www-form-urlencoded string
 *
 * @param {type} payload - Payload object
 * @return {string} - URL encoded string for that payload
 */
function payloadToBody(payload) {
    if (payload) {
        const payloadParamsCollector = {
            params: [],
            addParam: function (name, value) {
                this.params.push(encodeURIComponent(name) + '=' + encodeURIComponent(value));
            }
        };

        collectParams(payloadParamsCollector, payload);

        if (payloadParamsCollector.params.length) {
            return payloadParamsCollector.params.join('&');
        }
    }

    return null;
}


/**
 * Creates a Local Services Framework service definition
 * @param {string} apiKey - Stripe API Private Key
 *
 * @returns {dw.svc.Service} - The created service definition.
 */
function getStripeServiceDefinition(apiKey) {
    return LocalServiceRegistry.createService('stripe.http.service', {

        /**
         * A callback function to configure HTTP request parameters before
         * a call is made to Stripe web service
         *
         * @param {dw.svc.Service} svc Service instance
         * @param {string} requestObject - Request object, containing the end point, query string params, payload etc.
         * @returns {string} - The body of HTTP request
         */
        createRequest: function (svc, requestObject) {
            const framework = require('*/cartridge/scripts/stripe/helpers/stripeHelper').isSFRA() ? 'SFRA' : 'SiteGenesis';

            var stripeHeader = {
                application: {
                    name: 'Stripe SFCCB2C',
                    partner_id: 'pp_partner_Fs71dOwRYXhmze',
                    url: 'https://docs.stripe.com/use-stripe-apps/salesforce-commerce-cloud',
                    version: '24.1.1.' + framework
                }
            };
            // Idempotency keys only apply to POST requests. Callers that may repeat the same logical
            // operation pass a deterministic key (see idempotencyHelper.js) so Stripe can dedupe;
            // otherwise every request gets a unique key.
            if (requestObject.httpMethod === 'POST') {
                svc.addHeader('Idempotency-Key', requestObject.idempotencyKey || require('dw/util/UUIDUtils').createUUID());
            }

            svc.addHeader('Authorization', 'Bearer ' + apiKey);
            svc.addHeader('X-Stripe-Client-User-Agent', JSON.stringify(stripeHeader));

            var URL = svc.configuration.credential.URL;
            URL += requestObject.endpoint;

            svc.setURL(URL);

            if (requestObject.httpMethod) {
                svc.setRequestMethod(requestObject.httpMethod);
            }

            if (requestObject.queryString) {
                collectParams(svc, requestObject.queryString);
            }

            if (requestObject.payload) {
                return payloadToBody(requestObject.payload);
            }

            return null;
        },

        /**
         * A callback function to parse Stripe web service response
         *
         * @param {dw.svc.Service} svc - Service instance
         * @param {dw.net.HTTPClient} httpClient - HTTP client instance
         * @returns {string} - Response body in case of a successful request or null
         */
        parseResponse: function (svc, httpClient) {
            return JSON.parse(httpClient.text);
        },

        mockCall: function (svc) {
            var mockResponsesHelper = require('./mockResponsesHelper');

            return mockResponsesHelper.getMockedResponse(svc);
        },

        /**
         * Enables communication logs on Production (no card data is sent).
         * @param {string} msg - Log message
         * @returns {string} - Message to log
         */
        filterLogMessage: function (msg) {
            return msg;
        }
    });
}

// Only for unit testing!
exports.getStripeServiceDefinition = getStripeServiceDefinition;

/**
 * Creates an Error and appends web service call result as callResult
 *
 * @param {dw.svc.Result} callResult - Web service call result
 * @return {Error} - Error created
 */
function StripeServiceError(callResult) {
    var message = 'Stripe web service call failed';
    if (callResult && callResult.errorMessage) {
        message += ': ' + callResult.errorMessage;
    }

    const err = new Error(message);
    err.callResult = callResult;
    err.name = 'StripeServiceError';

    return err;
}

/**
 * Checks that an endpoint only contains '/'-separated ID segments.
 * @param {string} endpoint - API path
 * @return {boolean} true when safe to call
 */
function isSafeEndpoint(endpoint) {
    return typeof endpoint === 'string' && /^(\/[A-Za-z0-9_-]+)+$/.test(endpoint);
}

/**
 * Makes a call to Stripe web service given a request object.
 * Throws an error (StripeServiceError, which will have the call dw.svc.Result
 * object in callResult property) in case the result of a call is not ok.
 *
 * @param {Object} requestObject - An object having details for the request to
 *   be made, including endpoint, payload etc.
 * @param {string} apiKey - Stripe API Private Key
 * @return {dw.svc.Result} - Result returned by the call.
 */
function callService(requestObject, apiKey) {
    if (!requestObject) {
        throw new Error('Required requestObject parameter missing or incorrect.');
    }

    if (!isSafeEndpoint(requestObject.endpoint)) {
        throw new Error('Invalid Stripe API endpoint.');
    }

    const callResult = getStripeServiceDefinition(apiKey).call(requestObject);

    if (!callResult.ok) {
        throw new StripeServiceError(callResult);
    }

    return callResult.object;
}

exports.call = callService;

// /v1/
exports.webhooks = {
    create: function (url, enabledEvents, apiKey) {
        var requestObject = {
            endpoint: '/webhook_endpoints',
            httpMethod: 'POST',
            payload: {
                url: url,
                enabled_events: enabledEvents
            }
        };
        return callService(requestObject, apiKey);
    },
    delete: function (webhookId, apiKey) {
        var requestObject = {
            endpoint: '/webhook_endpoints/' + webhookId,
            httpMethod: 'DELETE'
        };

        return callService(requestObject, apiKey);
    },
    list_all: function (apiKey) {
        var requestObject = {
            endpoint: '/webhook_endpoints',
            httpMethod: 'GET'
        };

        return callService(requestObject, apiKey);
    }
};

exports.account = {
    get: function (apiKey) {
        var requestObject = {
            endpoint: '/account',
            httpMethod: 'GET'
        };

        return callService(requestObject, apiKey);
    }
};

exports.refunds = {
    createByPaymentItent: function (amount, paymentIntent, apiKey, idempotencyKey) {
        var requestObject = {
            endpoint: '/refunds',
            httpMethod: 'POST',
            payload: {
                amount: amount,
                payment_intent: paymentIntent
            },
            idempotencyKey: idempotencyKey
        };
        return callService(requestObject, apiKey);
    },
    createByCharge: function (amount, charge, apiKey, idempotencyKey) {
        var requestObject = {
            endpoint: '/refunds',
            httpMethod: 'POST',
            payload: {
                amount: amount,
                charge: charge
            },
            idempotencyKey: idempotencyKey
        };
        return callService(requestObject, apiKey);
    }
};

// https://stripe.com/docs/api/payment_intents
exports.captures = {
    captureByPaymentIntent: function (amount, paymentIntentId, apiKey, idempotencyKey) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'capture'].join('/'),
            httpMethod: 'POST',
            payload: {
                amount_to_capture: amount
            },
            idempotencyKey: idempotencyKey
        };

        return callService(requestObject, apiKey);
    },
    captureByCharge: function (amount, chargeId, apiKey, idempotencyKey) {
        var requestObject = {
            endpoint: ['/charges', chargeId, 'capture'].join('/'),
            httpMethod: 'POST',
            payload: {
                amount: amount
            },
            idempotencyKey: idempotencyKey
        };

        return callService(requestObject, apiKey);
    }
};

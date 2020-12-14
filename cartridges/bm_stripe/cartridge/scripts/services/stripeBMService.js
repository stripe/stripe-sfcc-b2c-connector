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

const cardNumberRegex = /card.{1,6}number[^=]*=(\d*)/;

/**
 * Replaces credit card number (a number following card_number=) in a given
 * string with a masked version, keeping only the last 4 digits.
 *
 * @param {type} msg - The string in which to replace the card number.
 * @return {string} - The same string with only card number masked.
 */
function maskCardNumber(msg) {
    if (msg && msg.length) {
        const matches = msg.match(cardNumberRegex);

        if (matches && matches.length > 1) {
            const matched = matches[0];
            const toMask = matches[1];
            const masked = (new Array(toMask.length - 3)).join('*') + toMask.substr(-4);
            const stringToReplace = matched.replace(toMask, masked);
            return msg.replace(matched, stringToReplace);
        }
    }

    return msg;
}

const cvcRegex = /card.{1,6}cvc[^=]*=(\d*)/;

/**
 * Replaces CVC number (a number following card_cvc=) in a given
 * string with asterisks.
 *
 * @param {type} msg - The string in which to replace the cvc.
 * @return {string} - The same string with only cvc masked.
 */
function maskCVC(msg) {
    if (msg && msg.length) {
        const matches = msg.match(cvcRegex);

        if (matches && matches.length > 1) {
            const matched = matches[0];
            const toMask = matches[1];
            const masked = (new Array(toMask.length + 1)).join('*');
            const stringToReplace = matched.replace(toMask, masked);
            return msg.replace(matched, stringToReplace);
        }
    }

    return msg;
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
            svc.addHeader('X-Stripe-Client-User-Agent', '{"AppName":"Stripe SFCCB2C", "partner_id", "pp_partner_Fs71dOwRYXhmze", "url", "https://stripe.com/docs/plugins/salesforce-commerce-cloud", "version": "20.2.0"}');

            svc.addHeader('apiKey', apiKey);
            svc.addHeader('Authorization', 'Bearer ' + apiKey);
            svc.addHeader('User-Agent', 'Stripe-SFCC-LINK/19.6.0');

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
         * A callback that allows filtering communication URL, request, and response
         * log messages. Must be implemented to have messages logged on Production.
         *
         * @param {string} msg - The original message to log.
         * @returns {string} - The original message itself, as no sensitive data is
         *   communicated.
         */
        filterLogMessage: function (msg) {
            return maskCVC(maskCardNumber(msg));
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

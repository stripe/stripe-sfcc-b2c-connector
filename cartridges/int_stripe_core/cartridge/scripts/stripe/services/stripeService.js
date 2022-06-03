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
 *
 * @returns {dw.svc.Service} - The created service definition.
 */
function getStripeServiceDefinition() {
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
            const Site = require('dw/system/Site');
            const apiKey = Site.current.getCustomPreferenceValue('stripeApiKey');
            const apiVersion = Site.current.getCustomPreferenceValue('stripeApiVersion');

            var stripeHeader = {
                X_STRIPE_CLIENT_USER_AGENT: {
                    AppName: 'Stripe SFCCB2C',
                    partner_id: 'pp_partner_Fs71dOwRYXhmze',
                    url: '[https://stripe.com/docs/plugins/salesforce-commerce-cloud]',
                    version: '22.1.0'
                }
            };

            svc.addHeader('apiKey', apiKey);
            svc.addHeader('Authorization', 'Bearer ' + apiKey);
            svc.addHeader('User-Agent', JSON.stringify(stripeHeader));
            svc.addHeader('Stripe-Version', apiVersion);

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
 * @return {dw.svc.Result} - Result returned by the call.
 */
function callService(requestObject) {
    if (!requestObject) {
        throw new Error('Required requestObject parameter missing or incorrect.');
    }

    const callResult = getStripeServiceDefinition().call(requestObject);

    if (!callResult.ok) {
        throw new StripeServiceError(callResult);
    }

    return callResult.object;
}

exports.call = callService;

// https://stripe.com/docs/api/customers
exports.customers = {
    create: function (createCustomerPayload) {
        var requestObject = {
            endpoint: '/customers',
            httpMethod: 'POST',
            payload: createCustomerPayload
        };

        return callService(requestObject);
    },
    retrieve: function (customerId) {
        var requestObject = {
            endpoint: '/customers/' + customerId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (customerId, updateCustomerPayload) {
        var requestObject = {
            endpoint: '/customers/' + customerId,
            httpMethod: 'POST',
            payload: updateCustomerPayload
        };

        return callService(requestObject);
    },
    delete: function (customerId) {
        var requestObject = {
            endpoint: '/customers/' + customerId,
            httpMethod: 'DELETE'
        };

        return callService(requestObject);
    },
    retrieve_source: function (customerId, sourceId) {
        var requestObject = {
            endpoint: '/customers/' + customerId + '/sources/' + sourceId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    verify_bank_account: function (customerId, sourceId, firstAmount, secondAmount) {
        var requestObject = {
            endpoint: '/customers/' + customerId + '/sources/' + sourceId + '/verify',
            httpMethod: 'POST',
            payload: {
                amounts: [firstAmount, secondAmount]
            }

        };

        return callService(requestObject);
    },
    list: function (email) {
        var requestObject = {
            endpoint: '/customers?email=' + email + '&limit=5',
            httpMethod: 'GET'
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/payment_methods
exports.paymentMethods = {
    create: function (createPaymentMethodPayload) {
        var requestObject = {
            endpoint: '/payment_methods',
            httpMethod: 'POST',
            payload: createPaymentMethodPayload
        };

        return callService(requestObject);
    },
    retrieve: function (paymentMethodId) {
        var requestObject = {
            endpoint: '/payment_methods/' + paymentMethodId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (paymentMethodId, updatePaymentMethodPayload) {
        var requestObject = {
            endpoint: '/payment_methods/' + paymentMethodId,
            httpMethod: 'POST',
            payload: updatePaymentMethodPayload
        };

        return callService(requestObject);
    },
    list: function (customerId, type) {
        var requestObject = {
            endpoint: '/payment_methods',
            queryString: {
                customer: customerId,
                type: type
            },
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    attach: function (paymentMethodId, customerId) {
        var requestObject = {
            endpoint: ['/payment_methods', paymentMethodId, 'attach'].join('/'),
            httpMethod: 'POST',
            payload: {
                customer: customerId
            }
        };

        return callService(requestObject);
    },
    detach: function (paymentMethodId) {
        var requestObject = {
            endpoint: ['/payment_methods', paymentMethodId, 'detach'].join('/'),
            httpMethod: 'POST'
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/payment_intents
exports.paymentIntents = {
    create: function (createPaymentIntentPayload) {
        var requestObject = {
            endpoint: '/payment_intents',
            httpMethod: 'POST',
            payload: createPaymentIntentPayload
        };

        return callService(requestObject);
    },
    retrieve: function (paymentIntentId) {
        var requestObject = {
            endpoint: '/payment_intents/' + paymentIntentId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (paymentIntentId, updatePaymentIntentPayload) {
        var requestObject = {
            endpoint: '/payment_intents/' + paymentIntentId,
            httpMethod: 'POST',
            payload: updatePaymentIntentPayload
        };

        return callService(requestObject);
    },
    confirm: function (paymentIntentId, confirmPaymentIntentPayload) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'confirm'].join('/'),
            httpMethod: 'POST'
        };

        if (confirmPaymentIntentPayload) {
            requestObject.payload = confirmPaymentIntentPayload;
        }

        return callService(requestObject);
    },
    capture: function (paymentIntentId, capturePaymentIntentPayload) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'capture'].join('/'),
            httpMethod: 'POST'
        };

        if (capturePaymentIntentPayload) {
            requestObject.payload = capturePaymentIntentPayload;
        }

        return callService(requestObject);
    },
    cancel: function (paymentIntentId, cancellationReason) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'cancel'].join('/'),
            httpMethod: 'POST'
        };

        if (cancellationReason) {
            requestObject.payload = {
                cancellation_reason: cancellationReason
            };
        }

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/sources
exports.sources = {
    create: function (createSourcePayload) {
        var requestObject = {
            endpoint: '/sources',
            httpMethod: 'POST',
            payload: createSourcePayload
        };

        return callService(requestObject);
    },
    retrieve: function (sourceId) {
        var requestObject = {
            endpoint: '/sources/' + sourceId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (sourceId, updateSourcePayload) {
        var requestObject = {
            endpoint: '/sources/' + sourceId,
            httpMethod: 'POST',
            payload: updateSourcePayload
        };

        return callService(requestObject);
    },
    attach: function (sourceId, customerId) {
        var requestObject = {
            endpoint: ['/customers', customerId, 'sources'].join('/'),
            httpMethod: 'POST',
            payload: {
                source: sourceId
            }
        };

        return callService(requestObject);
    },
    detach: function (sourceId, customerId) {
        var requestObject = {
            endpoint: ['/customers', customerId, 'sources', sourceId].join('/'),
            httpMethod: 'DELETE'
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/charges
exports.charges = {
    create: function (createChargePayload) {
        var requestObject = {
            endpoint: '/charges',
            httpMethod: 'POST',
            payload: createChargePayload
        };

        return callService(requestObject);
    },
    retrieve: function (chargeId) {
        var requestObject = {
            endpoint: '/charges/' + chargeId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (chargeId, updateChargePayload) {
        var requestObject = {
            endpoint: '/charges/' + chargeId,
            httpMethod: 'POST',
            payload: updateChargePayload
        };

        return callService(requestObject);
    },
    capture: function (chargeId, captureChargePayload) {
        var requestObject = {
            endpoint: ['/charges', chargeId, 'capture'].join('/'),
            httpMethod: 'POST',
            payload: captureChargePayload
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/refunds
exports.refunds = {
    create: function (createRefundPayload) {
        var requestObject = {
            endpoint: '/refunds',
            httpMethod: 'POST',
            payload: createRefundPayload
        };

        return callService(requestObject);
    },
    retrieve: function (refundId) {
        var requestObject = {
            endpoint: '/refunds/' + refundId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (refundId, updateRefundPayload) {
        var requestObject = {
            endpoint: '/refunds/' + refundId,
            httpMethod: 'POST',
            payload: updateRefundPayload
        };

        return callService(requestObject);
    }
};

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
            // let paramName = prefix && prefix.length ? prefix + '[' + (Array.isArray(payload) ? '' : key) + ']' : key;
            let paramName = prefix && prefix.length ? prefix + '[' + key + ']' : key;
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
            const framework = require('*/cartridge/scripts/stripe/helpers/stripeHelper').isSFRA() ? 'SFRA' : 'SiteGenesis';

            var stripeHeader = {
                application: {
                    name: 'Stripe SFCCB2C',
                    partner_id: 'pp_partner_Fs71dOwRYXhmze',
                    url: 'https://docs.stripe.com/use-stripe-apps/salesforce-commerce-cloud',
                    version: '24.1.0.' + framework
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

    try {
    	if (callResult && callResult.errorMessage) {
    		var jsonMessage = JSON.parse(callResult.errorMessage);
    		if (jsonMessage && jsonMessage.error && jsonMessage.error.message) {
    			message = jsonMessage.error.message;
    		}
    	}
    } catch (e) {
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
 * @return {dw.svc.Result} - Result returned by the call.
 */
function callService(requestObject) {
    if (!requestObject) {
        throw new Error('Required requestObject parameter missing or incorrect.');
    }

    if (!isSafeEndpoint(requestObject.endpoint)) {
        throw new Error('Invalid Stripe API endpoint.');
    }

    const callResult = getStripeServiceDefinition().call(requestObject);

    if (!callResult.ok) {
        throw new StripeServiceError(callResult);
    }

    return callResult.object;
}

exports.call = callService;

// https://stripe.com/docs/api/customer_sessions
exports.customerSessions = {
    create: function (customerSessionPayload) {
        var requestObject = {
            endpoint: '/customer_sessions',
            httpMethod: 'POST',
            payload: customerSessionPayload
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/customers
exports.customers = {
    create: function (createCustomerPayload, idempotencyKey) {
        var requestObject = {
            endpoint: '/customers',
            httpMethod: 'POST',
            payload: createCustomerPayload,
            idempotencyKey: idempotencyKey
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
            endpoint: '/customers',
            queryString: {
                email: email,
                limit: 5
            },
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
    list: function (customerId, type, expandArray) {
        var requestObject = {
            endpoint: '/payment_methods',
            queryString: {
                customer: customerId,
                type: type
            },
            httpMethod: 'GET'
        };

        if (expandArray && expandArray.length) {
            requestObject.queryString.expand = expandArray;
        }

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
    create: function (createPaymentIntentPayload, idempotencyKey) {
        var requestObject = {
            endpoint: '/payment_intents',
            httpMethod: 'POST',
            payload: createPaymentIntentPayload,
            idempotencyKey: idempotencyKey
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
    confirm: function (paymentIntentId, confirmPaymentIntentPayload, idempotencyKey) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'confirm'].join('/'),
            httpMethod: 'POST',
            idempotencyKey: idempotencyKey
        };

        if (confirmPaymentIntentPayload) {
            requestObject.payload = confirmPaymentIntentPayload;
        }

        return callService(requestObject);
    },
    capture: function (paymentIntentId, capturePaymentIntentPayload, idempotencyKey) {
        var requestObject = {
            endpoint: ['/payment_intents', paymentIntentId, 'capture'].join('/'),
            httpMethod: 'POST',
            idempotencyKey: idempotencyKey
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
    create: function (createChargePayload, idempotencyKey) {
        var requestObject = {
            endpoint: '/charges',
            httpMethod: 'POST',
            payload: createChargePayload,
            idempotencyKey: idempotencyKey
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
    capture: function (chargeId, captureChargePayload, idempotencyKey) {
        var requestObject = {
            endpoint: ['/charges', chargeId, 'capture'].join('/'),
            httpMethod: 'POST',
            payload: captureChargePayload,
            idempotencyKey: idempotencyKey
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/checkout/sessions
exports.checkoutSessions = {
    create: function (createCheckoutSessionPayload) {
        var requestObject = {
            endpoint: '/checkout/sessions',
            httpMethod: 'POST',
            payload: createCheckoutSessionPayload
        };

        return callService(requestObject);
    },
    retrieve: function (sessionId) {
        var requestObject = {
            endpoint: '/checkout/sessions/' + sessionId,
            httpMethod: 'GET'
        };

        return callService(requestObject);
    },
    update: function (sessionId, updateObject) {
        var requestObject = {
            endpoint: '/checkout/sessions/' + sessionId,
            httpMethod: 'POST',
            payload: updateObject
        };

        return callService(requestObject);
    }
};

// https://stripe.com/docs/api/refunds
exports.refunds = {
    create: function (createRefundPayload, idempotencyKey) {
        var requestObject = {
            endpoint: '/refunds',
            httpMethod: 'POST',
            payload: createRefundPayload,
            idempotencyKey: idempotencyKey
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

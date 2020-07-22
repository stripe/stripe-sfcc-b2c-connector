/* eslint-env es6 */
/* eslint-disable no-plusplus */

'use strict';

const mockResults = [
// Customers
    { // stripe.customers.create
        urlRegEx: /customers$/,
        httpMethod: 'POST',
        mockedResponseId: 'customers.create'
    },
    { // stripe.customers.retrieve
        urlRegEx: /customers\/cus_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'customers.retrieve'
    },
    { // stripe.customers.update
        urlRegEx: /customers\/cus_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'customers.update'
    },
    { // stripe.customers.delete
        urlRegEx: /customers\/cus_[^/]*$/,
        httpMethod: 'DELETE',
        mockedResponseId: 'customers.delete'
    },
    { // stripe.customers.retrieve_source
        urlRegEx: /customers\/cus_[^/]*$\/sources\/ba_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'customers.retrieve_source'
    },
    { // stripe.customers.verify_bank_account
        urlRegEx: /customers\/cus_[^/]*$\/sources\/ba_[^/]*$\/verify/,
        httpMethod: 'POST',
        mockedResponseId: 'customers.verify_bank_account'
    },

    // PaymentMethods
    { // stripe.paymentMethods.create
        urlRegEx: /payment_methods$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentMethods.create'
    },
    { // stripe.paymentMethods.retrieve
        urlRegEx: /payment_methods\/pm_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'paymentMethods.retrieve'
    },
    { // stripe.paymentMethods.update
        urlRegEx: /payment_methods\/pm_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentMethods.update'
    },
    { // stripe.paymentMethods.list
        urlRegEx: /payment_methods\?customer=/,
        httpMethod: 'GET',
        mockedResponseId: 'paymentMethods.list'
    },
    { // stripe.paymentMethods.attach
        urlRegEx: /payment_methods\/pm_[^/]*\/attach$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentMethods.attach'
    },
    { // stripe.paymentMethods.detach
        urlRegEx: /payment_methods\/pm_[^/]*\/detach$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentMethods.detach'
    },

    // PaymentIntents
    { // stripe.paymentIntents.create
        urlRegEx: /payment_intents$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentIntents.create'
    },
    { // stripe.paymentIntents.retrieve
        urlRegEx: /payment_intents\/pi_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'paymentIntents.retrieve'
    },
    { // stripe.paymentIntents.update
        urlRegEx: /payment_intents\/pi_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentIntents.update'
    },
    { // stripe.paymentIntents.confirm
        urlRegEx: /payment_intents\/pi_[^/]*\/confirm$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentIntents.confirm'
    },
    { // stripe.paymentIntents.capture
        urlRegEx: /payment_intents\/pi_[^/]*\/capture$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentIntents.capture'
    },
    { // stripe.paymentIntents.cancel
        urlRegEx: /payment_intents\/pi_[^/]*\/cancel$/,
        httpMethod: 'POST',
        mockedResponseId: 'paymentIntents.cancel'
    },

    // Sources
    { // stripe.sources.create
        urlRegEx: /^((?!customers).)*\/sources$/,
        httpMethod: 'POST',
        mockedResponseId: 'sources.create'
    },
    { // stripe.sources.retrieve
        urlRegEx: /sources\/src_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'sources.retrieve'
    },
    { // stripe.sources.update
        urlRegEx: /sources\/src_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'sources.update'
    },
    { // stripe.customers.createSource
        urlRegEx: /customers\/cus_[^/]*\/sources$/,
        httpMethod: 'POST',
        mockedResponseId: 'sources.attach'
    },
    { // stripe.customers.deleteSource
        urlRegEx: /customers\/cus_[^/]*\/sources\/src_[^/]*$/,
        httpMethod: 'DELETE',
        mockedResponseId: 'sources.detach'
    },

    // Charges
    { // stripe.charges.create
        urlRegEx: /charges$/,
        httpMethod: 'POST',
        mockedResponseId: 'charges.create'
    },
    { // stripe.charges.retrieve
        urlRegEx: /charges\/ch_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'charges.retrieve'
    },
    { // stripe.charges.update
        urlRegEx: /charges\/ch_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'charges.update'
    },
    { // stripe.charges.capture
        urlRegEx: /charges\/ch_[^/]*\/capture$/,
        httpMethod: 'POST',
        mockedResponseId: 'charges.capture'
    },

    // Refunds
    { // stripe.refunds.create
        urlRegEx: /refunds$/,
        httpMethod: 'POST',
        mockedResponseId: 'refunds.create'
    },
    { // stripe.refunds.retrieve
        urlRegEx: /refunds\/re_[^/]*$/,
        httpMethod: 'GET',
        mockedResponseId: 'refunds.retrieve'
    },
    { // stripe.refunds.update
        urlRegEx: /refunds\/re_[^/]*$/,
        httpMethod: 'POST',
        mockedResponseId: 'refunds.update'
    }
];

/**
 * Returns a mocked response for a Stripe service call.
 * @param {type} svc Service
 * @return {Object} mocked response
 */
function getMockedResponse(svc) {
    if (svc && svc.URL && svc.requestMethod) {
        for (let i = 0; i < mockResults.length; i++) {
            let mockResult = mockResults[i];

            if (mockResult.urlRegEx.test(svc.URL) && mockResult.httpMethod.equalsIgnoreCase(svc.requestMethod)) {
                let mockedResponses = require('./mockedResponses.json');
                let mockedResponse = mockedResponses[mockResult.mockedResponseId];

                return {
                    statusCode: 200,
                    statusMessage: 'Success',
                    text: JSON.stringify(mockedResponse)
                };
            }
        }
    }

    return {
        statusCode: 404,
        statusMessage: 'Not found',
        errorText: 'No mocked response available for ' + svc.requestMethod + ' ' + svc.URL
    };
}

exports.getMockedResponse = getMockedResponse;

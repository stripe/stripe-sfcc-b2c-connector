/* eslint-env es6 */

'use strict';

/*
 * Deterministic Stripe idempotency keys for operations that may be repeated.
 * Stripe keeps keys for 24 hours only, so local state checks are still required.
 */

const KEY_PREFIX = 'sfcc';
const MAX_KEY_LENGTH = 255;
const PAYLOAD_HASH_LENGTH = 16;

/**
 * Returns a short SHA-256 hex digest of a payload.
 * @param {Object} payload - Stripe request payload
 * @returns {string} - Digest prefix
 */
function hashPayload(payload) {
    const MessageDigest = require('dw/crypto/MessageDigest');
    const Encoding = require('dw/crypto/Encoding');
    const Bytes = require('dw/util/Bytes');

    const digest = new MessageDigest(MessageDigest.DIGEST_SHA_256);
    const json = JSON.stringify(payload || {});

    return Encoding.toHex(digest.digestBytes(new Bytes(json, 'UTF-8'))).substring(0, PAYLOAD_HASH_LENGTH);
}

/**
 * Builds a deterministic idempotency key.
 * @param {string} operation - Operation name, e.g. 'pi-create'
 * @param {string} identity - Business identity of the operation, e.g. an order number
 * @param {Object} payload - Stripe request payload
 * @returns {string} - Idempotency key
 */
function buildKey(operation, identity, payload) {
    if (!operation || !identity) {
        throw new Error('Idempotency key requires an operation and an identity');
    }

    const hash = hashPayload(payload);
    var key = [KEY_PREFIX, operation, identity].join('-');

    // Keep the payload hash even when the identity is very long
    if (key.length + hash.length + 1 > MAX_KEY_LENGTH) {
        key = key.substring(0, MAX_KEY_LENGTH - hash.length - 1);
    }

    return key + '-' + hash;
}

/**
 * Checks whether a failed Stripe call may still have been performed (no response, 5xx, 409, 429).
 * @param {Error} err - Error thrown by the Stripe service layer
 * @returns {boolean} - True if the outcome of the call is unknown
 */
function isOutcomeUnknown(err) {
    const callResult = err && err.callResult;

    if (!callResult) {
        return true;
    }

    const Result = require('dw/svc/Result');
    const notSentReasons = [Result.UNAVAILABLE_RATE_LIMITED, Result.UNAVAILABLE_CIRCUIT_BROKEN,
        Result.UNAVAILABLE_DISABLED, Result.UNAVAILABLE_CONFIG_PROBLEM];

    // Rejected locally by the service framework: the request never reached Stripe
    if (callResult.status === Result.SERVICE_UNAVAILABLE
        && notSentReasons.indexOf(callResult.unavailableReason) !== -1) {
        return false;
    }

    const httpStatus = callResult.error;

    return !httpStatus || httpStatus >= 500 || httpStatus === 409 || httpStatus === 429;
}

/**
 * Calls a Stripe operation, retrying once while its outcome is unknown.
 * @param {Function} fn - Callback performing the Stripe call with idempotencyKey
 * @param {string} idempotencyKey - Idempotency key used by the callback
 * @returns {*} - Result of the callback
 */
function callWithRetry(fn, idempotencyKey) {
    const MAX_ATTEMPTS = 2;
    var lastError;

    for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return fn();
        } catch (e) {
            lastError = e;

            if (!isOutcomeUnknown(e)) {
                throw e;
            }
        }
    }

    lastError.outcomeUnknown = true;
    lastError.message = 'Stripe outcome unknown, the request may have been processed - verify in Stripe (Idempotency-Key ' + idempotencyKey + '): ' + lastError.message;
    require('dw/system/Logger').getLogger('Stripe', 'stripe').error(lastError.message);

    throw lastError;
}

exports.buildKey = buildKey;
exports.isOutcomeUnknown = isOutcomeUnknown;
exports.callWithRetry = callWithRetry;

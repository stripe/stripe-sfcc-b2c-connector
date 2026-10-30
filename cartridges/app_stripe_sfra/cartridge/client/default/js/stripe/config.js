'use strict';

var cache = {};

/**
 * Returns a config
 * @param {string} name - 'base', 'checkout' or 'expressCheckout'
 * @returns {Object} - config, empty object if missing
 */
function get(name) {
    if (!cache[name]) {
        var el = document.getElementById('stripe-' + name + '-config');
        try {
            cache[name] = el ? JSON.parse(el.textContent) : {};
        } catch (e) {
            cache[name] = {};
        }
    }
    return cache[name];
}

module.exports = { get: get };

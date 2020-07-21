/* eslint-env es6 */

'use strict';

/**
 * @type {dw.template.ISML}
 */
const ISML = require('dw/template/ISML');

/**
 * Load stripe js lib
 */
function htmlHead() {
    ISML.renderTemplate('loadStripe');
}

exports.htmlHead = htmlHead;

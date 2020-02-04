const sandboxedModule = require('sandboxed-module');
module.exports = sandboxedModule.load('../../../../../../../cartridges/int_stripe_core/cartridge/scripts/stripe/services/stripeService', {
    requires: {
        'dw/svc/LocalServiceRegistry': require('../../../../../dw-mocks/dw/svc/LocalServiceRegistry'),
        'dw/system/Site': require('../../../../../dw-mocks/dw/system/Site')
    },
    singleOnly: true
});

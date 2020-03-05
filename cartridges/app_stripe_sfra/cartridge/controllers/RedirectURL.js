'use strict';

var server = require('server');
var page = module.superModule;
server.extend(page);

server.prepend('Start', function (req, res, next) {
    var URLRedirectMgr = require('dw/web/URLRedirectMgr');

    // Stripe changes BEGIN
    if (URLRedirectMgr.getRedirectOrigin() === '/.well-known/apple-developer-merchantid-domain-association') { // Intercept the incoming path request
        res.render('stripe/util/apple');
        return;
    }

    return next();
});

module.exports = server.exports();

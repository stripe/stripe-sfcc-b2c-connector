'use strict';

var server = require('server');
var page = module.superModule;
server.extend(page);

server.replace('Start', function (req, res, next) {
    var URLRedirectMgr = require('dw/web/URLRedirectMgr');

    // Stripe changes BEGIN
    if (URLRedirectMgr.getRedirectOrigin() === '/.well-known/apple-developer-merchantid-domain-association') { // Intercept the incoming path request
        res.render('stripe/util/apple');
        return next();
    }
    // Stripe changes END

    var redirect = URLRedirectMgr.redirect;
    var location = redirect ? redirect.location : null;
    var redirectStatus = redirect ? redirect.getStatus() : null;

    if (!location) {
        res.setStatusCode(404);
        res.render('error/notFound');
    } else {
        if (redirectStatus) {
            res.setRedirectStatus(redirectStatus);
        }
        res.redirect(location);
    }

    return next();
});

module.exports = server.exports();

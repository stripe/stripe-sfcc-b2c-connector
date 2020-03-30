const sinon = require('sinon');

const LocalServiceRegistry = {

    call: sinon.stub(),

    createService(serviceId, callback) {
        return {
            serviceId,
            callback,
            call: this.call
        };
    }
};

module.exports = LocalServiceRegistry;

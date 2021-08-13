/* eslint-env es6 */
/* eslint-disable no-plusplus */

'use strict';

/**
 * Composes a search query string based on job parameters.
 *
 * @param {Object} jobParams - Job parameters
 * @return {string} - Generted query string
 */
function getSearchQueryString(jobParams) {
    var clauses = [];

    if (jobParams.UNKNOWN) {
        clauses.push("custom.processingStatus='UNKNOWN'");
    }
    if (jobParams.PENDING_CHARGE) {
        clauses.push("custom.processingStatus='PENDING_CHARGE'");
    }
    if (jobParams.PROCESS) {
        clauses.push("custom.processingStatus='PROCESS'");
    }
    if (jobParams.PROCESSED) {
        clauses.push("custom.processingStatus='PROCESSED'");
    }
    if (jobParams.FAIL_OR_CANCEL) {
        clauses.push("custom.processingStatus='FAIL_OR_CANCEL'");
    }

    return clauses.length
        ? clauses.join(' OR ')
        : null;
}

exports.execute = function (jobParams) {
    const Status = require('dw/system/Status');
    const Logger = require('dw/system/Logger');

    const queryString = getSearchQueryString(jobParams);

    if (!queryString) { // No statuses selected
        Logger.info('No statuses selected, exiting');
        return new Status(Status.OK);
    }

    const CustomObjectMgr = require('dw/object/CustomObjectMgr');
    const Transaction = require('dw/system/Transaction');
    const webhooksHelper = require('*/cartridge/scripts/stripe/helpers/webhooksHelper');

    var stripeObjectsIter;
    try {
        const customObjectType = webhooksHelper.getNotificationsCustomObjectType();
        stripeObjectsIter = CustomObjectMgr.queryCustomObjects(customObjectType, queryString, null);
        let objectsRemovedCount = 0;

        while (stripeObjectsIter.hasNext()) {
            var stripeNoficationObject = stripeObjectsIter.next();

            Transaction.wrap(function () { // eslint-disable-line
                CustomObjectMgr.remove(stripeNoficationObject);
                objectsRemovedCount++;
            });
        }

        Logger.info('Removed {0} custom objects.', objectsRemovedCount);
    } catch (e) {
        var errMsg = e.message;
        Logger.error(errMsg);
        return new Status(Status.ERROR);
    } finally {
        if (stripeObjectsIter) {
            try {
                stripeObjectsIter.close();
            } catch (e) {
                Logger.error('Failed to close seekable iterator.');
            }
        }
    }

    return new Status(Status.OK);
};

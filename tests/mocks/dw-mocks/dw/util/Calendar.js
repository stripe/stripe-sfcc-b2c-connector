const moment = require('moment');
const momentJavaSimpleDateFormat = require('moment-jdateformatparser');

momentJavaSimpleDateFormat(moment);

class Calendar {
    static get DAY_OF_MONTH() { return 5; }

    static get HOUR_OF_DAY() { return 1; }

    static get MINUTE() { return 12; }

    static get SECOND() { return 13; }

    constructor(date = new Date()) {
        this.date = date;
    }

    add(field, value) {
        switch (field) {
            case Calendar.DAY_OF_MONTH:
                this.date.setDate(this.date.getDate() + value);
                break;

            default:
        }
    }

    get(field) {
        switch (field) {
            case Calendar.HOUR_OF_DAY:
                return this.date.getHours();
            default:
                return null;
        }
    }

    set(field, value) {
        switch (field) {
            case Calendar.HOUR_OF_DAY:
                this.date.setHours(value);
                break;
            case Calendar.MINUTE:
                this.date.setMinutes(value);
                break;
            case Calendar.SECOND:
                this.date.setSeconds(value);
                break;
            default:
        }
    }

    getTime() {
        return this.date;
    }

    // eslint-disable-next-line class-methods-use-this
    parseByFormat(dateString, format) {
        this.date = moment(dateString, moment().toMomentFormatString(format)).toDate();
    }

    setFirstDayOfWeek() {
        this.firstDayOfWeek = 2;
    }
}

module.exports = Calendar;

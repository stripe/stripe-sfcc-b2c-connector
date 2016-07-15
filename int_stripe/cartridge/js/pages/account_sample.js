'use strict';

var giftcert = require('../giftcert'),
    tooltip = require('../tooltip'),
    util = require('../util'),
    dialog = require('../dialog'),
    page = require('../page'),
    validator = require('../validator'),
    stripe = require('../stripe');

/**
 * @function
 * @description Initializes the events on the address form (apply, cancel, delete)
 * @param {Element} form The form which will be initialized
 */
function initializeAddressForm() {
    var $form = $('#edit-address-form');

    $form.find('input[name="format"]').remove();
    tooltip.init();
    //$("<input/>").attr({type:"hidden", name:"format", value:"ajax"}).appendTo(form);

    $form.on('click', '.apply-button', function (e) {
        e.preventDefault();
        if (!$form.valid()) {
            return false;
        }
        var url = util.appendParamToURL($form.attr('action'), 'format', 'ajax');
        var applyName = $form.find('.apply-button').attr('name');
        var options = {
            url: url,
            data: $form.serialize() + '&' + applyName + '=x',
            type: 'POST'
        };
        $.ajax(options).done(function (data) {
            if (typeof(data) !== 'string') {
                if (data.success) {
                    dialog.close();
                    page.refresh();
                } else {
                    window.alert(data.message);
                    return false;
                }
            } else {
                $('#dialog-container').html(data);
                account.init();
                tooltip.init();
            }
        });
    })
    .on('click', '.cancel-button, .close-button', function (e) {
        e.preventDefault();
        dialog.close();
    })
    .on('click', '.delete-button', function (e) {
        e.preventDefault();
        if (window.confirm(String.format(Resources.CONFIRM_DELETE, Resources.TITLE_ADDRESS))) {
            var url = util.appendParamsToUrl(Urls.deleteAddress, {
                AddressID: $form.find('#addressid').val(),
                format: 'ajax'
            });
            $.ajax({
                url: url,
                method: 'POST',
                dataType: 'json'
            }).done(function (data) {
                if (data.status.toLowerCase() === 'ok') {
                    dialog.close();
                    page.refresh();
                } else if (data.message.length > 0) {
                    window.alert(data.message);
                    return false;
                } else {
                    dialog.close();
                    page.refresh();
                }
            });
        }
    });

    validator.init();
}
/**
 * @private
 * @function
 * @description Toggles the list of Orders
 */
function toggleFullOrder () {
    $('.order-items')
        .find('li.hidden:first')
        .prev('li')
        .append('<a class="toggle">View All</a>')
        .children('.toggle')
        .click(function () {
            $(this).parent().siblings('li.hidden').show();
            $(this).remove();
        });
}
/**
 * @private
 * @function
 * @description Binds the events on the address form (edit, create, delete)
 */
function initAddressEvents() {
    var addresses = $('#addresses');
    if (addresses.length === 0) { return; }

    addresses.on('click', '.address-edit, .address-create', function (e) {
        e.preventDefault();
        dialog.open({
            url: this.href,
            options: {
                open: initializeAddressForm
            }
        });
    }).on('click', '.delete', function (e) {
        e.preventDefault();
        if (window.confirm(String.format(Resources.CONFIRM_DELETE, Resources.TITLE_ADDRESS))) {
            $.ajax({
                url: util.appendParamToURL($(this).attr('href'), 'format', 'ajax'),
                dataType: 'json'
            }).done(function (data) {
                if (data.status.toLowerCase() === 'ok') {
                    page.redirect(Urls.addressesList);
                } else if (data.message.length > 0) {
                    window.alert(data.message);
                } else {
                    page.refresh();
                }
            });
        }
    });
}
/**
 * @private
 * @function
 * @description Binds the events of the payment methods list (delete card)
 */
function initPaymentEvents() {
    $('.add-card').on('click', function (e) {
        e.preventDefault();
        dialog.open({
            url: $(e.target).attr('href'),
            callback: function () {
            	stripe.initMyAccount();
            }
        });
    });

    var paymentList = $('.payment-list');
    if (paymentList.length === 0) { return; }

    util.setDeleteConfirmation(paymentList, String.format(Resources.CONFIRM_DELETE, Resources.TITLE_CREDITCARD));

    $('form[name="payment-remove"]').on('submit', function (e) {
        e.preventDefault();
        // override form submission in order to prevent refresh issues
        var button = $(this).find('.delete');
        $('<input/>').attr({
            type: 'hidden',
            name: button.attr('name'),
            value: button.attr('value') || 'delete card'
        }).appendTo($(this));
        var data = $(this).serialize();
        $.ajax({
            type: 'POST',
            url: $(this).attr('action'),
            data: data
        })
        .done(function () {
            page.redirect(Urls.paymentsList);
        });
    });
}
/**
 * @private
 * @function
 * @description init events for the loginPage
 */
function initLoginPage() {
    //o-auth binding for which icon is clicked
    $('.oAuthIcon').bind('click', function () {
        $('#OAuthProvider').val(this.id);
    });

    //toggle the value of the rememberme checkbox
    $('#dwfrm_login_rememberme').bind('change', function () {
        if ($('#dwfrm_login_rememberme').attr('checked')) {
            $('#rememberme').val('true');
        } else {
            $('#rememberme').val('false');
        }
    });
    $('#password-reset').on('click', function (e) {
        e.preventDefault();
        dialog.open({
            url: $(e.target).attr('href'),
            options: {
                open: function () {
                    validator.init();
                    var $requestPasswordForm = $('[name$="_requestpassword"]'),
                        $submit = $requestPasswordForm.find('[name$="_requestpassword_send"]');
                    $($submit).on('click', function (e) {
                        if (!$requestPasswordForm.valid()) {
                            return;
                        }
                        e.preventDefault();
                        dialog.submit($submit.attr('name'));
                    });
                }
            }
        });
    });
}
/**
 * @private
 * @function
 * @description Binds the events of the order, address and payment pages
 */
function initializeEvents() {
    toggleFullOrder();
    initAddressEvents();
    initPaymentEvents();
    initLoginPage();
}

var account = {
    init: function () {
        initializeEvents();
        giftcert.init();
    },
    initCartLogin: function () {
        initLoginPage();
    }
};

module.exports = account;

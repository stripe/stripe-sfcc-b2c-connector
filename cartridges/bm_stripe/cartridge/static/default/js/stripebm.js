/* eslint-env es6 */
/* eslint-disable no-console */
/* eslint-disable no-plusplus */

var ready = (callback) => {
    if (document.readyState !== 'loading') {
        callback();
    } else {
        document.addEventListener('DOMContentLoaded', callback);
    }
};

ready(() => {
    if (document.querySelector('button.stripe-quick-setup-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-quick-setup-submit').addEventListener('click', (e) => {
            e.preventDefault();
            var siteIDs = [];

            var siteIDCheckboxes = document.getElementsByName('siteid');
            for (var i = 0; i < siteIDCheckboxes.length; ++i) {
                if (siteIDCheckboxes[i].checked) {
                    siteIDs.push(siteIDCheckboxes[i].dataset.siteid);
                }
            }

            document.getElementById('stripe_site_ids').value = siteIDs.join(',');

            document.getElementById('quick-setup-sites-error-msg').style.display = siteIDs.length ? 'none' : 'block';

            if (!siteIDs.length) {
                return;
            }

            var stripeQuickSetupForm = document.getElementById('stripe-quick-setup-form');
            var isStripeQuickSetupFormValid = stripeQuickSetupForm.checkValidity();
            if (!isStripeQuickSetupFormValid) {
                stripeQuickSetupForm.reportValidity();
                return;
            }

            var httpRequest = new XMLHttpRequest();
            var formData = document.getElementById('stripe-quick-setup-form').serialize();

            httpRequest.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    var response = JSON.parse(this.responseText);
                    var result = document.getElementById('quick-setup-result');
                    result.style.color = response.error ? '#ff0000' : '';
                    result.innerHTML = response.message;
                }
            };

            httpRequest.open('POST', document.getElementById('stripe-quick-setup-form').action, true);
            httpRequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            httpRequest.send(formData);
        });
    }

    if (document.querySelector('button.stripe-payment-setup-submit')) {
        // eslint-disable-next-line no-unused-vars
        document.querySelector('button.stripe-payment-setup-submit').addEventListener('click', (e) => {
            e.preventDefault();

            var httpRequest = new XMLHttpRequest();
            var formData = document.getElementById('stripe-payments-setup-form').serialize();

            httpRequest.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    var response = JSON.parse(this.responseText);

                    if (response.error) {
                        var result = document.getElementById('payment-setup-result');
                        result.style.color = '#ff0000';
                        result.innerHTML = response.message;
                    } else {
                        var a = document.createElement('a');
                        a.href = 'data:text/html;charset=utf-8,' + response.content;
                        a.download = 'payment-methods.xml';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }
                }
            };

            httpRequest.open('POST', document.getElementById('stripe-payments-setup-form').action, true);
            httpRequest.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            httpRequest.send(formData);
        });
    }
});

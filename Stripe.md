# Stripe payments

The Stripe SFCC SFRA Cartridge can be used to add card payments and alternative payment methods supported by Stripe to your webshop.

## Installation

To install the Stripe cartridge, first create the required custom objects, then set the custom preferences for it and finally upload the cartridge.

### Creating Custom Objects

Import the metadata xml's in your site from `metadata` folder.

### Setting the custom preferences

See section "1.3 Setup" from `documentation/Stripe SGJC documentation.docx` for custom preferences details.

### Uploading the cartridge

From the `link_stripe` directory:
-	Run `npm install` to install all of the local dependencies (node version 8.x or current LTS release recommended)
-	Run `npm run compile:js` from the command line that would compile all client-side JS files.
Upload and add int_stripe_sfra and int_stripe_core cartridges to the site cartridge path, example:

`int_stripe_sfra:int_stripe_core:app_storefront_base`

This distribution also contains modified templates and controllers from the Storefront Reference Architecture.
They are included in the `app_stripe_sfra` cartridge and can be used as is or the changes transfered in custom integrational cartridge.
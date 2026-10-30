var path = require('path');
var sgmfScripts = require('sgmf-scripts');
var RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
var MiniCssExtractPlugin = require('mini-css-extract-plugin');
var CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

module.exports = [{
    mode: 'production',
    name: 'js',
    entry: sgmfScripts.createJsPath(),
    output: {
        path: path.resolve('./cartridges/app_stripe_sfra/cartridge/static/'),
        filename: '[name].js'
    }
},
{
    mode: 'production',
    name: 'scss',
    entry: sgmfScripts.createScssPath(),
    output: {
        path: path.resolve('./cartridges/app_stripe_sfra/cartridge/static/')
    },
    module: {
        rules: [{
            test: /\.scss$/,
            use: [{
                loader: MiniCssExtractPlugin.loader,
                options: {
                    esModule: false
                }
            }, {
                loader: 'css-loader',
                options: {
                    url: false
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    postcssOptions: {
                        plugins: [
                            require('autoprefixer')()
                        ]
                    }
                }
            }, {
                loader: 'sass-loader',
                options: {
                    implementation: require('sass'),
                    sassOptions: {
                        includePaths: [
                            path.resolve('node_modules'),
                            path.resolve('node_modules/flag-icon-css/sass')
                        ]
                    }
                }
            }]
        }]
    },
    resolve: {
        alias: {
            base: path.resolve(__dirname, '../storefront-reference-architecture/cartridges/app_storefront_base/cartridge/client/default/scss')
        }
    },
    plugins: [
        new RemoveEmptyScriptsPlugin(),
        new MiniCssExtractPlugin({ filename: '[name].css' })
    ],
    optimization: {
        minimizer: ['...', new CssMinimizerPlugin()]
    }
}];

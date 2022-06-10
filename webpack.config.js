var path = require('path');
var sgmfScripts = require('sgmf-scripts');
var ExtractTextPlugin = require('sgmf-scripts')['extract-text-webpack-plugin'];

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
        path: path.resolve('./cartridges/app_stripe_sfra/cartridge/static/'),
        filename: '[name].css'
    },
    module: {
        rules: [{
            test: /\.scss$/,
            use: ExtractTextPlugin.extract({
                use: [{
                    loader: 'css-loader',
                    options: {
                        url: false,
                        minimize: true,
                        sourceMap: true
                    }
                }, {
                    loader: 'postcss-loader',
                    options: {
                        plugins: [
                            require('autoprefixer')()
                        ],
                        sourceMap: true
                    }
                }, {
                    loader: 'sass-loader',
                    options: {
                        includePaths: [
                            path.resolve('node_modules'),
                            path.resolve('node_modules/flag-icon-css/sass')
                        ],
                        sourceMap: true
                    }
                }]
            })
        }]
    },
    resolve: {
        alias: {
            base: path.resolve(__dirname, '../storefront-reference-architecture/cartridges/app_storefront_base/cartridge/client/default/scss')
        }
    },
    plugins: [
        new ExtractTextPlugin({ filename: '[name].css' })
    ]
}];

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    assetModuleFilename: 'assets/[name][ext]'
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.scss$/i,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        test: /\.(glb|gltf)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.hdr$/i,
        type: 'asset/resource', 
      },
      {
        test: /\.html$/i,
        loader: 'html-loader',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[hash].[ext]',
              outputPath: 'assets/fonts/',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      template: './payment-orchestration.html',
      filename: 'payment-orchestration.html',
    }),
    new HtmlWebpackPlugin({
      template: './open-banking.html',
      filename: 'open-banking.html',
    }),
    new HtmlWebpackPlugin({
      template: './igaming-platform.html',
      filename: 'igaming-platform.html',
    }),
    new HtmlWebpackPlugin({
      template: './crypto-wallet-solution.html',
      filename: 'crypto-wallet-solution.html',
    }),
    new HtmlWebpackPlugin({
      template: './mobile-user-acquisition.html',
      filename: 'mobile-user-acquisition.html',
    }),
    new HtmlWebpackPlugin({
      template: './it-consulting-and-software.html',
      filename: 'it-consulting-and-software.html',
    }),
    new HtmlWebpackPlugin({
      template: './policy.html',
      filename: 'policy.html',
    }),
  ],
  devServer: {
    static: './dist',
    open: true,
  },
  mode: 'development',
};
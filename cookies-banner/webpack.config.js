// const path = require('path');
// const TerserPlugin = require('terser-webpack-plugin');

// module.exports = {
//   entry: './src/index.js',
//   output: {
//     path: path.resolve(__dirname, 'dist'),
//     filename: 'bundle.min.js', // Set the filename to bundle.min.js
//   },
//   resolve: {
//     alias: {
//       'react': '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules/react/umd/react.production.min.js',
//       'react-dom': '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules/react-dom/umd/react-dom.production.min.js',
//     },
//     modules: [
//       '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules'
//     ]
//   },
//   module: {
//     rules: [{
//       test: /\.js$/,
//       exclude: /node_modules/,
//       use: {
//         loader: '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules/babel-loader',
//         options: {
//           presets: ['@babel/preset-env', '@babel/preset-react'],
//         },
//       },
//     },
//     {
//       test: /\.css$/,
//       use: [
//         '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules/style-loader',
//         '/home/ubuntu/grc-express-test/cookies-banner-node_modules_custom/node_modules/css-loader'
//       ],
//     },
//     ],
//   },
//   optimization: {
//     minimize: true, // Enable minimization
//     minimizer: [new TerserPlugin()], // Use TerserPlugin for minification
//   },
// };




// cookies-banner/webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'src', 'entry.js'),
  output: {
    filename: 'banner.js',                   // final bundle
    path: path.resolve(__dirname, 'dist'),
    library: 'GRCBanner',                    // optional global var
    libraryTarget: 'umd',
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',            // make sure you installed this
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      }
    ]
  }
};




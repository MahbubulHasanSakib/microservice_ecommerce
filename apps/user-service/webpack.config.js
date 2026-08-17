/**
 * Webpack config for User Service.
 * Same reasoning as api-gateway/webpack.config.js — see that file for explanation.
 */
const path = require('path');

module.exports = (options) => {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      alias: {
        ...((options.resolve && options.resolve.alias) || {}),
        '@ecommerce/shared': path.resolve(__dirname, '../../libs/shared/src'),
      },
    },
  };
};

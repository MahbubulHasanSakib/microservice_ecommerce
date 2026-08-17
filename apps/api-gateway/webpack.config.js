/**
 * Webpack config for API Gateway.
 *
 * WHY WEBPACK MODE:
 * NestJS CLI's default tsc mode has trouble with cross-package path aliases
 * in an npm workspaces monorepo. When `@ecommerce/shared` is compiled by tsc,
 * the output still contains `require('@ecommerce/shared')` which Node.js
 * resolves at runtime via the npm workspaces symlink — to a .ts file it can't load.
 *
 * Webpack bundles everything at build time, resolving all path aliases and
 * imports into a single optimized output file. No runtime module resolution.
 */
const path = require('path');

module.exports = (options) => {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      alias: {
        ...((options.resolve && options.resolve.alias) || {}),
        // Map @ecommerce/shared to the TypeScript source at build time
        '@ecommerce/shared': path.resolve(__dirname, '../../libs/shared/src'),
      },
    },
  };
};

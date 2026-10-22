/* eslint-disable @typescript-eslint/no-var-requires */
const baseConfig = require('@e-sign/tailwind-config');
const path = require('path');

module.exports = {
  ...baseConfig,
  content: [`templates/**/*.{ts,tsx}`],
};

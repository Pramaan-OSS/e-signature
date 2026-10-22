/* eslint-disable @typescript-eslint/no-var-requires */
const baseConfig = require('@e-sign/ui/tailwind.config.cjs');
const path = require('path');

module.exports = {
  presets: [baseConfig],
  content: [
    './app/**/*.{ts,tsx}',
    `${path.join(require.resolve('@e-sign/ui'), '..')}/components/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/ui'), '..')}/icons/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/ui'), '..')}/lib/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/ui'), '..')}/primitives/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/email'), '..')}/templates/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/email'), '..')}/template-components/**/*.{ts,tsx}`,
    `${path.join(require.resolve('@e-sign/email'), '..')}/providers/**/*.{ts,tsx}`,
  ],
};

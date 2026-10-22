/* eslint-disable @typescript-eslint/no-var-requires */
const { fontFamily } = require('tailwindcss/defaultTheme');
const { default: flattenColorPalette } = require('tailwindcss/lib/util/flattenColorPalette');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['variant', '&:is(.dark:not(.dark-mode-disabled) *)'],
  content: ['src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans],
        signature: ['var(--font-signature)'],
        noto: ['var(--font-noto)'],
      },
      zIndex: {
        9999: '9999',
      },
      aspectRatio: {
        'signature-pad': '16 / 7',
      },
      colors: {
        border: 'var(--line)',
        'field-border': 'var(--line)',
        input: 'var(--line)',
        ring: 'var(--focus)',
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        primary: {
          DEFAULT: 'var(--inverse)',
          foreground: 'var(--on-inverse)',
        },
        'envelope-editor-background': 'var(--bg)',
        secondary: {
          DEFAULT: 'var(--glass)',
          foreground: 'var(--fg-2)',
        },
        warning: {
          DEFAULT: 'var(--needs)',
        },
        destructive: {
          DEFAULT: 'var(--inverse)',
          foreground: 'var(--on-inverse)',
        },
        muted: {
          DEFAULT: 'var(--surface-sunk)',
          foreground: 'var(--fg-3)',
        },
        accent: {
          DEFAULT: 'var(--surface-sunk)',
          foreground: 'var(--fg)',
        },
        popover: {
          DEFAULT: 'var(--glass-strong)',
          foreground: 'var(--fg)',
        },
        card: {
          DEFAULT: 'var(--glass)',
          foreground: 'var(--fg)',
        },
        'field-card': {
          DEFAULT: 'var(--surface-sunk)',
          border: 'var(--line)',
          foreground: 'var(--fg)',
        },
        widget: {
          DEFAULT: 'var(--surface-sunk)',
          foreground: 'var(--fg)',
        },
        esign: {
          DEFAULT: 'var(--fg)',
          50: 'var(--fg)',
          100: 'var(--fg)',
          200: 'var(--fg)',
          300: 'var(--fg)',
          400: 'var(--fg)',
          500: 'var(--fg)',
          600: 'var(--fg)',
          700: 'var(--fg)',
          800: 'var(--fg)',
          900: 'var(--fg)',
          950: 'var(--fg)',
        },
        dawn: {
          DEFAULT: 'var(--fg)',
          50: 'var(--fg)',
          100: 'var(--fg)',
          200: 'var(--fg)',
          300: 'var(--fg)',
          400: 'var(--fg)',
          500: 'var(--fg)',
          600: 'var(--fg)',
          700: 'var(--fg)',
          800: 'var(--fg)',
          900: 'var(--fg)',
          950: 'var(--fg)',
        },
        water: {
          DEFAULT: 'var(--fg)',
          50: 'var(--fg)',
          100: 'var(--fg)',
          200: 'var(--fg)',
          300: 'var(--fg)',
          400: 'var(--fg)',
          500: 'var(--fg)',
          600: 'var(--fg)',
          700: 'var(--fg)',
          800: 'var(--fg)',
          900: 'var(--fg)',
          950: 'var(--fg)',
        },
        recipient: {
          green: 'hsl(var(--recipient-green))',
          blue: 'hsl(var(--recipient-blue))',
          purple: 'hsl(var(--recipient-purple))',
          orange: 'hsl(var(--recipient-orange))',
          yellow: 'hsl(var(--recipient-yellow))',
          pink: 'hsl(var(--recipient-pink))',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        DEFAULT: 'calc(var(--radius) - 3px)',
        '2xl': 'calc(var(--radius) + 4px)',
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
      screens: {
        '3xl': '1920px',
        '4xl': '2560px',
        '5xl': '3840px',
        print: { raw: 'print' },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/container-queries'),
    addVariablesForColors,
  ],
};

function addVariablesForColors({ addBase, theme }) {
  const allColors = flattenColorPalette(theme('colors'));
  const newVars = Object.fromEntries(Object.entries(allColors).map(([key, val]) => [`--${key}`, val]));

  addBase({
    ':root': newVars,
  });
}

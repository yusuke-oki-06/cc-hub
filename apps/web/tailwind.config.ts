import type { Config } from 'tailwindcss';

/**
 * DESIGN.md (Claude 風) に忠実なパレット・タイポ。
 * 冷色グレーは禁止、暖色ニュートラルのみ。
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary / Brand
        terracotta: { DEFAULT: '#c96442', light: '#d97757' },
        // Surfaces
        parchment: '#f5f4ed',
        ivory: '#faf9f5',
        sand: '#e8e6dc',
        // Deep dark surfaces (rarely used as page bg)
        near: '#141413',
        dark: '#30302e',
        // Neutrals (warm)
        charcoal: '#4d4c48',
        olive: '#5e5d59',
        stone: '#87867f',
        silver: '#b0aea5',
        // Borders
        'border-cream': '#f0eee6',
        'border-warm': '#e8e6dc',
        // Semantic
        'error-crimson': '#b53333',
        'focus-blue': '#3898ec',
        // Rings
        'ring-warm': '#d1cfc5',
        'ring-deep': '#c2c0b6',
      },
      fontFamily: {
        serif: ['Georgia', 'Iowan Old Style', 'Noto Serif JP', 'serif'],
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'Noto Sans JP',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        hero: ['4rem', { lineHeight: '1.1', fontWeight: '500' }],
        section: ['3.25rem', { lineHeight: '1.2', fontWeight: '500' }],
        subhead: ['2rem', { lineHeight: '1.1', fontWeight: '500' }],
        'subhead-sm': ['1.6rem', { lineHeight: '1.2', fontWeight: '500' }],
        feature: ['1.3rem', { lineHeight: '1.2', fontWeight: '500' }],
      },
      borderRadius: {
        card: '12px',
        hero: '32px',
      },
      boxShadow: {
        ring: '0 0 0 1px #d1cfc5',
        'ring-deep': '0 0 0 1px #c2c0b6',
        whisper: '0 4px 24px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
export default config;

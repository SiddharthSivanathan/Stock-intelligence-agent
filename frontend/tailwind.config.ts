import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        panel: 'hsl(var(--panel))',
        'panel-2': 'hsl(var(--panel-2))',
        border: 'hsl(var(--border))',
        text: 'hsl(var(--text))',
        muted: 'hsl(var(--text-muted))',
        accent: 'hsl(var(--accent))',
        danger: 'hsl(var(--danger))',
        warning: 'hsl(var(--warning))',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 32px hsl(var(--accent) / 0.25)',
        'glow-danger': '0 0 32px hsl(var(--danger) / 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void:  '#0b0a08',
        paper: '#f0ebe1',
        gold:  '#c09a58',
        fog:   '#1e1c19',
        fog2:  '#252320',
        mist:  '#4a4540',
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config

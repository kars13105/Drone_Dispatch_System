/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Space Grotesk"', 'sans-serif'],
        ui: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        void: '#050810',
        panel: '#080d18',
        surface: '#0d1525',
        border: '#1a2540',
        'border-bright': '#263760',
        accent: '#00d4ff',
        'accent-dim': '#0097b8',
        'accent-glow': 'rgba(0,212,255,0.15)',
        warning: '#f59e0b',
        danger: '#ef4444',
        success: '#10b981',
        muted: '#4a6080',
        text: '#c8d8f0',
        'text-dim': '#6a86a8',
        'text-bright': '#e8f4ff',
        drone: '#00d4ff',
        delivery: '#fbbf24',
        station: '#10b981',
        noflyzone: '#ef444460',
        'noflyzone-border': '#ef4444',
      },
      boxShadow: {
        'panel': '0 0 0 1px #1a2540, 0 4px 24px rgba(0,0,0,0.5)',
        'accent': '0 0 20px rgba(0,212,255,0.3)',
        'glow': '0 0 40px rgba(0,212,255,0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 2s linear infinite',
        'flicker': 'flicker 4s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.6' },
          '94%': { opacity: '1' },
          '96%': { opacity: '0.8' },
          '97%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

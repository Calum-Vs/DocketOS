/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': '#080809',
        'bg-surface': '#121214',
        'bg-elevated': '#1A1A1E',
        'border-subtle': '#1F1F23',
        accent: '#7A5CFF',
        'accent-hover': '#8F74FF',
        'text-primary': '#F5F5F7',
        'text-muted': '#8E8E93',
        'status-error': '#FF453A',
        'status-warn': '#FF9F0A',
        'status-ok': '#30D158',
      },
      borderRadius: {
        app: '4px',
      },
    },
  },
  plugins: [],
}

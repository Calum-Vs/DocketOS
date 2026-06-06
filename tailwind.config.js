/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base': '#000000',
        'bg-surface': '#1C1C20',
        'bg-elevated': '#26262C',
        'bg-hover': '#303038',
        'border-subtle': '#34343A',
        accent: '#7A5CFF',
        'accent-hover': '#8F74FF',
        'accent-soft': '#B8AAFF',
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

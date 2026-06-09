/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        'primary-hover': '#1D4ED8',
        secondary: '#F2F6FB',
        'secondary-foreground': '#102A43',
        foreground: '#102A43',
        background: '#F7F9FC',
        border: '#D9E2EC',
        'muted-foreground': '#52606D',
        success: '#16A34A',
        destructive: '#DC2626',
        warning: '#D97706',
        info: '#0284C7',
      },
      fontFamily: {
        sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      },
      spacing: {
        '4.5': '1.125rem',
      },
    },
  },
  plugins: [],
};

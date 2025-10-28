/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'b1t-orange': {
          DEFAULT: '#FF6B00',
          50: '#FFE8D5',
          100: '#FFD9BA',
          200: '#FFBB85',
          300: '#FF9D50',
          400: '#FF841A',
          500: '#FF6B00',
          600: '#CC5600',
          700: '#994000',
          800: '#662B00',
          900: '#331500',
        },
        'dark': {
          DEFAULT: '#1A1A1A',
          50: '#3D3D3D',
          100: '#333333',
          200: '#2A2A2A',
          300: '#202020',
          400: '#1A1A1A',
          500: '#0F0F0F',
          600: '#0A0A0A',
          700: '#050505',
          800: '#000000',
          900: '#000000',
        },
      },
      backgroundImage: {
        'gradient-orange': 'linear-gradient(135deg, #FF6B00 0%, #FF9D50 100%)',
        'gradient-dark': 'linear-gradient(135deg, #1A1A1A 0%, #0A0A0A 100%)',
        'gradient-radial': 'radial-gradient(circle, var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 3s infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #FF6B00, 0 0 10px #FF6B00' },
          '100%': { boxShadow: '0 0 10px #FF6B00, 0 0 20px #FF6B00, 0 0 30px #FF6B00' },
        },
      },
    },
  },
  plugins: [],
}



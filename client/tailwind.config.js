/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#0969DA',
          600: '#0550AE',
          700: '#033D82',
        }
      }
    },
  },
  plugins: [],
}
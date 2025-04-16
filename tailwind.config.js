/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}", // 👈 asegúrate de que incluya todos los archivos donde usas clases
  ],
  theme: {
    extend: {},
  },
  safelist: [
    'opacity-0',
    'opacity-100',
    'scale-y-0',
    'scale-y-100',
    'transition-all',
    'duration-300',
    'ease-in-out'
  ],
  plugins: [],
}



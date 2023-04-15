/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "../**/*.{html,js}",
    "!../node_modules/**/*",
    "!./node_modules/**/*"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

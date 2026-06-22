/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        'status-hold': '#DC2626',
        'status-carryforward': '#A855F7',
        'status-completed': '#10B981',
        'status-pending': '#6B7280',
      },
    },
  },
  plugins: [],
}

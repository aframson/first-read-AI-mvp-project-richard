/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        blink: {
          "0%, 49%": { opacity: "0.4" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        blink: "blink 1s steps(2, start) infinite",
      },
    },
  },
  plugins: [],
};
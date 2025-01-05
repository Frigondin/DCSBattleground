// eslint-disable-next-line no-undef
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./src/index.html"],
  safelist: {
        standard: [],
      },
  darkMode: 'media', // or 'media' or 'class'
  theme: {},
  variants: {
    extend: {
      "border-b": ["hover"],
    },
  },
  plugins: [
	require('tailwind-scrollbar'),
  ],
};


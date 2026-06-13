import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      maxWidth: {
        content: "860px",
      },
      colors: {
        // Distinctive dark palette + sharp teal accent.
        ink: "#0a0f1e", // page background — near-black navy
        surface: "#111827", // card surface — a step lighter than the page
        accent: {
          DEFAULT: "#00d4aa",
          ink: "#04140f", // dark text that sits on a solid accent fill
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

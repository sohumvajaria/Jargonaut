import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      maxWidth: {
        hero: "640px",
        results: "1024px",
      },
      colors: {
        paper: "#f7f5ef",
        surface: "#ffffff",
        ink: "#1b1813",
        "ink-muted": "#6c6357",
        edge: "#ddd5c6",
        stamp: {
          DEFAULT: "#c10f2b",
          deep: "#9a0c22",
        },
        cleared: "#1a7d3c",
        medium: "#c47f0a",
      },
      fontFamily: {
        display: [
          "var(--font-display)",
          "var(--font-serif)",
          "Georgia",
          "serif",
        ],
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
        serif: [
          "var(--font-serif)",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

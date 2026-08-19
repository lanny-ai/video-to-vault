import type { Config } from "tailwindcss";

// Design tokens. One accent color. Near-monochrome everything else.
// See docs/DESIGN_PRINCIPLES.md before adding any color here.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        hairline: "var(--hairline)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        pass: {
          DEFAULT: "var(--pass)",
          soft: "var(--pass-soft)",
        },
        fail: {
          DEFAULT: "var(--fail)",
          soft: "var(--fail-soft)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      transitionTimingFunction: {
        calm: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;

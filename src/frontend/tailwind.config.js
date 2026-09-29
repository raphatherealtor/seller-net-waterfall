import typography from "@tailwindcss/typography";
import containerQueries from "@tailwindcss/container-queries";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["index.html", "src/**/*.{js,ts,jsx,tsx,html,css}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "oklch(var(--success) / <alpha-value>)",
          foreground: "oklch(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "oklch(var(--warning) / <alpha-value>)",
        },
        "prov-user": "oklch(var(--prov-user) / <alpha-value>)",
        "prov-default": "oklch(var(--prov-default) / <alpha-value>)",
        "prov-estimate": "oklch(var(--prov-estimate) / <alpha-value>)",
        "prov-verified": "oklch(var(--prov-verified) / <alpha-value>)",
        "prov-unknown": "oklch(var(--prov-unknown) / <alpha-value>)",
        "ledger-rule": "oklch(var(--ledger-rule) / <alpha-value>)",
        "ledger-rule-strong": "oklch(var(--ledger-rule-strong) / <alpha-value>)",
        "chip-border": "oklch(var(--chip-border) / <alpha-value>)",
        "chip-bg": "oklch(var(--chip-bg) / <alpha-value>)",
        "chip-fg": "oklch(var(--chip-fg) / <alpha-value>)",
        panel: {
          DEFAULT: "oklch(var(--panel) / <alpha-value>)",
          foreground: "oklch(var(--panel-foreground) / <alpha-value>)",
          muted: "oklch(var(--panel-muted) / <alpha-value>)",
          border: "oklch(var(--panel-border) / <alpha-value>)",
          accent: "oklch(var(--panel-accent) / <alpha-value>)",
          positive: "oklch(var(--panel-positive) / <alpha-value>)",
          negative: "oklch(var(--panel-negative) / <alpha-value>)",
          rule: "oklch(var(--panel-rule) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "oklch(var(--popover))",
          foreground: "oklch(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "oklch(var(--card))",
          foreground: "oklch(var(--card-foreground))",
        },
        chart: {
          1: "oklch(var(--chart-1))",
          2: "oklch(var(--chart-2))",
          3: "oklch(var(--chart-3))",
          4: "oklch(var(--chart-4))",
          5: "oklch(var(--chart-5))",
          gross: "oklch(var(--chart-gross))",
          net: "oklch(var(--chart-net))",
          track: "oklch(var(--chart-track))",
          grid: "oklch(var(--chart-grid))",
          baseline: "oklch(var(--chart-baseline))",
        },
        elev: {
          1: "oklch(var(--elev-1))",
          2: "oklch(var(--elev-2))",
          3: "oklch(var(--elev-3))",
        },
        badge: {
          DEFAULT: "oklch(var(--badge-bg))",
          border: "oklch(var(--badge-border))",
          ink: "oklch(var(--badge-ink))",
          face: "oklch(var(--badge-face))",
          "face-lo": "oklch(var(--badge-face-lo))",
          "edge-lo": "oklch(var(--badge-edge-lo))",
          ring: "oklch(var(--badge-ring))",
          cast: "oklch(var(--badge-cast))",
          glyph: "oklch(var(--badge-glyph))",
          "glyph-hi": "oklch(var(--badge-glyph-hi))",
          bevel: "oklch(var(--badge-bevel))",
        },
        sidebar: {
          DEFAULT: "oklch(var(--sidebar))",
          foreground: "oklch(var(--sidebar-foreground))",
          primary: "oklch(var(--sidebar-primary))",
          "primary-foreground": "oklch(var(--sidebar-primary-foreground))",
          accent: "oklch(var(--sidebar-accent))",
          "accent-foreground": "oklch(var(--sidebar-accent-foreground))",
          border: "oklch(var(--sidebar-border))",
          ring: "oklch(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 1px 0 oklch(0.2 0.016 250 / 0.04)",
        subtle: "0 1px 1px 0 oklch(0.2 0.016 250 / 0.04)",
        elevated:
          "0 1px 2px 0 oklch(0.2 0.016 250 / 0.05), 0 3px 8px -4px oklch(0.2 0.016 250 / 0.07)",
        "inset-soft":
          "inset 0 1px 0 0 oklch(var(--inset-highlight) / 0.65)",
        "card-soft":
          "inset 0 1px 0 0 oklch(var(--inset-highlight) / 0.7), 0 1px 1px 0 oklch(var(--shadow-ink) / 0.04)",
        "card-raised":
          "inset 0 1px 0 0 oklch(var(--inset-highlight) / 0.75), 0 1px 2px 0 oklch(var(--shadow-ink) / 0.05), 0 3px 8px -4px oklch(var(--shadow-ink) / 0.07)",
        "badge-dim":
          "inset 0 1px 0 0 oklch(var(--badge-highlight) / 0.7), 0 1px 1px 0 oklch(var(--shadow-ink) / 0.06), 0 2px 4px -2px oklch(var(--shadow-ink) / 0.08)",
        "badge-keycap":
          "inset 0 1px 0 0 oklch(var(--badge-bevel) / 0.85), inset 1px 0 0 0 oklch(var(--badge-bevel) / 0.35), inset 0 -1px 1px 0 oklch(var(--badge-edge-lo) / 0.9), inset -1px 0 1px 0 oklch(var(--badge-edge-lo) / 0.55), 0 1px 0 0 oklch(var(--badge-edge-lo) / 0.45), 0 1px 2px 0 oklch(var(--badge-cast) / 0.1), 0 3px 6px -3px oklch(var(--badge-cast) / 0.14)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "value-flash": {
          "0%": { backgroundColor: "oklch(var(--primary) / 0.12)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out both",
        "value-flash": "value-flash 0.6s ease-out",
      },
    },
  },
  plugins: [typography, containerQueries, animate],
};

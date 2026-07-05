import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3730A3",
        accent: "#F59E0B",
        success: "#10B981",
        warning: "#F43F5E",
        neutralBg: "#FAFAF9",
        neutralText: "#1F2933"
      },
      boxShadow: {
        // Bóng đổ nhiều lớp cho chiều sâu tinh tế hơn bóng phẳng cũ.
        soft: "0 1px 2px rgba(31, 41, 51, 0.04), 0 10px 26px -12px rgba(31, 41, 51, 0.14)",
        card: "0 1px 3px rgba(31, 41, 51, 0.05), 0 14px 34px -14px rgba(31, 41, 51, 0.16)",
        lift: "0 2px 6px rgba(31, 41, 51, 0.06), 0 22px 44px -18px rgba(55, 48, 163, 0.24)",
        insetLine: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.35s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both"
      }
    }
  },
  plugins: []
};

export default config;

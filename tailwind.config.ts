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
        soft: "0 12px 32px rgba(31, 41, 51, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

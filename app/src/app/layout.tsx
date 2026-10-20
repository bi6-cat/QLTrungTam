import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "APLUS ACADEMY · Quản lý trung tâm",
    template: "%s · APLUS ACADEMY"
  },
  description: "Quản lý trung tâm dạy thêm và thu học phí QR",
  icons: { icon: "/logo.jpg" }
};

export const viewport: Viewport = {
  themeColor: "#3730A3",
  colorScheme: "light"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

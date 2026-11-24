import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { isStaging } from "@/lib/environment";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const staging = await isStaging();
  return (
    <html lang="vi" data-env={staging ? "staging" : undefined} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

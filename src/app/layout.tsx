import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { isStaging } from "@/lib/environment";
import { THEME_COOKIE, isThemeId } from "@/lib/themes";

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
  // Bộ màu đọc từ cookie ngay lúc render server nên trang không bị nháy màu khi tải.
  const savedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemeId(savedTheme) ? savedTheme : undefined;
  return (
    <html lang="vi" data-env={staging ? "staging" : undefined} data-theme={theme} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

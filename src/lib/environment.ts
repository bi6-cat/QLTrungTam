import { headers } from "next/headers";

/**
 * Bản staging: APP_ENV=staging, hoặc tên miền đang truy cập có chữ "staging"
 * (aplus-staging.zett.io.vn). Dùng để đổi giao diện sang tông cam, tránh nhầm với production.
 */
export async function isStaging() {
  const appEnv = (process.env.APP_ENV ?? "").trim().toLowerCase();
  if (appEnv) return appEnv === "staging";
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return host.toLowerCase().includes("staging");
}

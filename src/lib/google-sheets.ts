import { createSign } from "node:crypto";

/**
 * Client Google Sheets tối giản: đăng nhập bằng Service Account (JWT ký RS256 bằng crypto của
 * Node) rồi gọi thẳng REST API, không cần thư viện googleapis.
 */

export type ServiceAccount = { clientEmail: string; privateKey: string };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Đọc file JSON key của Service Account; báo lỗi dễ hiểu khi dán nhầm nội dung. */
export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Key Service Account không phải JSON hợp lệ. Dán nguyên nội dung file .json tải từ Google Cloud.");
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const clientEmail = typeof record.client_email === "string" ? record.client_email.trim() : "";
  const privateKey = typeof record.private_key === "string" ? record.private_key : "";
  if (!clientEmail || !privateKey.includes("PRIVATE KEY")) {
    throw new Error("Key thiếu client_email hoặc private_key. Hãy dùng file key loại JSON của Service Account.");
  }
  return { clientEmail, privateKey };
}

/** Nhận link Google Sheet hoặc ID trần, trả về ID; null nếu không nhận ra. */
export function extractSpreadsheetId(input: string) {
  const value = input.trim();
  const fromUrl = value.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(value) ? value : null;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

let cachedToken: { clientEmail: string; token: string; expiresAt: number } | null = null;

async function getAccessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.clientEmail === account.clientEmail && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({ iss: account.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.privateKey, "base64url");
  } catch {
    throw new Error("private_key trong key Service Account không hợp lệ.");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`
    })
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`Google từ chối key Service Account: ${body.error_description ?? response.statusText}`);
  }
  cachedToken = {
    clientEmail: account.clientEmail,
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000
  };
  return body.access_token;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function sheetsRequest<T>(account: ServiceAccount, path: string, init: { method?: string; body?: unknown } = {}) {
  const token = await getAccessToken(account);
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${SHEETS_URL}/${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
    // Hết hạn mức ghi (60 lần/phút) hoặc Google lỗi tạm thời: chờ rồi thử lại.
    if (RETRY_STATUSES.has(response.status) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 5_000));
      continue;
    }
    const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        throw new Error(
          `Không mở được Google Sheet. Kiểm tra ID và đã chia sẻ file cho ${account.clientEmail} với quyền Người chỉnh sửa.`
        );
      }
      throw new Error(`Google Sheets báo lỗi: ${body.error?.message ?? response.statusText}`);
    }
    return body;
  }
}

export type SheetTab = { sheetId: number; title: string; index: number };

export async function listSheetTabs(account: ServiceAccount, spreadsheetId: string) {
  const body = await sheetsRequest<{ properties?: { title?: string }; sheets?: Array<{ properties: SheetTab }> }>(
    account,
    `${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(sheetId,title,index)`
  );
  return { title: body.properties?.title ?? "", tabs: (body.sheets ?? []).map((sheet) => sheet.properties) };
}

export async function batchUpdateSpreadsheet(account: ServiceAccount, spreadsheetId: string, requests: unknown[]) {
  await sheetsRequest(account, `${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: { requests }
  });
}

"use client";

import { useActionState } from "react";
import { CheckCircle2, ExternalLink, History, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { runSheetSyncAction, saveSheetSyncConfigAction } from "@/lib/actions/sheet-sync";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input, Textarea } from "@/components/ui";

type Status = { at: string; ok: boolean; message: string; trigger: "nightly" | "manual" } | null;

export function SheetSyncPanel({
  spreadsheetId,
  clientEmail,
  configured,
  nightlyHour,
  status
}: {
  spreadsheetId: string;
  clientEmail: string;
  configured: boolean;
  nightlyHour: number;
  status: Status;
}) {
  const [configState, configAction, saving] = useActionState(saveSheetSyncConfigAction, EMPTY_RESULT_STATE);
  const [syncState, syncAction, syncing] = useActionState(runSheetSyncAction, EMPTY_RESULT_STATE);
  useResultToast(configState);
  useResultToast(syncState, { showError: true });
  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : "";

  return (
    <div className="grid gap-5">
      {configured ? (
        <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
          <p className="text-stone-700">
            Tự đồng bộ lúc {nightlyHour}:00 mỗi đêm: tháng này, tháng trước và mọi tháng vừa có dữ liệu sửa.
          </p>
          {status ? (
            <p className={`flex items-start gap-2 ${status.ok ? "text-emerald-700" : "text-warning"}`}>
              {status.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {new Date(status.at).toLocaleString("vi-VN")} ({status.trigger === "nightly" ? "tự động" : "bấm tay"}):{" "}
                {status.message}
              </span>
            </p>
          ) : (
            <p className="text-stone-500">Chưa đồng bộ lần nào. Bấm “Đồng bộ toàn bộ lịch sử” để đưa các tháng cũ lên.</p>
          )}
          <form action={syncAction} className="flex flex-wrap gap-2">
            <Button type="submit" name="scope" value="recent" disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
            </Button>
            <Button type="submit" name="scope" value="all" variant="secondary" disabled={syncing}>
              <History className="h-4 w-4" />
              Đồng bộ toàn bộ lịch sử
            </Button>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary hover:bg-indigo-50"
            >
              <ExternalLink className="h-4 w-4" />
              Mở Google Sheet
            </a>
          </form>
        </div>
      ) : null}

      <details className="rounded-xl border border-stone-200 p-4 text-sm text-stone-700" open={!configured}>
        <summary className="cursor-pointer font-semibold">Cách kết nối (làm một lần)</summary>
        <ol className="mt-3 grid list-decimal gap-1.5 pl-5">
          <li>
            Vào <strong>console.cloud.google.com</strong>, tạo project, bật <strong>Google Sheets API</strong>.
          </li>
          <li>
            IAM &amp; Admin → Service Accounts → tạo tài khoản → tab Keys → Add key → <strong>JSON</strong>, tải file về.
          </li>
          <li>
            Tạo một Google Sheet trống, bấm Chia sẻ cho email <strong>client_email</strong> trong file JSON với quyền{" "}
            <strong>Người chỉnh sửa</strong>.
          </li>
          <li>Dán link Sheet và nội dung file JSON vào ô dưới rồi bấm Lưu.</li>
        </ol>
      </details>

      <form action={configAction} className="grid gap-4">
        <Field label="Link Google Sheet">
          <Input
            name="spreadsheet"
            defaultValue={sheetUrl}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            autoComplete="off"
            required
          />
        </Field>
        <Field
          label="Key Service Account (nội dung file JSON)"
          hint={clientEmail ? `Đã lưu: ${clientEmail}` : undefined}
        >
          <Textarea
            name="serviceAccount"
            rows={4}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            placeholder={clientEmail ? "Để trống để giữ key đã lưu" : '{ "type": "service_account", ... }'}
          />
        </Field>
        {configState.error ? <p className="text-sm font-medium text-warning">{configState.error}</p> : null}
        <div>
          <Button type="submit" disabled={saving}>
            <Link2 className="h-4 w-4" />
            {saving ? "Đang kiểm tra..." : "Lưu và kiểm tra kết nối"}
          </Button>
        </div>
      </form>
    </div>
  );
}

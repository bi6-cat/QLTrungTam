import { Banknote, BarChart3, Download, Landmark, ReceiptText } from "lucide-react";
import { Button, Field, Input, Panel, PageHeader, Select } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAdmin();
  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();
  const classes = await prisma.classRoom.findMany({ orderBy: { name: "asc" } });
  const teacherNames = [...new Set(classes.map((classRoom) => classRoom.teacherName))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Xuất báo cáo"
        description="Tải file Excel theo lớp, lịch sử giao dịch, lương giáo viên hoặc báo cáo tổng quan."
      />

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Báo cáo học phí theo lớp</h2>
        </div>
        <form action="/admin/reports/export" method="GET" className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto]">
          <Field label="Lớp">
            <Select name="classId" defaultValue="">
              <option value="">Tất cả lớp</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}{classRoom.archivedAt ? " (đã lưu trữ)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={defaultMonth} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={defaultYear} />
          </Field>
          <Button type="submit" className="self-end">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch sử giao dịch</h2>
        </div>
        <form
          action="/admin/reports/export-transactions"
          method="GET"
          className="grid gap-3 md:grid-cols-[140px_140px_auto]"
        >
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={defaultMonth} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={defaultYear} />
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-1 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lương giáo viên</h2>
        </div>
        <p className="mb-4 text-sm text-stone-500">
          Giống trang Lương GV: tổng tháng, chuyển khoản, tiền mặt, dư nợ, ghi chú nộp muộn; kèm tổng theo giáo viên và
          từng lần trả.
        </p>
        <form
          action="/admin/reports/export-salary"
          method="GET"
          className="grid gap-3 md:grid-cols-[1fr_120px_140px_180px_auto]"
        >
          <Field label="Giáo viên">
            <Select name="teacher" defaultValue="">
              <option value="">Tất cả giáo viên</option>
              {teacherNames.map((name) => (
                <option key={name || "__none"} value={name || "__none"}>
                  {name || "Chưa ghi tên giáo viên"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={defaultMonth} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={defaultYear} />
          </Field>
          <Field label="Khoảng">
            <Select name="range" defaultValue="1">
              <option value="1">Chỉ tháng này</option>
              <option value="3">3 tháng đến tháng này</option>
              <option value="6">6 tháng đến tháng này</option>
              <option value="12">12 tháng đến tháng này</option>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Báo cáo tổng quan</h2>
        </div>
        <form
          action="/admin/reports/export-summary"
          method="GET"
          className="grid gap-3 md:grid-cols-[140px_140px_auto]"
        >
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={defaultMonth} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={defaultYear} />
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </form>
      </Panel>
    </div>
  );
}

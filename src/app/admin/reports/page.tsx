import { Download } from "lucide-react";
import { Button, Field, Input, Panel, Select } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const now = new Date();
  const classes = await prisma.classRoom.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutralText">Xuất báo cáo</h1>
        <p className="mt-1 text-sm text-stone-600">Tải Excel theo lớp hoặc toàn bộ trung tâm trong một tháng.</p>
      </div>

      <Panel>
        <form action="/admin/reports/export" method="GET" className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto]">
          <Field label="Lớp">
            <Select name="classId" defaultValue="">
              <option value="">Tất cả lớp</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={now.getMonth() + 1} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={now.getFullYear()} />
          </Field>
          <Button type="submit" className="self-end">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </form>
      </Panel>
    </div>
  );
}

import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { listClassesForStudent } from "@/modules/center";
import { requireStudent } from "@/modules/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lớp của em" };

export default async function LearnClassesPage() {
  const student = await requireStudent();
  const classes = await listClassesForStudent(student.id);

  return (
    <>
      <PageHeader title="Lớp của em" />
      {classes.length === 0 ? (
        <EmptyState title="Em chưa có lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nếu em đang đi học, báo thầy cô để trung tâm kiểm tra lại.
        </EmptyState>
      ) : (
        <Panel>
          <ul className="divide-y divide-stone-100">
            {classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-neutralText">{c.name}</span>
                  {c.teacherName ? <span className="block text-sm text-stone-500">{c.teacherName}</span> : null}
                </span>
                {c.onLeave ? <Badge tone="neutral">Bảo lưu</Badge> : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

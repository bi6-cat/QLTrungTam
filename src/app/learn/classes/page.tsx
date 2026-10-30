import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Avatar, Card, Chip, EmptyBlock, PageIntro } from "@/components/portal/kit";
import { listClassesForStudent } from "@/modules/center";
import { requireStudent } from "@/modules/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lớp của em" };

export default async function LearnClassesPage() {
  const student = await requireStudent();
  const classes = await listClassesForStudent(student.id);

  return (
    <>
      <PageIntro title="Lớp của em" subtitle={`Em đang học ${classes.length} lớp ở trung tâm.`} />
      {classes.length === 0 ? (
        <EmptyBlock icon={<BookOpen className="h-6 w-6" />} title="Em chưa có lớp nào">
          Nếu em đang đi học, báo thầy cô để trung tâm kiểm tra lại.
        </EmptyBlock>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-sm">
                    {c.shortCode.slice(0, 5)}
                  </span>
                  {c.onLeave ? <Chip tone="amber">Bảo lưu</Chip> : <Chip tone="emerald">Đang học</Chip>}
                </div>
                <p className="text-lg font-bold text-neutralText">{c.name}</p>
                {c.teacherName ? (
                  <div className="mt-auto flex items-center gap-2.5 border-t border-stone-100 pt-3">
                    <Avatar name={c.teacherName} size="sm" />
                    <span className="text-sm text-stone-600">{c.teacherName}</span>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

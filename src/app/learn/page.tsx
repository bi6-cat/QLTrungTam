import type { Metadata } from "next";
import { BookOpen, LogOut } from "lucide-react";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { Badge, Button, EmptyState, Panel } from "@/components/ui";
import { studentLogoutAction } from "@/app/login/actions";
import { listClassesForStudent } from "@/modules/center";
import { requireStudent } from "@/modules/identity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Góc học tập",
  robots: { index: false, follow: false }
};

// Trang đích tạm của cổng học sinh; layout và "Bài cần làm" làm ở bước dựng cổng.
export default async function LearnHomePage() {
  const student = await requireStudent();
  const classes = await listClassesForStudent(student.id);

  return (
    <main className="min-h-screen bg-stone-50">
      <PublicBrandHeader subtitle="Góc học tập" />
      <div className="mx-auto grid max-w-3xl gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutralText">Chào {student.fullName}</h1>
            <p className="text-sm text-stone-500">
              Mã học sinh: <span className="font-mono">{student.code}</span>
            </p>
          </div>
          <form action={studentLogoutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          </form>
        </div>
        <Panel>
          <h2 className="mb-3 text-lg font-bold text-neutralText">Lớp của em</h2>
          {classes.length === 0 ? (
            <EmptyState title="Em chưa có lớp nào" icon={<BookOpen className="h-5 w-5" />}>
              Nếu em đang đi học, báo thầy cô để trung tâm kiểm tra lại.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-medium text-neutralText">{c.name}</span>
                    {c.teacherName ? <span className="block text-sm text-stone-500">{c.teacherName}</span> : null}
                  </span>
                  {c.onLeave ? <Badge tone="neutral">Bảo lưu</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

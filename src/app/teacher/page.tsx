import type { Metadata } from "next";
import { BookOpen, LogOut } from "lucide-react";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { Button, EmptyState, Panel } from "@/components/ui";
import { teacherLogoutAction } from "@/app/login/actions";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cổng giáo viên",
  robots: { index: false, follow: false }
};

// Trang đích tạm của cổng giáo viên; layout và menu đầy đủ làm ở bước dựng cổng.
export default async function TeacherHomePage() {
  const teacher = await requireTeacher();
  const classes = await listClassesForTeacher(teacher.id);

  return (
    <main className="min-h-screen bg-stone-50">
      <PublicBrandHeader subtitle="Cổng giáo viên" />
      <div className="mx-auto grid max-w-3xl gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutralText">Chào {teacher.fullName}</h1>
            <p className="text-sm text-stone-500">Tên đăng nhập: {teacher.username}</p>
          </div>
          <form action={teacherLogoutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          </form>
        </div>
        <Panel>
          <h2 className="mb-3 text-lg font-bold text-neutralText">Lớp của tôi</h2>
          {classes.length === 0 ? (
            <EmptyState title="Chưa được gán lớp nào" icon={<BookOpen className="h-5 w-5" />}>
              Nhờ trung tâm gán lớp cho tài khoản của thầy cô.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium text-neutralText">{c.name}</span>
                  <span className="font-mono text-xs text-stone-500">{c.shortCode}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

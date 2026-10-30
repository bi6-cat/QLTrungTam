import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckCircle2, FolderOpen, Pencil, Plus } from "lucide-react";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireTeacher } from "@/modules/identity";
import { listMaterialsForTeacher } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài liệu" };

const newButton =
  "focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-600 to-primary px-4 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-indigo-900";
const smallLink = "focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-indigo-50";

export default async function TeacherMaterialsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const teacher = await requireTeacher();
  const groups = await listMaterialsForTeacher(teacher.id);
  const teaching = groups.some((g) => g.teaching);
  const saved = (await searchParams).saved === "1";

  return (
    <>
      <PageHeader
        title="Tài liệu"
        description="Đường dẫn và ghi chú chia sẻ cho học sinh trong lớp."
        actions={
          teaching ? (
            <Link href="/teacher/materials/new" className={newButton}>
              <Plus className="h-4 w-4" />
              Thêm tài liệu
            </Link>
          ) : null
        }
      />
      {saved ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Đã lưu tài liệu.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState title="Chưa được gán lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nhờ trung tâm gán lớp cho tài khoản <span className="font-mono">{teacher.username}</span> trước khi đăng tài liệu.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <Panel key={g.classId} className="p-0">
            <div id={`class-${g.classId}`} className="flex scroll-mt-32 flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-neutralText">
                {g.className}
                {g.teaching ? null : <Badge tone="neutral">Không còn dạy</Badge>}
              </h2>
              {g.teaching ? (
                <Link href={`/teacher/materials/new?class=${g.classId}`} className={smallLink}>
                  <Plus className="h-4 w-4" />
                  Thêm
                </Link>
              ) : null}
            </div>
            {g.materials.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-stone-500">
                <FolderOpen className="h-4 w-4" />
                Chưa có tài liệu.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {g.materials.map((m) => (
                  <li key={m.id}>
                    <MaterialCard
                      material={m}
                      actions={
                        <Link href={`/teacher/materials/${m.id}`} className={smallLink}>
                          <Pencil className="h-4 w-4" />
                          Sửa
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))
      )}
    </>
  );
}

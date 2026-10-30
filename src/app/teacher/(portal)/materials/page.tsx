import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckCircle2, FolderOpen, Pencil, Plus } from "lucide-react";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { Chip, EmptyBlock, linkButton, PageIntro } from "@/components/portal/kit";
import { requireTeacher } from "@/modules/identity";
import { listMaterialsForTeacher } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài liệu" };

export default async function TeacherMaterialsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const teacher = await requireTeacher();
  const groups = await listMaterialsForTeacher(teacher.id);
  const teaching = groups.some((g) => g.teaching);
  const saved = (await searchParams).saved === "1";
  const total = groups.reduce((sum, g) => sum + g.materials.length, 0);

  return (
    <>
      <PageIntro
        title="Tài liệu"
        subtitle={`Đường dẫn và ghi chú chia sẻ cho học sinh${total ? ` · ${total} tài liệu` : ""}.`}
        actions={
          teaching ? (
            <Link href="/teacher/materials/new" className={linkButton.primary}>
              <Plus className="h-4 w-4" />
              Thêm tài liệu
            </Link>
          ) : null
        }
      />
      {saved ? (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Đã lưu tài liệu.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <EmptyBlock icon={<BookOpen className="h-6 w-6" />} title="Chưa được gán lớp nào">
          Nhờ trung tâm gán lớp cho tài khoản <span className="font-mono">{teacher.username}</span> trước khi đăng tài liệu.
        </EmptyBlock>
      ) : (
        groups.map((g) => (
          <section key={g.classId} id={`class-${g.classId}`} className="grid scroll-mt-24 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-neutralText">
                {g.className}
                <Chip>{g.materials.length}</Chip>
                {g.teaching ? null : <Chip tone="amber">Không còn dạy</Chip>}
              </h2>
              {g.teaching ? (
                <Link
                  href={`/teacher/materials/new?class=${g.classId}`}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary hover:bg-indigo-50"
                >
                  <Plus className="h-4 w-4" />
                  Thêm vào lớp này
                </Link>
              ) : null}
            </div>
            {g.materials.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-5 text-sm text-stone-500">
                <FolderOpen className="h-4 w-4" />
                Chưa có tài liệu.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.materials.map((m) => (
                  <li key={m.id}>
                    <MaterialCard
                      material={m}
                      actions={
                        <Link
                          href={`/teacher/materials/${m.id}`}
                          aria-label={`Sửa ${m.title}`}
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </>
  );
}

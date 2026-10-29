import type { Metadata } from "next";
import { changeTeacherPasswordAction } from "@/app/teacher/(portal)/account/actions";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { PageHeader, Panel } from "@/components/ui";
import { requireTeacher } from "@/modules/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài khoản" };

export default async function TeacherAccountPage() {
  const teacher = await requireTeacher();
  return (
    <>
      <PageHeader title="Tài khoản" description={`${teacher.fullName} · tên đăng nhập ${teacher.username}`} />
      <Panel>
        <h2 className="mb-4 text-lg font-bold text-neutralText">Đổi mật khẩu</h2>
        <ChangePasswordForm action={changeTeacherPasswordAction} />
      </Panel>
    </>
  );
}

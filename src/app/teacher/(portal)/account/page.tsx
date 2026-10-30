import type { Metadata } from "next";
import { changeTeacherPasswordAction } from "@/app/teacher/(portal)/account/actions";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Avatar, Card, CardHeader, Chip, PageIntro } from "@/components/portal/kit";
import { requireTeacher } from "@/modules/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài khoản" };

export default async function TeacherAccountPage() {
  const teacher = await requireTeacher();
  return (
    <>
      <PageIntro title="Tài khoản" />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center text-center">
          <Avatar name={teacher.fullName} size="xl" />
          <p className="mt-3 text-lg font-bold text-neutralText">{teacher.fullName}</p>
          <p className="font-mono text-sm text-stone-500">{teacher.username}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <Chip tone="indigo">Giáo viên</Chip>
            {teacher.vocabEnabled ? <Chip tone="violet">Kiểm tra từ vựng</Chip> : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Đổi mật khẩu" subtitle="Đổi xong, các thiết bị khác sẽ bị đăng xuất." />
          <ChangePasswordForm action={changeTeacherPasswordAction} />
        </Card>
      </div>
    </>
  );
}

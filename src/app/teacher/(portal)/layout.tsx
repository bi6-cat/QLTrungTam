import type { Metadata } from "next";
import { teacherLogoutAction } from "@/app/login/actions";
import { PortalShell } from "@/components/PortalShell";
import { requireTeacher } from "@/modules/identity";

export const metadata: Metadata = {
  title: { default: "Cổng giáo viên", template: "%s · Cổng giáo viên" },
  robots: { index: false, follow: false }
};

// Layout không phải lớp bảo vệ dữ liệu (Next không chạy lại layout khi chuyển trang): mỗi trang
// và server action vẫn tự gọi requireTeacher().
export default async function TeacherPortalLayout({ children }: { children: React.ReactNode }) {
  const teacher = await requireTeacher();
  return (
    <PortalShell
      portalName="Giáo viên"
      greeting={`Xin chào, ${teacher.fullName}`}
      logoutAction={teacherLogoutAction}
      nav={[
        { href: "/teacher", label: "Lớp của tôi", icon: "classes" },
        { href: "/teacher/assignments", label: "Bài giao", icon: "tasks" },
        { href: "/teacher/vocab", label: "Bộ từ vựng", icon: "vocab" },
        { href: "/teacher/account", label: "Tài khoản", icon: "account" }
      ]}
    >
      {children}
    </PortalShell>
  );
}

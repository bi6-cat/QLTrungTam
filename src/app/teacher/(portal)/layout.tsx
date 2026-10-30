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
      portalName="Cổng giáo viên"
      user={{ name: teacher.fullName, detail: teacher.username }}
      logoutAction={teacherLogoutAction}
      nav={[
        { href: "/teacher", label: "Tổng quan", icon: "home" },
        { href: "/teacher/assignments", label: "Bài tập", icon: "tasks", match: ["/teacher/vocab"] },
        { href: "/teacher/materials", label: "Tài liệu", icon: "materials" },
        { href: "/teacher/account", label: "Tài khoản", icon: "account" }
      ]}
    >
      {children}
    </PortalShell>
  );
}

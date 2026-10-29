import type { Metadata } from "next";
import { studentLogoutAction } from "@/app/login/actions";
import { PortalShell } from "@/components/PortalShell";
import { requireStudent } from "@/modules/identity";

export const metadata: Metadata = {
  title: { default: "Góc học tập", template: "%s · Góc học tập" },
  robots: { index: false, follow: false }
};

// Layout không phải lớp bảo vệ dữ liệu: mỗi trang và server action vẫn tự gọi requireStudent().
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();
  return (
    <PortalShell
      portalName="Học sinh"
      greeting={`Chào ${student.fullName} · mã ${student.code}`}
      logoutAction={studentLogoutAction}
      nav={[
        { href: "/learn", label: "Bài cần làm", icon: "tasks", match: ["/learn/assignments", "/learn/attempts"] },
        { href: "/learn/classes", label: "Lớp của em", icon: "classes" }
      ]}
    >
      {children}
    </PortalShell>
  );
}

import Link from "next/link";
import { ArrowRight, CircleDollarSign, ReceiptText, Users } from "lucide-react";
import { Badge, EmptyState, Panel } from "@/components/ui";
import { getCurrentDashboard } from "@/lib/dashboard";
import { formatCurrency, formatMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const dashboard = await getCurrentDashboard();
  const totalExpected = dashboard.classes.reduce((sum, item) => sum + item.expectedAmount, 0);
  const totalPaid = dashboard.classes.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalRemaining = Math.max(0, totalExpected - totalPaid);
  const totalStudents = dashboard.classes.reduce((sum, item) => sum + item.activeStudents, 0);
  const totalUnpaid = dashboard.classes.reduce((sum, item) => sum + item.unpaidCount, 0);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutralText">Tổng quan {formatMonth(dashboard.month, dashboard.year)}</h1>
        <p className="mt-1 text-sm text-stone-600">Theo dõi thu học phí theo từng lớp trong tháng hiện tại.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Cần nộp</p>
            <CircleDollarSign className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-bold text-primary">{formatCurrency(totalExpected)}</p>
          <p className="mt-1 text-sm text-stone-500">Không tính học sinh bảo lưu</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Đã nộp</p>
            <CircleDollarSign className="h-5 w-5 text-success" />
          </div>
          <p className="mt-3 text-2xl font-bold text-success">{formatCurrency(totalPaid)}</p>
          <p className="mt-1 text-sm text-stone-500">Hóa đơn đã đóng trong tháng</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Còn lại</p>
            <ReceiptText className="h-5 w-5 text-warning" />
          </div>
          <p className="mt-3 text-2xl font-bold text-warning">{formatCurrency(totalRemaining)}</p>
          <p className="mt-1 text-sm text-stone-500">{totalUnpaid} học sinh chưa hoàn tất</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Học sinh đang học</p>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-bold">{totalStudents}</p>
          <p className="mt-1 text-sm text-stone-500">Tính theo từng lớp</p>
        </Panel>
      </div>

      {dashboard.classes.length === 0 ? (
        <EmptyState title="Chưa có lớp học nào">
          <Link href="/admin/classes" className="font-semibold text-primary">
            Tạo lớp đầu tiên
          </Link>
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-stone-200 p-5">
            <h2 className="font-bold">Theo lớp</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Đã đóng</th>
                  <th className="px-4 py-3">Chưa đóng</th>
                  <th className="px-4 py-3">Cần nộp</th>
                  <th className="px-4 py-3">Đã nộp</th>
                  <th className="px-4 py-3">Còn lại</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dashboard.classes.map((classRoom) => (
                  <tr key={classRoom.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{classRoom.name}</div>
                      <div className="text-xs text-stone-500">{classRoom.shortCode}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{classRoom.teacherName || "-"}</td>
                    <td className="px-4 py-3">{classRoom.activeStudents}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{classRoom.paidCount}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={classRoom.unpaidCount > 0 ? "warning" : "neutral"}>{classRoom.unpaidCount}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">{formatCurrency(classRoom.expectedAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-success">{formatCurrency(classRoom.paidAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-warning">{formatCurrency(classRoom.remainingAmount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/classes?classId=${classRoom.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-primary"
                      >
                        Chi tiết
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, CircleDollarSign, ReceiptText, Users, Wallet } from "lucide-react";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { getCurrentDashboard } from "@/lib/dashboard";
import { formatCurrency, formatMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const dashboard = await getCurrentDashboard();
  const totalExpected = dashboard.classes.reduce((sum, item) => sum + item.expectedAmount, 0);
  const totalPaid = dashboard.classes.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalRemaining = dashboard.classes.reduce((sum, item) => sum + item.remainingAmount, 0);
  const totalUnissued = dashboard.classes.reduce((sum, item) => sum + item.unissuedCount, 0);
  const totalStudents = dashboard.classes.reduce((sum, item) => sum + item.activeStudents, 0);
  const totalUnpaid = dashboard.classes.reduce((sum, item) => sum + item.unpaidCount, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Tổng quan ${formatMonth(dashboard.month, dashboard.year)}`}
        description="Theo dõi thu học phí theo từng lớp trong tháng hiện tại."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Đã phát hành"
          tone="primary"
          value={formatCurrency(totalExpected)}
          hint="Chỉ gồm hóa đơn đã đóng và chưa đóng"
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Đã nộp"
          tone="success"
          value={formatCurrency(totalPaid)}
          hint="Hóa đơn đã đóng trong tháng"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Công nợ chưa thu"
          tone="warning"
          value={formatCurrency(totalRemaining)}
          hint={`${totalUnpaid} hóa đơn chưa thanh toán`}
          icon={<ReceiptText className="h-5 w-5" />}
        />
        <StatCard
          label="Học sinh đang học"
          tone="neutral"
          value={totalStudents}
          hint={`${totalUnissued} học sinh đang học chưa phát hành hóa đơn`}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {dashboard.classes.length === 0 ? (
        <EmptyState title="Chưa có lớp học nào" icon={<Users className="h-6 w-6" />}>
          <Link href="/admin/classes" className="font-semibold text-primary hover:underline">
            Tạo lớp đầu tiên
          </Link>
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-stone-200/80 p-5">
            <h2 className="text-base font-bold tracking-tight">Theo lớp</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Đã đóng</th>
                  <th className="px-4 py-3">Chưa đóng</th>
                  <th className="px-4 py-3">Đã phát hành</th>
                  <th className="px-4 py-3">Đã nộp</th>
                  <th className="px-4 py-3">Công nợ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dashboard.classes.map((classRoom) => (
                  <tr key={classRoom.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{classRoom.name}</div>
                      <div className="text-xs text-stone-500">{classRoom.shortCode}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{classRoom.teacherName || "-"}</td>
                    <td className="px-4 py-3">
                      {classRoom.activeStudents}
                      {classRoom.unissuedCount > 0 ? (
                        <div className="text-xs text-amber-700">{classRoom.unissuedCount} chưa phát hành</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="success" dot>{classRoom.paidCount}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={classRoom.unpaidCount > 0 ? "warning" : "neutral"} dot>{classRoom.unpaidCount}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">{formatCurrency(classRoom.expectedAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-success">{formatCurrency(classRoom.paidAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-warning">{formatCurrency(classRoom.remainingAmount)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/classes?classId=${classRoom.id}`}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-primary transition-colors hover:bg-indigo-50"
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

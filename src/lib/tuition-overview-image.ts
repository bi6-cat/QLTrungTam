import { formatCurrency, formatMonth } from "@/lib/format";

// Vẽ ảnh "Tổng quan học phí" của một lớp (chạy trên trình duyệt, dùng canvas).
// Phong cách tối giản: nền trắng, đường kẻ mảnh, một màu nhấn chủ đạo.

export type OverviewImageStatus = "unpaid" | "paid" | "waived" | "void" | "not_created" | "on_leave";

export type OverviewImageRow = {
  studentName: string;
  status: OverviewImageStatus;
  sessions: number;
  pricePerSession: number;
  amount: number;
};

const COLORS = {
  page: "#ffffff",
  ink: "#1c1917",
  body: "#44403c",
  muted: "#78716c",
  faint: "#a8a29e",
  line: "#e7e5e4",
  strongLine: "#1c1917",
  primary: "#3730a3",
  panel: "#fafaf9"
};

const STATUS: Record<OverviewImageStatus, { label: string; dot: string }> = {
  unpaid: { label: "Chưa đóng", dot: "#ea580c" },
  paid: { label: "Đã đóng", dot: "#16a34a" },
  waived: { label: "Miễn học phí", dot: "#3730a3" },
  void: { label: "Đã hủy", dot: "#a8a29e" },
  not_created: { label: "Chưa tạo HĐ", dot: "#a8a29e" },
  on_leave: { label: "Nghỉ học", dot: "#a8a29e" }
};

const WIDTH = 1200;
const SCALE = 2; // ảnh 2400px cho nét khi phóng to trên điện thoại
const PAD = 80;

function pageFontFamily() {
  if (typeof document === "undefined") return "Arial, sans-serif";
  const family = getComputedStyle(document.body).fontFamily;
  return family ? `${family}, Arial, sans-serif` : "Arial, sans-serif";
}

export async function renderTuitionOverviewImage({
  centerName,
  className,
  month,
  year,
  rows
}: {
  centerName: string;
  className: string;
  month: number;
  year: number;
  rows: OverviewImageRow[];
}): Promise<Blob> {
  const family = pageFontFamily();
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  // Font web chỉ tải khi được dùng: nạp trước các độ đậm để canvas không vẽ bằng font dự phòng.
  await Promise.all(
    [400, 500, 600, 700].map((weight) => document.fonts?.load(font(weight, 20), "Học phí Tháng ₫").catch(() => undefined))
  );
  await document.fonts?.ready;

  const headerHeight = 300;
  const statsHeight = 150;
  const tableHeadHeight = 56;
  const rowHeight = 64;
  const totalHeight = 84;
  const footerHeight = 110;
  const bodyRows = Math.max(rows.length, 1);
  const height = headerHeight + statsHeight + tableHeadHeight + bodyRows * rowHeight + totalHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ tạo ảnh.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  const setSpacing = (px: number) => {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  };
  const text = (value: string, x: number, y: number, opts: { maxWidth?: number; align?: CanvasTextAlign } = {}) => {
    ctx.textAlign = opts.align ?? "left";
    let shown = value;
    if (opts.maxWidth && ctx.measureText(shown).width > opts.maxWidth) {
      while (shown.length > 1 && ctx.measureText(`${shown}…`).width > opts.maxWidth) shown = shown.slice(0, -1);
      shown = `${shown}…`;
    }
    ctx.fillText(shown, x, y);
    return ctx.measureText(shown).width;
  };
  const hline = (y: number, color: string, widthPx = 1, x1 = PAD, x2 = WIDTH - PAD) => {
    ctx.fillStyle = color;
    ctx.fillRect(x1, y, x2 - x1, widthPx);
  };

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, WIDTH, height);
  // Vạch màu chủ đạo trên cùng.
  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(0, 0, WIDTH, 8);

  // --- Tiêu đề ---
  ctx.fillStyle = COLORS.primary;
  ctx.font = font(700, 18);
  setSpacing(4);
  text(centerName.toUpperCase(), PAD, 82);
  setSpacing(0);

  ctx.fillStyle = COLORS.ink;
  ctx.font = font(700, 58);
  text(className, PAD, 168, { maxWidth: WIDTH - PAD * 2 });

  ctx.font = font(500, 32);
  ctx.fillStyle = COLORS.body;
  const subtitle = "Tổng quan học phí";
  const subtitleWidth = text(subtitle, PAD, 228);
  ctx.fillStyle = COLORS.faint;
  const dotWidth = text("  ·  ", PAD + subtitleWidth, 228);
  ctx.fillStyle = COLORS.primary;
  ctx.font = font(700, 32);
  text(formatMonth(month, year), PAD + subtitleWidth + dotWidth, 228);

  hline(headerHeight - 28, COLORS.line);

  // --- Số liệu tóm tắt ---
  const paid = rows.filter((row) => row.status === "paid");
  const unpaid = rows.filter((row) => row.status === "unpaid");
  const billed = rows.filter((row) => row.status === "paid" || row.status === "unpaid");
  const stats = [
    { label: "Học sinh", value: String(rows.length) },
    { label: "Đã đóng", value: String(paid.length) },
    { label: "Chưa đóng", value: String(unpaid.length) },
    { label: "Tổng học phí", value: formatCurrency(billed.reduce((sum, row) => sum + row.amount, 0)) }
  ];
  const statsTop = headerHeight;
  const colWidth = (WIDTH - PAD * 2) / stats.length;
  stats.forEach((stat, index) => {
    const x = PAD + index * colWidth;
    if (index > 0) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(x - 24, statsTop + 18, 1, 78);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(500, 17);
    setSpacing(1);
    text(stat.label.toUpperCase(), x, statsTop + 42);
    setSpacing(0);
    ctx.fillStyle = index === 2 && unpaid.length > 0 ? "#c2410c" : COLORS.ink;
    ctx.font = font(700, 36);
    text(stat.value, x, statsTop + 92, { maxWidth: colWidth - 40 });
  });

  // --- Bảng ---
  const left = PAD;
  const right = WIDTH - PAD;
  const col = {
    order: left,
    student: left + 64,
    status: left + 470,
    sessions: left + 760,
    price: left + 900,
    amount: right
  };
  const headTop = headerHeight + statsHeight;
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(600, 15);
  setSpacing(1.5);
  const headY = headTop + 34;
  text("STT", col.order, headY);
  text("HỌC SINH", col.student, headY);
  text("TRẠNG THÁI", col.status, headY);
  text("BUỔI", col.sessions, headY, { align: "right" });
  text("ĐƠN GIÁ", col.price, headY, { align: "right" });
  text("SỐ TIỀN", col.amount, headY, { align: "right" });
  setSpacing(0);
  hline(headTop + tableHeadHeight - 2, COLORS.strongLine, 2);

  const bodyTop = headTop + tableHeadHeight;
  if (rows.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = font(500, 21);
    text("Chưa có học sinh trong tháng này", col.student, bodyTop + 40);
  }
  rows.forEach((row, index) => {
    const top = bodyTop + index * rowHeight;
    const y = top + 40;
    ctx.fillStyle = COLORS.faint;
    ctx.font = font(500, 19);
    text(String(index + 1).padStart(2, "0"), col.order, y);

    ctx.fillStyle = COLORS.ink;
    ctx.font = font(600, 22);
    text(row.studentName, col.student, y, { maxWidth: col.status - col.student - 30 });

    const meta = STATUS[row.status];
    ctx.fillStyle = meta.dot;
    ctx.beginPath();
    ctx.arc(col.status + 5, y - 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.body;
    ctx.font = font(500, 19);
    text(meta.label, col.status + 20, y, { maxWidth: col.sessions - col.status - 90 });

    ctx.fillStyle = COLORS.body;
    ctx.font = font(500, 20);
    text(String(row.sessions), col.sessions, y, { align: "right" });
    text(formatCurrency(row.pricePerSession), col.price, y, { align: "right" });
    ctx.fillStyle = COLORS.ink;
    ctx.font = font(700, 20);
    text(formatCurrency(row.amount), col.amount, y, { align: "right" });

    if (index < rows.length - 1) hline(top + rowHeight - 1, COLORS.line);
  });

  // --- Tổng cộng ---
  const totalTop = bodyTop + bodyRows * rowHeight;
  hline(totalTop, COLORS.strongLine, 2);
  ctx.fillStyle = COLORS.body;
  ctx.font = font(600, 21);
  text(`Tổng cộng · ${rows.length} học sinh`, col.student, totalTop + 52);
  ctx.fillStyle = COLORS.ink;
  ctx.font = font(700, 24);
  text(formatCurrency(billed.reduce((sum, row) => sum + row.amount, 0)), col.amount, totalTop + 52, { align: "right" });

  // --- Chân trang ---
  const footerY = height - 48;
  hline(footerY - 40, COLORS.line);
  ctx.fillStyle = COLORS.faint;
  ctx.font = font(400, 16);
  text(`Xuất từ hệ thống quản lý ${centerName}`, PAD, footerY);
  text(`Ngày xuất ${new Date().toLocaleDateString("vi-VN")}`, WIDTH - PAD, footerY, { align: "right" });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Không thể tạo file ảnh.");
  return blob;
}

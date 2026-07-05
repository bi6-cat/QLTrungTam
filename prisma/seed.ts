import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { buildMemo } from "../src/lib/payment";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// PRNG xác định (deterministic) để mỗi lần seed cho ra cùng bộ dữ liệu demo.
// ---------------------------------------------------------------------------
let seedState = 987654321;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function chance(p: number) {
  return rand() < p;
}

// ---------------------------------------------------------------------------
// Dữ liệu nguồn để ghép tên tiếng Việt.
// ---------------------------------------------------------------------------
const surnames = [
  "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ",
  "Đặng", "Bùi", "Đỗ", "Ngô", "Dương", "Lý", "Hồ", "Đinh"
];
const middleMale = ["Văn", "Hữu", "Đức", "Quốc", "Minh", "Gia", "Anh", "Thành", "Công", "Xuân"];
const middleFemale = ["Thị", "Ngọc", "Thu", "Thanh", "Gia", "Khánh", "Phương", "Hải", "Diệu", "Bảo"];
const givenMale = ["An", "Bảo", "Khoa", "Khánh", "Duy", "Phúc", "Hưng", "Nam", "Sơn", "Tuấn", "Kiệt", "Long", "Đạt", "Huy", "Trí"];
const givenFemale = ["Anh", "Chi", "Dung", "Hà", "Hương", "Linh", "My", "Ngân", "Nhi", "Quỳnh", "Trang", "Vy", "Yến", "Thảo", "Uyên"];
const districts = [
  "Quận 1, TP.HCM", "Quận 3, TP.HCM", "Quận 5, TP.HCM", "Quận 7, TP.HCM",
  "Quận 10, TP.HCM", "Bình Thạnh, TP.HCM", "Gò Vấp, TP.HCM", "Tân Bình, TP.HCM",
  "TP. Thủ Đức", "Phú Nhuận, TP.HCM"
];
const notes = ["Học đều", "Hay quên bài", "Cần kèm thêm", "Tiếp thu nhanh", "Ít phát biểu", null, null, null];

// ---------------------------------------------------------------------------
// 7 lớp với môn/giá/số buổi khác nhau để phủ nhiều trường hợp học phí.
// ---------------------------------------------------------------------------
const classSeed = [
  { id: "cls-l10a", name: "Lớp 10A - Toán", shortCode: "L10A", teacherName: "Cô Hạnh", pricePerSession: 150000, sessionsPerMonthDefault: 8 },
  { id: "cls-l10v", name: "Lớp 10V - Ngữ Văn", shortCode: "L10V", teacherName: "Cô Lan", pricePerSession: 130000, sessionsPerMonthDefault: 8 },
  { id: "cls-l11l", name: "Lớp 11L - Vật Lý", shortCode: "L11L", teacherName: "Thầy Minh", pricePerSession: 170000, sessionsPerMonthDefault: 8 },
  { id: "cls-l11h", name: "Lớp 11H - Hóa Học", shortCode: "L11H", teacherName: "Thầy Sơn", pricePerSession: 170000, sessionsPerMonthDefault: 8 },
  { id: "cls-l12t", name: "Lớp 12T - Toán LTĐH", shortCode: "L12T", teacherName: "Thầy Khoa", pricePerSession: 200000, sessionsPerMonthDefault: 10 },
  { id: "cls-l9a", name: "Lớp 9A - Toán ôn thi", shortCode: "L9A", teacherName: "Cô Thu", pricePerSession: 140000, sessionsPerMonthDefault: 12 },
  { id: "cls-ena2", name: "Tiếng Anh A2", shortCode: "ENA2", teacherName: "Cô Trang", pricePerSession: 120000, sessionsPerMonthDefault: 10 }
];

const STUDENT_COUNT = 120;
const PER_CLASS = 20;

type StudentSeed = {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  parentName: string | null;
  note: string | null;
};

function buildStudents(): StudentSeed[] {
  const students: StudentSeed[] = [];
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const male = chance(0.5);
    const surname = pick(surnames);
    const middle = male ? pick(middleMale) : pick(middleFemale);
    const given = male ? pick(givenMale) : pick(givenFemale);
    const parentSurname = pick(surnames);
    students.push({
      id: `stu-${String(i).padStart(3, "0")}`,
      fullName: `${surname} ${middle} ${given}`,
      phone: `09${String(i).padStart(8, "0")}`,
      address: pick(districts),
      parentName: chance(0.85)
        ? `${parentSurname} ${male ? "Văn" : "Thị"} ${pick(male ? givenMale : givenFemale)}`
        : null,
      note: pick(notes)
    });
  }
  return students;
}

type EnrollmentSeed = {
  id: string;
  studentId: string;
  classId: string;
  shortCode: string;
  phone: string;
  pricePerSession: number;
  defaultSessions: number;
  sessionsOverride: number | null;
  status: "active" | "on_leave";
};

function buildEnrollments(students: StudentSeed[]): EnrollmentSeed[] {
  const enrollments: EnrollmentSeed[] = [];
  let seq = 0;
  classSeed.forEach((cls, classIndex) => {
    // Offset lệch nhau để tạo overlap (một số HS học nhiều lớp) nhưng vẫn
    // đảm bảo 20 HS trong 1 lớp là khác nhau.
    const start = (classIndex * 17) % STUDENT_COUNT;
    for (let k = 0; k < PER_CLASS; k++) {
      const student = students[(start + k) % STUDENT_COUNT];
      seq += 1;
      const onLeave = chance(0.1);
      enrollments.push({
        id: `enr-${String(seq).padStart(4, "0")}`,
        studentId: student.id,
        classId: cls.id,
        shortCode: cls.shortCode,
        phone: student.phone,
        pricePerSession: cls.pricePerSession,
        defaultSessions: cls.sessionsPerMonthDefault,
        sessionsOverride: !onLeave && chance(0.2) ? pick([4, 6, 10, 12]) : null,
        status: onLeave ? "on_leave" : "active"
      });
    }
  });
  return enrollments;
}

async function main() {
  // -------------------------------------------------------------------------
  // 1. Xoá sạch dữ liệu demo cũ (giữ AdminUser + AppSetting).
  //    Thứ tự an toàn với ràng buộc khoá ngoại (kể cả FK vòng invoice<->transaction).
  // -------------------------------------------------------------------------
  await prisma.monthlyInvoice.updateMany({ data: { transactionId: null } });
  await prisma.transaction.deleteMany({});
  await prisma.monthlyInvoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.classRoom.deleteMany({});

  // -------------------------------------------------------------------------
  // 2. Admin + cấu hình ứng dụng.
  // -------------------------------------------------------------------------
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  const passwordHash =
    configuredHash && configuredHash.length > 0
      ? configuredHash
      : hashPassword(process.env.ADMIN_PASSWORD || "admin123");

  await prisma.adminUser.upsert({
    where: { username: adminUsername },
    update: { passwordHash },
    create: { username: adminUsername, passwordHash }
  });

  const settings = {
    SEPAY_API_KEY: process.env.SEPAY_API_KEY || "",
    SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET || "",
    BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER || "19000000000000",
    BANK_ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || "APLUS ACADEMY",
    BANK_BIN: process.env.BANK_BIN || "970407",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // -------------------------------------------------------------------------
  // 3. Lớp, học sinh, ghi danh.
  // -------------------------------------------------------------------------
  const students = buildStudents();
  const enrollments = buildEnrollments(students);

  await prisma.classRoom.createMany({
    data: classSeed.map((c) => ({
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
      teacherName: c.teacherName,
      pricePerSession: c.pricePerSession,
      sessionsPerMonthDefault: c.sessionsPerMonthDefault
    }))
  });

  await prisma.student.createMany({
    data: students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      address: s.address,
      parentName: s.parentName,
      note: s.note
    }))
  });

  await prisma.enrollment.createMany({
    data: enrollments.map((e) => ({
      id: e.id,
      studentId: e.studentId,
      classId: e.classId,
      sessionsOverride: e.sessionsOverride,
      status: e.status
    }))
  });

  // -------------------------------------------------------------------------
  // 4. Hoá đơn + giao dịch (phủ mọi trạng thái).
  // -------------------------------------------------------------------------
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const counters = {
    unpaid: 0,
    paidTransfer: 0,
    paidCash: 0,
    noInvoice: 0,
    onLeave: 0,
    prevInvoices: 0,
    unmatchedTx: 0
  };
  let txSeq = 0;

  // Lưu lại một số hoá đơn để tạo giao dịch "chưa khớp" tham chiếu tới memo thật.
  const currentInvoiceRefs: { memo: string; amount: number; shortCode: string; phone: string }[] = [];

  async function createInvoice(
    enrollment: EnrollmentSeed,
    m: number,
    y: number,
    opts: { transferredAtDay: number }
  ) {
    const sessions = enrollment.sessionsOverride ?? enrollment.defaultSessions;
    const amount = sessions * enrollment.pricePerSession;
    const memo = buildMemo(enrollment.shortCode, enrollment.phone, m);
    const invoice = await prisma.monthlyInvoice.create({
      data: {
        enrollmentId: enrollment.id,
        month: m,
        year: y,
        sessions,
        pricePerSession: enrollment.pricePerSession,
        amount,
        memoContent: memo
      }
    });
    return { invoice, amount, memo };
  }

  async function payByTransfer(invoiceId: string, amount: number, memo: string, m: number, y: number, day: number) {
    txSeq += 1;
    const transferredAt = new Date(y, m - 1, Math.min(28, Math.max(1, day)), 9, 0, 0);
    const transaction = await prisma.transaction.create({
      data: {
        gatewayRef: `TF-${y}${String(m).padStart(2, "0")}-${String(txSeq).padStart(5, "0")}`,
        amount,
        rawContent: memo,
        transferredAt,
        matchedInvoiceId: invoiceId,
        rawPayload: { source: "sepay", gateway: "VCB", content: memo, transferAmount: amount }
      }
    });
    await prisma.monthlyInvoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: transferredAt, transactionId: transaction.id }
    });
  }

  async function payByCash(invoiceId: string, amount: number, studentName: string, shortCode: string, m: number, y: number, day: number) {
    const paidAt = new Date(y, m - 1, Math.min(28, Math.max(1, day)), 17, 30, 0);
    const transaction = await prisma.transaction.create({
      data: {
        gatewayRef: `CASH-${invoiceId}-${paidAt.getTime()}`,
        amount,
        rawContent: `Thu tiền mặt: ${studentName} - ${shortCode} - T${m}/${y}`,
        transferredAt: paidAt,
        matchedInvoiceId: invoiceId,
        rawPayload: { method: "cash", source: "admin_manual", invoiceId }
      }
    });
    await prisma.monthlyInvoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt, transactionId: transaction.id }
    });
  }

  const studentById = new Map(students.map((s) => [s.id, s]));

  for (const enrollment of enrollments) {
    const studentName = studentById.get(enrollment.studentId)?.fullName ?? "Học sinh";

    // Bảo lưu: bỏ qua hoá đơn (giống hành vi app khi generate).
    if (enrollment.status === "on_leave") {
      counters.onLeave += 1;
      continue;
    }

    // ~15% chưa có hoá đơn -> test trạng thái "Chưa tạo".
    if (chance(0.15)) {
      counters.noInvoice += 1;
      continue;
    }

    const day = 1 + Math.floor(rand() * 27);
    const { invoice, amount, memo } = await createInvoice(enrollment, month, year, { transferredAtDay: day });
    currentInvoiceRefs.push({ memo, amount, shortCode: enrollment.shortCode, phone: enrollment.phone });

    const roll = rand();
    if (roll < 0.45) {
      counters.unpaid += 1; // chưa đóng
    } else if (roll < 0.78) {
      await payByTransfer(invoice.id, amount, memo, month, year, day);
      counters.paidTransfer += 1;
    } else {
      await payByCash(invoice.id, amount, studentName, enrollment.shortCode, month, year, day);
      counters.paidCash += 1;
    }

    // Hoá đơn tháng trước cho ~45% HS -> test điều hướng tháng + lịch sử.
    if (chance(0.45)) {
      const prevDay = 1 + Math.floor(rand() * 27);
      const prev = await createInvoice(enrollment, prevMonth, prevYear, { transferredAtDay: prevDay });
      counters.prevInvoices += 1;
      // Đa số tháng trước đã đóng; một ít vẫn nợ.
      if (chance(0.85)) {
        if (chance(0.5)) {
          await payByTransfer(prev.invoice.id, prev.amount, prev.memo, prevMonth, prevYear, prevDay);
        } else {
          await payByCash(prev.invoice.id, prev.amount, studentName, enrollment.shortCode, prevMonth, prevYear, prevDay);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Giao dịch CHƯA KHỚP -> test màn "Giao dịch chưa khớp" + gán thủ công.
  // -------------------------------------------------------------------------
  async function createUnmatched(rawContent: string, amount: number, day: number) {
    txSeq += 1;
    counters.unmatchedTx += 1;
    await prisma.transaction.create({
      data: {
        gatewayRef: `TF-${year}${String(month).padStart(2, "0")}-U${String(txSeq).padStart(5, "0")}`,
        amount,
        rawContent,
        transferredAt: new Date(year, month - 1, Math.min(28, Math.max(1, day)), 10, 15, 0),
        matchedInvoiceId: null,
        rawPayload: { source: "sepay", gateway: "MB", content: rawContent, transferAmount: amount }
      }
    });
  }

  // 5a. Sai cú pháp memo hoàn toàn.
  await createUnmatched("CK MB CHUYEN TIEN HOC PHI THANG NAY", 1200000, 3);
  await createUnmatched("NGUYEN VAN A chuyen khoan", 850000, 7);
  await createUnmatched("THANH TOAN QR 0908", 990000, 12);

  // 5b. Memo đúng nhưng LỆCH SỐ TIỀN (không tự khớp được).
  for (const ref of currentInvoiceRefs.slice(0, 3)) {
    await createUnmatched(ref.memo, ref.amount + 50000, 15);
  }

  // 5c. Memo đúng cú pháp nhưng KHÔNG có hoá đơn tương ứng (SĐT lạ).
  await createUnmatched(buildMemo("L10A", "0900999888", month), 1200000, 18);
  await createUnmatched(buildMemo("ENA2", "0900777666", month), 1200000, 20);

  // -------------------------------------------------------------------------
  // 6. Tổng kết.
  // -------------------------------------------------------------------------
  const totalStudents = await prisma.student.count();
  const totalClasses = await prisma.classRoom.count();
  const totalEnrollments = await prisma.enrollment.count();
  const totalInvoices = await prisma.monthlyInvoice.count();
  const totalTransactions = await prisma.transaction.count();

  console.log("✅ Seed demo hoàn tất:");
  console.log(`   Lớp: ${totalClasses} | Học sinh: ${totalStudents} | Ghi danh: ${totalEnrollments}`);
  console.log(`   Hoá đơn: ${totalInvoices} | Giao dịch: ${totalTransactions}`);
  console.log("   Chi tiết tháng hiện tại:");
  console.log(`     - Chưa đóng:            ${counters.unpaid}`);
  console.log(`     - Đã đóng (chuyển khoản): ${counters.paidTransfer}`);
  console.log(`     - Đã đóng (tiền mặt):     ${counters.paidCash}`);
  console.log(`     - Chưa tạo hoá đơn:       ${counters.noInvoice}`);
  console.log(`     - Bảo lưu:                ${counters.onLeave}`);
  console.log(`   Hoá đơn tháng trước: ${counters.prevInvoices}`);
  console.log(`   Giao dịch chưa khớp: ${counters.unmatchedTx}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { buildMemo } from "../src/lib/payment";

const prisma = new PrismaClient();

async function main() {
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
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value }
    });
  }

  const classes = await Promise.all([
    prisma.classRoom.upsert({
      where: { shortCode: "L10A" },
      update: {
        name: "Lớp 10A - Toán",
        teacherName: "Cô Hạnh"
      },
      create: {
        name: "Lớp 10A - Toán",
        shortCode: "L10A",
        teacherName: "Cô Hạnh",
        pricePerSession: 150000,
        sessionsPerMonthDefault: 8
      }
    }),
    prisma.classRoom.upsert({
      where: { shortCode: "L11B" },
      update: {
        name: "Lớp 11B - Lý",
        teacherName: "Thầy Minh"
      },
      create: {
        name: "Lớp 11B - Lý",
        shortCode: "L11B",
        teacherName: "Thầy Minh",
        pricePerSession: 170000,
        sessionsPerMonthDefault: 8
      }
    }),
    prisma.classRoom.upsert({
      where: { shortCode: "A2" },
      update: {
        name: "Tiếng Anh A2",
        teacherName: "Cô Trang"
      },
      create: {
        name: "Tiếng Anh A2",
        shortCode: "A2",
        teacherName: "Cô Trang",
        pricePerSession: 120000,
        sessionsPerMonthDefault: 10
      }
    })
  ]);

  const students = await Promise.all([
    prisma.student.upsert({
      where: { id: "seed-student-an" },
      update: {
        fullName: "Nguyễn Minh An",
        parentName: "Nguyễn Văn Bình",
        address: "Quận 3, TP.HCM",
        note: "Học đều"
      },
      create: {
        id: "seed-student-an",
        fullName: "Nguyễn Minh An",
        phone: "0912345678",
        address: "Quận 3, TP.HCM",
        parentName: "Nguyễn Văn Bình",
        note: "Học đều"
      }
    }),
    prisma.student.upsert({
      where: { id: "seed-student-linh" },
      update: {
        fullName: "Trần Gia Linh",
        parentName: "Trần Thị Mai",
        address: "Quận 10, TP.HCM"
      },
      create: {
        id: "seed-student-linh",
        fullName: "Trần Gia Linh",
        phone: "0987654321",
        address: "Quận 10, TP.HCM",
        parentName: "Trần Thị Mai",
        note: ""
      }
    }),
    prisma.student.upsert({
      where: { id: "seed-student-khoa" },
      update: {
        fullName: "Lê Anh Khoa",
        parentName: "Lê Quang Huy",
        address: "Bình Thạnh, TP.HCM",
        note: "Bảo lưu tháng này"
      },
      create: {
        id: "seed-student-khoa",
        fullName: "Lê Anh Khoa",
        phone: "0901122334",
        address: "Bình Thạnh, TP.HCM",
        parentName: "Lê Quang Huy",
        note: "Bảo lưu tháng này"
      }
    })
  ]);

  const enrollments = await Promise.all([
    prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: students[0].id, classId: classes[0].id } },
      update: {},
      create: { studentId: students[0].id, classId: classes[0].id, status: "active" }
    }),
    prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: students[1].id, classId: classes[0].id } },
      update: {},
      create: { studentId: students[1].id, classId: classes[0].id, sessionsOverride: 6, status: "active" }
    }),
    prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: students[2].id, classId: classes[1].id } },
      update: {},
      create: { studentId: students[2].id, classId: classes[1].id, status: "on_leave" }
    }),
    prisma.enrollment.upsert({
      where: { studentId_classId: { studentId: students[0].id, classId: classes[2].id } },
      update: {},
      create: { studentId: students[0].id, classId: classes[2].id, status: "active" }
    })
  ]);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  for (const enrollment of enrollments.filter((item) => item.status === "active")) {
    const full = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
      include: { student: true, classRoom: true }
    });
    const sessions = full.sessionsOverride ?? full.classRoom.sessionsPerMonthDefault;
    await prisma.monthlyInvoice.upsert({
      where: { enrollmentId_month_year: { enrollmentId: full.id, month, year } },
      update: {},
      create: {
        enrollmentId: full.id,
        month,
        year,
        sessions,
        pricePerSession: full.classRoom.pricePerSession,
        amount: sessions * full.classRoom.pricePerSession,
        memoContent: buildMemo(full.classRoom.shortCode, full.student.phone, month)
      }
    });
  }
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

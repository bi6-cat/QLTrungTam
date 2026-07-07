"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { StudentEnrollmentPicker } from "@/components/StudentEnrollmentPicker";

type StudentOption = {
  id: string;
  fullName: string;
  phone: string;
};

export function AddStudentToClassButton({
  classId,
  students
}: {
  classId: string;
  students: StudentOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Thêm học sinh
      </Button>
      {open ? (
        <Modal title="Thêm học sinh vào lớp" onClose={() => setOpen(false)}>
          <p className="text-sm text-stone-500">Tìm theo tên hoặc số điện thoại rồi chọn học sinh cần thêm.</p>
          <StudentEnrollmentPicker classId={classId} students={students} onSuccess={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  );
}

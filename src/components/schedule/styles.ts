import type { CalendarStatus } from "@/lib/class-sessions";

/** Màu nhận diện lớp (chấm nhỏ cạnh tên lớp), xoay vòng theo thứ tự lớp. */
export const CLASS_DOTS = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-lime-600",
  "bg-orange-500",
  "bg-cyan-600",
  "bg-pink-500",
  "bg-violet-500"
];

export function classDot(index: number) {
  return CLASS_DOTS[index % CLASS_DOTS.length];
}

export const STATUS_STYLE: Record<CalendarStatus, { label: string; card: string; chip: string; cell: string }> = {
  held: {
    label: "Đã học",
    card: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70",
    chip: "bg-emerald-100 text-emerald-800",
    cell: "bg-emerald-500"
  },
  cancelled: {
    label: "Lớp nghỉ",
    card: "border-rose-200 bg-rose-50 hover:bg-rose-100/70",
    chip: "bg-rose-100 text-rose-800",
    cell: "bg-rose-500"
  },
  makeup: {
    label: "Học bù",
    card: "border-violet-200 bg-violet-50 hover:bg-violet-100/70",
    chip: "bg-violet-100 text-violet-800",
    cell: "bg-violet-500"
  },
  pending: {
    label: "Chưa điểm danh",
    card: "border-amber-300 bg-amber-50 hover:bg-amber-100/70",
    chip: "bg-amber-100 text-amber-800",
    cell: "bg-amber-400"
  },
  upcoming: {
    label: "Sắp tới",
    card: "border-stone-200 bg-white hover:bg-stone-50",
    chip: "bg-stone-100 text-stone-600",
    cell: "bg-stone-300"
  }
};

export const CANCEL_REASONS = ["GV bận", "Nghỉ lễ", "Thời tiết", "Lớp đi thi", "Mất điện"];

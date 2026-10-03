/**
 * Ngày chốt lương: học phí nộp đến hết ngày chốt của tháng T được tính vào lương tháng T; nộp
 * sau ngày đó (nộp muộn) thì tính vào lương của tháng kế tiếp còn chưa chốt.
 *
 * Mã lưu trong DB/cài đặt: "same:<ngày>" (ngày trong chính tháng đó) hoặc "next:<ngày>" (ngày
 * của tháng sau). Ngày 31 nghĩa là cuối tháng (tháng ngắn hơn thì lấy ngày cuối cùng).
 */

export type SalaryCutoff = { nextMonth: boolean; day: number };

export const SALARY_CUTOFF_SETTING_KEY = "SALARY_CUTOFF";
export const DEFAULT_SALARY_CUTOFF_CODE = "same:31";
export const SALARY_CUTOFF_PATTERN = /^(same|next):([1-9]|[12]\d|3[01])$/;

export function parseSalaryCutoff(code: string | null | undefined): SalaryCutoff | null {
  const match = SALARY_CUTOFF_PATTERN.exec((code ?? "").trim());
  if (!match) return null;
  return { nextMonth: match[1] === "next", day: Number(match[2]) };
}

export const DEFAULT_SALARY_CUTOFF = parseSalaryCutoff(DEFAULT_SALARY_CUTOFF_CODE) as SalaryCutoff;

function cutoffDay(cutoff: SalaryCutoff, index: number) {
  const target = index + (cutoff.nextMonth ? 1 : 0);
  const year = Math.floor(target / 12);
  const month = target % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { year, month, day: Math.min(cutoff.day, lastDay) };
}

/** Ngày chốt lương của tháng lương `index` (periodIndex), 0h theo giờ máy chủ — để hiển thị. */
export function salaryCutoffDate(cutoff: SalaryCutoff, index: number) {
  const { year, month, day } = cutoffDay(cutoff, index);
  return new Date(year, month, day);
}

/** Mốc ngay sau ngày chốt: tiền nộp TRƯỚC mốc này mới tính vào lương tháng `index`. */
export function salaryCutoffEnd(cutoff: SalaryCutoff, index: number) {
  const { year, month, day } = cutoffDay(cutoff, index);
  return new Date(year, month, day + 1);
}

/** Ngày chốt thực tế của từng tháng lương: theo quy tắc, trừ các tháng được đặt riêng một ngày. */
export type CutoffResolver = {
  date(index: number): Date;
  end(index: number): Date;
  overridden(index: number): boolean;
};

/** `overrides`: periodIndex → 0h của ngày chốt đặt riêng cho tháng đó. */
export function cutoffResolver(rule: SalaryCutoff, overrides?: ReadonlyMap<number, Date>): CutoffResolver {
  return {
    date: (index) => overrides?.get(index) ?? salaryCutoffDate(rule, index),
    end: (index) => {
      const day = overrides?.get(index);
      return day ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) : salaryCutoffEnd(rule, index);
    },
    overridden: (index) => overrides?.has(index) ?? false
  };
}

/**
 * "Dư nợ" là tiền học sinh đóng sau ngày tính lương. Tháng nào chuyển lương MUỘN hơn ngày chốt
 * (vd lớp mới thu học phí tháng 8 vào tháng 9 rồi mới trả lương ngày 30/9) thì ngày chốt lùi tới
 * ngày chuyển lương đầu tiên của tháng đó; chuyển sớm hơn thì vẫn giữ ngày chốt.
 */
export function withPayoutDates(
  base: CutoffResolver,
  firstPayoutAt: (index: number) => Date | null
): CutoffResolver & { fromPayout(index: number): boolean } {
  const payoutDay = (index: number) => {
    const at = firstPayoutAt(index);
    return at ? new Date(at.getFullYear(), at.getMonth(), at.getDate()) : null;
  };
  const fromPayout = (index: number) => {
    const day = payoutDay(index);
    return day !== null && day.getTime() > base.date(index).getTime();
  };
  return {
    date: (index) => (fromPayout(index) ? (payoutDay(index) as Date) : base.date(index)),
    end: (index) => {
      if (!fromPayout(index)) return base.end(index);
      const day = payoutDay(index) as Date;
      return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    },
    overridden: base.overridden,
    fromPayout
  };
}

/** Tháng lương (periodIndex) mà khoản học phí của kỳ `tuitionIndex`, nộp lúc `paidAt`, được tính vào. */
export function salaryIndexForPayment(tuitionIndex: number, paidAt: Date, cutoff: SalaryCutoff | CutoffResolver) {
  const resolver = "end" in cutoff ? cutoff : cutoffResolver(cutoff);
  let index = tuitionIndex;
  // Chặn vòng lặp với dữ liệu bất thường (nộp muộn quá 20 năm).
  for (let guard = 0; guard < 240 && paidAt.getTime() >= resolver.end(index).getTime(); guard += 1) {
    index += 1;
  }
  return index;
}

export function describeSalaryCutoff(cutoff: SalaryCutoff) {
  if (cutoff.day >= 31) return cutoff.nextMonth ? "cuối tháng sau" : "cuối tháng";
  return cutoff.nextMonth ? `ngày ${cutoff.day} tháng sau` : `ngày ${cutoff.day} trong tháng`;
}

/** Lựa chọn cho ô chọn ngày chốt (nhóm theo tháng). */
export const SALARY_CUTOFF_OPTIONS: Array<{ group: string; options: Array<{ value: string; label: string }> }> = [
  {
    group: "Trong chính tháng đó",
    options: [
      { value: "same:31", label: "Cuối tháng" },
      ...Array.from({ length: 21 }, (_, index) => 30 - index).map((day) => ({
        value: `same:${day}`,
        label: `Ngày ${day}`
      }))
    ]
  },
  {
    group: "Sang tháng sau",
    options: Array.from({ length: 15 }, (_, index) => index + 1).map((day) => ({
      value: `next:${day}`,
      label: `Ngày ${day} tháng sau`
    }))
  }
];

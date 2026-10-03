"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui";

const numberFormat = new Intl.NumberFormat("vi-VN");

function toText(value: number | null) {
  if (value === null) return "";
  return value < 0 ? `-${numberFormat.format(-value)}` : numberFormat.format(value);
}

function parseText(text: string, allowNegative: boolean) {
  const negative = allowNegative && text.trim().startsWith("-");
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
  return { negative, digits, value: digits ? Number(digits) * (negative ? -1 : 1) : null };
}

/**
 * Ô nhập số tiền tự thêm dấu chấm phân cách hàng nghìn khi gõ (4500000 → 4.500.000).
 * Có `name` thì gửi kèm số thô qua input ẩn để server action đọc như ô number bình thường.
 * Dùng kiểu điều khiển (`value` + `onValueChange`) hoặc tự quản (`defaultValue`).
 */
export function MoneyInput({
  name,
  value,
  defaultValue = null,
  onValueChange,
  allowNegative = false,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "name" | "type"> & {
  name?: string;
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
  allowNegative?: boolean;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<number | null>(defaultValue);
  const current = controlled ? value : inner;
  const [text, setText] = useState(() => toText(current));

  // Giá trị đổi từ bên ngoài (vd bấm "điền số còn nợ") thì hiển thị lại cho khớp.
  useEffect(() => {
    if (parseText(text, allowNegative).value !== current) setText(toText(current));
  }, [current]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseText(event.target.value, allowNegative);
    setText(parsed.digits ? toText(parsed.value) : parsed.negative ? "-" : "");
    if (!controlled) setInner(parsed.value);
    onValueChange?.(parsed.value);
  }

  return (
    <div className="relative">
      <Input
        {...rest}
        type="text"
        inputMode={allowNegative ? "text" : "numeric"}
        autoComplete="off"
        value={text}
        onChange={handleChange}
        className={`pr-8 text-right tabular-nums ${rest.className ?? ""}`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">đ</span>
      {name ? <input type="hidden" name={name} value={current ?? ""} /> : null}
    </div>
  );
}

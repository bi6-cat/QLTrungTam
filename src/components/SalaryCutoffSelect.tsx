import { Select } from "@/components/ui";
import { SALARY_CUTOFF_OPTIONS } from "@/lib/salary-cutoff";

/**
 * Ô chọn ngày chốt lương. Có `inheritLabel` thì thêm lựa chọn "Theo cài đặt chung" (giá trị rỗng)
 * cho form lớp.
 */
export function SalaryCutoffSelect({
  name,
  defaultValue,
  inheritLabel
}: {
  name: string;
  defaultValue: string;
  inheritLabel?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue}>
      {inheritLabel !== undefined ? <option value="">Theo cài đặt chung ({inheritLabel})</option> : null}
      {SALARY_CUTOFF_OPTIONS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

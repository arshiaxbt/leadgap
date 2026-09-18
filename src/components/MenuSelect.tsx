"use client";
/** Native select supplies keyboard navigation, focus management and mobile pickers. */
export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  ariaLabel?: string;
  align?: "left" | "right";
  className?: string;
  menuClassName?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel ?? "Select option"}
      onChange={(e) => onChange(e.target.value as T)}
      className={`lg-select min-h-9 max-w-full px-3 text-[13px] ${className}`}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

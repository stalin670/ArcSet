import { formatNumber, type FormatOptions } from "@/lib/format-number";

type FormattedNumberProps = FormatOptions & {
  value: number | null | undefined;
  className?: string;
};

export function FormattedNumber({ value, className = "", ...options }: FormattedNumberProps) {
  const result = formatNumber(value, options);

  return (
    <span
      className={`font-mono tabular-nums ${className}`}
      aria-label={result.ariaLabel}
      title={result.raw || undefined}
    >
      {result.display}
    </span>
  );
}

import { cn } from "@/lib/cn";
import { iconFor } from "@/lib/category-icons";

/** A category's icon in a rounded square tinted with the category colour. */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon?: string | null;
  color?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = iconFor(icon);
  const c = color ?? "#4d6175";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      // 0x26 ≈ 15% alpha tint of the category colour.
      style={{ backgroundColor: `${c}26`, color: c }}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} strokeWidth={2} />
    </span>
  );
}

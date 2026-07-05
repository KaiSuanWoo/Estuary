import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface DonutSlice {
  id: string;
  name: string;
  value: number;
  color: string;
}

/**
 * Category donut whose hover detail appears in a FIXED box pinned to the
 * top-right of the container (not a cursor-following tooltip that sits
 * unreadably over the ring). The box and the highlighted slice/legend share the
 * slice colour. Hovering the ring or a legend row both drive the highlight.
 */
export function HoverDonut({
  slices,
  base,
  centerLabel = "Total",
  legend = true,
  legendCount = 6,
  size = 148,
}: {
  slices: DonutSlice[];
  base: string;
  centerLabel?: string;
  legend?: boolean;
  legendCount?: number;
  size?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cur = active != null ? slices[active] : null;

  return (
    <div className="relative">
      {/* Fixed hover readout — top-right of the container, colour-coded. */}
      <div
        className={cn(
          "pointer-events-none absolute right-0 top-0 z-10 rounded-xl border-l-2 bg-ink-950/90 px-3 py-1.5 shadow-lg backdrop-blur transition-opacity",
          cur ? "opacity-100" : "opacity-0",
        )}
        style={{ borderColor: cur?.color }}
      >
        <p className="text-[11px] font-medium" style={{ color: cur?.color }}>
          {cur?.name ?? ""}
        </p>
        <p className="tnum text-sm font-semibold text-ink-50">
          {cur ? formatMoney(cur.value, base) : ""}
          {cur && (
            <span className="ml-1 text-xs font-normal text-ink-500">
              {Math.round((cur.value / total) * 100)}%
            </span>
          )}
        </p>
      </div>

      <div className={cn("flex items-center gap-4", !legend && "justify-center")}>
        <div className="relative shrink-0" style={{ height: size, width: size }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={size * 0.33}
                outerRadius={size * 0.47}
                paddingAngle={2}
                stroke="none"
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {slices.map((s, i) => (
                  <Cell
                    key={s.id}
                    fill={s.color}
                    opacity={active == null || active === i ? 1 : 0.3}
                    style={{ transition: "opacity 120ms" }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-ink-500">{cur ? cur.name : centerLabel}</span>
            <span
              className="tnum text-sm font-semibold"
              style={{ color: cur ? cur.color : undefined }}
            >
              {formatMoney(cur ? cur.value : total, base)}
            </span>
          </div>
        </div>

        {legend && (
          <ul className="min-w-0 flex-1 space-y-1.5">
            {slices.slice(0, legendCount).map((s, i) => (
              <li
                key={s.id}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-md px-1 py-0.5 text-sm transition-colors",
                  active === i && "bg-ink-800/60",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate text-ink-300">{s.name}</span>
                <span className="tnum shrink-0 text-ink-400">
                  {formatMoney(s.value, base)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

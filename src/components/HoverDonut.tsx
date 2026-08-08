import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/format";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  // The ring gives up some diameter on a phone, where it shares the page with
  // a full-width legend beneath it rather than sitting beside one.
  const narrow = useMediaQuery("(max-width: 639px)");
  const ringSize = narrow ? Math.round(size * 0.82) : size;

  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cur = active != null ? slices[active] : null;

  return (
    <div className="relative">
      {/* Fixed hover readout — top-right of the container, colour-coded. */}
      <div
        className={cn(
          "pointer-events-none absolute right-0 top-0 z-10 rounded-[2px] border-l-2 bg-page px-3 py-1.5 shadow-[0_2px_8px_rgb(0_0_0/0.35)] transition-opacity",
          cur ? "opacity-100" : "opacity-0",
        )}
        style={{ borderColor: cur?.color }}
      >
        <p className="text-[11px] font-medium" style={{ color: cur?.color }}>
          {cur?.name ?? ""}
        </p>
        <p className="tnum text-sm font-semibold text-quill">
          {cur ? formatMoney(cur.value, base) : ""}
          {cur && (
            <span className="ml-1 text-xs font-normal text-quill-faint">
              {Math.round((cur.value / total) * 100)}%
            </span>
          )}
        </p>
      </div>

      {/* Side by side once there's width for it. On a phone the ring and a
          legend can't share a row without crushing the names to initials, so
          the legend drops underneath at full width. */}
      <div
        className={cn(
          "flex flex-col items-center gap-4 sm:flex-row sm:items-center",
          !legend && "justify-center",
        )}
      >
        <div className="relative shrink-0" style={{ height: ringSize, width: ringSize }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={ringSize * 0.33}
                outerRadius={ringSize * 0.47}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
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
          {/* Held to 62% of the ring so a six-figure total can't spill out over
              the arcs. The label and the figure both truncate rather than wrap. */}
          <div
            className="pointer-events-none absolute inset-0 m-auto flex flex-col items-center justify-center text-center"
            style={{ width: "62%" }}
          >
            <span className="w-full truncate text-[11px] text-quill-faint">
              {cur ? cur.name : centerLabel}
            </span>
            <span
              className="tnum w-full truncate text-[13px]"
              style={{ color: cur ? cur.color : undefined }}
            >
              {formatMoney(cur ? cur.value : total, base)}
            </span>
          </div>
        </div>

        {legend && (
          <ul className="w-full min-w-0 flex-1 space-y-1.5">
            {slices.slice(0, legendCount).map((s, i) => (
              <li
                key={s.id}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  "flex cursor-default items-center gap-2 rounded-[2px] px-1 py-0.5 text-sm transition-colors",
                  active === i && "bg-[color-mix(in_oklab,var(--color-quill)_8%,transparent)]",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate text-quill-soft">{s.name}</span>
                <span className="tnum shrink-0 text-quill-soft">
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

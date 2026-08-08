import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { dismissKeyboard } from "@/lib/keyboard";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { Category } from "@/lib/types";

type Option = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
};

/**
 * Searchable category picker — a compact field that opens a focused overlay with
 * a search box and a filterable list (colour dot + name). Replaces a long native
 * <select>. Keyboard: ↑/↓ to move, Enter to choose, Esc to close; type to filter.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  kind,
}: {
  categories: Category[];
  value: string; // category id, or "" for uncategorised
  onChange: (id: string) => void;
  kind: "expense" | "income";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const pool = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );
  const selected = pool.find((c) => c.id === value) ?? null;

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? pool.filter((c) => c.name.toLowerCase().includes(q))
      : pool;
    return [
      { id: "", name: "Uncategorised", color: null, icon: null },
      ...matched.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
      })),
    ];
  }, [pool, query]);

  // Reset + focus when opening.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(id: string) {
    onChange(id);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={dismissKeyboard}
        onClick={() => setOpen(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[2px] border border-rule bg-well px-3 text-sm text-quill transition-colors hover:border-rule-strong focus:border-accent focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CategoryIcon
            icon={selected?.icon}
            color={selected?.color}
            size="sm"
          />
          <span className={cn("truncate", !selected && "text-quill-faint")}>
            {selected?.name ?? "Uncategorised"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-quill-faint" />
      </button>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select category"
          className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-24 pt-10 lg:items-center lg:py-8"
        >
          <button
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/55"
          />
          <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[2px] border border-rule bg-page-edge shadow-2xl shadow-black/40 lg:max-w-md">
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
              <Search className="size-4 shrink-0 text-quill-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search categories…"
                aria-label="Search categories"
                className="w-full bg-transparent text-sm text-quill placeholder:text-quill-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-page-edge text-quill-soft transition-colors hover:bg-rule hover:text-quill"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Options */}
            <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
              {options.map((o, i) => (
                <li
                  key={o.id || "__none"}
                  ref={i === active ? activeRef : undefined}
                  role="option"
                  aria-selected={o.id === value}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors",
                      i === active ? "bg-page-edge" : "hover:bg-page-edge",
                    )}
                  >
                    <CategoryIcon icon={o.icon} color={o.color} size="sm" />
                    <span
                      className={cn(
                        "flex-1 truncate",
                        o.id ? "text-quill" : "text-quill-soft",
                      )}
                    >
                      {o.name}
                    </span>
                    {o.id === value && (
                      <Check className="size-4 shrink-0 text-accent" />
                    )}
                  </button>
                </li>
              ))}
              {options.length === 1 && (
                <li className="px-4 py-6 text-center text-sm text-quill-faint">
                  No categories match “{query}”.
                </li>
              )}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

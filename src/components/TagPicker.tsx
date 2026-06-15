import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCreateTag, useTags } from "@/hooks/useTags";
import { cn } from "@/lib/cn";

/**
 * Multi-select tag chips with inline "create new tag". Tags are how a goal
 * budget (e.g. a vacation) scopes which transactions count toward it.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: tags = [] } = useTags();
  const create = useCreateTag();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);
  }

  async function addTag() {
    const n = name.trim();
    if (!n || create.isPending) return;
    const existing = tags.find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
    } else {
      const tag = await create.mutateAsync(n);
      onChange([...value, tag.id]);
    }
    setName("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => toggle(t.id)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            value.includes(t.id)
              ? "border-teal-500 bg-teal-500/15 text-teal-300"
              : "border-ink-700 text-ink-400 hover:border-ink-600",
          )}
        >
          {t.name}
        </button>
      ))}

      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              } else if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="New tag"
            className="h-7 w-24 rounded-full border border-ink-700 bg-ink-950/60 px-2.5 text-xs text-ink-50 placeholder:text-ink-600 focus:border-teal-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addTag}
            aria-label="Add tag"
            className="flex size-6 items-center justify-center rounded-full bg-teal-500 text-ink-950"
          >
            <Check className="size-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-700 px-2.5 py-1 text-xs text-ink-500 transition-colors hover:border-ink-600 hover:text-ink-300"
        >
          <Plus className="size-3" /> Tag
        </button>
      )}
    </div>
  );
}

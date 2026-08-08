import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, Pencil, RotateCcw, Store, X } from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import {
  useAliasMap,
  useRenameMerchant,
  useClearMerchantAliases,
} from "@/hooks/useMerchantAliases";
import { groupMerchants, type MerchantGroup } from "@/lib/merchants";
import { cn } from "@/lib/cn";
import { Card, EmptyState, Spinner } from "@/components/ui";

/**
 * Merchant manager: shows every canonical merchant group (auto-normalised +
 * user aliases) with the raw descriptors that fold into it. Renaming a group
 * writes alias rows so all analytics aggregate under the new name.
 */
export function Merchants() {
  const { data: txns = [], isLoading } = useTransactions();
  const aliasMap = useAliasMap();
  const rename = useRenameMerchant();
  const clear = useClearMerchantAliases();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups = useMemo(() => groupMerchants(txns, aliasMap), [txns, aliasMap]);

  async function saveRename(g: MerchantGroup) {
    const name = draft.trim();
    if (!name || name === g.canonical) {
      setEditing(null);
      return;
    }
    await rename.mutateAsync({ keys: g.keys, canonical: name });
    setEditing(null);
  }

  /** A group is user-renamed when any of its keys has an alias row. */
  function isRenamed(g: MerchantGroup): boolean {
    return g.keys.some((k) => aliasMap.has(k.toLowerCase()));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4 flex items-center gap-2">
        <Link
          to="/settings"
          className="flex size-8 items-center justify-center rounded-[2px] text-quill-soft hover:text-quill"
          aria-label="Back to settings"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-quill">
            Merchants
          </h1>
          <p className="text-sm text-quill-soft">
            Bank descriptors are grouped automatically — rename a group to tidy
            your analytics
          </p>
        </div>
      </header>

      {isLoading ? (
        <Card className="flex justify-center py-8">
          <Spinner />
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Store className="size-6" />}
          title="No merchants yet"
          hint="Add or import some transactions first."
        />
      ) : (
        <Card className="divide-y divide-rule py-0">
          {groups.slice(0, 100).map((g) => {
            const isEditing = editing === g.canonical;
            const renamed = isRenamed(g);
            return (
              <div key={g.canonical} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(g);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-8 w-full rounded-[2px] border border-accent bg-well px-2 text-sm text-quill focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-quill">
                        {g.canonical}
                        {renamed && (
                          <span className="ml-2 rounded-[2px] bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                            renamed
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-quill-faint">
                        ×{g.count}
                        {g.raws.length > 1 && (
                          <> · folds {g.raws.slice(0, 3).join(", ")}{g.raws.length > 3 ? "…" : ""}</>
                        )}
                      </p>
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void saveRename(g)}
                      disabled={rename.isPending}
                      aria-label="Save name"
                      className="flex size-8 items-center justify-center rounded-[2px] bg-accent/15 text-accent hover:bg-accent/25"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      aria-label="Cancel"
                      className="flex size-8 items-center justify-center rounded-[2px] text-quill-faint hover:bg-page-edge hover:text-quill"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    {renamed && (
                      <button
                        onClick={() => clear.mutate(g.keys)}
                        aria-label={`Reset ${g.canonical} to automatic name`}
                        title="Reset to automatic name"
                        className="flex size-8 items-center justify-center rounded-[2px] text-quill-faint hover:bg-page-edge hover:text-quill"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditing(g.canonical);
                        setDraft(g.canonical);
                      }}
                      aria-label={`Rename ${g.canonical}`}
                      className="flex size-8 items-center justify-center rounded-[2px] text-quill-faint hover:bg-page-edge hover:text-quill"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <p className={cn("mt-3 px-1 text-center text-xs text-quill-faint")}>
        Renames don't edit your transactions — they only change how merchants
        group in Analytics.
      </p>
    </div>
  );
}

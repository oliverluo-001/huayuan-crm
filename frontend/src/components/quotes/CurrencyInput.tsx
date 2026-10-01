import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Commit on blur, not each keystroke: changing USD to EUR prompts only once. */
export function CurrencyInput({ value, onCommit, label }: { value: string; onCommit: (next: string) => boolean; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) return;
    if (next !== value && !onCommit(next)) setDraft(value);
    else setDraft(next);
  };
  return <Input aria-label={label} value={draft} maxLength={3} pattern="[A-Za-z]{3}" required placeholder="USD" onChange={(event) => setDraft(event.target.value.toUpperCase())} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />;
}

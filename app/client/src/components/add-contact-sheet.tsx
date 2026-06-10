import { useState } from "react";
import { X } from "lucide-react";
import { useColors } from "@/App";

interface AddContactSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => Promise<unknown>;
}

const EMPTY = { firstName: "", lastName: "", companyName: "", title: "", email: "", linkedinUrl: "" };

export function AddContactSheet({ open, onClose, onCreate }: AddContactSheetProps) {
  const C = useColors();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.companyName.trim() ? { companyName: form.companyName.trim() } : {}),
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.linkedinUrl.trim() ? { linkedinUrl: form.linkedinUrl.trim() } : {}),
      });
      setForm(EMPTY);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
  };

  return (
    <>
      <div className="fixed inset-0 z-[69] bg-black/20" onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[70] w-full max-w-[640px] px-4 pt-4 pb-6 bg-white"
        style={{ borderRadius: "16px 16px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
        data-testid="add-contact-sheet"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold tracking-[0.15em] uppercase" style={{ color: C.text }}>
            New contact
          </h2>
          <button onClick={onClose} className="p-1.5 hover:opacity-70" style={{ color: C.muted }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              autoFocus
              required
              placeholder="First name"
              value={form.firstName}
              onChange={set("firstName")}
              className="flex-1 min-w-0 text-[13px] px-3 py-2.5 outline-none"
              style={inputStyle}
            />
            <input
              placeholder="Last name"
              value={form.lastName}
              onChange={set("lastName")}
              className="flex-1 min-w-0 text-[13px] px-3 py-2.5 outline-none"
              style={inputStyle}
            />
          </div>
          <input
            placeholder="Company"
            value={form.companyName}
            onChange={set("companyName")}
            className="text-[13px] px-3 py-2.5 outline-none"
            style={inputStyle}
          />
          <div className="flex gap-2">
            <input
              placeholder="Title"
              value={form.title}
              onChange={set("title")}
              className="flex-1 min-w-0 text-[13px] px-3 py-2.5 outline-none"
              style={inputStyle}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={set("email")}
              className="flex-1 min-w-0 text-[13px] px-3 py-2.5 outline-none"
              style={inputStyle}
            />
          </div>
          <input
            placeholder="LinkedIn URL"
            value={form.linkedinUrl}
            onChange={set("linkedinUrl")}
            className="text-[13px] px-3 py-2.5 outline-none"
            style={inputStyle}
          />
          {error && (
            <p className="text-[12px] px-1" style={{ color: C.red }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!form.firstName.trim() || saving}
            className="mt-1 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: C.accent, borderRadius: 12 }}
          >
            {saving ? "Adding…" : "Add contact"}
          </button>
        </form>
      </div>
    </>
  );
}

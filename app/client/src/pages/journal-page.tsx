import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Clock, RefreshCw } from "lucide-react";
import { Link, useParams } from "wouter";
import { useColors } from "@/App";
import { Markdown as MarkdownView } from "@/components/markdown";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { diffLines } from "diff";
import type { ContactWithRelations, ContactJournalRevision } from "@shared/schema";

interface JournalResponse {
  content: string;
  hash: string;
  initialized: boolean;
  sizeBytes: number;
}

type RevisionSummary = Pick<ContactJournalRevision, "id" | "createdAt" | "source" | "contentHash"> & {
  size: number;
};

const SHRINK_THRESHOLD = 0.2;
const SHRINK_MIN_BYTES = 500;

export default function JournalPage() {
  const C = useColors();
  const params = useParams<{ contactId: string }>();
  const contactId = parseInt(params.contactId || "0");

  const { data: contact } = useQuery<ContactWithRelations>({
    queryKey: [`/api/contacts/${contactId}`],
    enabled: contactId > 0,
  });

  const { data: journal } = useQuery<JournalResponse>({
    queryKey: [`/api/contacts/${contactId}/journal`],
    enabled: contactId > 0,
  });

  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Hash captured when edit mode was entered. Used as expectedHash on save
  // and to detect SSE-triggered updates while editing.
  const [editingBaseHash, setEditingBaseHash] = useState<string | null>(null);

  const reloadPending = editing && editingBaseHash && journal && journal.hash !== editingBaseHash ? journal.hash : null;
  const savedHash = editingBaseHash ?? journal?.hash ?? null;

  const editor = useEditor({
    extensions: [StarterKit, Markdown.configure({ html: false, breaks: true, linkify: true })],
    content: journal?.content ?? "",
    editable: editing,
  });

  useEffect(() => {
    if (editor && journal && !editing) {
      editor.commands.setContent(journal.content);
    }
  }, [journal, editor, editing]);

  useEffect(() => {
    editor?.setEditable(editing);
  }, [editing, editor]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { content: string; expectedHash?: string }) => {
      const res = await apiRequest("PUT", `/api/contacts/${contactId}/journal`, payload);
      return res.json();
    },
    onSuccess: (result) => {
      if (result?.ok) {
        setEditing(false);
        setEditingBaseHash(null);
        queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/journal`] });
        queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/journal/revisions`] });
      } else if (result?.reason === "hash_conflict") {
        // Force the banner by clearing our base hash so reloadPending recomputes.
        setEditingBaseHash(result.currentHash ?? null);
      } else {
        alert(result?.message || "Save failed");
      }
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });

  const handleSave = () => {
    if (!editor || !journal) return;
    const next = editor.storage.markdown.getMarkdown() as string;
    const oldLen = journal.content.length;
    const delta = oldLen - next.length;
    const pct = oldLen > 0 ? delta / oldLen : 0;
    if (delta >= Math.min(SHRINK_MIN_BYTES, oldLen) && pct >= SHRINK_THRESHOLD) {
      const approve = window.confirm(
        `You're about to remove ~${Math.round(pct * 100)}% of the journal (${oldLen} → ${next.length} chars). Continue?`,
      );
      if (!approve) return;
    }
    saveMutation.mutate({ content: next, expectedHash: savedHash ?? journal.hash });
  };

  const handleReload = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/journal`] });
    setEditingBaseHash(null);
    setEditing(false);
  };

  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : "Loading...";
  const companyName = contact?.company?.name || "";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="transition-colors hover:opacity-70" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-sm font-semibold" style={{ color: C.text }}>
              {contactName}
              {companyName && (
                <span className="font-normal ml-1.5" style={{ color: C.muted }}>
                  {companyName}
                </span>
              )}
            </h1>
            <p className="text-[11px]" style={{ color: C.muted }}>
              Relationship Journal
            </p>
          </div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5"
            style={{ color: C.accentDark, backgroundColor: C.accentLight }}
            title="Revision history"
          >
            <Clock className="h-3 w-3" />
            History
          </button>
        </div>
      </header>

      {reloadPending && (
        <div
          className="max-w-[640px] mx-auto mt-3 px-3 py-2 rounded-lg flex items-center justify-between text-xs"
          style={{ border: `1px solid ${C.stale}`, backgroundColor: C.staleBg, color: C.text }}
        >
          <span>Journal changed while you were editing.</span>
          <button
            onClick={handleReload}
            className="font-medium flex items-center gap-1"
            style={{ color: C.accentDark }}
          >
            <RefreshCw className="h-3 w-3" />
            Reload
          </button>
        </div>
      )}

      <main className="max-w-[640px] mx-auto px-4 py-5">
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1.25rem" }}>
          {!journal ? (
            <p className="text-sm" style={{ color: C.muted }}>
              Loading...
            </p>
          ) : editing ? (
            <div>
              <div
                className="prose prose-sm max-w-none min-h-[300px] p-3 rounded-lg"
                style={{ backgroundColor: C.accentLight, border: `1px solid ${C.border}` }}
              >
                <EditorContent editor={editor} />
              </div>
              <div className="flex gap-2 mt-3 items-center">
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                  style={{ backgroundColor: C.accentDark }}
                >
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditingBaseHash(null);
                    if (editor && journal) editor.commands.setContent(journal.content);
                  }}
                  className="text-xs px-3 py-1.5"
                  style={{ color: C.muted }}
                >
                  Cancel
                </button>
                <span className="text-[10px] ml-auto" style={{ color: C.muted }}>
                  {journal.sizeBytes} chars
                </span>
              </div>
            </div>
          ) : (
            <div>
              {journal.initialized ? (
                <MarkdownView>{journal.content}</MarkdownView>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm mb-3" style={{ color: C.muted }}>
                    No journal yet — a skeleton template is ready.
                  </p>
                </div>
              )}
              <div
                className="flex items-center justify-between mt-4 pt-3"
                style={{ borderTop: `1px dashed ${C.border}` }}
              >
                <span className="text-[10px]" style={{ color: C.muted }}>
                  {journal.sizeBytes} chars
                </span>
                <button
                  onClick={() => {
                    setEditingBaseHash(journal.hash);
                    setEditing(true);
                  }}
                  className="text-xs font-medium"
                  style={{ color: C.accentDark }}
                >
                  {journal.initialized ? "Edit" : "Start journal"}
                </button>
              </div>
            </div>
          )}
        </div>

        {showHistory && <HistoryDrawer contactId={contactId} currentContent={journal?.content ?? ""} />}
      </main>
    </div>
  );
}

function HistoryDrawer({ contactId, currentContent }: { contactId: number; currentContent: string }) {
  const C = useColors();
  const { data: revisions } = useQuery<RevisionSummary[]>({
    queryKey: [`/api/contacts/${contactId}/journal/revisions`],
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: selected } = useQuery<ContactJournalRevision>({
    queryKey: [`/api/contacts/${contactId}/journal/revisions`, selectedId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contacts/${contactId}/journal/revisions/${selectedId}`);
      return res.json();
    },
    enabled: selectedId !== null,
  });

  const restoreMutation = useMutation({
    mutationFn: async (content: string) => {
      const current = await apiRequest("GET", `/api/contacts/${contactId}/journal`).then((r) => r.json());
      const res = await apiRequest("PUT", `/api/contacts/${contactId}/journal`, {
        content,
        expectedHash: current.hash,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/journal`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/journal/revisions`] });
    },
  });

  const diff = useMemo(() => {
    if (!selected) return null;
    return diffLines(selected.content, currentContent);
  }, [selected, currentContent]);

  return (
    <div className="mt-4 bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.accentDark }}>
        Revisions
      </h2>
      {!revisions || revisions.length === 0 ? (
        <p className="text-xs" style={{ color: C.muted }}>
          No revisions yet.
        </p>
      ) : (
        <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
          {revisions.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between"
              style={{
                backgroundColor: selectedId === r.id ? C.accentLight : "transparent",
                color: C.text,
              }}
            >
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span className="flex items-center gap-2">
                <span
                  className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: r.source === "agent" ? C.accentLight : C.staleBg,
                    color: r.source === "agent" ? C.accentDark : C.stale,
                  }}
                >
                  {r.source}
                </span>
                <span style={{ color: C.muted }}>{r.size} ch</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && diff && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px]" style={{ color: C.muted }}>
              Before (this revision) → After (current)
            </p>
            <button
              onClick={() => {
                if (window.confirm("Restore this revision as a new write? Current content will be snapshotted.")) {
                  restoreMutation.mutate(selected.content);
                }
              }}
              className="text-xs font-medium px-2 py-1 rounded-md"
              style={{ backgroundColor: C.accentDark, color: "white" }}
            >
              Restore this version
            </button>
          </div>
          <pre
            className="text-[11px] leading-snug overflow-x-auto whitespace-pre-wrap rounded p-2"
            style={{ border: `1px solid ${C.border}`, backgroundColor: "#fafcfc" }}
          >
            {diff.map((part, i) => (
              <span
                key={i}
                style={{
                  backgroundColor: part.added ? "#e6ffed" : part.removed ? "#ffeef0" : "transparent",
                  color: part.added ? "#22863a" : part.removed ? "#b31d28" : C.text,
                  display: "block",
                }}
              >
                {part.added ? "+ " : part.removed ? "- " : "  "}
                {part.value}
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

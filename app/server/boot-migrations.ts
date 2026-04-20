// Idempotent schema fixups run at boot. Used for small, safe structural changes
// (renames, column adds with defaults) that should apply automatically on
// Railway deploy without requiring a manual drizzle-kit push.
//
// Guardrails:
// - Every statement must be idempotent and non-destructive (IF EXISTS / IF NOT EXISTS).
// - Never DROP, TRUNCATE, or DELETE here. Destructive changes go through a
//   deliberate migration, not boot code.

import { pool } from "./db";

interface BootMigration {
  name: string;
  sql: string;
}

const MIGRATIONS: BootMigration[] = [
  {
    // 2026-04-19: rename relationship_memory → relationship_journal (PR #68 follow-up).
    // Renames are conditional on the old column/table still existing, so this is a no-op
    // on already-migrated databases.
    name: "rename_memory_to_journal",
    sql: `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'relationship_memory'
  ) THEN
    ALTER TABLE contacts RENAME COLUMN relationship_memory TO relationship_journal;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'contact_memory_revisions'
  ) THEN
    ALTER TABLE contact_memory_revisions RENAME TO contact_journal_revisions;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'contact_memory_revisions_contact_created_idx'
  ) THEN
    ALTER INDEX contact_memory_revisions_contact_created_idx
      RENAME TO contact_journal_revisions_contact_created_idx;
  END IF;
END $$;

-- Ensure the journal column exists (catches a fresh Postgres where neither name is present).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_journal TEXT;

-- Ensure the journal revisions table exists.
CREATE TABLE IF NOT EXISTS contact_journal_revisions (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contact_journal_revisions_contact_created_idx
  ON contact_journal_revisions (contact_id, created_at DESC);
`,
  },
  {
    // 2026-04-20: contacts.linkedin_url — optional handle to the contact's
    // LinkedIn profile. Biggest research unlock for briefing agents (and the
    // user) with no downside when absent.
    name: "add_contacts_linkedin_url",
    sql: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;`,
  },
];

export async function runBootMigrations(): Promise<void> {
  for (const m of MIGRATIONS) {
    try {
      await pool.query(m.sql);
      console.warn(`[boot-migration] ${m.name}: ok`);
    } catch (err) {
      console.error(`[boot-migration] ${m.name}: FAILED`, err);
      throw err;
    }
  }
}

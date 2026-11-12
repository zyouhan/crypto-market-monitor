import { Router } from "express";

import { db } from "../../db";
import {
  failure,
  isPositiveInteger,
  success
} from "../middleware";

export const notesRouter: Router = Router();

interface NoteRow {
  id: number;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

interface NoteTagRow {
  note_id: number;
  tag: string;
}

interface NoteView extends NoteRow {
  tags: string[];
}

const MAX_TITLE = 200;
const MAX_CONTENT = 20000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 24;
const MAX_LIMIT = 50;

function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

function readTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，\s]+/)
      : [];
  const tags = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const tag = normalizeTag(item);

    if (tag) {
      tags.add(tag);
    }
  }

  if (tags.size > MAX_TAGS) {
    throw new Error(`标签不能超过 ${MAX_TAGS} 个`);
  }

  return Array.from(tags);
}

function readNoteInput(body: unknown): {
  title: string;
  content: string;
  tags: string[];
} {
  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const title =
    typeof input.title === "string" ? input.title.trim() : "";
  const content =
    typeof input.content === "string" ? input.content : "";

  if (!title && !content.trim()) {
    throw new Error("标题和正文不能同时为空");
  }

  if (title.length > MAX_TITLE) {
    throw new Error(`标题不能超过 ${MAX_TITLE} 个字符`);
  }

  if (content.length > MAX_CONTENT) {
    throw new Error(`正文不能超过 ${MAX_CONTENT} 个字符`);
  }

  return {
    title,
    content,
    tags: readTags(input.tags)
  };
}

function tagsForNotes(noteIds: number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();

  if (noteIds.length === 0) {
    return result;
  }

  const placeholders = noteIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT note_id, tag
    FROM note_tags
    WHERE note_id IN (${placeholders})
    ORDER BY tag ASC
  `).all(...noteIds) as NoteTagRow[];

  for (const row of rows) {
    const tags = result.get(row.note_id) ?? [];
    tags.push(row.tag);
    result.set(row.note_id, tags);
  }

  return result;
}

function toNoteView(
  row: NoteRow,
  tags: string[]
): NoteView {
  return { ...row, tags };
}

function getNote(id: number): NoteView | null {
  const row = db.prepare(`
    SELECT id, title, content, created_at, updated_at
    FROM notes
    WHERE id = ?
  `).get(id) as NoteRow | undefined;

  if (!row) {
    return null;
  }

  return toNoteView(row, tagsForNotes([id]).get(id) ?? []);
}

function replaceTags(noteId: number, tags: string[]): void {
  db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
  const insert = db.prepare(`
    INSERT INTO note_tags (note_id, tag)
    VALUES (?, ?)
  `);

  for (const tag of tags) {
    insert.run(noteId, tag);
  }
}

function readListQuery(query: Record<string, unknown>): {
  page: number;
  limit: number;
  tag: string;
  search: string;
} {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || 10, 1),
    MAX_LIMIT
  );
  const tag =
    typeof query.tag === "string"
      ? normalizeTag(query.tag)
      : "";
  const search =
    typeof query.search === "string"
      ? query.search.trim()
      : "";

  return { page, limit, tag, search };
}

notesRouter.get("/tags", (_req, res) => {
  const tags = db.prepare(`
    SELECT tag, COUNT(1) AS count
    FROM note_tags
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `).all() as Array<{ tag: string; count: number }>;

  res.json(success({ tags }));
});

notesRouter.get("/", (req, res) => {
  const { page, limit, tag, search } = readListQuery(
    req.query as Record<string, unknown>
  );
  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (tag) {
    whereParts.push(`
      EXISTS (
        SELECT 1 FROM note_tags
        WHERE note_tags.note_id = notes.id
          AND note_tags.tag = ?
      )
    `);
    params.push(tag);
  }

  if (search) {
    whereParts.push("(title LIKE ? OR content LIKE ?)");
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  const where =
    whereParts.length > 0
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";
  const totalRow = db.prepare(`
    SELECT COUNT(1) AS count
    FROM notes
    ${where}
  `).get(...params) as { count: number };
  const totalPages = Math.max(
    1,
    Math.ceil(totalRow.count / limit)
  );
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;
  const rows = db.prepare(`
    SELECT id, title, content, created_at, updated_at
    FROM notes
    ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as NoteRow[];
  const tagMap = tagsForNotes(rows.map((row) => row.id));

  res.json(
    success({
      items: rows.map((row) =>
        toNoteView(row, tagMap.get(row.id) ?? [])
      ),
      total: totalRow.count,
      page: currentPage,
      limit,
      total_pages: totalPages
    })
  );
});

notesRouter.post("/", (req, res) => {
  let input: ReturnType<typeof readNoteInput>;

  try {
    input = readNoteInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "笔记内容不正确")
    );
    return;
  }

  const now = Date.now();
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO notes (title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(input.title, input.content, now, now);
    const id = Number(result.lastInsertRowid);
    replaceTags(id, input.tags);
    return id;
  });
  const id = transaction();
  const note = getNote(id);

  if (!note) {
    res.status(500).json(failure("笔记创建失败"));
    return;
  }

  res.json(success(note, "笔记已创建"));
});

notesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("笔记 ID 不正确"));
    return;
  }

  if (!getNote(id)) {
    res.status(404).json(failure("笔记不存在"));
    return;
  }

  let input: ReturnType<typeof readNoteInput>;

  try {
    input = readNoteInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "笔记内容不正确")
    );
    return;
  }

  const now = Date.now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE notes
      SET title = ?, content = ?, updated_at = ?
      WHERE id = ?
    `).run(input.title, input.content, now, id);
    replaceTags(id, input.tags);
  });
  transaction();

  const note = getNote(id);

  if (!note) {
    res.status(404).json(failure("笔记不存在"));
    return;
  }

  res.json(success(note, "笔记已更新"));
});

notesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("笔记 ID 不正确"));
    return;
  }

  const result = db.prepare("DELETE FROM notes WHERE id = ?").run(id);

  if (result.changes === 0) {
    res.status(404).json(failure("笔记不存在"));
    return;
  }

  res.json(success({ id }, "笔记已删除"));
});

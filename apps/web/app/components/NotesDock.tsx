"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";

const PAGE_SIZE = 8;

interface NoteItem {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}

interface NotePage {
  items: NoteItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface TagCount {
  tag: string;
  count: number;
}

interface NoteForm {
  title: string;
  content: string;
  tags: string;
}

const EMPTY_FORM: NoteForm = {
  title: "",
  content: "",
  tags: ""
};

function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean)
    )
  );
}

export function NotesDock() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<NoteForm>(EMPTY_FORM);
  const [items, setItems] = useState<NoteItem[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const loadTags = useCallback(async () => {
    try {
      const data = await api<{ tags: TagCount[] }>(
        "/api/notes/tags"
      );
      setTags(data.tags);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, []);

  const loadNotes = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE)
      });

      if (tagFilter) {
        params.set("tag", tagFilter);
      }

      if (search) {
        params.set("search", search);
      }

      const data = await api<NotePage>(
        `/api/notes?${params.toString()}`
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      setPage(data.page);
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [page, tagFilter, search]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadNotes();
  }, [open, loadNotes]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTags();
  }, [open, loadTags]);

  function openDock(): void {
    setOpen(true);
    setError("");
  }

  function closeDock(): void {
    if (saving) {
      return;
    }

    setOpen(false);
    setMode("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function openCreate(): void {
    setMode("edit");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function openEdit(note: NoteItem): void {
    setMode("edit");
    setEditingId(note.id);
    setForm({
      title: note.title,
      content: note.content,
      tags: note.tags.join(", ")
    });
    setError("");
  }

  async function saveNote(): Promise<void> {
    if (saving) {
      return;
    }

    if (!form.title.trim() && !form.content.trim()) {
      setError("标题和正文不能同时为空");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api(
        editingId === null
          ? "/api/notes"
          : `/api/notes/${editingId}`,
        {
          method: editingId === null ? "POST" : "PUT",
          body: JSON.stringify({
            title: form.title,
            content: form.content,
            tags: parseTags(form.tags)
          })
        }
      );

      setMode("list");
      setEditingId(null);
      setForm(EMPTY_FORM);

      if (editingId === null) {
        setPage(1);
      }

      await Promise.all([loadNotes(), loadTags()]);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(note: NoteItem): Promise<void> {
    if (!window.confirm(`删除笔记「${note.title || "无标题"}」？`)) {
      return;
    }

    setError("");

    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });

      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
        await loadTags();
      } else {
        await Promise.all([loadNotes(), loadTags()]);
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  const activeTagCount = tags.find(
    (item) => item.tag === tagFilter
  )?.count;

  return (
    <>
      <button
        type="button"
        className="notes-fab"
        aria-label="打开笔记"
        onClick={openDock}
      >
        <span aria-hidden="true">✎</span>
        笔记
      </button>

      {open && (
        <div
          className="modal-backdrop notes-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDock();
            }
          }}
        >
          <section className="modal notes-modal" role="dialog" aria-modal="true">
            <div className="notes-head">
              <div>
                <h2>我的笔记</h2>
                <p>
                  {total} 条记录
                  {activeTagCount !== undefined
                    ? ` · 标签 ${activeTagCount} 条`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭笔记"
                onClick={closeDock}
              >
                ×
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            {mode === "list" ? (
              <>
                <div className="notes-toolbar">
                  <label className="search-box notes-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      value={query}
                      placeholder="搜索标题 / 正文"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <select
                    value={tagFilter}
                    aria-label="按标签筛选"
                    onChange={(event) => {
                      setTagFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">全部标签</option>
                    {tags.map((item) => (
                      <option value={item.tag} key={item.tag}>
                        {item.tag} ({item.count})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button small primary"
                    onClick={openCreate}
                  >
                    + 新建笔记
                  </button>
                </div>

                {loading ? (
                  <div className="notes-empty">加载中…</div>
                ) : items.length === 0 ? (
                  <div className="notes-empty">暂无笔记</div>
                ) : (
                  <div className="notes-list">
                    {items.map((note) => (
                      <article className="note-card" key={note.id}>
                        <div className="note-card-head">
                          <strong>{note.title || "无标题"}</strong>
                          <span>{formatTime(note.updated_at)}</span>
                        </div>
                        <p className="note-content">
                          {note.content || "（无正文）"}
                        </p>
                        {note.tags.length > 0 && (
                          <div className="note-tags">
                            {note.tags.map((tag) => (
                              <button
                                type="button"
                                className={`note-tag ${
                                  tagFilter === tag ? "active" : ""
                                }`}
                                key={tag}
                                onClick={() => {
                                  setTagFilter(tag);
                                  setPage(1);
                                }}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="note-actions">
                          <button
                            type="button"
                            className="button small"
                            onClick={() => openEdit(note)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="button small danger"
                            onClick={() => void deleteNote(note)}
                          >
                            删除
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <div className="notes-pagination">
                  <button
                    type="button"
                    className="button small"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="button small"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    下一页
                  </button>
                </div>
              </>
            ) : (
              <div className="note-form">
                <label>
                  标题
                  <input
                    value={form.title}
                    maxLength={200}
                    placeholder="可选"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  正文
                  <textarea
                    value={form.content}
                    maxLength={20000}
                    rows={12}
                    placeholder="记录行情、交易或复盘内容"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        content: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  标签
                  <input
                    value={form.tags}
                    placeholder="用逗号分隔，例如：BTC, 复盘, 风险"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tags: event.target.value
                      }))
                    }
                  />
                </label>
                <div className="note-form-actions">
                  <button
                    type="button"
                    className="button small"
                    disabled={saving}
                    onClick={() => {
                      setMode("list");
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                      setError("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="button small primary"
                    disabled={saving}
                    onClick={() => void saveNote()}
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

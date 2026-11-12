"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";

const PAGE_SIZE = 12;
const FULL_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 360;

interface CaseImage {
  id: number;
  width: number;
  height: number;
  byte_size: number;
  created_at: number;
}

interface CaseItem {
  id: number;
  title: string;
  description: string;
  image_count: number;
  cover_image_id: number | null;
  created_at: number;
  updated_at: number;
}

interface CaseDetail extends CaseItem {
  images: CaseImage[];
}

interface CasePage {
  items: CaseItem[];
  total: number;
  page: number;
  total_pages: number;
}

interface CompressedImage {
  full: string;
  thumb: string;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function renderJpeg(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(
    1,
    maxEdge / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持图片压缩");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width,
    height
  };
}

async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("原始图片不能超过 15MB");
  }

  const image = await loadImage(file);
  const full = renderJpeg(image, FULL_MAX_EDGE, 0.82);
  const thumb = renderJpeg(image, THUMB_MAX_EDGE, 0.72);

  return {
    full: full.dataUrl,
    thumb: thumb.dataUrl,
    width: full.width,
    height: full.height
  };
}

function imageUrl(id: number, variant: "thumb" | "full"): string {
  return `/api/cases/images/${id}?variant=${variant}`;
}

export function CasesPanel() {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewImageId, setPreviewImageId] = useState<number | null>(
    null
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCurrent, setUploadCurrent] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const requestIdRef = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const loadList = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE)
      });

      if (search) {
        params.set("search", search);
      }

      const data = await api<CasePage>(
        `/api/cases?${params.toString()}`
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
  }, [page, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);

    try {
      const data = await api<CaseDetail>(`/api/cases/${id}`);
      setDetail(data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function openCreate(): void {
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormOpen(true);
    setError("");
  }

  function openEdit(item: CaseItem | CaseDetail): void {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormOpen(true);
    setError("");
  }

  async function saveCase(): Promise<void> {
    if (saving) {
      return;
    }

    if (!formTitle.trim() && !formDescription.trim()) {
      setError("标题和描述不能同时为空");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editingId === null) {
        const created = await api<CaseItem>("/api/cases", {
          method: "POST",
          body: JSON.stringify({
            title: formTitle,
            description: formDescription
          })
        });
        setFormOpen(false);
        setPage(1);
        await loadList();
        await loadDetail(created.id);
      } else {
        await api(`/api/cases/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: formTitle,
            description: formDescription
          })
        });
        setFormOpen(false);
        await Promise.all([loadList(), loadDetail(editingId)]);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCase(item: CaseItem | CaseDetail): Promise<void> {
    if (
      !window.confirm(
        `删除案例「${item.title || "无标题"}」及其全部截图？`
      )
    ) {
      return;
    }

    setError("");

    try {
      await api(`/api/cases/${item.id}`, { method: "DELETE" });
      setDetail(null);
      setPreviewImageId(null);

      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await loadList();
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  async function uploadFiles(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!detail || files.length === 0) {
      return;
    }

    const remaining = 50 - detail.images.length;

    if (remaining <= 0) {
      setError("单个案例最多 50 张图片");
      return;
    }

    const accepted = files.slice(0, remaining);
    setUploading(true);
    setUploadTotal(accepted.length);
    setError("");

    for (const [index, file] of accepted.entries()) {
      setUploadCurrent(index + 1);

      try {
        const image = await compressImage(file);
        await api(`/api/cases/${detail.id}/images`, {
          method: "POST",
          body: JSON.stringify(image)
        });
      } catch (uploadError) {
        setError(
          `${file.name}: ${errorMessage(uploadError)}`
        );
      }
    }

    setUploading(false);
    setUploadCurrent(0);
    setUploadTotal(0);
    await Promise.all([loadDetail(detail.id), loadList()]);
  }

  async function deleteImage(image: CaseImage): Promise<void> {
    if (!detail || !window.confirm("删除这张截图？")) {
      return;
    }

    setError("");

    try {
      await api(`/api/cases/${detail.id}/images/${image.id}`, {
        method: "DELETE"
      });
      if (previewImageId === image.id) {
        setPreviewImageId(null);
      }
      await Promise.all([loadDetail(detail.id), loadList()]);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  return (
    <section className="cases-panel">
      <div className="cases-toolbar">
        <label className="search-box cases-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            placeholder="搜索案例标题 / 描述"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="cases-count">共 {total} 个案例</span>
        <button
          type="button"
          className="button primary"
          onClick={openCreate}
        >
          + 新建案例
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="empty">暂无交易案例</div>
      ) : (
        <div className="cases-grid">
          {items.map((item) => (
            <article
              className="case-card"
              key={item.id}
              onClick={() => void loadDetail(item.id)}
            >
              <div className="case-cover">
                {item.cover_image_id ? (
                  <img
                    src={imageUrl(item.cover_image_id, "thumb")}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span>暂无截图</span>
                )}
              </div>
              <div className="case-card-body">
                <div className="case-card-head">
                  <strong>{item.title || "无标题"}</strong>
                  <span>{item.image_count} 图</span>
                </div>
                <p>{item.description || "（无描述）"}</p>
                <div className="case-card-foot">
                  <span>{formatTime(item.updated_at)}</span>
                  <div className="case-card-actions">
                    <button
                      type="button"
                      className="button small"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(item);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="button small danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteCase(item);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="cases-pagination">
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

      {detail && (
        <div
          className="modal-backdrop case-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetail(null);
              setPreviewImageId(null);
            }
          }}
        >
          <section className="modal case-detail-modal">
            <div className="case-detail-head">
              <div>
                <h2>{detail.title || "无标题"}</h2>
                <p>
                  {detail.images.length} 张截图 ·{" "}
                  {formatTime(detail.updated_at)}
                </p>
              </div>
              <div className="case-detail-actions">
                <button
                  type="button"
                  className="button small"
                  onClick={() => openEdit(detail)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="button small danger"
                  onClick={() => void deleteCase(detail)}
                >
                  删除
                </button>
                <button
                  type="button"
                  className="notes-close"
                  aria-label="关闭"
                  onClick={() => {
                    setDetail(null);
                    setPreviewImageId(null);
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <p className="case-description">
              {detail.description || "（无描述）"}
            </p>

            {error && <div className="error-box">{error}</div>}

            <div className="case-upload-row">
              <label className="button small primary case-upload-button">
                {uploading
                  ? `上传中 ${uploadCurrent}/${uploadTotal}`
                  : "+ 上传截图"}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading || detail.images.length >= 50}
                  onChange={(event) => void uploadFiles(event)}
                />
              </label>
              <span>
                最多 50 张/案例 · 总上限 200 张
              </span>
            </div>

            {detailLoading ? (
              <div className="empty">加载中…</div>
            ) : detail.images.length === 0 ? (
              <div className="empty">还没有截图</div>
            ) : (
              <div className="case-gallery">
                {detail.images.map((image) => (
                  <figure className="case-image" key={image.id}>
                    <button
                      type="button"
                      className="case-image-button"
                      onClick={() => setPreviewImageId(image.id)}
                    >
                      <img
                        src={imageUrl(image.id, "thumb")}
                        alt=""
                        loading="lazy"
                      />
                    </button>
                    <button
                      type="button"
                      className="case-image-delete"
                      aria-label="删除截图"
                      onClick={() => void deleteImage(image)}
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {previewImageId !== null && (
        <div
          className="modal-backdrop case-preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewImageId(null);
            }
          }}
        >
          <button
            type="button"
            className="case-preview-close"
            aria-label="关闭图片"
            onClick={() => setPreviewImageId(null)}
          >
            ×
          </button>
          <img
            className="case-preview-image"
            src={imageUrl(previewImageId, "full")}
            alt=""
          />
        </div>
      )}

      {formOpen && (
        <div
          className="modal-backdrop case-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setFormOpen(false);
            }
          }}
        >
          <section className="modal case-form-modal">
            <div className="case-detail-head">
              <h2>{editingId === null ? "新建案例" : "编辑案例"}</h2>
              <button
                type="button"
                className="notes-close"
                aria-label="关闭"
                onClick={() => setFormOpen(false)}
              >
                ×
              </button>
            </div>
            {error && <div className="error-box">{error}</div>}
            <div className="note-form">
              <label>
                标题
                <input
                  value={formTitle}
                  maxLength={120}
                  placeholder="例如：BTC 顶部反转"
                  onChange={(event) => setFormTitle(event.target.value)}
                />
              </label>
              <label>
                描述
                <textarea
                  value={formDescription}
                  maxLength={5000}
                  rows={10}
                  placeholder="记录交易逻辑、入场理由、结果和复盘"
                  onChange={(event) =>
                    setFormDescription(event.target.value)
                  }
                />
              </label>
              <div className="note-form-actions">
                <button
                  type="button"
                  className="button small"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="button small primary"
                  disabled={saving}
                  onClick={() => void saveCase()}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

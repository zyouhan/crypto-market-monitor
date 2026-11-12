import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import { db, resolvedDatabasePath } from "../../db";
import {
  failure,
  isPositiveInteger,
  success
} from "../middleware";

export const casesRouter: Router = Router();

const IMAGE_ROOT = path.join(
  path.dirname(resolvedDatabasePath),
  "case-images"
);
const MAX_IMAGES_TOTAL = 200;
const MAX_IMAGES_PER_CASE = 50;
const MAX_FULL_BYTES = 2.5 * 1024 * 1024;
const MAX_THUMB_BYTES = 500 * 1024;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 5000;
const MAX_LIMIT = 50;

interface CaseRow {
  id: number;
  title: string;
  description: string;
  created_at: number;
  updated_at: number;
}

interface CaseImageRow {
  id: number;
  case_id: number;
  full_filename: string;
  thumb_filename: string;
  mime: string;
  width: number;
  height: number;
  byte_size: number;
  created_at: number;
}

interface DecodedImage {
  buffer: Buffer;
  mime: string;
  extension: string;
}

function readCaseInput(body: unknown): {
  title: string;
  description: string;
} {
  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const title =
    typeof input.title === "string" ? input.title.trim() : "";
  const description =
    typeof input.description === "string"
      ? input.description.trim()
      : "";

  if (!title && !description) {
    throw new Error("标题和描述不能同时为空");
  }

  if (title.length > MAX_TITLE) {
    throw new Error(`标题不能超过 ${MAX_TITLE} 个字符`);
  }

  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`描述不能超过 ${MAX_DESCRIPTION} 个字符`);
  }

  return { title, description };
}

function decodeImage(
  value: unknown,
  maxBytes: number,
  label: string
): DecodedImage {
  if (typeof value !== "string") {
    throw new Error(`${label}格式不正确`);
  }

  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
  );

  if (!match) {
    throw new Error(`${label}只支持 JPEG/PNG/WebP`);
  }

  const mime = `image/${match[1]}`;
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error(
      `${label}不能超过 ${Math.round(maxBytes / 1024 / 1024 * 10) / 10}MB`
    );
  }

  const isJpeg =
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (
    (mime === "image/jpeg" && !isJpeg) ||
    (mime === "image/png" && !isPng) ||
    (mime === "image/webp" && !isWebp)
  ) {
    throw new Error(`${label}内容与图片格式不匹配`);
  }

  return {
    buffer,
    mime,
    extension:
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : "jpg"
  };
}

function imagePath(filename: string): string {
  return path.join(IMAGE_ROOT, path.basename(filename));
}

function removeFiles(filenames: string[]): void {
  for (const filename of filenames) {
    try {
      fs.unlinkSync(imagePath(filename));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        console.error("[Cases] 删除图片失败", filename, error);
      }
    }
  }
}

function getCase(id: number): CaseRow | null {
  return (
    (db.prepare(`
      SELECT id, title, description, created_at, updated_at
      FROM trade_cases
      WHERE id = ?
    `).get(id) as CaseRow | undefined) ?? null
  );
}

function imageView(image: CaseImageRow) {
  return {
    id: image.id,
    width: image.width,
    height: image.height,
    byte_size: image.byte_size,
    created_at: image.created_at
  };
}

function getCaseImages(caseId: number): CaseImageRow[] {
  return db.prepare(`
    SELECT *
    FROM trade_case_images
    WHERE case_id = ?
    ORDER BY id ASC
  `).all(caseId) as CaseImageRow[];
}

casesRouter.get("/images/:imageId", (req, res) => {
  const imageId = Number(req.params.imageId);

  if (!isPositiveInteger(imageId)) {
    res.status(400).json(failure("图片 ID 不正确"));
    return;
  }

  const image = db.prepare(`
    SELECT *
    FROM trade_case_images
    WHERE id = ?
  `).get(imageId) as CaseImageRow | undefined;

  if (!image) {
    res.status(404).json(failure("图片不存在"));
    return;
  }

  const variant = req.query.variant === "full" ? "full" : "thumb";
  const filename =
    variant === "full" ? image.full_filename : image.thumb_filename;

  res.setHeader(
    "Cache-Control",
    "private, max-age=31536000, immutable"
  );
  res.type(image.mime);
  res.sendFile(imagePath(filename), (error) => {
    if (error && !res.headersSent) {
      res.status(404).json(failure("图片文件不存在"));
    }
  });
});

casesRouter.get("/", (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 12, 1),
    MAX_LIMIT
  );
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim()
      : "";
  const where = search
    ? "WHERE title LIKE ? OR description LIKE ?"
    : "";
  const params = search ? [`%${search}%`, `%${search}%`] : [];
  const totalRow = db.prepare(`
    SELECT COUNT(1) AS count
    FROM trade_cases
    ${where}
  `).get(...params) as { count: number };
  const totalPages = Math.max(1, Math.ceil(totalRow.count / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;
  const items = db.prepare(`
    SELECT
      c.id,
      c.title,
      c.description,
      c.created_at,
      c.updated_at,
      (
        SELECT COUNT(1)
        FROM trade_case_images i
        WHERE i.case_id = c.id
      ) AS image_count,
      (
        SELECT i.id
        FROM trade_case_images i
        WHERE i.case_id = c.id
        ORDER BY i.id ASC
        LIMIT 1
      ) AS cover_image_id
    FROM trade_cases c
    ${where}
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json(
    success({
      items,
      total: totalRow.count,
      page: currentPage,
      limit,
      total_pages: totalPages
    })
  );
});

casesRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("案例 ID 不正确"));
    return;
  }

  const row = getCase(id);

  if (!row) {
    res.status(404).json(failure("案例不存在"));
    return;
  }

  res.json(
    success({
      ...row,
      images: getCaseImages(id).map(imageView)
    })
  );
});

casesRouter.post("/", (req, res) => {
  let input: ReturnType<typeof readCaseInput>;

  try {
    input = readCaseInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "案例内容不正确")
    );
    return;
  }

  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO trade_cases (
      title, description, created_at, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run(input.title, input.description, now, now);
  const id = Number(result.lastInsertRowid);
  const row = getCase(id);

  res.json(success(row, "案例已创建"));
});

casesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("案例 ID 不正确"));
    return;
  }

  if (!getCase(id)) {
    res.status(404).json(failure("案例不存在"));
    return;
  }

  let input: ReturnType<typeof readCaseInput>;

  try {
    input = readCaseInput(req.body);
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "案例内容不正确")
    );
    return;
  }

  db.prepare(`
    UPDATE trade_cases
    SET title = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(input.title, input.description, Date.now(), id);

  res.json(success(getCase(id), "案例已更新"));
});

casesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("案例 ID 不正确"));
    return;
  }

  const images = getCaseImages(id);
  const result = db.prepare("DELETE FROM trade_cases WHERE id = ?").run(id);

  if (result.changes === 0) {
    res.status(404).json(failure("案例不存在"));
    return;
  }

  removeFiles(
    images.flatMap((image) => [
      image.full_filename,
      image.thumb_filename
    ])
  );

  res.json(success({ id }, "案例已删除"));
});

casesRouter.post("/:id/images", (req, res) => {
  const id = Number(req.params.id);

  if (!isPositiveInteger(id)) {
    res.status(400).json(failure("案例 ID 不正确"));
    return;
  }

  if (!getCase(id)) {
    res.status(404).json(failure("案例不存在"));
    return;
  }

  const total = db.prepare(`
    SELECT COUNT(1) AS count
    FROM trade_case_images
  `).get() as { count: number };
  const caseCount = db.prepare(`
    SELECT COUNT(1) AS count
    FROM trade_case_images
    WHERE case_id = ?
  `).get(id) as { count: number };

  if (total.count >= MAX_IMAGES_TOTAL) {
    res.status(400).json(failure("图片总数已达到 200 张上限"));
    return;
  }

  if (caseCount.count >= MAX_IMAGES_PER_CASE) {
    res.status(400).json(failure("单个案例最多 50 张图片"));
    return;
  }

  let full: DecodedImage;
  let thumb: DecodedImage;
  const width = Number(req.body?.width);
  const height = Number(req.body?.height);

  try {
    full = decodeImage(req.body?.full, MAX_FULL_BYTES, "完整图");
    thumb = decodeImage(req.body?.thumb, MAX_THUMB_BYTES, "缩略图");
  } catch (error) {
    res.status(400).json(
      failure(error instanceof Error ? error.message : "图片格式不正确")
    );
    return;
  }

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 10000 ||
    height > 10000
  ) {
    res.status(400).json(failure("图片尺寸不正确"));
    return;
  }

  const uuid = crypto.randomUUID();
  const fullFilename = `${uuid}-full.${full.extension}`;
  const thumbFilename = `${uuid}-thumb.${thumb.extension}`;
  const fullPath = imagePath(fullFilename);
  const thumbPath = imagePath(thumbFilename);

  try {
    fs.mkdirSync(IMAGE_ROOT, { recursive: true });
    fs.writeFileSync(fullPath, full.buffer);
    fs.writeFileSync(thumbPath, thumb.buffer);
  } catch (error) {
    removeFiles([fullFilename, thumbFilename]);
    res.status(500).json(failure("图片保存失败"));
    return;
  }

  try {
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO trade_case_images (
        case_id, full_filename, thumb_filename, mime,
        width, height, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      fullFilename,
      thumbFilename,
      full.mime,
      width,
      height,
      full.buffer.length,
      now
    );
    db.prepare(`
      UPDATE trade_cases
      SET updated_at = ?
      WHERE id = ?
    `).run(now, id);

    const image = db.prepare(`
      SELECT *
      FROM trade_case_images
      WHERE id = ?
    `).get(result.lastInsertRowid) as CaseImageRow;

    res.json(success(imageView(image), "图片已上传"));
  } catch (error) {
    removeFiles([fullFilename, thumbFilename]);
    console.error("[Cases] 保存图片记录失败", error);
    res.status(500).json(failure("图片保存失败"));
  }
});

casesRouter.delete("/:id/images/:imageId", (req, res) => {
  const id = Number(req.params.id);
  const imageId = Number(req.params.imageId);

  if (!isPositiveInteger(id) || !isPositiveInteger(imageId)) {
    res.status(400).json(failure("参数不正确"));
    return;
  }

  const image = db.prepare(`
    SELECT *
    FROM trade_case_images
    WHERE id = ? AND case_id = ?
  `).get(imageId, id) as CaseImageRow | undefined;

  if (!image) {
    res.status(404).json(failure("图片不存在"));
    return;
  }

  db.prepare("DELETE FROM trade_case_images WHERE id = ?").run(imageId);
  db.prepare(`
    UPDATE trade_cases
    SET updated_at = ?
    WHERE id = ?
  `).run(Date.now(), id);
  removeFiles([image.full_filename, image.thumb_filename]);

  res.json(success({ id: imageId }, "图片已删除"));
});

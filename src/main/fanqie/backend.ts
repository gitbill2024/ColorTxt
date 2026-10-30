/**
 * 对「本机 fqapp / 什锦铺 后端」回环 HTTP 接口的客户端。
 *
 * fqapp 电脑版的 Rust 后端会把番茄小说的设备注册、请求签名（a_bogus /
 * msToken）与 AES-CBC DRM 解密全部做完，并通过 `/api/v1/*` 读接口对外暴露
 * 给外部阅读器 / 本地工具。此处只做三件事：
 *   1. 探测后端地址（默认 127.0.0.1:18921，可用环境变量覆盖）
 *   2. 调用 search / detail / directory / content 读取接口
 *   3. 把后端「已解密」的结果装配成结构化的中间对象，供 service 层映射进
 *      ColorTxt 书源模型。
 *
 * 后端地址默认读取环境变量 FQAPP_BACKEND_URL；未设置时回退到默认端口。
 */
import type { FanqieBackendStatus } from "@shared/fanqie/types";

const DEFAULT_BACKEND_PORT = 18921;

export class FanqieBackendError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FanqieBackendError";
    this.status = status;
  }
}

function defaultBackendBaseUrl(): string {
  const fromEnv = process.env.FQAPP_BACKEND_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;
}

let configuredBaseUrl = defaultBackendBaseUrl();

/** 当前生效的后端基址（可由用户设置覆盖） */
export function getFanqieBackendBaseUrl(): string {
  return configuredBaseUrl;
}

/** 覆盖后端基址；空串回退到默认 */
export function setFanqieBackendBaseUrl(url: string): void {
  configuredBaseUrl = url.trim() ? url.trim().replace(/\/+$/, "") : defaultBackendBaseUrl();
}

async function requestJson(
  path: string,
  query: Record<string, string | number | undefined>,
  timeoutMs = 15_000,
): Promise<unknown> {
  const base = getFanqieBackendBaseUrl();
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new FanqieBackendError(`无法连接什锦铺后端：${msg}`);
  }
  if (res.status === 404) {
    throw new FanqieBackendError("后端接口不存在（请确认已安装对应版本的什锦铺）", 404);
  }
  if (res.status >= 500) {
    throw new FanqieBackendError(`后端服务异常（HTTP ${res.status}）`, res.status);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FanqieBackendError("后端返回了非 JSON 响应", res.status);
  }
  return json;
}

/** 带 JSON body 的 POST（账号书架采集用）。 */
async function requestJsonPost(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<unknown> {
  const base = getFanqieBackendBaseUrl();
  const url = new URL(path, base);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new FanqieBackendError(`无法连接什锦铺后端：${msg}`);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FanqieBackendError("后端返回了非 JSON 响应", res.status);
  }
  const obj = asObject(json);
  if (obj && obj.success === false) {
    throw new FanqieBackendError(str(obj.error) || "后端请求未成功", res.status);
  }
  return json;
}

/** 读取后端返回的业务载荷：兼容 { data } 或裸对象两种形态 */
function unwrapData(payload: unknown): Record<string, unknown> | unknown[] | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, "data")) {
      const d = obj.data;
      if (d !== null && d !== undefined) return d as Record<string, unknown> | unknown[];
    }
    return obj;
  }
  if (Array.isArray(payload)) return payload;
  return null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) {
    for (const e of v) {
      const s = str(e);
      if (s) return s;
    }
    return "";
  }
  return String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type FanqieSearchItem = {
  bookId: string;
  name: string;
  author: string;
  cover: string;
  intro: string;
  kind: string;
  wordCount: number;
  lastChapter: string;
};

export type FanqieSearchResult = {
  hasMore: boolean;
  nextOffset: number | null;
  items: FanqieSearchItem[];
};

/** 从单个搜索 cell 里抽取书籍字段（book_data 可能是对象或数组）。 */
function extractBookItem(cell: Record<string, unknown>): FanqieSearchItem | null {
  const bookData = asObject(cell.book_data) ?? cell;
  // book_data 可能是数组：取第一个元素作为书籍对象（对齐 fqapp 客户端行为）
  let bookObj: Record<string, unknown> = bookData;
  if (Array.isArray(cell.book_data)) {
    const first = cell.book_data[0];
    const fo = asObject(first);
    if (fo) bookObj = { ...cell, ...fo };
  }
  const bd = bookObj;
  const bookId =
    str(bd.book_id) ||
    str(bd.bookId) ||
    str(bd.item_id) ||
    str(bd.id) ||
    str(cell.book_id) ||
    "";
  const name =
    str(bd.book_name) ||
    str(bd.title) ||
    str(bd.name) ||
    str(bd.raw_book_name) ||
    "";
  if (!bookId || !name) return null;
  const author =
    str(bd.author_name) ||
    str(bd.author) ||
    str(bd.author_text) ||
    "";
  const cover =
    str(bd.thumb_url) ||
    str(bd.audio_thumb_uri) ||
    str(bd.cover) ||
    str(bd.cover_url) ||
    str(bd.book_cover) ||
    "";
  const intro = str(bd.abstract) || str(bd.intro) || str(bd.description) || "";
  const kind = str(bd.category) || str(bd.kind) || str(bd.cat_name) || "";
  const wordCount = num(
    bd.word_number ??
      bd.wordNumber ??
      bd.word_num ??
      bd.words_count,
  );
  const lastChapter = str(bd.last_chapter) || str(bd.last_chapter_title) || "";
  return {
    bookId,
    name,
    author,
    cover,
    intro,
    kind,
    wordCount,
    lastChapter,
  };
}

/** 搜索小说（tab_type=3 书籍；不传则取第一个含书籍的 tab） */
export async function searchFanqieBooks(
  query: string,
  offset = 0,
  count = 20,
): Promise<FanqieSearchResult> {
  const payload = await requestJson("/api/v1/search", {
    query,
    offset,
    count,
    tab_type: 3,
  });
  const data = unwrapData(payload);
  const root = asObject(data ?? payload) ?? {};
  const tabs = asArray(root.search_tabs).length
    ? asArray(root.search_tabs)
    : asArray(asObject(root.data)?.["search_tabs"] ?? []);
  let items: FanqieSearchItem[] = [];
  let hasMore = false;
  let nextOffset: number | null = null;
  for (const rawTab of tabs) {
    const tab = asObject(rawTab);
    if (!tab) continue;
    if (tab.tab_type !== undefined && Number(tab.tab_type) !== 3) continue;
    for (const rawCell of asArray(tab.data)) {
      const cell = asObject(rawCell);
      if (!cell) continue;
      const fb = extractBookItem(cell);
      if (fb) items.push(fb);
    }
    if (typeof tab.has_more === "boolean") hasMore = hasMore || tab.has_more;
    if (tab.next_offset !== undefined) {
      nextOffset = num(tab.next_offset);
    }
  }
  // 兜底：某些 tab 未打 tab_type 时直接全量收集
  if (items.length === 0) {
    for (const rawTab of tabs) {
      const tab = asObject(rawTab);
      if (!tab) continue;
      for (const rawCell of asArray(tab.data)) {
        const cell = asObject(rawCell);
        if (!cell) continue;
        const fb = extractBookItem(cell);
        if (fb) items.push(fb);
      }
    }
  }
  // 去重
  const seen = new Set<string>();
  items = items.filter((it) => {
    if (seen.has(it.bookId)) return false;
    seen.add(it.bookId);
    return true;
  });
  return { hasMore, nextOffset, items };
}

export type FanqieBookDetail = {
  bookId: string;
  name: string;
  author: string;
  cover: string;
  intro: string;
  kind: string;
  wordCount: number;
  lastChapter: string;
  creationStatus: number;
  serialCount: number;
  score: string;
  tags: string[];
  tocUrl: string;
};

/** 读取书籍详情（/api/v1/books/{id}/detail） */
export async function getFanqieBookDetail(bookId: string): Promise<FanqieBookDetail | null> {
  const id = encodeURIComponent(bookId);
  const payload = await requestJson(`/api/v1/books/${id}/detail`, {});
  const data = unwrapData(payload);
  const d = asObject(data ?? payload) ?? {};
  const name =
    str(d.book_name) || str(d.title) || str(d.name) || str(d.book_title) || "";
  const gotId = str(d.book_id) || bookId;
  if (!gotId || !name) return null;
  const authorObj = asObject(d.author) ?? asObject(d.author_data) ?? {};
  const author =
    str(d.author_name) ||
    str(authorObj.user_name) ||
    str(d.author) ||
    str(d.author_text) ||
    "";
  const cover =
    str(d.thumb_url) || str(d.cover) || str(d.cover_url) || str(d.book_cover) || "";
  const intro = str(d.abstract) || str(d.intro) || str(d.description) || "";
  const kind = str(d.category) || str(d.category_name) || str(d.cat_name) || "";
  const wordCount = num(d.word_number ?? d.wordNumber);
  const lastChapter = str(d.last_chapter_title) || str(d.last_chapter) || "";
  const creationStatus = num(d.creation_status ?? d.creationStatus);
  const serialCount = num(d.serial_count ?? d.serialCount);
  const score = str(d.score);
  const tags = str(d.tags)
    ? str(d.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    bookId: gotId,
    name,
    author,
    cover,
    intro,
    kind,
    wordCount,
    lastChapter,
    creationStatus,
    serialCount,
    score,
    tags,
    tocUrl: str(d.directory_url) || "",
  };
}

export type FanqieChapter = {
  itemId: string;
  title: string;
  index: number;
  isVip: boolean;
};

export type FanqieDirectory = {
  bookId: string;
  chapters: FanqieChapter[];
};

/** 读取章节目录（/api/v1/books/{id}/directory） */
export async function getFanqieDirectory(bookId: string): Promise<FanqieDirectory | null> {
  const id = encodeURIComponent(bookId);
  const payload = await requestJson(`/api/v1/books/${id}/directory`, {});
  const data = unwrapData(payload);
  const root = asObject(data ?? payload) ?? {};
  // 不同后端/协议版本章节列表字段名不一，逐个尝试
  const chapterList =
    root.item_data_list ??
    root.item_list ??
    root.chapter_list_with_chapter_num ??
    root.chapterList ??
    root.chapter_list;
  const items = asArray(chapterList);
  if (items.length === 0) {
    const arr = asArray(root.data);
    if (arr.length) {
      return { bookId, chapters: arr.map(mapChapter) };
    }
    return null;
  }
  return { bookId, chapters: items.map(mapChapter) };
}

function mapChapter(raw: unknown, idx: number): FanqieChapter {
  const c = asObject(raw) ?? {};
  const itemId =
    str(c.item_id) || str(c.itemId) || str(c.chapter_id) || str(c.chapterId) || str(c.id) || "";
  const title = str(c.title) || str(c.chapter_title) || str(c.chapter_name) || `第${idx + 1}章`;
  return {
    itemId,
    title,
    index: idx,
    isVip: Boolean(c.is_vip ?? c.isVip ?? false),
  };
}

/** 读取已解密的章节正文（/api/v1/chapters/{itemId}/novel） */
export async function getFanqieChapterContent(itemId: string): Promise<string> {
  const id = encodeURIComponent(itemId);
  const payload = await requestJson(`/api/v1/chapters/${id}/novel`, {}, 20_000);
  const data = unwrapData(payload);
  const d = asObject(data ?? payload) ?? {};
  let content = str(d.content);
  if (!content) {
    // 有些后端把正文放在 data.data 或 item_infos
    const inner = asObject(d.data);
    if (inner) content = str(inner.content ?? inner.text);
  }
  if (!content) {
    const infos = asObject(d.item_infos);
    if (infos) {
      const val = infos[itemId] ?? infos[str(d.item_id)];
      const iv = asObject(val);
      if (iv) content = str(iv.content);
    }
  }
  if (!content) {
    throw new FanqieBackendError("后端未返回章节正文");
  }
  return content;
}

/** 后端探活 */
export async function probeFanqieBackend(
  timeoutMs = 3_000,
): Promise<FanqieBackendStatus> {
  const base = getFanqieBackendBaseUrl();
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    // /health 可能返回 404（部分后端未暴露）；能连通即视为进程在运行
    return {
      ok: true,
      running: true,
      baseUrl: base,
      httpStatus: res.status,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, running: false, baseUrl: base, message: msg };
  }
}

// ---------------------------------------------------------------------------
// 番茄账号书架采集（需要用户粘贴登录 Cookie）
// ---------------------------------------------------------------------------

/** 书架里的单本书 */
export type FanqieShelfBook = {
  bookId: string;
  name: string;
  author: string;
  cover: string;
  intro: string;
  kind: string;
  wordCount: number;
  lastChapter: string;
};

/** 阅读进度 */
export type FanqieShelfProgress = {
  bookId: string;
  /** 读到的最新章节 itemId */
  chapterItemId: string;
  /** 真实章节序号（1 起） */
  realChapterOrder: number;
  readAtMs: number;
};

/** 从上游 shelf 响应 payload 里递归抽取小说记录（book_type==0） */
function walkNovelRecords(value: unknown, out: FanqieShelfBook[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkNovelRecords(item, out);
    return;
  }
  const obj = asObject(value);
  if (!obj) return;
  const bookType = str(obj.book_type) || str(obj.bookType);
  const bookId =
    str(obj.book_id_str) || str(obj.book_id) || str(obj.bookId) || str(obj.id);
  const name = str(obj.book_name) || str(obj.title) || str(obj.name);
  // 命中一条小说记录：收集并停止向该节点更深处递归（避免把书内推荐卷进来）
  // book_type == 0 才是小说（对齐 fqapp 自带导入逻辑），排除听书/漫画等。
  if (bookId && name && bookType === "0") {
    out.push({
      bookId,
      name,
      author: str(obj.author) || str(obj.author_name) || "",
      cover: str(obj.thumb_url) || str(obj.cover) || str(obj.cover_url) || "",
      intro: str(obj.abstract) || str(obj.intro) || "",
      kind: str(obj.category) || str(obj.kind) || "",
      wordCount: num(obj.word_number ?? obj.wordNumber),
      lastChapter: str(obj.last_chapter_title) || str(obj.last_chapter) || "",
    });
    return;
  }
  for (const child of Object.values(obj)) {
    if (child && typeof child === "object") walkNovelRecords(child, out);
  }
}

/** 读取 payload 里的上游 JSON，返回其 data（可能带 has_more/next_offset） */
function payloadData(payloadJson: unknown): Record<string, unknown> | unknown[] | null {
  const p = asObject(payloadJson);
  if (!p) return null;
  const d = p.data;
  if (d !== undefined && d !== null) return (typeof d === "object" ? d : null) as Record<string, unknown> | unknown[] | null;
  return p;
}

/** 采集番茄书架列表（分页）。cookie 为用户番茄登录态。 */
export async function getFanqieShelfBooks(
  cookie: string,
  bookType = 0,
): Promise<FanqieShelfBook[]> {
  const out: FanqieShelfBook[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const json = await requestJsonPost("/api/v1/account/fanqie/library", {
      cookie,
      resource: "shelf_list",
      book_type: bookType,
      offset,
      book_ids: [],
    });
    const obj = asObject(json);
    const payload = obj?.payload ?? json;
    const data = payloadData(payload);
    if (data == null) break;
    const before = out.length;
    walkNovelRecords(data, out);
    // 去重
    const dedup: FanqieShelfBook[] = [];
    for (const b of out) {
      if (!seen.has(b.bookId)) {
        seen.add(b.bookId);
        dedup.push(b);
      }
    }
    out.length = 0;
    out.push(...dedup);
    // 分页判断
    const dataObj = asObject(data);
    const hasMore = dataObj ? Boolean(dataObj.has_more ?? dataObj.hasMore) : false;
    const nextOffset = dataObj
      ? num(dataObj.next_offset ?? dataObj.nextOffset ?? dataObj.offset)
      : 0;
    if (!hasMore) break;
    if (nextOffset <= offset) break;
    offset = nextOffset;
    if (out.length === before && page > 3) break;
  }
  return out;
}

/** 批量读取书籍阅读进度（progress_batch） */
export async function getFanqieShelfProgress(
  cookie: string,
  bookIds: string[],
  bookType = 0,
): Promise<FanqieShelfProgress[]> {
  if (!bookIds.length) return [];
  const out: FanqieShelfProgress[] = [];
  const CHUNK = 50;
  for (let i = 0; i < bookIds.length; i += CHUNK) {
    const chunk = bookIds.slice(i, i + CHUNK);
    const json = await requestJsonPost("/api/v1/account/fanqie/library", {
      cookie,
      resource: "progress_batch",
      book_type: bookType,
      book_ids: chunk,
    });
    const obj = asObject(json);
    const payload = obj?.payload ?? json;
    const data = payloadData(payload);
    walkProgressRecords(data, out);
  }
  return out;
}

function walkProgressRecords(value: unknown, out: FanqieShelfProgress[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkProgressRecords(item, out);
    return;
  }
  const obj = asObject(value);
  if (!obj) return;
  const bookId =
    str(obj.book_id_str) || str(obj.book_id) || str(obj.bookId) || str(obj.item_book_id) || "";
  const chapterItemId =
    str(obj.item_id) || str(obj.chapter_id) || str(obj.chapterId) || str(obj.itemId) || "";
  if (bookId && chapterItemId) {
    const ms = num(obj.read_timestamp_ms);
    const sec = num(obj.read_timestamp);
    out.push({
      bookId,
      chapterItemId,
      realChapterOrder: num(obj.real_chapter_order ?? obj.order ?? obj.chapter_order),
      readAtMs: ms > 0 ? ms : sec > 0 ? sec * 1000 : 0,
    });
    return;
  }
  for (const child of Object.values(obj)) {
    if (child && typeof child === "object") walkProgressRecords(child, out);
  }
}

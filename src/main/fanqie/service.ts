/**
 * 把「本机 fqapp 后端」返回的番茄数据映射进 ColorTxt 书源模型。
 *
 * 这些函数是书源引擎（webBook.ts / getChapterContentWithCache.ts）在为
 * 内置番茄源分支时调用的出口，返回类型与 Legado 引擎一致，
 * 因此上层(搜索面板/阅读器/书架/缓存)无需感知来源差异。
 */
import {
  FANQIE_SOURCE_URL,
  FANQIE_SOURCE_NAME,
  fanqieBookUrl,
  parseFanqieBookId,
} from "@shared/fanqie/types";
import type {
  Book,
  BookChapter,
  SearchBookItem,
} from "@shared/bookSource/types";

import {
  getFanqieBookDetail,
  getFanqieChapterContent,
  getFanqieDirectory,
  searchFanqieBooks,
  type FanqieSearchItem,
} from "./backend";

function coverUrlOf(c: string): string {
  // 番茄的封面直链基本可直接访问；带协议相对或 http 均保留。
  if (!c) return "";
  return c;
}

function wordCountText(n: number): string {
  if (!n) return "";
  return String(n);
}

function fanqieSearchItemToSearchBook(it: FanqieSearchItem): SearchBookItem {
  const bookUrl = fanqieBookUrl(it.bookId);
  return {
    // id 加前缀避免与其它书源的数字 id 去重冲突
    id: `fanqie:${it.bookId}`,
    name: it.name,
    author: it.author,
    kind: it.kind,
    wordCount: wordCountText(it.wordCount),
    intro: it.intro,
    lastChapter: it.lastChapter,
    coverUrl: coverUrlOf(it.cover),
    coverSourceUrl: coverUrlOf(it.cover),
    bookUrl,
    origin: FANQIE_SOURCE_URL,
    originName: FANQIE_SOURCE_NAME,
    variable: { id: it.bookId },
    tocUrl: bookUrl,
  };
}

/** 搜索（page 1 起） */
export async function searchFanqieSource(key: string, page = 1): Promise<SearchBookItem[]> {
  const offset = (page - 1) * 20;
  const res = await searchFanqieBooks(key, offset, 20);
  return res.items.map(fanqieSearchItemToSearchBook);
}

/** 搜索「是否还有下一页」 */
export async function fanqieSearchHasMore(key: string, page: number): Promise<boolean> {
  const offset = (page - 1) * 20;
  const res = await searchFanqieBooks(key, offset, 20);
  return res.hasMore || res.items.length > 0;
}

/** 详情：从搜索带入的信息 + 后端详情补充 */
export async function getFanqieBookInfo(
  bookUrl: string,
  name: string,
  author: string,
  seed: {
    kind?: string;
    wordCount?: string;
    intro?: string;
    lastChapter?: string;
    coverUrl?: string;
    variable?: Record<string, string>;
    tocUrl?: string;
  } = {},
): Promise<Book> {
  const bookId = parseFanqieBookId(bookUrl) || seed.variable?.id || "";
  let detail = null;
  if (bookId) {
    try {
      detail = await getFanqieBookDetail(bookId);
    } catch {
      detail = null;
    }
  }
  return {
    name: detail?.name || name,
    author: detail?.author || author,
    intro: detail?.intro || seed.intro || "",
    coverUrl: detail?.cover || seed.coverUrl || "",
    coverSourceUrl: detail?.cover || seed.coverUrl || "",
    kind: detail?.kind || seed.kind || "",
    wordCount: wordCountText(detail?.wordCount || 0) || seed.wordCount || "",
    lastChapter: detail?.lastChapter || seed.lastChapter || "",
    tocUrl: detail?.tocUrl || seed.tocUrl || bookUrl,
    bookUrl,
    origin: FANQIE_SOURCE_URL,
    originName: FANQIE_SOURCE_NAME,
    variable: seed.variable,
  };
}

/** 目录 */
export async function getFanqieChapterList(bookUrl: string): Promise<BookChapter[]> {
  const bookId = parseFanqieBookId(bookUrl);
  if (!bookId) return [];
  const dir = await getFanqieDirectory(bookId);
  if (!dir) return [];
  // 后端目录按「第1章 → 最新」正序返回；ColorTxt 书源约定 getChapterList
  // 返回「最新在前」（无 `-` 前缀的章节目录会被引擎反转成正序展示），
  // 因此这里反转成最新在前，否则「下一章 / 上一章」会颠倒。
  const reversed = [...dir.chapters].reverse();
  let i = 0;
  return reversed.map((c) => {
    const idx = i++;
    return {
      title: c.title,
      // 用实际 itemId 作为章节定位（正文解析时据此取回正文）
      url: c.itemId ? `fanqie://chapter/${encodeURIComponent(c.itemId)}` : `fanqie://chapter/${encodeURIComponent(bookId)}/${idx}`,
      isVolume: false,
      isVip: c.isVip,
      tag: c.isVip ? "付费" : undefined,
    };
  });
}

/** 正文（后端已解密）。chapterUrl 即章节 itemId。 */
export async function getFanqieChapterContentByUrl(
  chapterUrl: string,
  chapterTitle = "",
): Promise<string> {
  const itemId = parseFanqieChapterItemId(chapterUrl);
  if (!itemId) throw new Error("无效的番茄章节 URL");
  const raw = await getFanqieChapterContent(itemId);
  const text = fanqieContentHtmlToText(raw, chapterTitle);
  if (!text.trim()) throw new Error("章节正文为空");
  return text;
}

/** 从 `fanqie://chapter/<itemId>` 或裸 itemId 解析出章节 id */
function parseFanqieChapterItemId(chapterUrl: string): string {
  if (!chapterUrl) return "";
  const prefix = "fanqie://chapter/";
  if (chapterUrl.startsWith(prefix)) {
    const rest = chapterUrl.slice(prefix.length);
    // 形如 <bookId>/<idx> 的兜底形式无法得到 itemId
    const firstSegment = rest.split("/")[0];
    return decodeURIComponent(firstSegment);
  }
  return decodeURIComponent(chapterUrl);
}

/**
 * 后端 /novel 返回的正文是 HTML（<p> / <br> 等）。作为文本书源接入，需转成
 * 纯文本：标题前置为一行，段落间换行，去标签、解实体、折叠多余空行。
 */
function fanqieContentHtmlToText(html: string, chapterTitle: string): string {
  if (!html) return "";
  const t = html.trim();
  // 已无标签（后端返回纯文本）时原样返回
  if (!/<[^>]+>/.test(t)) return t;

  let body = t;
  const titleMatch = /<div[^>]*class=["']tt-title["'][^>]*>([\s\S]*?)<\/div>/i.exec(body);
  const titleFromHtml = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : "";

  // <br> / </p> / </div> / </header> / </article> 视为换行
  body = body
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|header|article|section|h[1-6]|li|blockquote)>/gi, "\n");

  const text = decodeEntities(stripTags(body))
    .split("\n")
    .map((s) => s.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((s) => s.length > 0)
    .join("\n");

  const title = titleFromHtml || chapterTitle.trim();
  if (title && text !== title && !text.startsWith(`${title}\n`)) {
    return `${title}\n${text}`;
  }
  return text;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return Number.isFinite(c) ? String.fromCodePoint(c) : "";
    });
}

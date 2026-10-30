/**
 * 带离线缓存的章节正文：先读本地，miss 再联网，成功后写入缓存。
 * 阅读与整书下载共用。
 * 返回缓存/联网原文；全局「替换净化」在渲染展示管线（与「转换」同路径）或导出时再套用。
 */
import type { Book, BookSourceRecord } from "@shared/bookSource/types";
import { coerceBook } from "@shared/bookSource/bookModel";
import { isFanqieSource } from "@shared/fanqie/types";
import { getFanqieChapterContentByUrl } from "../../fanqie/service";
import {
  getChapterContent,
  isSameBookPageUrl,
  stripLeadingDuplicateChapterTitle,
} from "./webBook";
import { readChapterCache, saveChapterCache } from "./chapterCache";

export type ChapterContentBook = Book;

export type ChapterContentChapter = {
  title: string;
  url: string;
  index: number;
  isVolume?: boolean;
  tag?: string;
};

export async function getChapterContentWithCache(
  source: BookSourceRecord,
  chapterUrl: string,
  bookInput: ChapterContentBook | Partial<Book>,
  chapter: ChapterContentChapter,
  logs: string[] = [],
  nextChapterUrl?: string,
  options?: {
    preferCache?: boolean;
    cacheDir?: string;
    chapterUrls?: string[];
  },
): Promise<{ content: string; fromCache: boolean; displayTitle: string }> {
  if (isFanqieSource(source)) {
    return getFanqieContentWithCache(chapterUrl, bookInput, chapter, logs, options);
  }
  const preferCache = options?.preferCache !== false;
  const cacheDir = options?.cacheDir;
  const book = coerceBook(bookInput);
  const bookName = book.name || "";
  const bookUrl = book.bookUrl || "";
  const contentRule = source.ruleContent?.content?.trim() ?? "";
  const skipChapterCache =
    contentRule.startsWith("<js>") &&
    Boolean(bookUrl && chapterUrl && isSameBookPageUrl(chapterUrl, bookUrl));

  const finalize = (raw: string, fromCache: boolean) => ({
    content: raw,
    fromCache,
    displayTitle: chapter.title || "",
  });

  if (preferCache && bookUrl && chapterUrl && !skipChapterCache) {
    const cached = await readChapterCache(
      bookName,
      bookUrl,
      chapterUrl,
      cacheDir,
    );
    if (cached != null) {
      // 旧缓存可能仍含章节名；与联网路径一样剥离，必要时回写
      const stripped = stripLeadingDuplicateChapterTitle(
        cached,
        chapter.title,
        bookName,
      );
      if (stripped !== cached) {
        try {
          await saveChapterCache(
            bookName,
            bookUrl,
            chapterUrl,
            stripped,
            cacheDir,
          );
        } catch {
          /* ignore rewrite failures */
        }
      }
      return finalize(stripped, true);
    }
  }

  const content = await getChapterContent(
    source,
    chapterUrl,
    book,
    chapter,
    logs,
    nextChapterUrl,
    options?.chapterUrls,
  );

  if (
    bookUrl &&
    chapterUrl &&
    typeof content === "string" &&
    content.length &&
    !skipChapterCache
  ) {
    try {
      await saveChapterCache(
        bookName,
        bookUrl,
        chapterUrl,
        content,
        cacheDir,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logs.push(`写入章节缓存失败: ${msg}`);
    }
  }

  return finalize(content, false);
}

/** 番茄源正文：优先本地缓存，miss 才调用 fqapp 后端，成功后写缓存。 */
async function getFanqieContentWithCache(
  chapterUrl: string,
  bookInput: ChapterContentBook | Partial<Book>,
  chapter: ChapterContentChapter,
  logs: string[] = [],
  options?: {
    preferCache?: boolean;
    cacheDir?: string;
    chapterUrls?: string[];
  },
): Promise<{ content: string; fromCache: boolean; displayTitle: string }> {
  const book = coerceBook(bookInput);
  const bookName = book.name || "";
  const bookUrl = book.bookUrl || "";
  const finalize = (raw: string, fromCache: boolean) => ({
    content: raw,
    fromCache,
    displayTitle: chapter.title || "",
  });

  const preferCache = options?.preferCache !== false;
  const cacheDir = options?.cacheDir;
  if (preferCache && bookUrl && chapterUrl) {
    const cached = await readChapterCache(bookName, bookUrl, chapterUrl, cacheDir);
    if (cached != null) {
      const stripped = stripLeadingDuplicateChapterTitle(cached, chapter.title, bookName);
      if (stripped !== cached) {
        try {
          await saveChapterCache(bookName, bookUrl, chapterUrl, stripped, cacheDir);
        } catch {
          /* ignore rewrite failures */
        }
      }
      return finalize(stripped, true);
    }
  }

  let content: string;
  try {
    content = await getFanqieChapterContentByUrl(chapterUrl, chapter.title || "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[番茄小说] 正文获取失败: ${msg}`);
    throw e;
  }

  if (bookUrl && chapterUrl && content.length) {
    try {
      await saveChapterCache(bookName, bookUrl, chapterUrl, content, cacheDir);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logs.push(`写入章节缓存失败: ${msg}`);
    }
  }
  return finalize(content, false);
}

import { ipcMain } from "electron";
import { app } from "electron";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FANQIE_IPC } from "@shared/fanqie/ipc";
import type {
  FanqieSyncShelfBook,
  FanqieSyncShelfResult,
} from "@shared/fanqie/ipc";
import { fanqieBookUrl } from "@shared/fanqie/types";
import {
  getFanqieBackendBaseUrl,
  getFanqieShelfBooks,
  getFanqieShelfProgress,
  probeFanqieBackend,
  setFanqieBackendBaseUrl,
  type FanqieShelfProgress,
} from "./backend";
import { getFanqieBookInfo, getFanqieChapterList } from "./service";

const SETTINGS_FILE = "fanqie-backend.json";

type FanqieSettings = { backendUrl?: string; cookie?: string };

function settingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

async function loadSettings(): Promise<FanqieSettings> {
  try {
    const p = settingsPath();
    if (!existsSync(p)) return {};
    return JSON.parse(await readFile(p, "utf8")) as FanqieSettings;
  } catch {
    return {};
  }
}

async function saveSettings(settings: FanqieSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

async function applyStoredBackendUrl(): Promise<void> {
  const s = await loadSettings();
  if (s.backendUrl) setFanqieBackendBaseUrl(s.backendUrl);
}

/** 把番茄书架 + 进度同步成 ColorTxt 找书书架可消费的归一化数据 */
async function syncFanqieShelf(cookie: string | undefined): Promise<FanqieSyncShelfResult> {
  if (!cookie?.trim()) {
    return { ok: false, message: "请先在设置里粘贴番茄登录 Cookie" };
  }
  let shelfBooks;
  try {
    shelfBooks = await getFanqieShelfBooks(cookie.trim());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (!shelfBooks.length) {
    return { ok: false, message: "未获取到书架书籍（可能是 Cookie 无效或书架为空）" };
  }
  let progress: FanqieShelfProgress[] = [];
  try {
    progress = await getFanqieShelfProgress(
      cookie.trim(),
      shelfBooks.map((b) => b.bookId),
    );
  } catch {
    progress = [];
  }
  const progressByBook = new Map(progress.map((p) => [p.bookId, p]));

  const books: FanqieSyncShelfBook[] = [];
  let failed = 0;
  for (const b of shelfBooks) {
    try {
      const bookUrl = fanqieBookUrl(b.bookId);
      const detail = await getFanqieBookInfo(bookUrl, b.name, b.author, {
        kind: b.kind,
        wordCount: b.wordCount ? String(b.wordCount) : "",
        intro: b.intro,
        lastChapter: b.lastChapter,
        coverUrl: b.cover,
        tocUrl: bookUrl,
      });
      let chapters: FanqieSyncShelfBook["chapters"] = [];
      let lastReadChapterIndex = -1;
      let lastReadChapterTitle = "";
      try {
        const list = await getFanqieChapterList(bookUrl);
        chapters = list.map((c) => ({
          title: c.title,
          url: c.url,
          isVip: c.isVip,
        }));
      } catch {
        // 章节拉不到则不阻塞书架同步
      }
      const prog = progressByBook.get(b.bookId);
      if (prog?.chapterItemId) {
        const idx = chapters.findIndex((c) => /chapter\/[^/]+$/.test(c.url) && c.url.includes(encodeURIComponent(prog.chapterItemId)));
        if (idx >= 0) {
          lastReadChapterIndex = idx;
          lastReadChapterTitle = chapters[idx]!.title || "";
        } else if (prog.realChapterOrder > 0 && chapters.length) {
          // 兜底：按真实章节序号推算（目录最新在前，故 index = total - realOrder）
          const total = chapters.length;
          const approx = Math.max(0, total - prog.realChapterOrder);
          if (approx < total) {
            lastReadChapterIndex = approx;
            lastReadChapterTitle = chapters[approx]?.title || "";
          }
        }
      }
      books.push({
        bookUrl,
        name: detail.name || b.name,
        author: detail.author || b.author,
        cover: detail.coverUrl || b.cover,
        intro: detail.intro || b.intro,
        kind: detail.kind || b.kind,
        wordCount: detail.wordCount || (b.wordCount ? String(b.wordCount) : ""),
        lastChapter: detail.lastChapter || b.lastChapter,
        tocUrl: detail.tocUrl || bookUrl,
        chapters,
        lastReadChapterIndex,
        lastReadChapterTitle,
        lastReadAt: prog?.readAtMs ?? 0,
      });
    } catch {
      failed++;
    }
  }
  return {
    ok: true,
    total: shelfBooks.length,
    books,
    failed,
    added: books.length,
    message: `已同步 ${books.length} 本（失败 ${failed} 本）`,
  };
}

export function registerFanqieIpcHandlers(): void {
  // 启动时应用持久化的后端地址（有则覆盖默认）
  void applyStoredBackendUrl();

  ipcMain.handle(FANQIE_IPC.status, async () => {
    return probeFanqieBackend();
  });

  ipcMain.handle(FANQIE_IPC.getBackendUrl, () => {
    return getFanqieBackendBaseUrl();
  });

  ipcMain.handle(FANQIE_IPC.setBackendUrl, async (_e, url: unknown) => {
    const u = typeof url === "string" ? url : "";
    setFanqieBackendBaseUrl(u);
    const effective = getFanqieBackendBaseUrl();
    const s = await loadSettings();
    s.backendUrl = effective;
    await saveSettings(s);
    return { ok: true, message: effective };
  });

  ipcMain.handle(FANQIE_IPC.getCookie, async () => {
    const s = await loadSettings();
    return s.cookie ?? "";
  });

  ipcMain.handle(FANQIE_IPC.setCookie, async (_e, cookie: unknown) => {
    const c = typeof cookie === "string" ? cookie.trim() : "";
    const s = await loadSettings();
    s.cookie = c || undefined;
    await saveSettings(s);
    return { ok: true };
  });

  ipcMain.handle(FANQIE_IPC.syncShelf, async (_e, cookie: unknown) => {
    const passed = typeof cookie === "string" && cookie.trim() ? cookie.trim() : undefined;
    const stored = passed ?? (await loadSettings()).cookie ?? undefined;
    return syncFanqieShelf(stored);
  });
}


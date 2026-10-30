import type { FanqieBackendStatus } from "./types";

export const FANQIE_IPC = {
  /** 探活 / 获取后端状态 */
  status: "fanqie:status",
  /** 获取当前后端基址 */
  getBackendUrl: "fanqie:getBackendUrl",
  /** 设置后端基址（空串回退默认） */
  setBackendUrl: "fanqie:setBackendUrl",
  /** 获取已保存的番茄登录 Cookie */
  getCookie: "fanqie:getCookie",
  /** 保存番茄登录 Cookie（空串清除） */
  setCookie: "fanqie:setCookie",
  /** 同步番茄书架到找书书架 */
  syncShelf: "fanqie:syncShelf",
} as const;

export type FanqieSyncShelfChapter = {
  title: string;
  url: string;
  isVip?: boolean;
};

export type FanqieSyncShelfBook = {
  bookUrl: string;
  name: string;
  author: string;
  cover: string;
  intro: string;
  kind: string;
  wordCount: string;
  lastChapter: string;
  tocUrl: string;
  chapters: FanqieSyncShelfChapter[];
  /** 阅读进度：上一章数组下标（-1 表示未知） */
  lastReadChapterIndex: number;
  lastReadChapterTitle: string;
  lastReadAt: number;
};

export type FanqieSyncShelfResult = {
  ok: boolean;
  message?: string;
  added?: number;
  updated?: number;
  failed?: number;
  total?: number;
  books?: FanqieSyncShelfBook[];
};

export const FANQIE_CATEGORY = "番茄";

export type FanqieIpcApi = {
  fanqieStatus: () => Promise<FanqieBackendStatus>;
  fanqieGetBackendUrl: () => Promise<string>;
  fanqieSetBackendUrl: (url: string) => Promise<{ ok: boolean; message?: string }>;
  fanqieGetCookie: () => Promise<string>;
  fanqieSetCookie: (cookie: string) => Promise<{ ok: boolean }>;
  fanqieSyncShelf: (cookie?: string) => Promise<FanqieSyncShelfResult>;
};

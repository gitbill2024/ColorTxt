/**
 * 番茄小说（通过本机 fqapp / 什锦铺 后端桥接）的共享常量与类型。
 *
 * ColorTxt 并不实现番茄的设备注册/签名/DRM 解密——这些全部由本机运行的
 * fqapp 电脑版 Rust 后端完成；本模块只通过其回环 HTTP 接口（/api/v1/*）
 * 消费「已解密的纯文本」结果，并映射进 ColorTxt 的书源模型。
 */

/** 内置番茄书源的标识 URL（用于在书源引擎中识别并走桥接分支） */
export const FANQIE_SOURCE_URL = "fanqie://novel";

/** 内置番茄书源的显示名 */
export const FANQIE_SOURCE_NAME = "番茄小说";

/** 番茄书源的 searchUrl 占位标记（引擎据此识别走桥接分支） */
export const FANQIE_SEARCH_URL = "fanqie://novel/search";

/** 番茄书源的书籍详情 URL 占位形式：fanqie://book/<bookId> */
export function fanqieBookUrl(bookId: string): string {
  return `fanqie://book/${encodeURIComponent(bookId)}`;
}

/** 从 ColorTxt 内部书籍 URL 中解析出番茄 bookId；非番茄 URL 返回 null */
export function parseFanqieBookId(bookUrl: string): string | null {
  if (!bookUrl) return null;
  const m = /^fanqie:\/\/book\/(.+)$/.exec(bookUrl);
  if (!m) return null;
  return decodeURIComponent(m[1]);
}

/** 是否内置番茄书源 */
export function isFanqieSource(
  source: { bookSourceUrl?: string; bookSourceName?: string } | null | undefined,
): boolean {
  return Boolean(source && source.bookSourceUrl === FANQIE_SOURCE_URL);
}

/** 是否番茄书籍 URL */
export function isFanqieBookUrl(bookUrl: string | undefined | null): boolean {
  return Boolean(bookUrl && bookUrl.startsWith("fanqie://book/"));
}

/** fqapp 后端是否可达 / 后端状态 */
export type FanqieBackendStatus = {
  ok: boolean;
  baseUrl: string;
  /** 后端健康检查 HTTP 状态码（仅 ok 时） */
  httpStatus?: number;
  /** 不可达原因 */
  message?: string;
  /** 后端进程是否在运行（通过 /health 探测） */
  running: boolean;
};

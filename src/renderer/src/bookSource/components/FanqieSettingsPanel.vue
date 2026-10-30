<script setup lang="ts">
import { onMounted, ref } from "vue";
import SwitchToggle from "../../components/SwitchToggle.vue";
import { appAlert } from "../../services/appDialog";
import { appToast } from "../../services/appToast";
import type { FanqieBackendStatus } from "@shared/fanqie/types";
import type { FanqieSyncShelfResult } from "@shared/fanqie/ipc";
import { addSyncedFanqieBooksToFindBookBookshelf } from "../findBookBookshelf";

const FANQIE_SOURCE_URL = "fanqie://novel";

const status = ref<FanqieBackendStatus | null>(null);
const backendUrl = ref("");
const checking = ref(false);
const sourceEnabled = ref(true);
const busy = ref(false);

const cookie = ref("");
const syncing = ref(false);
const syncResult = ref<string>("");

async function refreshStatus() {
  checking.value = true;
  try {
    status.value = await window.colorTxt.fanqieStatus();
  } finally {
    checking.value = false;
  }
}

async function loadBackendUrl() {
  backendUrl.value = await window.colorTxt.fanqieGetBackendUrl();
}

async function loadCookie() {
  cookie.value = await window.colorTxt.fanqieGetCookie();
}

async function loadSourceEnabled() {
  try {
    const s = await window.colorTxt.bookSourceGet(FANQIE_SOURCE_URL);
    sourceEnabled.value = s?.enabled !== false;
  } catch {
    sourceEnabled.value = true;
  }
}

async function applyBackendUrl() {
  busy.value = true;
  try {
    const r = await window.colorTxt.fanqieSetBackendUrl(backendUrl.value.trim());
    if (!r.ok) {
      await appAlert(r.message || "保存失败");
      return;
    }
    backendUrl.value = r.message || backendUrl.value.trim();
    await appToast("已保存后端地址");
    await refreshStatus();
  } finally {
    busy.value = false;
  }
}

async function saveCookie() {
  busy.value = true;
  try {
    await window.colorTxt.fanqieSetCookie(cookie.value.trim());
    await appToast(cookie.value.trim() ? "已保存番茄登录 Cookie" : "已清除番茄登录 Cookie");
  } finally {
    busy.value = false;
  }
}

async function syncShelf() {
  syncing.value = true;
  syncResult.value = "";
  try {
    const r: FanqieSyncShelfResult = await window.colorTxt.fanqieSyncShelf();
    if (r.ok && r.books?.length) {
      const res = addSyncedFanqieBooksToFindBookBookshelf(r.books);
      syncResult.value = `${r.message || ""}；已加入找书书架（新增 ${res.added}，更新 ${res.updated}），分类「番茄」`;
      await appToast(`书架同步完成：新增 ${res.added}，更新 ${res.updated}`);
    } else {
      syncResult.value = r.message || "同步未完成";
      await appAlert(r.message || "同步失败");
    }
  } catch (e) {
    syncResult.value = e instanceof Error ? e.message : String(e);
    await appAlert(syncResult.value);
  } finally {
    syncing.value = false;
  }
}

async function toggleSource(enabled: boolean) {
  sourceEnabled.value = enabled;
  try {
    await window.colorTxt.bookSourceToggle(FANQIE_SOURCE_URL, enabled);
  } catch (e) {
    sourceEnabled.value = !enabled;
    await appAlert(e instanceof Error ? e.message : String(e));
  }
}

onMounted(() => {
  void refreshStatus();
  void loadBackendUrl();
  void loadCookie();
  void loadSourceEnabled();
});
</script>

<template>
  <div class="fanqieRoot">
    <div class="settingsBody">
      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">在找书搜索中启用「番茄小说」</span>
          <SwitchToggle
            :model-value="sourceEnabled"
            aria-label="启用番茄小说书源"
            @update:model-value="toggleSource"
          />
        </div>
        <p class="settingsHint">
          开启后，找书的全局搜索会自动包含番茄小说结果；点击结果可在阅读器中直接阅读（正文由本机什锦铺后端解密）。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel short">后端地址</span>
          <input
            v-model="backendUrl"
            class="settingsTextInput"
            type="text"
            aria-label="什锦铺后端地址"
            placeholder="http://127.0.0.1:18921"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <p class="settingsHint">
          本机「什锦铺」电脑版默认监听 127.0.0.1:18921；如后端使用其它端口
          请在启动时用环境变量 <code>FQAPP_BACKEND_URL</code> 指定，或在此填写。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">后端状态</span>
          <span class="statusBadge" :class="{ ok: status?.ok, bad: !status?.ok }">
            {{ checking ? "检测中…" : status?.ok ? `已连接 (${status?.httpStatus ?? "200"})` : "未连接" }}
          </span>
        </div>
        <p v-if="!status?.ok" class="settingsHint">
          {{ status?.message || "未检测到什锦铺后端。" }} 请先安装并运行「什锦铺」
          电脑版，再点击下方「重新检测」。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <button type="button" class="btn" :disabled="checking" @click="refreshStatus">
            重新检测
          </button>
          <button type="button" class="btn" :disabled="busy" @click="applyBackendUrl">
            保存地址
          </button>
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel short">番茄登录 Cookie</span>
          <input
            v-model="cookie"
            class="settingsTextInput"
            type="password"
            aria-label="番茄登录 Cookie"
            placeholder="粘贴 sessionid / sid_tt 等登录态"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <p class="settingsHint">
          用于同步你的番茄书架（转发到后端 <code>/api/v1/account/fanqie/library</code>）。
          在浏览器登录番茄小说后按 F12 → 应用/网络 → 复制请求头里的 Cookie 粘贴到此处，
          仅保存在本机，读取书架时需要。左侧操作说明：
        </p>
        <div class="settingsRowMain">
          <button type="button" class="btn" :disabled="busy" @click="saveCookie">
            保存 Cookie
          </button>
          <button
            type="button"
            class="btn"
            :disabled="syncing"
            @click="syncShelf"
          >
            {{ syncing ? "同步中…" : "同步番茄书架" }}
          </button>
        </div>
        <p v-if="syncResult" class="settingsHint">{{ syncResult }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fanqieRoot {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settingsBody {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
}

.settingsRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settingsRowMain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.settingsRowMain--baseline {
  align-items: baseline;
}

.settingsLabel {
  font-size: 14px;
  color: var(--fg);
  white-space: nowrap;
  flex: 1 1 60%;
}

.settingsLabel.short {
  flex: 1 1 30%;
  min-width: 30%;
}

.settingsTextInput {
  box-sizing: border-box;
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  width: 100%;
  height: 32px;
  font-size: 13px;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.settingsHint code {
  font-size: 11px;
}

.statusBadge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--muted);
}

.statusBadge.ok {
  color: #16a34a;
  border-color: #16a34a;
}

.statusBadge.bad {
  color: #dc2626;
  border-color: #dc2626;
}
</style>

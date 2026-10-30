# Legado 扩展机制与 API 参考

> 来源整理：[Legado_Max 帮助文档](https://github.com/youfengknight/Legado_Max/tree/main/app/src/main/assets/web/help/md) · [legado-E（阅读Sigma）](https://github.com/Luoyacheng/legado-E)

---

## 目录

- [1. 订阅源规则](#1-订阅源规则)
- [2. 特殊机制详解](#2-特殊机制详解)
  - [2.1 缓存与导出备份机制](#21-缓存与导出备份机制)
  - [2.2 图片加载机制](#22-图片加载机制)
  - [2.3 网络请求机制](#23-网络请求机制)
  - [2.4 目录不完全加载机制](#24-目录不完全加载机制)
  - [2.5 正文下一页懒加载与缓存机制](#25-正文下一页懒加载与缓存机制)
  - [2.6 替换规则流程与机制](#26-替换规则流程与机制)
  - [2.7 预注入 JS 机制详解](#27-预注入-js-机制详解)
  - [2.8 错误处理机制](#28-错误处理机制)
  - [2.9 书源登录信息与运行变量备份机制](#29-书源登录信息与运行变量备份机制)
  - [2.10 正文图片加载与样式控制](#210-正文图片加载与样式控制)
- [3. Web API 接口](#3-web-api-接口)
- [4. Content Provider API](#4-content-provider-api)
- [5. 数据对象参考](#5-数据对象参考)
- [6. 其他功能](#6-其他功能)
  - [6.1 字典规则](#61-字典规则)
  - [6.2 在线朗读引擎（TTS）](#62-在线朗读引擎tts)
  - [6.3 WebDav 备份/恢复](#63-webdav-备份恢复)
  - [6.4 正则（regex）帮助](#64-正则regex帮助)
  - [6.5 XPath 帮助](#65-xpath-帮助)
  - [6.6 替换规则（replaceRule）](#66-替换规则replacerule)
  - [6.7 高亮规则（highlightRule）](#67-高亮规则highlightrule)
  - [6.8 本地 TXT 目录规则（txtTocRule）](#68-本地-txt-目录规则txttocrule)

---

## 1. 订阅源规则

订阅源用于订阅 RSS 内容，其结构类似书源但用于订阅源场景。

### 规则类型对照

| 规则类型 | 标识符 | 说明 |
|---|---|---|
| Default | `@@` 或直接写 | JSoup/CSS 选择器 |
| XPath | `@XPath:` 或以 `/` 开头 | XPath 选择器 |
| Json | `@Json:` 或以 `$.` `$[` 开头 | JSONPath 选择器 |
| Regex | `:` 开头（仅限列表规则） | 正则匹配 HTML 片段 |
| Js | `{{}}`、`@js:`、`<js>` | JavaScript |
| WebJs | `@webJs:` | WebView 注入 JS |

### 订阅源字段

| 字段 | 支持规则 | 返回结果 | 说明 |
|---|---|---|---|
| `articleList` | Default, XPath, Json, Regex, Js, **WebJs** | List | 文章列表 |
| `title` | Default, XPath, Json, Js, **WebJs** | String | 文章标题 |
| `author` | Default, XPath, Json, Js, **WebJs** | String | 文章作者 |
| `pubDate` | Default, XPath, Json, Js, **WebJs** | String | 发布日期 |
| `description` | Default, XPath, Json, Js, **WebJs** | String | 文章描述 |
| `content` | Default, XPath, Json, Js, **WebJs** | String | 文章正文 |
| `link` | Default, XPath, Json, Js, **WebJs** | String(URL) | 文章链接 |
| `coverUrl` | Default, XPath, Json, Js, **WebJs** | String(URL) | 封面 URL |
| `enclosureUrl` | Default, XPath, Json, Js, **WebJs** | String(URL) | 附件 URL |
| `enclosureType` | Default, XPath, Json, Js, **WebJs** | String | 附件类型（如 `audio/mpeg`） |
| `sourceRegex` | **Regex** | String | 资源正则（用于嗅探） |
| `webJs` | **WebJs** | String | WebView 注入 JS |
| `nextArticleUrl` | Default, XPath, Json, Js, **WebJs** | String/List | 下一页链接 |

### 订阅源基本配置

| 字段 | 必填 | 说明 |
|---|---|---|
| `sourceUrl` | **是** | 订阅源唯一标识 |
| `sourceName` | **是** | 订阅源名称 |
| `sourceGroup` | 否 | 分组 |
| `sourceType` | 否 | 类型（0: RSS, 1: 其他） |
| `exploreUrl` | 否 | 发现 URL |

---

## 2. 特殊机制详解

### 2.1 缓存与导出备份机制

- **缓存目录**：应用内部存储，按书源分类
- **导出格式**：支持 JSON 格式导出书源、替换规则、订阅源等
- **导出包含**：书源配置、用户变量、登录信息（加密）
- **导入方式**：文件导入、URL 导入、剪贴板导入
- **备份范围**：书源、订阅源、替换规则、主题、朗读引擎、字典规则

### 2.2 图片加载机制

- 使用 Glide 图片加载库
- 支持自定义 headers（在正文中通过 `<img src="url,{headers}">` 实现）
- 支持 SVG 图片（Base64 格式）
- 支持自定义图片样式：
  - `style`: `center`、`left`、`right`、`full`、`single`、`TEXT`
  - `width`: 像素值或百分比
  - `click`: 点击图片执行 JS
- 支持图片解密（`imageDecode` 字段返回 ByteArray）

### 2.3 网络请求机制

- 基于 OkHttp3
- 支持 **WebView 渲染**（`{"webView":true}`）- 适用于 JS 动态渲染页面
- 支持 **WebView 注入 JS**（`webJs`）- 模拟点击等操作
- WebView 模式下自动处理 Cookie、Session
- 自动重试（`retry` 参数）
- 支持自定义 DNS（`dnsIp` 参数）
- 支持重定向拦截（`java.get` / `java.post`）

### 2.4 目录不完全加载机制

- 当网站目录页分页加载时，通过 `nextTocUrl` 实现翻页
- `nextTocUrl` 支持单个 URL 或 URL 数组
- JS 中返回 `[]` / `null` / `""` 时停止加载下一页
- 目录列表首字符加 `-` 可反序

### 2.5 正文下一页懒加载与缓存机制

- 通过 `nextContentUrl` 实现正文分页
- 支持单个 URL 或 URL 数组
- 多页内容可通过 `replaceRegex` 进行合并后替换净化
- 已缓存的章节正文不会重复请求

### 2.6 替换规则流程与机制

替换规则用于正文净化（去除广告、无关内容等）：

**格式：**
```json
{
  "replaceSummary": "替换规则名称",
  "pattern": "正则匹配",
  "replacement": "替换内容",
  "isRegex": true,
  "isEnable": true,
  "isToAll": true
}
```

- `isRegex`: 是否为正则模式（否则为普通文本替换）
- `isToAll`: 是否应用到所有书源
- 支持指定 `sourceUrl` 仅应用于特定书源
- 替换规则在正文加载后应用

### 2.7 预注入 JS 机制详解

**jsLib：** 注入 JavaScript 到 RhinoJs 引擎，支持函数共用

- 可直接填写 JavaScript 代码片段
- 或填写 `{"url": "https://example.com/lib.js"}` 自动下载复用
- 定义的函数可能被多线程同时调用
- 函数内声明全局变量必须使用 `var`
- 可通过 `source.put` / `source.get` 在函数间共享变量

### 2.8 错误处理机制

- 网络请求超时 → 自动重试（`retry` 参数）
- 规则解析失败 → 返回空结果，不崩溃
- JS 执行错误 → 可在 try/catch 中捕获并通过 `java.log` 输出
- 调试模式下显示详细错误信息

**推荐 JS 错误处理模板：**
```js
(function(result){
  try {
    // 处理 result
    return result;
  } catch(e) {
    java.log("错误：" + e);
    return ""+e;
  }
})(result);
```

### 2.9 书源登录信息与运行变量备份机制

- 登录信息（用户名、密码、Cookie）保存在应用数据库中
- 导出备份时，登录信息会加密保存
- 运行变量（通过 `source.put` 设置）在应用重启后保留
- `source.getVariable()` / `source.setVariable()` 管理持久化变量
- 登录检测可在每次请求前执行，自动刷新已过期的 Cookie

### 2.10 正文图片加载与样式控制

**修改图片请求头：**
```js
let options = {
  "headers": {
    "User-Agent": "xxxx",
    "Referrer": baseUrl,
    "Cookie": "aaa=vbbb;"
  }
};
'<img src="'+src+","+JSON.stringify(options)+'">'
```

**样式与交互控制：**
```
<img src="url,{'style':'center','width':'50%'}">
<img src="url,{'style':'right','width':'300'}">
<img src="data:image/svg+xml;base64,QQ,{'style':'left','width':'100%'}">
<img src="url,{'click':'java.toast(\'点击了图片\')'}">
```

样式说明：`text`（1.5字符位）、`full`（铺满）、`single`（单独一行）、`left`（左浮动）、`right`（右浮动）

---

## 3. Web API 接口

需在设置中启用"Web 服务"。以下假设本机操作，端口 1234。

### 书源管理

| 操作 | 方法 | URL |
|---|---|---|
| 插入单个书源 | POST | `/saveBookSource` |
| 插入多个书源 | POST | `/saveBookSources` |
| 获取单个书源 | GET | `/getBookSource?url=xxx` |
| 获取所有书源 | GET | `/getBookSources` |
| 删除多个书源 | POST | `/deleteBookSources` |

BODY 为 JSON，格式参考 `BookSource.kt` 实体类。

### 订阅源管理

| 操作 | 方法 | URL |
|---|---|---|
| 插入多个订阅源 | POST | `/saveRssSources` |
| 获取单个订阅源 | GET | `/getRssSource?url=xxx` |
| 获取所有订阅源 | GET | `/getRssSources` |
| 删除多个订阅源 | POST | `/deleteRssSources` |

### 替换规则管理

| 操作 | 方法 | URL |
|---|---|---|
| 获取所有替换规则 | GET | `/getReplaceRules` |
| 插入 | POST | `/saveReplaceRule` (BODY: `[ReplaceRule]`) |
| 删除 | POST | `/deleteReplaceRule` (BODY: `[ReplaceRule]`) |
| 测试 | POST | `/testReplaceRule` (BODY: `{rule:[ReplaceRule], text:[String]}`) |

### 书籍管理

| 操作 | 方法 | URL |
|---|---|---|
| 搜索在线书籍 | WebSocket | `ws://127.0.0.1:1235/searchBook` (Message: `{key: [String]}`) |
| 插入书籍 | POST | `/saveBook` (BODY: `Book` JSON) |
| 删除书籍 | POST | `/deleteBook` |
| 获取所有书籍 | GET | `/getBookshelf` |
| 获取章节列表 | GET | `/getChapterList?url=xxx` |
| 获取章节内容 | GET | `/getBookContent?url=xxx&index=1` |
| 获取封面 | GET | `/cover?path=xxxxx` |
| 获取正文图片 | GET | `/image?url=${bookUrl}&path=${picUrl}&width=${width}` |
| 保存进度 | POST | `/saveBookProgress` (BODY: `BookProgress` JSON) |

### 调试

| 操作 | 协议 | URL |
|---|---|---|
| 书源调试 | WebSocket | `ws://127.0.0.1:1235/bookSourceDebug` |
| 订阅源调试 | WebSocket | `ws://127.0.0.1:1235/rssSourceDebug` |

Message: `{ key: [String], tag: [String] }`

---

## 4. Content Provider API

需声明 `io.legado.READ_WRITE` 权限。`providerHost` 为 `包名.readerProvider`，不同包名地址不同。

### 书源/订阅源

| 操作 | URL |
|---|---|
| 插入单个书源 | `content://providerHost/bookSource/insert` |
| 插入多个书源 | `content://providerHost/bookSources/insert` |
| 获取单个书源 | `content://providerHost/bookSource/query?url=xxx` |
| 获取所有书源 | `content://providerHost/bookSources/query` |
| 删除多个书源 | `content://providerHost/bookSources/delete` |
| 插入单个订阅源 | `content://providerHost/rssSource/insert` |
| 插入多个订阅源 | `content://providerHost/rssSources/insert` |
| 获取单个订阅源 | `content://providerHost/rssSource/query?url=xxx` |
| 获取所有订阅源 | `content://providerHost/rssSources/query` |
| 删除多个订阅源 | `content://providerHost/rssSources/delete` |

创建 `Key="json"` 的 `ContentValues`，内容为 JSON 字符串。

### 书籍

| 操作 | URL |
|---|---|
| 插入书籍 | `content://providerHost/book/insert` |
| 获取所有书籍 | `content://providerHost/books/query` |
| 获取章节列表 | `content://providerHost/book/chapter/query?url=xxx` |
| 获取章节内容 | `content://providerHost/book/content/query?url=xxx&index=1` |
| 获取封面 | `content://providerHost/book/cover/query?path=xxxx` |

用 `Cursor.getString(0)` 取出返回结果。

---

## 5. 数据对象参考

### BookSource（书源）

| 字段 | 类型 | 说明 |
|---|---|---|
| `bookSourceUrl` | String | 书源 URL（唯一标识） |
| `bookSourceName` | String | 书源名称 |
| `bookSourceGroup` | String? | 书源分组 |
| `bookSourceType` | Int | 类型（0: 文本, 1: 音频） |
| `bookUrlPattern` | String? | 书籍 URL 正则 |
| `loginUrl` | String? | 登录 URL |
| `loginUi` | String? | 登录 UI JSON |
| `loginCheckJs` | String? | 登录检测 JS |
| `header` | String? | 请求头 JSON |
| `searchUrl` | String? | 搜索 URL |
| `exploreUrl` | String? | 发现 URL |
| `ruleSearch` | String? | 搜索规则 JSON |
| `ruleExplore` | String? | 发现规则 JSON |
| `ruleBookInfo` | String? | 详情规则 JSON |
| `ruleToc` | String? | 目录规则 JSON |
| `ruleContent` | String? | 正文规则 JSON |
| `jsLib` | String? | JS 函数库 |
| `concurrentLimit` | String? | 并发率限制 |
| `weight` | Int | 权重 |
| `enabled` | Boolean | 启用 |
| `enabledExplore` | Boolean | 启用发现 |
| `customOrder` | Int | 自定义排序 |

### Book（书籍）

| 字段 | 类型 | 说明 |
|---|---|---|
| `bookUrl` | String | 详情页 URL |
| `tocUrl` | String | 目录页 URL |
| `origin` | String | 书源 URL |
| `originName` | String | 书源名称 |
| `name` | String | 书名 |
| `author` | String | 作者 |
| `kind` | String | 分类 |
| `coverUrl` | String | 封面 URL |
| `intro` | String | 简介 |
| `latestChapterTitle` | String | 最新章节标题 |
| `latestChapterTime` | String | 最新章节更新时间 |
| `totalChapterNum` | Int | 总章节数 |
| `type` | Int | 类型（0: 文本, 1: 音频） |
| `group` | Int | 分组索引 |
| `variable` | String? | 自定义变量 |

### BookChapter（章节）

| 字段 | 类型 | 说明 |
|---|---|---|
| `url` | String | 章节地址 |
| `title` | String | 章节标题 |
| `baseUrl` | String | 拼接相对 URL 的基础 URL |
| `bookUrl` | String | 书籍地址 |
| `index` | Int | 章节序号 |
| `resourceUrl` | String? | 音频真实 URL |
| `tag` | String? | 章节标签 |
| `start` | Long | 章节起始位置 |
| `end` | Long | 章节终止位置 |
| `variable` | String? | 变量 |

### ReplaceRule（替换规则）

| 字段 | 类型 | 说明 |
|---|---|---|
| `replaceSummary` | String | 规则名称 |
| `pattern` | String | 正则/文本匹配 |
| `replacement` | String | 替换内容 |
| `isRegex` | Boolean | 是否正则模式 |
| `isEnable` | Boolean | 是否启用 |
| `isToAll` | Boolean | 是否应用到所有书源 |
| `sourceUrl` | String? | 指定书源 URL |

---

## 6. 其他功能

### 6.1 字典规则

用于在阅读界面长按查词。支持两种模式：

**内置字典：**
- 直接使用系统内置词典
- 支持在线字典查询

**自定义字典（dictRule）：**
- 支持 JSONPath 解析 JSON 格式的字典 API 返回
- 支持 XPath 解析 HTML 格式的字典页面
- 返回结果支持 HTML 显示（用 `<usehtml></usehtml>` 包裹）

### 6.2 在线朗读引擎（TTS）

- 支持 HTTP TTS 接口
- 配置 URL 模板，`{{text}}` 替换为朗读文本
- 支持返回音频数据流播放

### 6.3 WebDav 备份/恢复

- 支持 WebDAV 协议的远程备份
- 可备份/恢复：书源、订阅源、替换规则、主题、朗读引擎等
- 配置：服务器地址、用户名、密码

### 6.4 正则（regex）帮助

**常用正则模式：**

| 模式 | 说明 |
|---|---|
| `.*` | 匹配任意字符（贪婪） |
| `.*?` | 匹配任意字符（非贪婪） |
| `[^<]*` | 匹配非 `<` 字符 |
| `[\s\S]*` | 匹配任意字符（包括换行） |
| `(\d+)` | 捕获数字 |
| `[^"]+` | 匹配非引号字符 |

**在书源中的典型用法：**

```
##<[^>]+>##                              去除 HTML 标签
##\s+##                                  去除多余空白
##[a-zA-Z\.:\/]||##                      净化规则
```

**注意：** 正则中的 `\` 需要转义为 `\\`

### 6.5 XPath 帮助

**常用 XPath 表达式：**

| 表达式 | 说明 |
|---|---|
| `//div` | 选择所有 div 元素 |
| `//*[@id="content"]` | 选择 id 为 content 的元素 |
| `//div[@class="book"]` | 选择 class 为 book 的 div |
| `//a[text()="阅读"]` | 选择文本为"阅读"的链接 |
| `//a/@href` | 获取链接的 href 属性 |
| `//*[@property="og:title"]/@content` | 获取 meta 的 content 属性 |
| `//li[1]` | 第一个 li |
| `//li[position()>1]` | 从第二个开始的 li |
| `//strong/following-sibling::a` | strong 后的同级 a |
| `//div[count(../div)>10]` | 父节点有超过 10 个 div 的 div |

### 6.6 替换规则（replaceRule）

替换规则用于正文净化，支持：

- **全局替换**：应用到所有书源
- **指定书源**：仅应用到特定书源
- **正则模式**：支持捕获组（`$1`, `$2` 等）
- **普通文本模式**：精确字符串替换
- **启用/禁用**：可单独控制每条规则

### 6.7 高亮规则（highlightRule）

用于阅读正文中的关键词高亮：

- 支持正则匹配
- 支持指定颜色
- 仅作用于正文内容

### 6.8 本地 TXT 目录规则（txtTocRule）

用于解析本地 TXT 文件的目录结构：

```json
{
  "ruleName": "默认规则",
  "chapterPattern": "第[一二三四五六七八九十百千万零0-9]+章\\s*.*",
  "isRegex": true,
  "serialNumber": false
}
```

- `chapterPattern`: 章节匹配正则
- `isRegex`: 是否正则模式
- `serialNumber`: 是否包含序号

---

> **参考来源：**
> - [Legado_Max 帮助文档](https://github.com/youfengknight/Legado_Max/tree/main/app/src/main/assets/web/help/md)
> - [Legado 书源规则说明](https://mgz0227.github.io/The-tutorial-of-Legado/Rule/source.html)
> - [legado-E（阅读Sigma）源码](https://github.com/Luoyacheng/legado-E)
> - [阅读3.0(Legado)规则说明](https://mgz0227.github.io/The-tutorial-of-Legado/)
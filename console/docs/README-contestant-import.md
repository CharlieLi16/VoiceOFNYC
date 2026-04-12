# 选手信息录入说明（Voice of NYC Console）

本文说明如何在控制台中维护 **选手名单、头像、曲目** 以及如何 **导入/导出**。算分公式见 `console/README.md`（总分 = 观众/2 + 评委/6）。

## 数据存在哪里

- **运行时权威数据**：后端 SQLite（`console/data/voiceofnyc.db`），通过 `/api/import` 与 PATCH 分数接口更新。
- **前端内置「去年」种子**（便于一键导入）：
  - 名单 JSON：`frontend/public/data/seed-contestants.json`
  - 头像文件：`frontend/public/img/contestants/1.jpg`～`10.jpg`（可用 `scripts/setup-contestant-photos-1-10.sh` 从 `image0`～`image9` 生成）

控分 **`/admin`** 等环节页从接口读取选手；头像字段为 **URL 路径**（约定 `/img/contestants/1.jpg`～`10.jpg` 对应选手 id 0～9），由浏览器向当前站点请求静态资源。

---

## 方式一：后台一键导入去年种子（推荐首次）

1. 启动后端（`uvicorn` 8765）与前端：**推荐** `cd console/frontend && npm run dev`（会把 `/api` 代理到后端）。
2. 浏览器打开 **控分后台** `/admin`。
3. 点击 **「导入去年种子名单」**。
4. 成功后左侧列表应出现 10 位选手，分数均为 0。

**说明**：该操作会 **整表替换** 服务器中的选手数据（与「导入 JSON」相同），请先导出备份若已有数据。

---

## 方式二：从本机 JSON 文件导入

1. 在 `/admin` 点击 **「导入 JSON」**，选择符合格式的数组文件。
2. 格式与 `seed-contestants.json` 一致（见下一节字段说明）。

---

## 方式三：编辑种子文件（明年 / 换届）

### 1. 修改 `frontend/public/data/seed-contestants.json`

根节点为 **数组**，每位选手一个对象，字段如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | 整数 | 唯一编号，建议从 0 连续递增（与旧版 `mydata.json` 一致）。 |
| `name` | 字符串 | 显示姓名。 |
| `img` | 字符串 | **站点内路径**，建议 `/img/contestants/文件名.jpg`。勿使用 `file://` 或仅相对 `./assets/...`（打包后无效）。 |
| `song` | 字符串 | 主选曲目（展示用）。 |
| `songTwo` | 字符串 | 第二首 / 副标题（展示用）。 |
| `judges` | 字符串数字 | 评委侧存储值；导入时一般为 `"0"`。旧导出里若仍写 `juges`，导入时也会被识别。 |
| `audience` | 字符串数字 | 观众分；导入时一般为 `"0"`。 |
| `total` | 字符串数字 | 总分；可省略则由后台按公式重算。 |
| `ranking` | 整数 | 导入后会被后台按总分重算，可填 `0`。 |

### 2. 更换或新增照片

将图片放入 **`frontend/public/img/contestants/`**，在 JSON 的 `img` 中写对应路径，例如：

`/img/contestants/zhangsan.jpg`

注意：文件名区分大小写；构建生产包时 `public/` 下文件会原样拷贝到 `dist/`。

### 3. 保存后

- 重新执行 `/admin` 里的 **「导入去年种子名单」**（若你改的是 `seed-contestants.json`），或 **「导入 JSON」** 选择你保存的文件。
- 开发时若已打开页面，**刷新** 后再导入一次即可。

---

## 导出与备份

在 `/admin` 点击 **「导出 JSON」**，可下载当前服务器上的选手数组，便于备份或改完再导回。

---

## 与仓库根目录 `assets/js/mydata.json` 的关系

根目录旧站使用 `./assets/img/imageN.jpg` 这类路径；控制台种子已改为 **`/img/contestants/...`** 以适配 Vite 的 `public` 目录。若你在根目录更新了 `mydata.json`，可同步改 `seed-contestants.json` 的姓名/曲目，并把新图复制到 `frontend/public/img/contestants/`。

---

## 常见问题

**点了导入但列表没变 / 像没反应**

- 导入必须打到 **FastAPI** 的 `POST /api/import`。若用 **`python -m http.server` 只打开 `dist/`**，浏览器会向 **8080** 发 `/api/import`，静态服务器无法处理，导入会失败。
- **做法 A**：用 **`npm run dev`** 打开 `http://127.0.0.1:5173/admin`（确保后端已在 8765 运行）。
- **做法 B**：在 `frontend/.env.local` 写 `VITE_API_BASE=http://127.0.0.1:8765`，再 **`npm run build`**，用静态服务器托管 **`dist` 根目录**；后端 CORS 已允许 `http://127.0.0.1:8080`。成功后页面会显示绿色提示「已导入…人」。

**导入后大屏不显示头像**  
确认 `img` 以 `/` 开头且文件确实存在于 `public/img/contestants/`；浏览器开发者工具 Network 中查看 404。

**导入按钮报错**  
确认后端已启动且 Vite 代理 `/api` 正常；种子文件路径为 `/data/seed-contestants.json`（对应磁盘 `public/data/seed-contestants.json`）。

**只想改一个人**  
可先导出 JSON，编辑后整文件再「导入 JSON」；或在 `/admin` 选中选手后只改分数并「保存到服务器」（不改名单结构）。

# Agent-Wiki MCP Plugin 实施规划

> 日期：2026-04-06
> 状态：待执行
> 前置：设计文档已确认（2026-04-06-agent-wiki-mcp-plugin-design.md）

## 实施概览

```
Phase 1: 项目骨架（~15 min）
  └─ Task 1: 初始化 npm 项目 + 依赖
  └─ Task 2: MCP Server 骨架（可启动、注册 8 个空工具）

Phase 2: 核心文件操作（~30 min）
  └─ Task 3: 状态管理（state.json 读写 + config 读写）
  └─ Task 4: wiki_init（创建目录 + 生成 SCHEMA.md）
  └─ Task 5: wiki_ingest（复制 MD 到 raw/）
  └─ Task 6: wiki_tag（读写 frontmatter 标签）
  └─ Task 7: wiki_compile（生成 Wiki 页面 + INDEX.md + LOG.md）
  └─ Task 8: wiki_search（标签 + 全文搜索）
  └─ Task 9: wiki_article（保存原创文章到 outputs/）
  └─ Task 10: wiki_lint（自检死链接等）
  └─ Task 11: wiki_status（状态查询 + 首次引导）

Phase 3: 打包发布（~10 min）
  └─ Task 12: bin 入口 + package.json 配置
  └─ Task 13: 本地端到端测试
  └─ Task 14: npm publish 准备（package.json + README）
```

## 详细任务

### Task 1: 初始化 npm 项目 + 依赖

**目标**：创建 TypeScript 项目骨架

**文件**：
- `src/` 目录
- `package.json`
- `tsconfig.json`

**操作**：
```bash
mkdir -p src
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

**package.json 关键配置**：
```json
{
  "name": "agent-wiki",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "agent-wiki": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**tsconfig.json**：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

**验证**：`npx tsc --noEmit` 无错误

---

### Task 2: MCP Server 骨架

**目标**：可启动的 MCP Server，注册 8 个空工具

**文件**：`src/index.ts`

**代码结构**：
```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "agent-wiki", version: "0.1.0" });

// 注册 8 个工具（占位，后续任务填充实现）
server.tool("wiki_status", "查询知识库状态", {}, async () => { ... });
server.tool("wiki_init", "初始化知识库", { dir: z.string(), topics: z.array(z.string()), interests: z.array(z.string()) }, async () => { ... });
server.tool("wiki_ingest", "摄入 MD 文件", { source: z.string(), force: z.boolean().optional() }, async () => { ... });
server.tool("wiki_tag", "写入标签", { file: z.string(), tags: z.array(z.string()) }, async () => { ... });
server.tool("wiki_compile", "生成 Wiki 页面", { ... }, async () => { ... });
server.tool("wiki_search", "搜索知识库", { ... }, async () => { ... });
server.tool("wiki_article", "保存原创文章", { ... }, async () => { ... });
server.tool("wiki_lint", "自检知识库", { ... }, async () => { ... });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
```

**验证**：`npx tsc && echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js` 返回 8 个工具

---

### Task 3: 状态管理模块

**目标**：读写 `~/.agent-wiki/config.json` 和知识库 `state.json`

**文件**：`src/state.ts`

**功能**：
- `getConfig()` — 读取全局配置（知识库目录路径）
- `setConfig(config)` — 保存全局配置
- `getState(wikiDir)` — 读取知识库状态（已摄入/已打标签/已编译的文件列表）
- `setState(wikiDir, state)` — 保存知识库状态
- `isInitialized()` — 检查是否已初始化

**数据结构**：
```typescript
// ~/.agent-wiki/config.json
interface GlobalConfig {
  wikiDir: string;  // 知识库根目录
}

// {wikiDir}/state.json
interface WikiState {
  ingested: string[];    // 已摄入的文件名
  tagged: string[];      // 已打标签的文件名
  compiled: string[];    // 已编译的文件名
}
```

**验证**：单元测试 getConfig/setConfig 往返

---

### Task 4: wiki_init 实现

**目标**：创建目录结构 + 生成 SCHEMA.md

**文件**：`src/tools/init.ts`

**逻辑**：
1. 创建 `raw/`、`wiki/`、`wiki/articles/`、`outputs/` 目录
2. 生成 `SCHEMA.md`（用设计文档里的模板，填入 topics 和 interests）
3. 生成 `wiki/INDEX.md`（空索引模板）
4. 生成 `wiki/LOG.md`（空日志模板）
5. 保存全局配置到 `~/.agent-wiki/config.json`
6. 初始化 `state.json`

**返回**：`{ status: "ok", dir: "...", created: ["raw/", "wiki/", "outputs/", "SCHEMA.md"] }`

**验证**：调用 wiki_init 后检查目录和文件都存在

---

### Task 5: wiki_ingest 实现

**目标**：从指定路径复制 MD 文件到 raw/（增量）

**文件**：`src/tools/ingest.ts`

**逻辑**（从 Python server.py 迁移）：
1. 判断 source 是文件还是目录
2. 如果是目录，扫描所有 .md 文件
3. 对每个文件：
   - 检查 state.json 的 ingested 列表，已存在则跳过（除非 force）
   - 复制到 raw/
   - 更新 state.json
4. 返回新文件列表 + 每个文件的前 500 字预览

**返回**：`{ status: "ok", ingested: N, files: [{name, content_preview}] }`

**验证**：放入测试 MD 文件，调用 wiki_ingest，检查 raw/ 目录有文件

---

### Task 6: wiki_tag 实现

**目标**：读写 frontmatter 中的 tags 字段

**文件**：`src/tools/tag.ts`

**逻辑**（从 Python 迁移）：
1. 读取 raw/ 中的指定文件
2. 解析 frontmatter（--- 分隔的 YAML）
3. 更新 tags 字段
4. 写回文件

**frontmatter 解析**（不用外部 YAML 库）：
```typescript
function parseFrontmatter(content: string): { meta: Record<string, any>, body: string }
function writeFrontmatter(meta: Record<string, any>, body: string): string
```

**返回**：`{ status: "ok", file: "...", tags: [...] }`

**验证**：写入标签后读取，确认 tags 正确

---

### Task 7: wiki_compile 实现

**目标**：生成 Wiki 页面 + 更新 INDEX.md + 追加 LOG.md

**文件**：`src/tools/compile.ts`

**逻辑**（从 Python 迁移）：
1. 接收 Agent 传入的结构化内容（title, summary, insights, category, tags, source_file）
2. 生成 Wiki 页面 MD 文件（按设计文档的模板）
3. 文件名：将 title 转为安全文件名
4. 更新 `wiki/INDEX.md`（按分类分组，每个条目一行描述）
5. 追加 `wiki/LOG.md`（append-only）
6. 更新 state.json 的 compiled 列表

**安全文件名**：`title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-_]/g, '-').substring(0, 80)`

**返回**：`{ status: "ok", wiki_file: "...", title: "..." }`

**验证**：调用 compile 后检查 Wiki 页面、INDEX.md、LOG.md 都更新了

---

### Task 8: wiki_search 实现

**目标**：标签匹配 + 全文关键词搜索

**文件**：`src/tools/search.ts`

**逻辑**（从 Python 迁移）：
1. 遍历 wiki/*.md（排除 INDEX.md、LOG.md）
2. 标签匹配：读取 frontmatter tags，匹配 tags 参数
3. 全文搜索：在文件内容中搜索 query 关键词
4. 计算综合得分：标签匹配权重 0.6 + 全文匹配权重 0.4
5. 按 score 排序，取 top_k
6. match="any" 任一标签匹配即可，match="all" 所有标签都需匹配

**返回**：`{ total: N, results: [{title, file, tags, summary, score}] }`

**验证**：准备测试数据，搜索已知关键词，确认结果排序正确

---

### Task 9: wiki_article 实现

**目标**：保存 Agent 写好的原创文章到 outputs/

**文件**：`src/tools/article.ts`

**逻辑**：
1. 接收 Agent 传入的 topic 和 content
2. 生成文件名：`YYYYMMDD-主题.md`
3. 添加 frontmatter（title, date, tags）
4. 保存到 outputs/
5. 追加 LOG.md

**返回**：`{ status: "ok", file: "...", topic: "..." }`

**验证**：保存文章后检查 outputs/ 目录

---

### Task 10: wiki_lint 实现

**目标**：自检死链接、缺摘要、内容过短

**文件**：`src/tools/lint.ts`

**逻辑**（从 Python 迁移）：
1. 遍历所有 wiki/*.md（排除 INDEX.md、LOG.md）
2. 检测死链接：正则提取 `[[xxx]]` 引用，检查目标文件是否存在
3. 检测缺摘要：检查 `## 摘要` 后是否有内容
4. 检测内容过短：文件 < 100 字符
5. 如果 check_only=false，自动修复（如删除死链接）
6. 按严重程度分类：error / warning / info

**返回**：`{ total_pages: N, issues: [{type, severity, source}], auto_fixed: N }`

**验证**：创建有问题的测试数据，运行 lint，确认检测正确

---

### Task 11: wiki_status 实现

**目标**：返回知识库状态 + 首次引导提示

**文件**：`src/tools/status.ts`

**逻辑**：
1. 检查 `~/.agent-wiki/config.json` 是否存在
2. 如果不存在（未初始化）：
   - 返回 `{ initialized: false, hint: "..." }`
   - hint 内容是首次引导的完整提示文本（见设计文档）
3. 如果存在（已初始化）：
   - 统计 raw/ 文件数、wiki/ 文件数、outputs/ 文件数
   - 读取 state.json 获取进度
   - 返回 `{ initialized: true, wiki_pages: N, raw_files: N, articles: N, ... }`

**返回**：见设计文档 wiki_status 部分

**验证**：未初始化调用返回 hint，初始化后调用返回统计数据

---

### Task 12: bin 入口 + package.json

**目标**：`npx agent-wiki` 一行启动

**操作**：
1. `src/index.ts` 头部加 `#!/usr/bin/env node`
2. package.json 添加 `bin` 字段
3. `npm run build` 编译
4. `npm link` 本地测试

**验证**：`npx agent-wiki` 启动后能响应 MCP 请求

---

### Task 13: 端到端测试

**目标**：模拟完整用户流程

**测试脚本**：手动通过 stdio 发送 JSON-RPC 请求

```bash
# 1. 初始化
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_init","arguments":{"dir":"/tmp/test-wiki","topics":["AI","产品"]}},"id":2}' | node dist/index.js

# 2. 摄入
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_ingest","arguments":{"source":"/path/to/test.md"}},"id":3}' | node dist/index.js

# 3. 打标签
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_tag","arguments":{"file":"test.md","tags":["AI","RAG"]}},"id":4}' | node dist/index.js

# 4. 编译
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_compile","arguments":{...}},"id":5}' | node dist/index.js

# 5. 搜索
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_search","arguments":{"query":"AI"}},"id":6}' | node dist/index.js

# 6. 写文章
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_article","arguments":{"topic":"AI工程化","content":"..."}},"id":7}' | node dist/index.js

# 7. 检查
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_lint","arguments":{}},"id":8}' | node dist/index.js
```

---

### Task 14: npm publish 准备

**目标**：准备好发布到 npm

**操作**：
1. 完善 package.json（description, keywords, repository, license）
2. 添加 .npmignore
3. 添加 README.md（安装说明 + 使用示例）
4. `npm publish --dry-run` 检查包内容

**验证**：`npm publish --dry-run` 输出正确

---

## 项目目录结构

```
agent-wiki/
├── src/
│   ├── index.ts          # 入口 + MCP Server 注册
│   ├── state.ts          # 状态管理
│   ├── utils.ts          # frontmatter 解析、安全文件名等工具函数
│   └── tools/
│       ├── init.ts       # wiki_init
│       ├── ingest.ts     # wiki_ingest
│       ├── tag.ts        # wiki_tag
│       ├── compile.ts    # wiki_compile
│       ├── search.ts     # wiki_search
│       ├── article.ts    # wiki_article
│       ├── lint.ts       # wiki_lint
│       └── status.ts     # wiki_status
├── dist/                 # 编译输出（gitignore）
├── package.json
├── tsconfig.json
├── .npmignore
└── README.md
```

## 执行策略

- **批次 1**（Task 1-2）：项目骨架，所有后续任务依赖
- **批次 2**（Task 3-11）：并行实现各工具（Task 3 先做，其余可并行）
- **批次 3**（Task 12-14）：打包发布

每个 Task 预计 3-5 分钟。Phase 2 的工具实现可以用 subagent 并行。

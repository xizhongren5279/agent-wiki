# Agent-Wiki MCP Plugin 设计文档

> 日期：2026-04-06
> 状态：已确认
> 作者：江鑫光 + Claude

## 一、定位

面向 Claude Code / Cursor / OpenClaw 用户的卡帕西智能知识库 MCP 插件。

**一句话**：一行命令安装，纯对话交互，Agent 自动帮你管理知识库、写有人味儿的原创文章。

**目标用户**：会用 Claude Code / Cursor 的用户，但不会配 JSON、不懂 MCP 技术细节。

## 二、核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| LLM 来源 | 宿主 Agent 的 LLM | 零依赖、零配置、用户不需要装 Ollama |
| 分发方式 | npm 包，`npx agent-wiki` | MCP 生态标准，一行安装 |
| 知识库目录 | 首次启动 Agent 问用户 | 不同用户目录不同，但只需说一次 |
| 交互方式 | 纯对话 | 用户不需要学任何命令 |
| 文章风格 | 微信公众号风格，人味儿 | 用户最大场景是发公众号 |

## 三、架构

```
┌──────────────────────────────────────────────┐
│         宿主 Agent (Claude Code 等)           │
│   用户说"帮我搜 RAG" → Agent 用 LLM 思考     │
│   + 调用 agent-wiki MCP 工具                  │
└──────────┬───────────────────────────────────┘
           │ MCP 协议 (stdio)
           ▼
┌──────────────────────────────────────────────┐
│       agent-wiki MCP Server (TypeScript)      │
│                                               │
│  wiki_status  — 状态查询 + 首次引导           │
│  wiki_init    — 创建目录 + 生成 SCHEMA.md     │
│  wiki_ingest  — 摄入 MD 文件                  │
│  wiki_tag     — 读写 frontmatter tags         │
│  wiki_compile — 生成 Wiki 页面 + 索引 + 日志  │
│  wiki_search  — 标签 + 全文搜索               │
│  wiki_article — 保存原创文章                   │
│  wiki_lint    — 自检自修复                     │
└──────────┬───────────────────────────────────┘
           │ 文件系统
           ▼
┌──────────────────────────────────────────────┐
│            用户的本地知识库目录                │
│  raw/ → wiki/ → outputs/                     │
│  SCHEMA.md（知识库说明书 + Agent 操作指南）    │
└──────────────────────────────────────────────┘
```

**核心分工**：
- **插件**：纯文件操作（搬文件、读写元数据、搜索、生成模板）
- **Agent**：所有智能工作（LLM 提取标签、写摘要、生成洞察、写文章）

## 四、目录结构

```
用户指定目录/
├── SCHEMA.md       # 知识库说明书（Agent 的操作指南 + 写作规则）
├── raw/            # 源材料（不可变，用户往里扔文件）
├── wiki/           # AI 维护的维基
│   ├── INDEX.md    # 分类索引（按主题分组，每个条目一行描述）
│   ├── LOG.md      # Append-only 操作日志
│   └── *.md        # Wiki 页面（摘要 + 洞察 + 标签 + 反向链接）
├── outputs/        # 原创文章（人味儿，可直接发微信公众号）
└── state.json      # 插件内部状态（已摄入/已打标签/已编译）
```

### Wiki 页面模板

```markdown
---
title: "文章标题"
date: 2026-04-06
tags: [标签1, 标签2, ..., 标签10]
category: 分类名
sources:
  - "[[raw/源文件名.md]]"
---

# 文章标题

## 摘要
（2-3 句话概括核心内容）

## 核心洞察
- 洞察 1
- 洞察 2
- 洞察 3

## 标签
标签1, 标签2, ..., 标签10

---
*来源: raw/源文件名.md · 编译时间: 2026-04-06 10:35*
```

### INDEX.md 模板

```markdown
---
title: "知识库索引"
date: 2026-04-06
---
# 知识库索引

## 分类名1
- [[页面标题]] (标签1, 标签2, 标签3)

## 分类名2
- [[页面标题]] (标签1, 标签2, 标签3)

---
*共 N 篇 · 更新于 2026-04-06 10:44*
```

### LOG.md 模板（Append-only）

```markdown
---
title: "Wiki 操作日志"
tags: [log, wiki]
---
# Wiki Log

> Append-only 时间线，记录 wiki 的每次变更。

## [2026-04-06 10:35] ingest | 文件名
来源: 原文件名.md | 分类: XX | 标签: A, B, C
```

## 五、SCHEMA.md（核心灵魂）

`wiki_init` 时自动生成，内容包含：

1. **知识库元信息**：主题、兴趣方向
2. **目录规则**：raw/ 不可变、wiki/ 由 AI 维护、outputs/ 存文章
3. **维基规则**：每主题一个文件、摘要开头、[[wikilink]] 链接、维护 INDEX.md
4. **Agent 操作指南**：用户说不同的话，Agent 应该怎么编排工具
5. **写作规则**：微信公众号风格、人味儿、去 AI 味的完整规则

### SCHEMA.md 完整模板

```markdown
# 知识库 Schema

## 这是什么
一个关于 {topics} 的个人知识库，基于 Karpathy LLM Wiki 方案。

## 目录规则
- raw/ — 未处理的源材料，永远不要修改这些文件
- wiki/ — AI 维护的维基，用户只读
- outputs/ — 生成的原创文章，适合直接发微信公众号

## 维基规则
- 每个主题在 wiki/ 中有自己的 .md 文件
- 每个维基文件以一段摘要开头
- 使用 [[topic-name]] 格式链接相关主题
- 维护 wiki/INDEX.md，列出每个主题及一行描述
- 每次操作追加到 wiki/LOG.md
- 当添加新的源材料时，更新相关的维基文章

## Agent 操作指南
当用户说以下内容时，你应该：
- "把这篇文章加入知识库" / "加个文章" → wiki_ingest → 用 LLM 提取标签 → wiki_tag → 用 LLM 生成摘要/洞察/分类 → wiki_compile
- "整理知识库" / "全部处理一下" → wiki_ingest（全部新文件）→ 逐篇 LLM 打标签 → wiki_tag → 逐篇 LLM 生成摘要 → wiki_compile
- "搜一下 XX" / "有没有关于 XX 的" → wiki_search(tags=["XX"])
- "写一篇关于 XX 的文章" → wiki_search 找参考资料 → 按"写原创文章规则"用 LLM 写文 → wiki_article 保存
- "检查知识库" / "知识库健康吗" → wiki_lint
- "知识库状态" → wiki_status

## 写原创文章规则

文章风格：微信公众号适合的、有人味的中文写作。

### 人味标准
- 像跟朋友聊天，不像写论文
- 有自己的观点和态度，不当理中客
- 短句为主，该断就断
- 敢用"我"，敢说"我觉得"
- 该短就短，不是每篇都要 3000 字

### 微信公众号适配
- 标题直接说事，不超过 20 字
- 开头 3 句话内抓住读者
- 每 3-4 段一个小标题
- 关键句加粗，方便快速扫读
- 结尾不要升华，可以留个问题或一个观点
- 正文纯 Markdown，用户复制到公众号编辑器即可

### 禁止的 AI 味
- "值得注意的是""总而言之""让我们..."
- 破折号滥用
- "深入探讨""全面解析""深度剖析"
- "在当今...的时代""随着...的发展"开头
- "首先...其次...最后..."排比结构
- 夸张比喻（"像灯塔一样""如同一把钥匙"）
- 结尾升华（"让我们携手共创美好未来"）
- "一方面...另一方面..."两头讨好

## 我的兴趣方向
{interests}
```

## 六、MCP 工具详细设计（8 个）

### wiki_status
- **入参**：无
- **返回**：
  - 已初始化：`{initialized: true, wiki_pages: N, raw_files: N, articles: N, topics: [...]}`
  - 未初始化：`{initialized: false, hint: "主动引导用户设置知识库的提示文本"}`
- **首次引导提示文本**：
  ```
  你好！我是 agent-wiki 知识库助手。
  我可以帮你搭一个个人知识库——把你收藏的文章自动整理成维基、
  打标签、生成摘要。还能基于你的知识库帮你写有人味儿的原创文章，
  适合直接发微信公众号。

  先设置一下：
  1. 你想把知识库放在哪个目录？
  2. 你主要关注什么方向？（3-5 个关键词）

  不要等用户问，主动开始引导。
  ```

### wiki_init
- **入参**：`{dir: string, topics: string[], interests: string[]}`
- **返回**：`{status: "ok", dir: "...", created: ["raw/", "wiki/", "outputs/", "SCHEMA.md"]}`
- **行为**：创建目录结构 + 生成 SCHEMA.md

### wiki_ingest
- **入参**：`{source: string, force?: boolean}`
  - source 可以是文件路径或目录路径
- **返回**：`{status: "ok", ingested: N, total: N, files: [{name, content_preview}]}`
- **行为**：
  - 复制 MD 到 raw/（增量，已存在则跳过，除非 force）
  - 返回每个文件的名称和前 500 字预览（供 Agent 用 LLM 处理）

### wiki_tag
- **入参**：`{file: string, tags: string[]}`
- **返回**：`{status: "ok", file: "...", tags: [...]}`
- **行为**：把 Agent 传入的标签写入文件的 frontmatter

### wiki_compile
- **入参**：`{file: string, title: string, summary: string, insights: string[], category: string, tags: string[], source_file: string}`
- **返回**：`{status: "ok", wiki_file: "...", title: "..."}`
- **行为**：
  - 根据 Agent 传入的结构化内容生成 Wiki 页面 MD 文件
  - 更新 INDEX.md（按分类分组）
  - 追加 LOG.md（append-only）

### wiki_search
- **入参**：`{tags?: string[], query?: string, match?: "any"|"all", top_k?: number}`
- **返回**：`{total: N, results: [{title, file, tags, summary, score}]}`
- **行为**：
  - 标签匹配（frontmatter tags 字段）
  - 全文关键词搜索
  - 按综合得分排序

### wiki_article
- **入参**：`{topic: string, content: string, refs?: string[]}`
- **返回**：`{status: "ok", file: "...", topic: "..."}`
- **行为**：保存 Agent 写好的文章到 outputs/ 目录，文件名 `YYYYMMDD-主题.md`

### wiki_lint
- **入参**：`{check_only?: boolean}`
- **返回**：`{total_pages: N, issues: [{type, severity, source}], auto_fixed: N}`
- **行为**：
  - 检测死链接（[[]] 引用不存在的页面）
  - 检测缺失反向链接
  - 检测缺摘要
  - 检测内容过短
  - 自动修复（如果 check_only=false）

## 七、安装体验

### 一行安装

```bash
# Claude Code
claude mcp add agent-wiki -- npx agent-wiki

# Cursor：在 MCP 设置中添加
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["agent-wiki"]
    }
  }
}
```

### 首次使用流程（Agent 主动引导）

```
[用户装完插件，打开 Agent，还没说话]

Agent 主动说：
  你好！我注意到你安装了 agent-wiki 知识库插件。
  我可以帮你搭建一个卡帕西风格的个人知识库，把你收藏的文章
  自动整理成维基、打标签、生成摘要。还能基于你的知识库
  帮你写有人味儿的原创文章，适合直接发微信公众号。

  先设置一下：
  1. 你想把知识库放在哪个目录？（比如 ~/Documents/知识库）
  2. 你主要关注什么方向？（3-5 个关键词就行）

用户：~/Documents/知识库，关注 AI 和产品管理

Agent 调 wiki_init({dir: "~/Documents/知识库", topics: ["AI", "产品管理"]})

Agent：搞定！知识库已建好。你可以：
  - 把文章文件路径发给我，我帮你加入知识库
  - 说"整理知识库"，我自动处理所有新文章
  - 随时让我帮你搜知识库或写原创文章
  
  你有现成的文章想加进来吗？
```

### 日常使用（纯对话）

```
用户：把 ~/Downloads/这篇文章.md 加到知识库
Agent 自动：wiki_ingest → LLM 打标签 → wiki_tag → LLM 生成摘要 → wiki_compile

用户：搜一下 RAG 相关的内容
Agent 自动：wiki_search(tags=["RAG"]) → 返回匹配结果

用户：帮我写一篇 Agent 工程化的综述
Agent 自动：读 SCHEMA.md 写作规则 → wiki_search 找参考 → LLM 写文（人味儿）→ wiki_article 保存

用户：检查一下知识库
Agent 自动：wiki_lint → 报告问题
```

## 八、技术栈

- **语言**：TypeScript
- **MCP SDK**：`@modelcontextprotocol/sdk`
- **分发**：npm 包，`npx agent-wiki` 一行安装
- **外部依赖**：零（只用 Node.js 标准库 fs/path）
- **MCP 传输**：stdio（JSON-RPC over stdin/stdout）

## 九、与现有 agent-wiki 的关系

现有 Python 代码（`/Users/xizhongren/.openclaw/workspace/_workspace/projects/agent-wiki/`）作为参考：
- `server.py` 的文件操作逻辑（ingest/tag/compile/search/lint）→ 迁移为 TypeScript
- `mcp_server.py` 的 MCP 协议实现 → 用 `@modelcontextprotocol/sdk` 重写
- HTTP Server → 砍掉（MCP stdio 替代）
- LLM 调用 → 砍掉（宿主 Agent 负责）
- config.json → 砍掉（SCHEMA.md 替代）

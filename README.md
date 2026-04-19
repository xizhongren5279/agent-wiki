# Agent-Wiki

卡帕西智能知识库 MCP 插件。一行安装，纯对话交互。

帮你把收藏的文章自动整理成维基、打标签、生成摘要，还能基于知识库写有人味儿的原创文章。

## 安装

所有主流 Agent 通用，底层都是同一个 `npx agent-wiki`。装完重启 Agent 就行。

### Claude Code

```bash
claude mcp add agent-wiki -- npx agent-wiki
```

### Cursor

Settings → MCP → Add new MCP Server：

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["-y", "agent-wiki"]
    }
  }
}
```

### Trae

Settings → MCP → 添加服务器（或从 MCP Marketplace 搜索安装）：

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["-y", "agent-wiki"]
    }
  }
}
```

### Qoder

MCP Settings → Connect your own MCP server（或从 MCP Square 搜索安装）：

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["-y", "agent-wiki"]
    }
  }
}
```

### Windsurf

Plugins → Browse MCP Servers → Install，或编辑 `mcp_config.json`：

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["-y", "agent-wiki"]
    }
  }
}
```

### OpenClaw

编辑 `~/.openclaw/workspace/_workspace/config/mcporter.json`：

```json
{
  "mcpServers": {
    "agent-wiki": {
      "command": "npx",
      "args": ["-y", "agent-wiki"]
      "env": {},
      "disabled": false
    }
  }
}
```

## 首次使用

装完后打开 Agent，它会主动引导你：

```
Agent：你好！我是 agent-wiki 知识库助手。
我可以帮你搭一个个人知识库。还能基于你的知识库
帮你写有人味儿的原创文章，适合直接发微信公众号。

先设置一下：
1. 你想把知识库放在哪个目录？
2. 你主要关注什么方向？
```

你回答两个问题就建好了。

## 日常使用

纯对话，不需要记任何命令：

```
你：把 ~/Downloads/这篇文章.md 加到知识库
你：把 https://example.com/article 加到知识库
你：整理一下知识库
你：搜一下 RAG 相关的内容
你：帮我写一篇 Agent 工程化的综述
你：这段分析不错，存到知识库吧
你：检查一下知识库健不健康
你：看看有没有重复内容
你：按主题聚个类
你：生成一份知识库报告
```

## 支持的文件格式

| 格式 | 处理方式 |
|------|---------|
| `.md` | 直接摄入 |
| `.txt` | 自动转为 .md |
| `.html` | 去标签提取正文，转 .md |
| `.csv` | 转为 Markdown 表格 |
| `.pdf` / `.docx` / `.xlsx` | 原样存储，Agent 多模态读取 |
| 图片 | 存储到 raw/assets/ |
| URL | 抓取网页 HTML，转 .md（v0.3） |

## 知识库结构

```
你的知识库目录/
├── SCHEMA.md       # 知识库说明书（Agent 自动读取）
├── raw/            # 原始文章（不可变）
│   └── assets/     # 图片等资源
├── wiki/           # AI 编译后的维基页面
│   ├── INDEX.md    # 分类索引
│   ├── LOG.md      # 操作日志
│   ├── CLUSTERS.md # 主题聚类导航（v0.3）
│   ├── REPORT.md   # 知识库全景报告（v0.3）
│   └── *.md        # Wiki 页面
└── outputs/        # 原创文章（可直接发微信公众号）
```

## 工具列表

| 工具 | 功能 |
|------|------|
| wiki_status | 查询知识库状态，首次使用自动引导 |
| wiki_init | 初始化知识库（创建目录 + SCHEMA.md） |
| wiki_ingest | 摄入文章到 raw/（支持 md/txt/html/csv/pdf/docx/xlsx/图片/URL），SHA256 增量变更检测 |
| wiki_tag | 写入标签到 frontmatter |
| wiki_compile | 生成 Wiki 页面 + 更新索引 + 记录日志，支持来源标记和双向链接 |
| wiki_search | 标签 + 全文搜索，支持一跳关联扩展 |
| wiki_article | 保存原创文章到 outputs/ |
| wiki_lint | 自检死链接、缺摘要、缺来源标记等 |
| wiki_feedback | 保存问答分析到知识库（用户确认后） |
| wiki_cluster | 基于标签共现自动聚类，生成主题导航页（v0.3） |
| wiki_report | 生成知识库全景报告：连接度、孤立页、标签分布等（v0.3） |
| wiki_dedup | 三维去重检测：标题/标签/内容（v0.3） |

## 写文章风格

插件内置了去 AI 味规则，写出来的文章：
- 像跟朋友聊天，不像写论文
- 有自己的观点和态度
- 适合直接发微信公众号

## 知识自进化

每次问答中的综合分析，用户确认后会自动存入知识库。问得越多，知识库越厚。存入的内容会标记为 `query-derived`，与原始材料编译的内容区分开。

## v0.3 新功能

借鉴 [Graphify](https://github.com/graphify) 知识图谱系统的设计思路，在零外部依赖的约束下新增 8 项能力：

**增量智能** — 摄入文件时自动计算 SHA256 哈希。同名文件内容变了会触发重新处理，内容没变则跳过，不浪费 token。

**来源追踪** — 每条知识标记来源类型：`extracted`（原文摘录）、`inferred`（LLM 推断）、`query-derived`（问答衍生）。方便审计和清理。

**双向链接** — 编译 Wiki 页面时可指定相关页面，自动建立双向关联。A 关联 B，B 也会自动关联回 A。

**关联搜索** — 搜索命中页面后，自动扩展其关联页面作为补充结果（可关闭）。零成本提升搜索召回率。

**主题聚类** — 基于标签共现自动将页面分组，生成 CLUSTERS.md 主题导航页。不需要 embedding，纯标签计算。

**全景报告** — 一键生成 REPORT.md：高连接度页面、孤立页面、标签分布、来源分布、健康指标。鸟瞰知识库全貌。

**URL 摄入** — 直接传入网页 URL，自动抓取 HTML 转为 markdown 存入知识库。

**去重检测** — 三维检测重复内容：标题相似、标签高度重叠（80%+）、内容哈希相同。只报告不自动删，你来决定。

## 技术栈

- TypeScript + @modelcontextprotocol/sdk
- 零外部依赖（只用 Node.js 标准库）
- LLM 由宿主 Agent 提供，插件不碰 LLM
- MCP stdio 协议

## License

MIT

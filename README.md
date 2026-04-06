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
你：整理一下知识库
你：搜一下 RAG 相关的内容
你：帮我写一篇 Agent 工程化的综述
你：这段分析不错，存到知识库吧
你：检查一下知识库健不健康
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

## 知识库结构

```
你的知识库目录/
├── SCHEMA.md       # 知识库说明书（Agent 自动读取）
├── raw/            # 原始文章（不可变）
│   └── assets/     # 图片等资源
├── wiki/           # AI 编译后的维基页面
│   ├── INDEX.md    # 分类索引
│   ├── LOG.md      # 操作日志
│   └── *.md        # Wiki 页面
└── outputs/        # 原创文章（可直接发微信公众号）
```

## 工具列表

| 工具 | 功能 |
|------|------|
| wiki_status | 查询知识库状态，首次使用自动引导 |
| wiki_init | 初始化知识库（创建目录 + SCHEMA.md） |
| wiki_ingest | 摄入文章到 raw/（支持 md/txt/html/csv/pdf/docx/xlsx/图片） |
| wiki_tag | 写入标签到 frontmatter |
| wiki_compile | 生成 Wiki 页面 + 更新索引 + 记录日志 |
| wiki_search | 标签 + 全文搜索 |
| wiki_article | 保存原创文章到 outputs/ |
| wiki_lint | 自检死链接、缺摘要等 |
| wiki_feedback | 保存问答分析到知识库（用户确认后） |

## 写文章风格

插件内置了去 AI 味规则，写出来的文章：
- 像跟朋友聊天，不像写论文
- 有自己的观点和态度
- 适合直接发微信公众号

## 知识自进化

每次问答中的综合分析，用户确认后会自动存入知识库。问得越多，知识库越厚。存入的内容会标记为 `query-derived`，与原始材料编译的内容区分开。

## 技术栈

- TypeScript + @modelcontextprotocol/sdk
- 零外部依赖（只用 Node.js 标准库）
- LLM 由宿主 Agent 提供，插件不碰 LLM
- MCP stdio 协议

## License

MIT

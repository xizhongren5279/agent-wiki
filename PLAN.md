# Agent-Wiki 引擎 — 项目规划

> 目标：把现有 Wiki 工作流脚本包装成独立服务，让所有 Agent（OpenClaw、Claude Code、Cursor 等）都能通过 API/MCP 使用。

## 架构

```
agent-wiki/
├── engine/                  # 核心引擎（Python，FastAPI）
│   ├── server.py            # HTTP API 服务（端口 8090）
│   ├── tagger.py            # 标签提取（从 tag-clippings.py 重构）
│   ├── compiler.py          # 维基编译（从 compile-clippings.py 重构）
│   ├── healer.py            # 自检自修复（从 wiki-lint-heal.py 重构）
│   ├── fileback.py          # Q&A 反哺（从 qa-fileback.py 重构）
│   └── logger.py            # 时间线日志（从 wiki_log.py 重构）
├── mcp/                     # MCP Server（Node.js/Python）
│   └── server.py            # MCP 协议封装
├── config.yaml              # 统一配置
├── requirements.txt
├── README.md
└── LICENSE                  # MIT
```

## API 设计

### 核心接口

```
POST /api/v1/tag        — 给文件打标签
POST /api/v1/compile    — 编译成维基页面
POST /api/v1/lint       — 自检自修复
POST /api/v1/feedback   — Q&A 反哺（Karpathy compounding）
GET  /api/v1/search     — 语义搜索 Wiki
GET  /api/v1/status     — 服务状态
GET  /api/v1/tree       — Wiki 目录树
```

### MCP 工具

```
wiki_tag        — 打标签
wiki_compile    — 编译维基
wiki_lint       — 自检修复
wiki_feedback   — Q&A 反哺
wiki_search     — 搜索
wiki_status     — 状态
```

## 配置（config.yaml）

```yaml
server:
  host: 127.0.0.1
  port: 8090

ollama:
  api_base: http://localhost:11434
  model: gemma4:e2b

paths:
  clippings: /path/to/Clippings/
  raw: /path/to/Raw/
  wiki: /path/to/Wiki/
  state: /path/to/state/

embedding:
  api_base: http://localhost:5050/v1
  model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  dimension: 384
```

## 发布渠道

1. **PyPI**：`pip install agent-wiki`
2. **MCP Server 注册**：发布到 MCP Server 目录
3. **OpenClaw Skill**：发布到 ClawhHub
4. **GitHub**：开源，MIT 协议
5. **Obsidian 插件**：后续（TypeScript 重写前端）

## 里程碑

- [ ] M1：核心引擎 + HTTP API（Day 1-2）
- [ ] M2：MCP Server（Day 3）
- [ ] M3：OpenClaw Skill 适配（Day 4）
- [ ] M4：测试 + 文档 + PyPI 发布（Day 5）
- [ ] M5：Obsidian 插件（后续）

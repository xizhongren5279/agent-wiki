# Agent-Wiki 需求规格 v1.1 (MVP)

> 2026-04-06 江鑫光确认 · MVP 原则：能砍就砍

## 核心流程

```
用户指定目录 → 搬到 RAW → 打标签 → 编译 Wiki → 搜标签 → [可选] 给主题写原创文章
```

## MVP 功能（P0）

### 输入
- 用户指定目录路径 → 引擎把 MD 文件搬到 RAW（不可变）
- 只支持 MD
- 增量处理（只搬新文件）

### LLM 配置（双模式）
- 本地：Ollama
- 云端：OpenAI 兼容 API（OpenRouter / DeepSeek / 通义千问等）
- 用户在 config 选，引擎自动适配

### 打标签
- LLM 提取 10 个标签
- 写入 MD frontmatter

### 编译 Wiki
- 摘要 + 洞察 + 分类 + 反向链接
- 索引自动更新
- Raw 备份

### 搜索
- **只搜标签**（不要 Embedding，不要向量）
- 用户给标签 → 返回所有带该标签的 Wiki 页面
- 毫秒级，不需要 LLM

### 原创文章（可选）
- 用户给主题 → 从 Wiki 搜相关标签内容 → LLM 写原创
- 输出 MD 文件

### Agent 接入
- HTTP API（端口 8090）
- MCP Server

## 不做（后续版本）

- ❌ Embedding / 向量搜索
- ❌ 语义搜索
- ❌ Q&A 自动反哺
- ❌ PDF / 网页 URL 支持
- ❌ 多格式输出（飞书/微信）
- ❌ YAML 配置
- ❌ 去重检测
- ❌ 版本管理

## 约束

- 核心引擎零外部依赖（Python 标准库）
- 配置 JSON
- 错误恢复（LLM 重试 3 次）

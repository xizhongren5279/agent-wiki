# Design: Agent-Wiki v0.3 技术方案

## 改动文件列表

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/tools.ts` | 修改 | 修改 wiki_ingest/wiki_compile/wiki_search，新增 wiki_cluster/wiki_report/wiki_dedup |
| `src/index.ts` | 修改 | 注册 3 个新工具的 schema |
| `src/utils.ts`（新建） | 新增 | 提取 SHA256、Union-Find、URL fetch 等工具函数 |

## 技术方案

### 1. 内容变更检测

```typescript
// src/utils.ts
import { createHash } from "node:crypto";
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
```

- `wiki_ingest` 流程变更：读取文件 → 计算 SHA256 → 对比 state.hashes[filename]
- 哈希不同 → 覆盖文件 + 从 tagged/compiled 移除 + 更新 hashes
- state.json 新增 `hashes: Record<string, string>`

### 2. 置信度/来源标记

- `wiki_compile` 的 Zod schema 新增 `source_type: z.enum(["extracted","inferred"]).optional().default("extracted")`
- 写入 frontmatter 时加入 `source_type` 字段
- `wiki_search` 返回结果中包含 `source_type`

### 3. 关系提取 + 双向链接

- `wiki_compile` 的 Zod schema 新增 `related: z.array(z.string()).optional()`
- 编译时：
  1. 将 related 写入当前页面 frontmatter
  2. 遍历 related 列表，读取每个目标页面，在其 frontmatter.related 中添加当前页面（去重）
  3. 在页面底部追加 `## 相关页面` 区块，格式 `- [[页面名]]`

### 4. 搜索增强

- `wiki_search` 新增参数 `expand_related`
- 搜索流程：原有搜索 → 收集直接命中 → 读取每个命中页面的 related → 加载关联页面 → 打 0.7 折 → 合并去重 → 排序返回
- 结果新增 `match_type: "direct" | "related"` 字段

### 5. 主题聚类

```typescript
// Union-Find 实现（~30 行）
class UnionFind {
  parent: Map<string, string>;
  find(x: string): string { ... }
  union(x: string, y: string): void { ... }
  groups(): Map<string, string[]> { ... }
}
```

- 遍历所有 wiki 页面对，计算共享标签数
- 共享数 >= min_shared_tags → union 两个页面
- 输出连通分量作为集群
- 集群命名：取该集群所有页面标签的交集中频率最高的 2-3 个

### 6. 知识图谱报告

- 读取所有 wiki 页面的 frontmatter
- 统计 related 引用计数（入度排序）
- 统计标签分布、来源分布
- 读取 LOG.md 最后 10 行
- 生成 REPORT.md（markdown 表格格式）

### 7. URL 摄入

```typescript
// wiki_ingest 中新增分支
if (source.startsWith("http://") || source.startsWith("https://")) {
  const resp = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const md = htmlToMarkdown(html);  // 复用现有函数
  const filename = urlToFilename(source);  // hostname-path.md
  // 写入 raw/ 并在 frontmatter 加 source_url
}
```

- `urlToFilename`：取 hostname + pathname，替换非法字符为 `-`，截断 80 字符

### 8. 去重检测

- 三轮检测：
  1. 标题比较：`title.toLowerCase().trim()` 相同
  2. 标签重叠：`intersection.length / union.length >= 0.8`
  3. 内容哈希：body 部分 SHA256 相同
- 返回所有疑似重复对，附原因

## 验证方案

每个功能完成后：
1. `npm run build` 编译通过
2. 手动测试 MCP 工具调用
3. `wiki_lint` 无新增 error

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| URL fetch 在某些 MCP 宿主环境不可用 | URL 摄入失败 | 捕获错误，返回明确提示 |
| 双向链接写入并发冲突 | frontmatter 损坏 | 串行写入，读-改-写原子操作 |
| 大量页面时聚类性能 | 响应慢 | O(n²) 但 wiki 页面通常 <1000，可接受 |

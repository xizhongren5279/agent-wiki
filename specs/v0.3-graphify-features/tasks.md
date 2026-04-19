# Tasks: Agent-Wiki v0.3 施工清单

## 基础设施
- [ ] T1: 新建 `src/utils.ts`，实现 sha256、UnionFind、urlToFilename 工具函数
- [ ] T2: 扩展 state.json 类型定义，新增 hashes 字段

## 功能 1: 内容变更检测
- [ ] T3: 修改 wiki_ingest，摄入时计算 SHA256 并存入 state.hashes
- [ ] T4: 实现哈希比对逻辑（不同→覆盖+移除 tagged/compiled，相同→跳过）

## 功能 2: 置信度/来源标记
- [ ] T5: wiki_compile 新增 source_type 参数，写入 frontmatter
- [ ] T6: wiki_search 返回结果包含 source_type；wiki_lint 检查缺失 source_type

## 功能 3: 关系提取 + 双向链接
- [ ] T7: wiki_compile 新增 related 参数，写入 frontmatter + 生成"相关页面"区块
- [ ] T8: 实现双向链接自动回写（A related B → B related A）

## 功能 4: 搜索增强
- [ ] T9: wiki_search 新增 expand_related 参数，实现一跳关联扩展 + match_type 标记

## 功能 5: 主题聚类
- [ ] T10: 实现 wiki_cluster 工具（Union-Find 聚类 + CLUSTERS.md 生成）
- [ ] T11: 在 index.ts 注册 wiki_cluster schema

## 功能 6: 知识图谱报告
- [ ] T12: 实现 wiki_report 工具（统计 + REPORT.md 生成）
- [ ] T13: 在 index.ts 注册 wiki_report schema

## 功能 7: URL 摄入
- [ ] T14: wiki_ingest 支持 HTTP/HTTPS URL（fetch + htmlToMarkdown + source_url frontmatter）

## 功能 8: 去重检测
- [ ] T15: 实现 wiki_dedup 工具（标题/标签/内容三维检测）
- [ ] T16: 在 index.ts 注册 wiki_dedup schema

## 收尾
- [ ] T17: npm run build 编译通过，全量功能验证

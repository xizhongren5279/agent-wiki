/**
 * wiki_search — 标签匹配 + 全文关键词搜索
 *
 * 遍历 wiki/*.md，解析 frontmatter tags
 * 标签匹配权重 0.6 + 全文匹配权重 0.4
 * 支持匹配模式 any（任一）/ all（全部）
 */

import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir } from "../state.js";
import { parseFrontmatter } from "../utils.js";
import { textResult, ToolResult } from "../types.js";

export async function handleSearch(params: {
  tags?: string[];
  query?: string;
  match?: "any" | "all";
  top_k?: number;
}): Promise<ToolResult> {
  const wikiDir = getWikiDir();
  if (!wikiDir) {
    return textResult(JSON.stringify({ error: "知识库未初始化" }));
  }

  const wikiPagesDir = getWikiPagesDir(wikiDir);
  if (!fs.existsSync(wikiPagesDir)) {
    return textResult(JSON.stringify({ total: 0, results: [] }));
  }

  const { tags = [], query = "", match = "any", top_k = 10 } = params;
  const searchTags = tags.map((t) => t.toLowerCase());
  const searchQuery = query.toLowerCase();

  // 排除索引和日志文件
  const excludeFiles = new Set(["INDEX.md", "LOG.md"]);
  const mdFiles = fs
    .readdirSync(wikiPagesDir)
    .filter((f) => f.endsWith(".md") && !excludeFiles.has(f));

  interface SearchResult {
    title: string;
    file: string;
    tags: string[];
    summary: string;
    score: number;
    type: string;
  }

  const results: SearchResult[] = [];

  for (const fileName of mdFiles) {
    const filePath = path.join(wikiPagesDir, fileName);
    const content = fs.readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(content);

    const fileTags: string[] = Array.isArray(meta.tags)
      ? meta.tags.map((t: unknown) => String(t).toLowerCase())
      : [];

    // 提取摘要（## 摘要 后面的内容）
    let summary = "";
    const summaryMatch = body.match(/## 摘要\s*\n([\s\S]*?)(?=\n##|$)/);
    if (summaryMatch) {
      summary = summaryMatch[1].trim().substring(0, 200);
    }

    const title = String(meta.title || fileName.replace(".md", ""));

    // 计算得分
    let tagScore = 0;
    let textScore = 0;

    if (searchTags.length > 0) {
      if (match === "any") {
        // 任一标签匹配
        const matchedCount = searchTags.filter((st) => fileTags.some((ft) => ft.includes(st))).length;
        tagScore = matchedCount / searchTags.length;
      } else {
        // 全部标签匹配
        const allMatch = searchTags.every((st) => fileTags.some((ft) => ft.includes(st)));
        tagScore = allMatch ? 1 : 0;
      }
    }

    if (searchQuery) {
      const bodyLower = body.toLowerCase();
      // 统计关键词出现次数（最多计 5 次避免长文偏差）
      const matches = bodyLower.split(searchQuery).length - 1;
      textScore = Math.min(matches / 5, 1);
    }

    // 综合得分：标签权重 0.6 + 全文权重 0.4
    // 如果只有标签搜索，标签权重 1.0；如果只有全文，全文权重 1.0
    let score: number;
    if (searchTags.length > 0 && searchQuery) {
      score = tagScore * 0.6 + textScore * 0.4;
    } else if (searchTags.length > 0) {
      score = tagScore;
    } else if (searchQuery) {
      score = textScore;
    } else {
      score = 0;
    }

    // 至少有一点匹配才加入结果
    if (score > 0) {
      // 类型权重：compiled（原始材料编译）排在 query-derived（问答生成）前面
      const typeBoost = String(meta.type) === "query-derived" ? 0.9 : 1.0;
      results.push({
        title,
        file: fileName,
        tags: fileTags,
        summary,
        score: Math.round(score * typeBoost * 100) / 100,
        type: String(meta.type || "compiled"),
      });
    }
  }

  // 按得分降序排序，取 top_k
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, top_k);

  return textResult(JSON.stringify({
    total: topResults.length,
    results: topResults,
  }));
}

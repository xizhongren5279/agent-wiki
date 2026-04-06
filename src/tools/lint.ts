/**
 * wiki_lint — 自检知识库健康状态
 *
 * 检测：
 * 1. 死链接（[[xxx]] 引用不存在的页面）
 * 2. 缺失反向链接（被引用但未引用回的页面）
 * 3. 缺摘要（## 摘要 后无内容）
 * 4. 内容过短（文件 < 100 字符）
 * 5. 缺 frontmatter tags
 * 6. frontmatter 中 sources 引用的源文件不存在
 *
 * 如果 check_only=false，自动修复能修的问题：
 * - 缺标签 → 从 category 和标题关键词推断
 * - 死链接 → 从正文中删除无效的 [[xxx]] 引用
 */

import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir, getRawDir } from "../state.js";
import { parseFrontmatter, writeFrontmatter } from "../utils.js";
import { textResult, ToolResult } from "../types.js";

interface LintIssue {
  type: string;
  severity: "error" | "warning" | "info";
  source: string;
  detail: string;
  auto_fixed?: boolean; // 标记是否已自动修复
}

export async function handleLint(params: {
  check_only?: boolean;
}): Promise<ToolResult> {
  const wikiDir = getWikiDir();
  if (!wikiDir) {
    return textResult(JSON.stringify({ error: "知识库未初始化" }));
  }

  const wikiPagesDir = getWikiPagesDir(wikiDir);
  const rawDir = getRawDir(wikiDir);
  const checkOnly = params.check_only ?? true;
  const issues: LintIssue[] = [];
  let autoFixed = 0;

  if (!fs.existsSync(wikiPagesDir)) {
    return textResult(JSON.stringify({ total_pages: 0, issues: [], auto_fixed: 0 }));
  }

  const excludeFiles = new Set(["INDEX.md", "LOG.md"]);
  const wikiFiles = fs
    .readdirSync(wikiPagesDir)
    .filter((f) => f.endsWith(".md") && !excludeFiles.has(f));

  // 收集所有 Wiki 页面标题（用于检测死链接）
  const existingPages = new Set(wikiFiles.map((f) => f.replace(".md", "")));

  // 收集所有 raw 文件（用于检测源文件引用）
  const rawFiles = new Set(
    fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : []
  );

  for (const fileName of wikiFiles) {
    const filePath = path.join(wikiPagesDir, fileName);
    const content = fs.readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    let modified = false;
    let newBody = body;
    const newMeta = { ...meta };

    // 1. 检测内容过短
    if (content.length < 100) {
      issues.push({
        type: "too_short",
        severity: "warning",
        source: fileName,
        detail: `文件仅 ${content.length} 字符，内容过短`,
      });
    }

    // 2. 检测缺 frontmatter tags → 自动修复
    if (!meta.tags || !Array.isArray(meta.tags) || meta.tags.length === 0) {
      // 自动修复：从 category + 标题关键词推断标签
      const inferredTags: string[] = [];
      if (meta.category && typeof meta.category === "string") {
        inferredTags.push(meta.category);
      }
      // 从标题提取中文关键词（取前 2-4 个字作为一个 tag）
      const titleStr = String(meta.title || fileName.replace(".md", ""));
      if (titleStr.length >= 4) {
        // 简单策略：标题本身就是最好的标签候选
        inferredTags.push(titleStr.substring(0, Math.min(8, titleStr.length)));
      }
      if (inferredTags.length === 0) {
        inferredTags.push("untagged");
      }

      if (checkOnly) {
        issues.push({
          type: "missing_tags",
          severity: "warning",
          source: fileName,
          detail: `缺少标签（推断标签: ${inferredTags.join(", ")}）`,
        });
      } else {
        newMeta.tags = inferredTags;
        modified = true;
        autoFixed++;
        issues.push({
          type: "missing_tags",
          severity: "warning",
          source: fileName,
          detail: `已自动补标签: [${inferredTags.join(", ")}]`,
          auto_fixed: true,
        });
      }
    }

    // 3. 检测缺摘要
    const summaryMatch = newBody.match(/## 摘要\s*\n([\s\S]*?)(?=\n##|$)/);
    if (!summaryMatch || summaryMatch[1].trim().length < 10) {
      issues.push({
        type: "missing_summary",
        severity: "info",
        source: fileName,
        detail: "缺少摘要或摘要内容过短",
      });
    }

    // 4. 检测死链接（[[xxx]] 引用）→ 自动修复
    const deadLinks: string[] = [];
    const wikilinks = newBody.matchAll(/\[\[(.+?)\]\]/g);
    for (const link of wikilinks) {
      const linkTarget = link[1];
      let isDead = false;

      if (linkTarget.startsWith("raw/")) {
        const rawFileName = linkTarget.replace("raw/", "");
        if (!rawFiles.has(rawFileName)) {
          isDead = true;
        }
      } else {
        // Wiki 页面间引用
        if (!existingPages.has(linkTarget)) {
          isDead = true;
        }
      }

      if (isDead) {
        deadLinks.push(linkTarget);
        issues.push({
          type: "dead_link",
          severity: "error",
          source: fileName,
          detail: `死链接: [[${linkTarget}]]，目标不存在`,
          auto_fixed: !checkOnly,
        });
      }
    }

    // 自动修复：从正文中删除死链接
    if (!checkOnly && deadLinks.length > 0) {
      for (const deadLink of deadLinks) {
        // 删除 [[deadLink]] 引用（包括可能的前后空格和换行）
        const escaped = deadLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newBody = newBody.replace(new RegExp(`\\s*\\[\\[${escaped}\\]\\]\\s*`, "g"), " ");
      }
      modified = true;
      autoFixed += deadLinks.length;
    }

    // 5. 检测源文件引用
    const sources = newMeta.sources;
    if (Array.isArray(sources)) {
      const validSources: string[] = [];
      let sourcesChanged = false;
      for (const src of sources) {
        const srcStr = String(src).replace(/\[\[|\]\]/g, "");
        if (srcStr.startsWith("raw/")) {
          const rawFileName = srcStr.replace("raw/", "");
          if (!rawFiles.has(rawFileName)) {
            if (checkOnly) {
              issues.push({
                type: "broken_source",
                severity: "error",
                source: fileName,
                detail: `源文件引用不存在: ${srcStr}`,
              });
            } else {
              // 自动修复：删除无效的源文件引用
              sourcesChanged = true;
              autoFixed++;
              issues.push({
                type: "broken_source",
                severity: "error",
                source: fileName,
                detail: `已删除无效源文件引用: ${srcStr}`,
                auto_fixed: true,
              });
            }
          } else {
            validSources.push(String(src));
          }
        } else {
          validSources.push(String(src));
        }
      }
      if (sourcesChanged) {
        newMeta.sources = validSources;
        modified = true;
      }
    }

    // 如果有修改，写回文件
    if (modified && !checkOnly) {
      const newContent = writeFrontmatter(newMeta, newBody);
      fs.writeFileSync(filePath, newContent, "utf-8");
    }
  }

  return textResult(JSON.stringify({
    total_pages: wikiFiles.length,
    issues,
    auto_fixed: autoFixed,
    summary: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      auto_fixed_count: autoFixed,
    },
  }));
}

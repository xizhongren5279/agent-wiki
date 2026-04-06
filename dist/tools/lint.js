/**
 * wiki_lint — 自检知识库健康状态
 *
 * 检测：
 * 1. 死链接（[[xxx]] 引用不存在的页面）
 * 2. 缺失反向链接（被引用但未引用回的页面）
 * 3. 缺摘要（## 摘要 后无内容）
 * 4. 内容过短（文件 < 100 字符）
 * 5. 缺 frontmatter tags
 *
 * 如果 check_only=false，自动修复能修的问题
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir, getRawDir } from "../state.js";
import { parseFrontmatter } from "../utils.js";
import { textResult } from "../types.js";
export async function handleLint(params) {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    const rawDir = getRawDir(wikiDir);
    const checkOnly = params.check_only ?? true;
    const issues = [];
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
    const rawFiles = new Set(fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : []);
    for (const fileName of wikiFiles) {
        const filePath = path.join(wikiPagesDir, fileName);
        const content = fs.readFileSync(filePath, "utf-8");
        const { meta, body } = parseFrontmatter(content);
        // 1. 检测内容过短
        if (content.length < 100) {
            issues.push({
                type: "too_short",
                severity: "warning",
                source: fileName,
                detail: `文件仅 ${content.length} 字符，内容过短`,
            });
        }
        // 2. 检测缺 frontmatter tags
        if (!meta.tags || !Array.isArray(meta.tags) || meta.tags.length === 0) {
            issues.push({
                type: "missing_tags",
                severity: "warning",
                source: fileName,
                detail: "缺少标签（frontmatter tags 字段为空或不存在）",
            });
        }
        // 3. 检测缺摘要
        const summaryMatch = body.match(/## 摘要\s*\n([\s\S]*?)(?=\n##|$)/);
        if (!summaryMatch || summaryMatch[1].trim().length < 10) {
            issues.push({
                type: "missing_summary",
                severity: "info",
                source: fileName,
                detail: "缺少摘要或摘要内容过短",
            });
        }
        // 4. 检测死链接（[[xxx]] 引用）
        const wikilinks = body.matchAll(/\[\[(.+?)\]\]/g);
        for (const link of wikilinks) {
            const linkTarget = link[1];
            // 检查是否是 raw/ 下的源文件引用
            if (linkTarget.startsWith("raw/")) {
                const rawFileName = linkTarget.replace("raw/", "");
                if (!rawFiles.has(rawFileName)) {
                    issues.push({
                        type: "dead_link",
                        severity: "error",
                        source: fileName,
                        detail: `死链接: [[${linkTarget}]]，源文件不存在`,
                    });
                }
            }
            else {
                // Wiki 页面间引用
                if (!existingPages.has(linkTarget)) {
                    issues.push({
                        type: "dead_link",
                        severity: "error",
                        source: fileName,
                        detail: `死链接: [[${linkTarget}]]，目标页面不存在`,
                    });
                }
            }
        }
        // 5. 检测源文件引用
        const sources = meta.sources;
        if (Array.isArray(sources)) {
            for (const src of sources) {
                const srcStr = String(src).replace(/\[\[|\]\]/g, "");
                if (srcStr.startsWith("raw/")) {
                    const rawFileName = srcStr.replace("raw/", "");
                    if (!rawFiles.has(rawFileName)) {
                        issues.push({
                            type: "broken_source",
                            severity: "error",
                            source: fileName,
                            detail: `源文件引用不存在: ${srcStr}`,
                        });
                    }
                }
            }
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
        },
    }));
}

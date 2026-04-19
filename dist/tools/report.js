/**
 * wiki_report — 生成知识库全景报告
 *
 * 统计：高连接度页面、孤立页面、标签分布、来源分布、最近更新、健康指标
 * 输出 wiki/REPORT.md
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir } from "../state.js";
import { parseFrontmatter, todayStr, readFile_safe } from "../utils.js";
import { textResult } from "../types.js";
export async function handleReport() {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    if (!fs.existsSync(wikiPagesDir)) {
        return textResult(JSON.stringify({ error: "wiki/ 目录不存在" }));
    }
    const excludeFiles = new Set(["INDEX.md", "LOG.md", "CLUSTERS.md", "REPORT.md"]);
    const mdFiles = fs
        .readdirSync(wikiPagesDir)
        .filter((f) => f.endsWith(".md") && !excludeFiles.has(f));
    // 收集所有页面的元数据
    const tagCounts = new Map();
    const sourceTypeCounts = new Map();
    const inDegree = new Map(); // 被引用次数
    const pagesWithRelated = [];
    const pagesWithoutRelated = [];
    let totalTags = 0;
    for (const fileName of mdFiles) {
        const content = fs.readFileSync(path.join(wikiPagesDir, fileName), "utf-8");
        const { meta } = parseFrontmatter(content);
        // 标签统计
        const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => String(t)) : [];
        totalTags += tags.length;
        for (const t of tags) {
            tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
        // 来源类型统计
        const st = String(meta.source_type || meta.type || "unknown");
        sourceTypeCounts.set(st, (sourceTypeCounts.get(st) ?? 0) + 1);
        // 关联统计
        const related = Array.isArray(meta.related) ? meta.related.map((r) => String(r)) : [];
        if (related.length > 0) {
            pagesWithRelated.push(fileName);
            for (const r of related) {
                const rFile = r.endsWith(".md") ? r : r + ".md";
                inDegree.set(rFile, (inDegree.get(rFile) ?? 0) + 1);
            }
        }
        else {
            pagesWithoutRelated.push(fileName);
        }
    }
    // Top 10 高连接度页面
    const topConnected = Array.from(inDegree.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    // 标签分布（按频率排序）
    const tagDist = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
    // 最近 10 条日志
    const logPath = path.join(wikiPagesDir, "LOG.md");
    const logContent = readFile_safe(logPath) ?? "";
    const logEntries = logContent
        .split(/\n## /)
        .filter((e) => e.trim() && !e.startsWith("---") && !e.startsWith("# "))
        .slice(-10)
        .reverse();
    // 生成 REPORT.md
    const lines = [
        "---",
        `title: 知识库报告`,
        `date: ${todayStr()}`,
        "---",
        "",
        "# 知识库全景报告",
        "",
        "## 健康指标",
        "",
        `| 指标 | 值 |`,
        `|------|-----|`,
        `| 总页面数 | ${mdFiles.length} |`,
        `| 有标签率 | ${mdFiles.length > 0 ? Math.round((tagCounts.size > 0 ? mdFiles.filter((f) => { const c = fs.readFileSync(path.join(wikiPagesDir, f), "utf-8"); const { meta } = parseFrontmatter(c); return Array.isArray(meta.tags) && meta.tags.length > 0; }).length : 0) / mdFiles.length * 100) : 0}% |`,
        `| 有关联率 | ${mdFiles.length > 0 ? Math.round(pagesWithRelated.length / mdFiles.length * 100) : 0}% |`,
        `| 平均标签数 | ${mdFiles.length > 0 ? (totalTags / mdFiles.length).toFixed(1) : 0} |`,
        "",
    ];
    // 高连接度页面
    lines.push("## 高连接度页面（被引用最多）");
    lines.push("");
    if (topConnected.length > 0) {
        lines.push("| 页面 | 被引用次数 |");
        lines.push("|------|-----------|");
        for (const [file, count] of topConnected) {
            lines.push(`| [[${file.replace(".md", "")}]] | ${count} |`);
        }
    }
    else {
        lines.push("暂无关联数据。使用 wiki_compile 的 related 参数建立页面关联。");
    }
    lines.push("");
    // 孤立页面
    lines.push("## 孤立页面（无关联）");
    lines.push("");
    if (pagesWithoutRelated.length > 0) {
        for (const p of pagesWithoutRelated.slice(0, 20)) {
            lines.push(`- [[${p.replace(".md", "")}]]`);
        }
        if (pagesWithoutRelated.length > 20) {
            lines.push(`- ...及其他 ${pagesWithoutRelated.length - 20} 个`);
        }
    }
    else {
        lines.push("所有页面都有关联。");
    }
    lines.push("");
    // 标签分布
    lines.push("## 标签分布");
    lines.push("");
    lines.push("| 标签 | 页面数 |");
    lines.push("|------|--------|");
    for (const [tag, count] of tagDist) {
        lines.push(`| ${tag} | ${count} |`);
    }
    lines.push("");
    // 来源分布
    lines.push("## 来源分布");
    lines.push("");
    lines.push("| 类型 | 页面数 |");
    lines.push("|------|--------|");
    for (const [st, count] of sourceTypeCounts) {
        lines.push(`| ${st} | ${count} |`);
    }
    lines.push("");
    // 最近更新
    lines.push("## 最近更新");
    lines.push("");
    if (logEntries.length > 0) {
        for (const entry of logEntries) {
            lines.push(`- ${entry.trim().split("\n")[0]}`);
        }
    }
    else {
        lines.push("暂无操作日志。");
    }
    lines.push("");
    lines.push(`---\n*生成于 ${todayStr()}*`);
    fs.writeFileSync(path.join(wikiPagesDir, "REPORT.md"), lines.join("\n"), "utf-8");
    return textResult(JSON.stringify({
        status: "ok",
        total_pages: mdFiles.length,
        top_connected: topConnected.slice(0, 5).map(([f, c]) => ({ file: f, refs: c })),
        orphan_count: pagesWithoutRelated.length,
        tag_count: tagCounts.size,
        source_types: Object.fromEntries(sourceTypeCounts),
    }));
}

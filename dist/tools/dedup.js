/**
 * wiki_dedup — 检测知识库中的重复内容
 *
 * 三维检测：
 * 1. 标题相似（完全相同或仅大小写/空格不同）
 * 2. 标签高度重叠（80%+ Jaccard 相似度）
 * 3. 内容哈希相同（body 部分 SHA256 一致）
 *
 * 只报告不自动处理，由用户决定保留哪个
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir, getRawDir } from "../state.js";
import { parseFrontmatter, sha256 } from "../utils.js";
import { textResult } from "../types.js";
export async function handleDedup() {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const duplicates = [];
    const allFiles = [];
    // 收集 wiki/ 和 raw/ 下的所有 md 文件
    for (const [dirName, dirPath] of [
        ["wiki", getWikiPagesDir(wikiDir)],
        ["raw", getRawDir(wikiDir)],
    ]) {
        if (!fs.existsSync(dirPath))
            continue;
        const excludeFiles = new Set(["INDEX.md", "LOG.md", "CLUSTERS.md", "REPORT.md"]);
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md") && !excludeFiles.has(f));
        for (const fileName of files) {
            const content = fs.readFileSync(path.join(dirPath, fileName), "utf-8");
            const { meta, body } = parseFrontmatter(content);
            const title = String(meta.title || fileName.replace(".md", ""));
            const tags = Array.isArray(meta.tags)
                ? meta.tags.map((t) => String(t).toLowerCase())
                : [];
            allFiles.push({
                file: `${dirName}/${fileName}`,
                dir: dirName,
                title,
                titleNorm: title.toLowerCase().replace(/\s+/g, "").trim(),
                tags,
                bodyHash: sha256(body.trim()),
            });
        }
    }
    // 去重检测：两两比较
    const seen = new Set();
    for (let i = 0; i < allFiles.length; i++) {
        for (let j = i + 1; j < allFiles.length; j++) {
            const a = allFiles[i];
            const b = allFiles[j];
            const pairKey = `${a.file}|${b.file}`;
            if (seen.has(pairKey))
                continue;
            const reasons = [];
            // 1. 标题相似
            if (a.titleNorm === b.titleNorm) {
                reasons.push("标题相同");
            }
            // 2. 标签高度重叠（Jaccard >= 0.8）
            if (a.tags.length > 0 && b.tags.length > 0) {
                const setA = new Set(a.tags);
                const setB = new Set(b.tags);
                const intersection = a.tags.filter((t) => setB.has(t)).length;
                const union = new Set([...a.tags, ...b.tags]).size;
                if (union > 0 && intersection / union >= 0.8) {
                    reasons.push(`标签重叠 ${Math.round(intersection / union * 100)}%`);
                }
            }
            // 3. 内容哈希相同
            if (a.bodyHash === b.bodyHash) {
                reasons.push("内容完全相同");
            }
            if (reasons.length > 0) {
                seen.add(pairKey);
                duplicates.push({
                    files: [a.file, b.file],
                    reason: reasons.join(" + "),
                });
            }
        }
    }
    return textResult(JSON.stringify({
        status: "ok",
        duplicates,
        total_checked: allFiles.length,
    }));
}

/**
 * wiki_cluster — 基于标签共现的主题自动聚类
 *
 * 遍历所有 wiki 页面对，共享标签数 >= min_shared_tags 的归为一组
 * 使用 Union-Find 合并连通分量
 * 生成 wiki/CLUSTERS.md 主题导航页
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir } from "../state.js";
import { parseFrontmatter, UnionFind, todayStr } from "../utils.js";
import { textResult } from "../types.js";
export async function handleCluster(params) {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    if (!fs.existsSync(wikiPagesDir)) {
        return textResult(JSON.stringify({ clusters: [], orphans: [] }));
    }
    const minShared = params.min_shared_tags ?? 2;
    const excludeFiles = new Set(["INDEX.md", "LOG.md", "CLUSTERS.md", "REPORT.md"]);
    const mdFiles = fs
        .readdirSync(wikiPagesDir)
        .filter((f) => f.endsWith(".md") && !excludeFiles.has(f));
    // 收集每个页面的标签
    const pageTags = new Map();
    for (const fileName of mdFiles) {
        const content = fs.readFileSync(path.join(wikiPagesDir, fileName), "utf-8");
        const { meta } = parseFrontmatter(content);
        const tags = Array.isArray(meta.tags)
            ? meta.tags.map((t) => String(t).toLowerCase())
            : [];
        pageTags.set(fileName, tags);
    }
    // Union-Find 聚类：共享标签数 >= minShared 的页面归为一组
    const uf = new UnionFind();
    const files = Array.from(pageTags.keys());
    for (let i = 0; i < files.length; i++) {
        uf.find(files[i]); // 确保每个文件都在并查集中
        for (let j = i + 1; j < files.length; j++) {
            const tagsA = pageTags.get(files[i]);
            const tagsB = pageTags.get(files[j]);
            const shared = tagsA.filter((t) => tagsB.includes(t));
            if (shared.length >= minShared) {
                uf.union(files[i], files[j]);
            }
        }
    }
    // 提取连通分量
    const groups = uf.groups();
    const clusters = [];
    const orphans = [];
    for (const [, members] of groups) {
        if (members.length === 1) {
            orphans.push(members[0]);
            continue;
        }
        // 集群命名：取所有成员标签的交集中频率最高的 2-3 个
        const tagCounts = new Map();
        for (const m of members) {
            for (const t of pageTags.get(m) ?? []) {
                tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
            }
        }
        // 按频率排序，取出现在 50%+ 成员中的标签
        const threshold = members.length * 0.5;
        const commonTags = Array.from(tagCounts.entries())
            .filter(([, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([tag]) => tag);
        const name = commonTags.length > 0 ? commonTags.join(" + ") : `集群 ${clusters.length + 1}`;
        clusters.push({ name, pages: members, shared_tags: commonTags });
    }
    // 生成 CLUSTERS.md
    const lines = [
        "---",
        `title: 主题聚类`,
        `date: ${todayStr()}`,
        "---",
        "",
        "# 主题聚类",
        "",
        `> 基于标签共现自动生成（最少共享 ${minShared} 个标签）`,
        "",
    ];
    for (const c of clusters) {
        lines.push(`## ${c.name}`);
        lines.push(`共享标签: ${c.shared_tags.join(", ")}`);
        lines.push("");
        for (const p of c.pages) {
            lines.push(`- [[${p.replace(".md", "")}]]`);
        }
        lines.push("");
    }
    if (orphans.length > 0) {
        lines.push("## 孤立页面");
        lines.push("");
        for (const o of orphans) {
            lines.push(`- [[${o.replace(".md", "")}]]`);
        }
        lines.push("");
    }
    lines.push(`---\n*生成于 ${todayStr()} · ${clusters.length} 个集群 · ${orphans.length} 个孤立页面*`);
    fs.writeFileSync(path.join(wikiPagesDir, "CLUSTERS.md"), lines.join("\n"), "utf-8");
    return textResult(JSON.stringify({
        status: "ok",
        clusters: clusters.map((c) => ({ name: c.name, pages: c.pages.length, shared_tags: c.shared_tags })),
        orphans,
        total_pages: mdFiles.length,
    }));
}

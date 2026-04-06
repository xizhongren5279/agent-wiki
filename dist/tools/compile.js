/**
 * wiki_compile — 根据 Agent 传入的内容生成 Wiki 页面
 *
 * 接收 Agent 用 LLM 生成的结构化内容（摘要、洞察、分类、标签）
 * 生成 Wiki 页面 MD 文件
 * 更新 wiki/INDEX.md（按分类分组）
 * 追加 wiki/LOG.md（append-only）
 * 更新 state.json
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir, getState, setState } from "../state.js";
import { safeFilename, todayStr, nowStr } from "../utils.js";
import { textResult } from "../types.js";
export async function handleCompile(params) {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const { file, title, summary, insights, category, tags, source_file } = params;
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    // 生成 Wiki 页面文件名
    const wikiFileName = safeFilename(title) + ".md";
    const wikiFilePath = path.join(wikiPagesDir, wikiFileName);
    // 转义 title 中的双引号，防止破坏 YAML frontmatter
    const safeTitle = title.replace(/"/g, '\\"');
    // 生成 Wiki 页面内容
    // 注意：sources 使用行内数组格式 [a, b]，而非 YAML 缩进列表（parseFrontmatter 不支持缩进列表）
    const wikiContent = `---
title: "${safeTitle}"
date: ${todayStr()}
tags: [${tags.join(", ")}]
category: ${category}
sources: ["[[raw/${source_file}]]"]
---

# ${title}

## 摘要
${summary}

## 核心洞察
${insights.map((i) => `- ${i}`).join("\n")}

## 标签
${tags.join(", ")}

---
*来源: raw/${source_file} · 编译时间: ${todayStr()} ${nowStr().split(" ")[1] || ""}*
`;
    // 写入 Wiki 页面
    fs.writeFileSync(wikiFilePath, wikiContent, "utf-8");
    // 更新 INDEX.md
    const indexPath = path.join(wikiPagesDir, "INDEX.md");
    updateIndex(indexPath, title, category, tags.slice(0, 3), wikiFileName);
    // 追加 LOG.md
    const logPath = path.join(wikiPagesDir, "LOG.md");
    appendLog(logPath, "compile", title, source_file, category, tags);
    // 更新状态
    const state = getState(wikiDir);
    if (!state.compiled.includes(file)) {
        state.compiled.push(file);
        setState(wikiDir, state);
    }
    return textResult(JSON.stringify({
        status: "ok",
        wiki_file: wikiFileName,
        title,
        index_updated: true,
        log_appended: true,
    }));
}
/**
 * 更新 INDEX.md：按分类分组，每个条目一行描述
 */
function updateIndex(indexPath, title, category, previewTags, wikiFileName) {
    let content = "";
    if (fs.existsSync(indexPath)) {
        content = fs.readFileSync(indexPath, "utf-8");
    }
    // 解析已有索引，按分类收集条目
    const sections = {};
    const lines = content.split("\n");
    let currentCategory = "";
    for (const line of lines) {
        if (line.startsWith("## ") && !line.includes("知识库索引")) {
            currentCategory = line.replace("## ", "").trim();
            if (!sections[currentCategory])
                sections[currentCategory] = [];
        }
        else if (line.startsWith("- [[") && currentCategory) {
            // 解析：- [[页面标题]] (标签1, 标签2)
            const linkMatch = line.match(/- \[\[(.+?)\]\]\s*\((.+?)\)/);
            if (linkMatch) {
                if (!sections[currentCategory])
                    sections[currentCategory] = [];
                sections[currentCategory].push({
                    title: linkMatch[1],
                    tags: linkMatch[2].split(",").map((t) => t.trim()),
                    file: "",
                });
            }
        }
    }
    // 添加新条目
    if (!sections[category])
        sections[category] = [];
    // 去重
    const existing = sections[category].find((e) => e.title === title);
    if (!existing) {
        sections[category].push({ title, tags: previewTags, file: wikiFileName });
    }
    // 重新生成 INDEX.md
    const totalEntries = Object.values(sections).reduce((s, e) => s + e.length, 0);
    const newLines = [
        "---",
        `title: 知识库索引`,
        `date: ${todayStr()}`,
        "---",
        "",
        "# 知识库索引",
        "",
    ];
    for (const [cat, entries] of Object.entries(sections)) {
        if (entries.length === 0)
            continue;
        newLines.push(`## ${cat}`);
        for (const entry of entries) {
            newLines.push(`- [[${entry.title}]] (${entry.tags.join(", ")})`);
        }
        newLines.push("");
    }
    newLines.push(`---\n*共 ${totalEntries} 篇 · 更新于 ${todayStr()}*`);
    fs.writeFileSync(indexPath, newLines.join("\n"), "utf-8");
}
/**
 * 追加操作日志到 LOG.md（append-only）
 */
function appendLog(logPath, action, title, sourceFile, category, tags) {
    const logEntry = `\n## [${nowStr()}] ${action} | ${title}\n来源: ${sourceFile} | 分类: ${category} | 标签: ${tags.join(", ")}\n`;
    if (fs.existsSync(logPath)) {
        fs.appendFileSync(logPath, logEntry, "utf-8");
    }
    else {
        fs.writeFileSync(logPath, `---\ntitle: Wiki 操作日志\ntags: [log, wiki]\n---\n\n# Wiki Log\n\n> Append-only 时间线，记录 wiki 的每次变更。\n${logEntry}`, "utf-8");
    }
}

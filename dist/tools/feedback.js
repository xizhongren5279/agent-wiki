/**
 * wiki_feedback — 保存问答分析到知识库（用户确认版）
 *
 * 核心理念（来自 Karpathy）：
 *   "good answers can be filed back into the wiki as new pages"
 *   用户的提问和 Agent 的回答，不应该消失在聊天记录里，应该沉淀回知识库
 *
 * 防止幻觉复利的关键设计：
 *   ❌ 不自动存：必须用户说"存"才调用
 *   ✅ 标记来源：type: query-derived，区分原始材料 vs 问答生成
 *   ✅ 搜索排序：compiled 类型排在 query-derived 前面
 */
import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getWikiPagesDir } from "../state.js";
import { safeFilename, todayStr, nowStr } from "../utils.js";
import { textResult } from "../types.js";
export async function handleFeedback(params) {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const { question, answer, sources, tags, category } = params;
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    // 从问题生成标题（截取前 30 字符）
    const title = `Q&A: ${question.substring(0, 30)}${question.length > 30 ? "..." : ""}`;
    const fileName = `${safeFilename(title)}.md`;
    const filePath = path.join(wikiPagesDir, fileName);
    // 构建 sources 的 wikilink 格式
    const sourceLinks = sources.map((s) => `- "[[${s}]]"`).join("\n");
    // 生成 Wiki 页面内容
    const content = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${todayStr()}
tags: [${tags.join(", ")}]
category: ${category}
type: query-derived
sources:
  ${sourceLinks}
---

# ${title}

## 问题
${question}

## 回答
${answer}

## 参考来源
${sources.map((s) => `- [[${s.replace(".md", "")}]]`).join("\n")}

---
*来源: 用户问答反馈 · 生成时间: ${nowStr()}*
`;
    // 写入 Wiki 页面
    fs.writeFileSync(filePath, content, "utf-8");
    // 更新 INDEX.md
    const indexPath = path.join(wikiPagesDir, "INDEX.md");
    if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, "utf-8");
        // 解析已有分类
        const sections = {};
        const lines = indexContent.split("\n");
        let currentCategory = "";
        for (const line of lines) {
            if (line.startsWith("## ") && !line.includes("知识库索引")) {
                currentCategory = line.replace("## ", "").trim();
                if (!sections[currentCategory])
                    sections[currentCategory] = [];
            }
            else if (line.startsWith("- [[") && currentCategory) {
                const linkMatch = line.match(/- \[\[(.+?)\]\]\s*\((.+?)\)/);
                if (linkMatch && !sections[currentCategory]) {
                    sections[currentCategory] = [];
                }
            }
        }
        if (!sections[category])
            sections[category] = [];
        sections[category].push({ title, tags: tags.slice(0, 3) });
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
    // 追加 LOG.md
    const logPath = path.join(wikiPagesDir, "LOG.md");
    const logEntry = `\n## [${nowStr()}] feedback | ${title}\n来源: 用户问答 | 分类: ${category} | 标签: ${tags.join(", ")} | 参考: ${sources.join(", ")}\n`;
    if (fs.existsSync(logPath)) {
        fs.appendFileSync(logPath, logEntry, "utf-8");
    }
    return textResult(JSON.stringify({
        status: "ok",
        file: fileName,
        title,
        type: "query-derived",
        note: "已保存为 Wiki 页面。搜索时 compiled 类型结果会排在 query-derived 前面。",
    }));
}

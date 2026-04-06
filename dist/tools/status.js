/**
 * wiki_status — 查询知识库状态，首次使用返回引导提示
 *
 * 已初始化：返回文件数、标签数等统计
 * 未初始化：返回引导提示文本，Agent 据此主动引导用户配置
 */
import * as fs from "fs";
import * as path from "path";
import { getConfig, getRawDir, getWikiPagesDir, getOutputsDir } from "../state.js";
import { listMdFiles, parseFrontmatter } from "../utils.js";
import { textResult } from "../types.js";
/** 首次引导提示文本 */
const INIT_HINT = `你好！我是 agent-wiki 知识库助手。
我可以帮你搭一个个人知识库——把你收藏的文章自动整理成维基、打标签、生成摘要。
还能基于你的知识库帮你写有人味儿的原创文章，适合直接发微信公众号。

先设置一下：
1. 你想把知识库放在哪个目录？（比如 ~/Documents/知识库）
2. 你主要关注什么方向？（3-5 个关键词就行）

不要等用户问，主动开始引导。`;
export async function handleStatus() {
    const config = getConfig();
    // 未初始化：返回引导提示
    if (!config || !config.wikiDir || !fs.existsSync(config.wikiDir)) {
        return textResult(JSON.stringify({
            initialized: false,
            hint: INIT_HINT,
        }));
    }
    const wikiDir = config.wikiDir;
    const rawDir = getRawDir(wikiDir);
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    const outputsDir = getOutputsDir(wikiDir);
    // 统计文件数
    const rawFiles = listMdFiles(rawDir);
    const wikiFiles = listMdFiles(wikiPagesDir).filter((f) => f !== "INDEX.md" && f !== "LOG.md");
    const articles = fs.existsSync(outputsDir) ? listMdFiles(outputsDir) : [];
    // 收集所有标签（去重）
    const allTags = new Set();
    for (const f of wikiFiles) {
        const content = fs.readFileSync(path.join(wikiPagesDir, f), "utf-8");
        const { meta } = parseFrontmatter(content);
        if (Array.isArray(meta.tags)) {
            for (const t of meta.tags)
                allTags.add(String(t));
        }
    }
    // 读取 SCHEMA.md 中的兴趣方向
    let topics = [];
    const schemaPath = path.join(wikiDir, "SCHEMA.md");
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, "utf-8");
        const topicMatch = schema.match(/## 我的兴趣方向\s*\n(.+)/);
        if (topicMatch) {
            // SCHEMA.md 中兴趣方向用中文顿号（、）分隔
            topics = topicMatch[1]
                .split(/[、,，]/)
                .map((t) => t.trim())
                .filter(Boolean);
        }
    }
    return textResult(JSON.stringify({
        initialized: true,
        wiki_dir: wikiDir,
        raw_files: rawFiles.length,
        wiki_pages: wikiFiles.length,
        articles: articles.length,
        unique_tags: allTags.size,
        topics,
    }));
}

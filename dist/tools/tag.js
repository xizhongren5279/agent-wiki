/**
 * wiki_tag — 把 Agent 传入的标签写入文件的 frontmatter
 *
 * 读取 raw/ 中的指定文件，解析 frontmatter
 * 更新 tags 字段，写回文件
 */
import * as path from "path";
import { getWikiDir, getRawDir, getState, setState } from "../state.js";
import { parseFrontmatter, writeFrontmatter, readFile_safe } from "../utils.js";
import * as fs from "fs";
import { textResult } from "../types.js";
export async function handleTag(params) {
    const wikiDir = getWikiDir();
    if (!wikiDir) {
        return textResult(JSON.stringify({ error: "知识库未初始化" }));
    }
    const rawDir = getRawDir(wikiDir);
    const filePath = path.join(rawDir, params.file);
    // 检查文件存在
    const content = readFile_safe(filePath);
    if (!content) {
        return textResult(JSON.stringify({ error: `文件不存在: ${params.file}` }));
    }
    // 解析 frontmatter
    const { meta, body } = parseFrontmatter(content);
    // 更新标签
    meta.tags = params.tags;
    // 写回文件
    const newContent = writeFrontmatter(meta, body);
    fs.writeFileSync(filePath, newContent, "utf-8");
    // 更新状态
    const state = getState(wikiDir);
    if (!state.tagged.includes(params.file)) {
        state.tagged.push(params.file);
        setState(wikiDir, state);
    }
    return textResult(JSON.stringify({
        status: "ok",
        file: params.file,
        tags: params.tags,
    }));
}

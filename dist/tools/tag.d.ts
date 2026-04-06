/**
 * wiki_tag — 把 Agent 传入的标签写入文件的 frontmatter
 *
 * 读取 raw/ 中的指定文件，解析 frontmatter
 * 更新 tags 字段，写回文件
 */
import { ToolResult } from "../types.js";
export declare function handleTag(params: {
    file: string;
    tags: string[];
}): Promise<ToolResult>;

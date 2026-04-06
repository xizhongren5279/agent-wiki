/**
 * wiki_search — 标签匹配 + 全文关键词搜索
 *
 * 遍历 wiki/*.md，解析 frontmatter tags
 * 标签匹配权重 0.6 + 全文匹配权重 0.4
 * 支持匹配模式 any（任一）/ all（全部）
 */
import { ToolResult } from "../types.js";
export declare function handleSearch(params: {
    tags?: string[];
    query?: string;
    match?: "any" | "all";
    top_k?: number;
}): Promise<ToolResult>;

/**
 * wiki_article — 保存 Agent 写好的原创文章到 outputs/
 *
 * 文件名格式：YYYYMMDD-主题.md
 * 自动添加 frontmatter（title, date, tags）
 * 追加 LOG.md 记录
 */
import { ToolResult } from "../types.js";
export declare function handleArticle(params: {
    topic: string;
    content: string;
    refs?: string[];
}): Promise<ToolResult>;

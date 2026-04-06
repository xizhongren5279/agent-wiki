/**
 * wiki_lint — 自检知识库健康状态
 *
 * 检测：
 * 1. 死链接（[[xxx]] 引用不存在的页面）
 * 2. 缺失反向链接（被引用但未引用回的页面）
 * 3. 缺摘要（## 摘要 后无内容）
 * 4. 内容过短（文件 < 100 字符）
 * 5. 缺 frontmatter tags
 * 6. frontmatter 中 sources 引用的源文件不存在
 *
 * 如果 check_only=false，自动修复能修的问题：
 * - 缺标签 → 从 category 和标题关键词推断
 * - 死链接 → 从正文中删除无效的 [[xxx]] 引用
 */
import { ToolResult } from "../types.js";
export declare function handleLint(params: {
    check_only?: boolean;
}): Promise<ToolResult>;

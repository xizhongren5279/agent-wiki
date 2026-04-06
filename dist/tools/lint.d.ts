/**
 * wiki_lint — 自检知识库健康状态
 *
 * 检测：
 * 1. 死链接（[[xxx]] 引用不存在的页面）
 * 2. 缺失反向链接（被引用但未引用回的页面）
 * 3. 缺摘要（## 摘要 后无内容）
 * 4. 内容过短（文件 < 100 字符）
 * 5. 缺 frontmatter tags
 *
 * 如果 check_only=false，自动修复能修的问题
 */
import { ToolResult } from "../types.js";
export declare function handleLint(params: {
    check_only?: boolean;
}): Promise<ToolResult>;

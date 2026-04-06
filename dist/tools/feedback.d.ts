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
import { ToolResult } from "../types.js";
export declare function handleFeedback(params: {
    question: string;
    answer: string;
    sources: string[];
    tags: string[];
    category: string;
}): Promise<ToolResult>;

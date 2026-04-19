/**
 * wiki_dedup — 检测知识库中的重复内容
 *
 * 三维检测：
 * 1. 标题相似（完全相同或仅大小写/空格不同）
 * 2. 标签高度重叠（80%+ Jaccard 相似度）
 * 3. 内容哈希相同（body 部分 SHA256 一致）
 *
 * 只报告不自动处理，由用户决定保留哪个
 */
import { ToolResult } from "../types.js";
export declare function handleDedup(): Promise<ToolResult>;

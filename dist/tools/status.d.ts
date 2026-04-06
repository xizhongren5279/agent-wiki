/**
 * wiki_status — 查询知识库状态，首次使用返回引导提示
 *
 * 已初始化：返回文件数、标签数等统计
 * 未初始化：返回引导提示文本，Agent 据此主动引导用户配置
 */
import { ToolResult } from "../types.js";
export declare function handleStatus(): Promise<ToolResult>;

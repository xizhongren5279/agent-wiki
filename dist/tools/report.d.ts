/**
 * wiki_report — 生成知识库全景报告
 *
 * 统计：高连接度页面、孤立页面、标签分布、来源分布、最近更新、健康指标
 * 输出 wiki/REPORT.md
 */
import { ToolResult } from "../types.js";
export declare function handleReport(): Promise<ToolResult>;

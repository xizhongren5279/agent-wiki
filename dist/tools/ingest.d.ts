/**
 * wiki_ingest — 从指定路径摄入文件到 raw/（增量，支持多格式）
 *
 * 零依赖转换：.md（直接复制）、.txt（改后缀）、.html（去标签）、.csv（转表格）
 * 原样存储：.pdf、.docx、.xlsx、.xls、图片 → Agent 多模态读取
 * 已摄入的文件跳过（除非 force=true）
 * 返回每个文件的名称、类型和前 500 字预览（供 Agent 用 LLM 处理）
 */
import { ToolResult } from "../types.js";
export declare function handleIngest(params: {
    source: string;
    force?: boolean;
}): Promise<ToolResult>;

/**
 * wiki_init — 首次初始化知识库
 *
 * 创建目录结构（raw/、wiki/、outputs/）
 * 生成 SCHEMA.md（知识库说明书 + Agent 操作指南 + 写作规则）
 * 生成 wiki/INDEX.md（空索引）
 * 生成 wiki/LOG.md（空日志）
 * 保存全局配置到 ~/.agent-wiki/config.json
 * 初始化 state.json
 */
import { ToolResult } from "../types.js";
export declare function handleInit(params: {
    dir: string;
    topics: string[];
    interests: string[];
}): Promise<ToolResult>;

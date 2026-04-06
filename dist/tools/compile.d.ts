/**
 * wiki_compile — 根据 Agent 传入的内容生成 Wiki 页面
 *
 * 接收 Agent 用 LLM 生成的结构化内容（摘要、洞察、分类、标签）
 * 生成 Wiki 页面 MD 文件
 * 更新 wiki/INDEX.md（按分类分组）
 * 追加 wiki/LOG.md（append-only）
 * 更新 state.json
 */
import { ToolResult } from "../types.js";
export declare function handleCompile(params: {
    file: string;
    title: string;
    summary: string;
    insights: string[];
    category: string;
    tags: string[];
    source_file: string;
}): Promise<ToolResult>;

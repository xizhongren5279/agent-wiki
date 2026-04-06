#!/usr/bin/env node
/**
 * Agent-Wiki MCP Server
 *
 * 卡帕西智能知识库 MCP 插件
 * 一行安装，纯对话交互，Agent 自动帮你管理知识库、写有人味儿的原创文章
 *
 * 零 LLM、零 HTTP、零外部依赖
 * 所有智能工作由宿主 Agent 的 LLM 完成
 * 本插件只负责文件操作（搬文件、读写元数据、搜索、生成模板）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleStatus } from "./tools/status.js";
import { handleInit } from "./tools/init.js";
import { handleIngest } from "./tools/ingest.js";
import { handleTag } from "./tools/tag.js";
import { handleCompile } from "./tools/compile.js";
import { handleSearch } from "./tools/search.js";
import { handleArticle } from "./tools/article.js";
import { handleLint } from "./tools/lint.js";
import { handleFeedback } from "./tools/feedback.js";
const server = new McpServer({
    name: "agent-wiki",
    version: "0.1.0",
});
// ─── 注册 8 个 MCP 工具 ───
/**
 * wiki_status — 查询知识库状态
 * 首次调用返回 initialized: false + 引导提示
 * Agent 应根据 hint 主动引导用户完成初始化
 */
server.tool("wiki_status", "查询知识库状态。首次调用如果返回 initialized: false，你应该主动引导用户：1. 问知识库目录 2. 问兴趣方向 3. 调用 wiki_init。不要等用户说'帮我建知识库'，你主动开始。", {}, async () => handleStatus());
/**
 * wiki_init — 初始化知识库
 * 创建目录结构（raw/、wiki/、outputs/）
 * 生成 SCHEMA.md（知识库说明书 + Agent 操作指南 + 写作规则）
 */
server.tool("wiki_init", "初始化知识库。创建目录结构和 SCHEMA.md。需要用户提供：目录路径、关注主题、兴趣方向。", {
    dir: z.string().describe("知识库根目录路径，如 ~/Documents/知识库"),
    topics: z.array(z.string()).describe("关注主题列表，如 ['AI', '产品管理']"),
    interests: z.array(z.string()).describe("兴趣方向列表，如 ['LLM', '创业', 'RAG']"),
}, async (params) => handleInit(params));
/**
 * wiki_ingest — 摄入文件到知识库（支持多格式）
 * md/txt/html/csv 零依赖转换为 md
 * pdf/docx/xlsx/图片原样存储，Agent 多模态读取
 */
server.tool("wiki_ingest", "摄入文件到知识库。支持 md/txt/html/csv（自动转 markdown）、pdf/docx/xlsx/图片（原样存储）。从指定路径复制到 raw/ 目录（增量，已摄入的跳过）。返回新文件内容预览，供你用 LLM 提取标签和摘要。", {
    source: z.string().describe("源文件路径或目录路径"),
    force: z.boolean().optional().describe("强制重新摄入已存在的文件，默认 false"),
}, async (params) => handleIngest(params));
/**
 * wiki_tag — 写入标签到文件 frontmatter
 * Agent 用 LLM 提取标签后，调用此工具写入
 */
server.tool("wiki_tag", "将标签写入文件的 frontmatter。你应该先用 LLM 为文件提取 5-10 个标签，然后调用此工具写入。", {
    file: z.string().describe("raw/ 下的文件名"),
    tags: z.array(z.string()).describe("标签列表，如 ['AI', 'RAG', '知识管理']"),
}, async (params) => handleTag(params));
/**
 * wiki_compile — 生成 Wiki 页面
 * 接收 Agent 用 LLM 生成的结构化内容，生成 Wiki 页面
 * 自动更新 INDEX.md 和 LOG.md
 */
server.tool("wiki_compile", "根据你用 LLM 生成的摘要、洞察、分类生成 Wiki 页面。同时更新 INDEX.md 和 LOG.md。你应该先读 SCHEMA.md 了解 Wiki 页面格式，用 LLM 生成内容后再调用。", {
    file: z.string().describe("raw/ 下的源文件名"),
    title: z.string().describe("Wiki 页面标题"),
    summary: z.string().describe("2-3 句话的核心内容摘要"),
    insights: z.array(z.string()).describe("3-5 个核心洞察"),
    category: z.string().describe("分类名，如 'AI工程化'、'知识管理'"),
    tags: z.array(z.string()).describe("5-10 个标签"),
    source_file: z.string().describe("raw/ 下的源文件名（同 file 参数）"),
}, async (params) => handleCompile(params));
/**
 * wiki_search — 搜索知识库
 * 支持标签匹配 + 全文关键词搜索
 */
server.tool("wiki_search", "搜索知识库。支持按标签和关键词搜索，返回匹配的 Wiki 页面列表。标签匹配权重 0.6 + 全文匹配权重 0.4。", {
    tags: z.array(z.string()).optional().describe("按标签搜索"),
    query: z.string().optional().describe("全文关键词搜索"),
    match: z.enum(["any", "all"]).optional().describe("标签匹配模式：any=任一匹配，all=全部匹配。默认 any"),
    top_k: z.number().optional().describe("返回结果数量，默认 10"),
}, async (params) => handleSearch(params));
/**
 * wiki_article — 保存原创文章
 * Agent 写好文章后调用此工具保存到 outputs/
 * 写作前必须读 SCHEMA.md 的"写原创文章规则"
 */
server.tool("wiki_article", "保存原创文章到 outputs/ 目录。保存前，你必须先读 SCHEMA.md 的'写原创文章规则'，确保文章是有人味儿的微信公众号风格，没有 AI 味。", {
    topic: z.string().describe("文章主题"),
    content: z.string().describe("文章正文（Markdown 格式）"),
    refs: z.array(z.string()).optional().describe("参考资料文件名列表"),
}, async (params) => handleArticle(params));
/**
 * wiki_lint — 自检知识库健康状态
 * 检测死链接、缺摘要、内容过短等问题
 */
server.tool("wiki_lint", "自检知识库健康状态。检测死链接、缺失摘要、内容过短、缺少标签等问题，返回问题列表。", {
    check_only: z.boolean().optional().describe("仅检测不修复，默认 true"),
}, async (params) => handleLint(params));
/**
 * wiki_feedback — 保存问答分析到知识库（用户确认版）
 * 用户问问题 → Agent 回答 → 如果回答有综合分析价值 → 用户说"存" → 调用此工具
 * 标记 type: query-derived，区分原始材料编译 vs 问答生成
 * 防止幻觉复利：不自动存，必须用户确认
 */
server.tool("wiki_feedback", "保存问答分析到知识库。仅当用户明确说'存'或'保存'时才调用。将问答中的综合分析、对比、洞察保存为新的 Wiki 页面，标记为 query-derived 类型（区分原始材料编译 vs 问答生成）。", {
    question: z.string().describe("用户的原始问题"),
    answer: z.string().describe("Agent 的回答内容（有价值综合分析部分）"),
    sources: z.array(z.string()).describe("参考了哪些 Wiki 页面（文件名列表）"),
    tags: z.array(z.string()).describe("标签列表，如 ['RAG', '对比分析']"),
    category: z.string().describe("分类名，如 'AI工程化'"),
}, async (params) => handleFeedback(params));
// ─── 启动 MCP Server ───
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("Agent-Wiki MCP Server 启动失败:", err);
    process.exit(1);
});

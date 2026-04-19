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
import * as path from "path";
import * as fs from "fs";
import { setConfig, getRawDir, getWikiPagesDir, getOutputsDir } from "../state.js";
import { ensureDir, todayStr, writeJSON } from "../utils.js";
import { textResult } from "../types.js";
/** SCHEMA.md 模板 */
function generateSchemaMd(topics, interests) {
    return `# 知识库 Schema

## 这是什么
一个关于 ${topics.join("、")} 的个人知识库，基于 Karpathy LLM Wiki 方案。

## 目录规则
- raw/ — 未处理的源材料，永远不要修改这些文件
- wiki/ — AI 维护的维基，用户只读
- outputs/ — 生成的原创文章，适合直接发微信公众号

## 维基规则
- 每个主题在 wiki/ 中有自己的 .md 文件
- 每个维基文件以一段摘要开头
- 使用 [[topic-name]] 格式链接相关主题
- 维护 wiki/INDEX.md，列出每个主题及一行描述
- 每次操作追加到 wiki/LOG.md
- 当添加新的源材料时，更新相关的维基文章

## 摘要标准

摘要不是"文章讲了什么"的复述，而是帮读者 10 秒内判断"值不值得深读"的判断依据。

### 字数要求
- **下限 150 字**，上限 300 字（汉字计）
- 少于 150 字 = 不合格，必须重写

### 结构要求（三段式）
1. **是什么**（1 句）：核心主题一句话说清
2. **为什么重要**（1-2 句）：跟行业/技术/读者的关系，有什么影响或冲击
3. **关键发现/观点**（2-3 句）：最值得记住的具体事实、数据或判断，不要空话

### 质量红线（出现即不合格）
- 以"文章介绍了...""本文探讨了...""这篇文章..."开头（摘要不是读后感）
- 只复述标题信息，没有信息增量
- 出现"值得注意的是""深入探讨""全面解析"等 AI 味词汇
- 没有任何具体事实/数据/人名/产品名
- 通篇抽象描述，读完还是不知道这篇文章到底说了啥

## Agent 操作指南
当用户说以下内容时，你应该：
- "把这篇文章加入知识库" / "加个文章" → wiki_ingest → 用 LLM 提取标签 → wiki_tag → 用 LLM 生成摘要/洞察/分类 → wiki_compile
- "整理知识库" / "全部处理一下" → wiki_ingest（全部新文件）→ 逐篇 LLM 打标签 → wiki_tag → 逐篇 LLM 生成摘要 → wiki_compile
- "搜一下 XX" / "有没有关于 XX 的" → wiki_search
- "写一篇关于 XX 的文章" → wiki_search 找参考资料 → 按"写原创文章规则"用 LLM 写文 → wiki_article 保存
- "检查知识库" / "知识库健康吗" → wiki_lint
- "知识库状态" → wiki_status

## 写原创文章规则

文章风格：微信公众号适合的、有人味的中文写作。

### 人味标准
- 像跟朋友聊天，不像写论文
- 有自己的观点和态度，不当理中客
- 短句为主，该断就断
- 敢用"我"，敢说"我觉得"
- 该短就短，不是每篇都要 3000 字

### 微信公众号适配
- 标题直接说事，不超过 20 字
- 开头 3 句话内抓住读者
- 每 3-4 段一个小标题
- 关键句加粗，方便快速扫读
- 结尾不要升华，可以留个问题或一个观点
- 正文纯 Markdown，用户复制到公众号编辑器即可

### 禁止的 AI 味
- "值得注意的是""总而言之""让我们..."
- 破折号滥用
- "深入探讨""全面解析""深度剖析"
- "在当今...的时代""随着...的发展"开头
- "首先...其次...最后..."排比结构
- 夸张比喻（"像灯塔一样""如同一把钥匙"）
- 结尾升华（"让我们携手共创美好未来"）
- "一方面...另一方面..."两头讨好

## 我的兴趣方向
${interests}
`;
}
export async function handleInit(params) {
    const { dir, topics, interests } = params;
    // 展开用户目录（~ → 绝对路径）
    const wikiDir = dir.replace(/^~/, process.env.HOME || "~");
    const interestsStr = interests.length > 0 ? interests.join("、") : topics.join("、");
    // 创建目录结构
    const rawDir = getRawDir(wikiDir);
    const wikiPagesDir = getWikiPagesDir(wikiDir);
    const outputsDir = getOutputsDir(wikiDir);
    ensureDir(rawDir);
    ensureDir(wikiPagesDir);
    ensureDir(outputsDir);
    // 生成 SCHEMA.md
    const schemaPath = path.join(wikiDir, "SCHEMA.md");
    if (!fs.existsSync(schemaPath)) {
        fs.writeFileSync(schemaPath, generateSchemaMd(topics, interestsStr), "utf-8");
    }
    // 生成 wiki/INDEX.md（空索引）
    const indexPath = path.join(wikiPagesDir, "INDEX.md");
    if (!fs.existsSync(indexPath)) {
        fs.writeFileSync(indexPath, `---\ntitle: 知识库索引\ndate: ${todayStr()}\n---\n\n# 知识库索引\n\n---\n*共 0 篇 · 更新于 ${todayStr()}*\n`, "utf-8");
    }
    // 生成 wiki/LOG.md（空日志）
    const logPath = path.join(wikiPagesDir, "LOG.md");
    if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, `---\ntitle: Wiki 操作日志\ntags: [log, wiki]\n---\n\n# Wiki Log\n\n> Append-only 时间线，记录 wiki 的每次变更。\n`, "utf-8");
    }
    // 初始化 state.json
    const statePath = path.join(wikiDir, "state.json");
    if (!fs.existsSync(statePath)) {
        writeJSON(statePath, { ingested: [], tagged: [], compiled: [] });
    }
    // 保存全局配置
    setConfig({ wikiDir });
    return textResult(JSON.stringify({
        status: "ok",
        dir: wikiDir,
        created: [
            "raw/",
            "wiki/",
            "outputs/",
            "SCHEMA.md",
            "wiki/INDEX.md",
            "wiki/LOG.md",
            "state.json",
        ],
        topics,
        interests: interestsStr,
    }));
}

/**
 * wiki_article — 保存 Agent 写好的原创文章到 outputs/
 *
 * 文件名格式：YYYYMMDD-主题.md
 * 自动添加 frontmatter（title, date, tags）
 * 追加 LOG.md 记录
 */

import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getOutputsDir, getWikiPagesDir } from "../state.js";
import { safeFilename, todayStr, dateCompact, nowStr, ensureDir } from "../utils.js";
import { textResult, ToolResult } from "../types.js";

export async function handleArticle(params: {
  topic: string;
  content: string;
  refs?: string[];
}): Promise<ToolResult> {
  const wikiDir = getWikiDir();
  if (!wikiDir) {
    return textResult(JSON.stringify({ error: "知识库未初始化" }));
  }

  const { topic, content, refs = [] } = params;
  const outputsDir = getOutputsDir(wikiDir);
  ensureDir(outputsDir);

  // 生成文件名：YYYYMMDD-主题.md
  const fileName = `${dateCompact()}-${safeFilename(topic)}.md`;
  const filePath = path.join(outputsDir, fileName);

  // 添加 frontmatter
  const refsStr = refs.length > 0 ? `\nrefs:\n${refs.map((r) => `  - "[[${r}]]"`).join("\n")}` : "";
  const fullContent = `---
title: "${topic}"
date: ${todayStr()}
type: article${refsStr}
---

${content}
`;

  fs.writeFileSync(filePath, fullContent, "utf-8");

  // 追加 LOG.md
  const logPath = path.join(getWikiPagesDir(wikiDir), "LOG.md");
  const logEntry = `\n## [${nowStr()}] article | ${topic}\n输出文件: outputs/${fileName}${refs.length > 0 ? ` | 参考资料: ${refs.join(", ")}` : ""}\n`;

  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, logEntry, "utf-8");
  }

  return textResult(JSON.stringify({
    status: "ok",
    file: `outputs/${fileName}`,
    topic,
  }));
}

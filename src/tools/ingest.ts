/**
 * wiki_ingest — 从指定路径摄入文件到 raw/（增量，支持多格式）
 *
 * 零依赖转换：.md（直接复制）、.txt（改后缀）、.html（去标签）、.csv（转表格）
 * 原样存储：.pdf、.docx、.xlsx、.xls、图片 → Agent 多模态读取
 * 已摄入的文件跳过（除非 force=true）
 * 返回每个文件的名称、类型和前 500 字预览（供 Agent 用 LLM 处理）
 */

import * as path from "path";
import * as fs from "fs";
import { getWikiDir, getRawDir, getState, setState } from "../state.js";
import { readFile_safe, ensureDir } from "../utils.js";
import { textResult, ToolResult } from "../types.js";

// ─── 支持的文件类型 ───

/** 零依赖可转为 .md 的格式 */
const CONVERTIBLE_EXTENSIONS = new Set([".md", ".txt", ".html", ".csv"]);

/** 原样存储的二进制格式（Agent 多模态读取） */
const BINARY_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".xls"]);

/** 图片格式 */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

/** 所有支持的格式 */
const SUPPORTED_EXTENSIONS = new Set([
  ...CONVERTIBLE_EXTENSIONS,
  ...BINARY_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
]);

// ─── 格式转换函数 ───

/**
 * .txt → .md（直接改后缀，内容不变）
 */
function convertTxt(content: string): string {
  return content;
}

/**
 * .html → .md（去除 HTML 标签，保留纯文本）
 * 零依赖，用正则处理。不追求完美还原，只提取可读文本
 */
function convertHtml(html: string): string {
  let text = html;

  // 去除 script、style 标签及其内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 处理常见块级标签，转为换行
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, "\n");

  // 处理标题标签，转为 markdown 标题
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n");
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n");

  // 处理列表项
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");

  // 处理加粗和斜体
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, "**$2**");
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, "*$2*");

  // 处理链接
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // 去除所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, "");

  // 解码常见 HTML 实体
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // 清理多余空行（超过 2 个连续换行压缩为 2 个）
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * .csv → markdown 表格
 * 零依赖，手动解析。处理简单 CSV（带引号的字段、逗号在引号内）
 */
function convertCsv(csv: string): string {
  // 简单 CSV 解析（处理引号内的逗号）
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // 转义引号 ""
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return "";

  // 第一行是表头
  const headers = parseLine(lines[0]);
  const colCount = headers.length;

  // 构建 markdown 表格
  const mdLines: string[] = [];

  // 表头行
  mdLines.push("| " + headers.join(" | ") + " |");

  // 分隔行
  mdLines.push("| " + headers.map(() => "---").join(" | ") + " |");

  // 数据行
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    // 补齐或截断到与表头同列数
    while (fields.length < colCount) fields.push("");
    mdLines.push("| " + fields.slice(0, colCount).join(" | ") + " |");
  }

  return mdLines.join("\n");
}

/**
 * 根据文件扩展名，将文件内容转为 .md 格式
 * 返回 null 表示无法转换（二进制文件）
 */
function convertToMarkdown(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const content = readFile_safe(filePath);
  if (content === null) return null;

  switch (ext) {
    case ".md":
      return content;
    case ".txt":
      return convertTxt(content);
    case ".html":
      return convertHtml(content);
    case ".csv":
      return convertCsv(content);
    default:
      return null;
  }
}

// ─── 文件类型判断 ───

function getFileType(filePath: string): "convertible" | "binary" | "image" | "unsupported" {
  const ext = path.extname(filePath).toLowerCase();
  if (CONVERTIBLE_EXTENSIONS.has(ext)) return "convertible";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "unsupported";
}

// ─── 主处理函数 ───

export async function handleIngest(params: {
  source: string;
  force?: boolean;
}): Promise<ToolResult> {
  const wikiDir = getWikiDir();
  if (!wikiDir) {
    return textResult(JSON.stringify({ error: "知识库未初始化，请先调用 wiki_init" }));
  }

  const rawDir = getRawDir(wikiDir);
  const assetsDir = path.join(rawDir, "assets");
  ensureDir(rawDir);
  ensureDir(assetsDir);

  const state = getState(wikiDir);
  const source = params.source.replace(/^~/, process.env.HOME || "~");
  const force = params.force ?? false;

  // 收集要摄入的文件列表
  let filesToIngest: string[] = [];
  if (fs.statSync(source).isDirectory()) {
    // 目录：扫描所有支持的文件类型
    filesToIngest = fs
      .readdirSync(source)
      .filter((f) => SUPPORTED_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(source, f));
  } else {
    // 单文件：检查是否支持
    const ext = path.extname(source).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      filesToIngest = [source];
    } else {
      return textResult(JSON.stringify({
        error: `不支持的文件格式: ${ext}。支持的格式: md, txt, html, csv, pdf, docx, xlsx, xls, png, jpg, jpeg, gif, webp`,
      }));
    }
  }

  // 增量过滤 + 处理
  const results: Array<{
    name: string;
    type: string;
    content_preview?: string;
    note?: string;
    skipped?: boolean;
  }> = [];
  let ingested = 0;

  for (const filePath of filesToIngest) {
    const fileName = path.basename(filePath);
    const fileType = getFileType(filePath);

    // 生成 raw/ 中的目标文件名
    let destFileName = fileName;
    if (fileType === "convertible" && !fileName.endsWith(".md")) {
      // 可转换格式：目标文件名改为 .md
      destFileName = path.basename(fileName, path.extname(fileName)) + ".md";
    }

    // 已摄入则跳过（除非 force）
    if (!force && state.ingested.includes(destFileName)) {
      results.push({ name: fileName, type: fileType, content_preview: "(已摄入，跳过)", skipped: true });
      continue;
    }

    if (fileType === "convertible") {
      // ── 零依赖转换 ──
      const mdContent = convertToMarkdown(filePath);
      if (!mdContent) {
        results.push({ name: fileName, type: fileType, content_preview: "(无法读取文件)", skipped: true });
        continue;
      }

      const destPath = path.join(rawDir, destFileName);
      fs.writeFileSync(destPath, mdContent, "utf-8");

      if (!state.ingested.includes(destFileName)) {
        state.ingested.push(destFileName);
      }

      results.push({
        name: fileName,
        type: "converted",
        content_preview: mdContent.substring(0, 500),
        note: `已转为 ${destFileName}`,
      });
    } else if (fileType === "binary") {
      // ── 原样存储（PDF/DOCX/XLSX） ──
      const destPath = path.join(rawDir, fileName);
      fs.copyFileSync(filePath, destPath);

      if (!state.ingested.includes(fileName)) {
        state.ingested.push(fileName);
      }

      results.push({
        name: fileName,
        type: "binary",
        note: "原文件已存储，请直接读取 raw/ 下的文件",
      });
    } else if (fileType === "image") {
      // ── 图片存储到 raw/assets/ ──
      const destPath = path.join(assetsDir, fileName);
      fs.copyFileSync(filePath, destPath);

      if (!state.ingested.includes(fileName)) {
        state.ingested.push(fileName);
      }

      results.push({
        name: fileName,
        type: "image",
        note: "已存储到 raw/assets/，可直接查看",
      });
    }

    ingested++;
  }

  // 保存状态
  setState(wikiDir, state);

  return textResult(JSON.stringify({
    status: "ok",
    ingested,
    total: filesToIngest.length,
    files: results,
  }));
}

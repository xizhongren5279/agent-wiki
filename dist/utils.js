/**
 * 工具函数：frontmatter 解析、安全文件名、日期格式化等
 */
import * as path from "path";
import * as fs from "fs";
// ─── Frontmatter 解析 ───
/**
 * 解析 Markdown 文件的 YAML frontmatter
 * 返回 meta 对象和 body 正文内容
 * 不依赖外部 YAML 库，手动解析简单的 key: value 格式
 */
export function parseFrontmatter(content) {
    // 匹配开头的 --- ... --- 块
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        return { meta: {}, body: content };
    }
    const yamlStr = match[1];
    const body = match[2];
    const meta = {};
    // 逐行解析简单的 YAML（key: value 和 key: [a, b, c] 格式）
    for (const line of yamlStr.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        // 数组格式：tags: [a, b, c]
        const arrMatch = trimmed.match(/^(\w+):\s*\[(.*)\]$/);
        if (arrMatch) {
            const key = arrMatch[1];
            const values = arrMatch[2]
                .split(",")
                .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
                .filter((v) => v);
            meta[key] = values;
            continue;
        }
        // 嵌套数组项（- value 格式），暂不处理
        if (trimmed.startsWith("- "))
            continue;
        // 普通键值对：key: value
        const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
        if (kvMatch) {
            const key = kvMatch[1];
            let value = kvMatch[2].trim().replace(/^['"]|['"]$/g, "");
            // 尝试解析为数字或布尔
            if (value === "true")
                value = true;
            else if (value === "false")
                value = false;
            else if (/^\d+$/.test(value))
                value = Number(value);
            meta[key] = value;
        }
    }
    return { meta, body };
}
/**
 * 将 meta 对象和 body 正文合成带 frontmatter 的 Markdown 字符串
 */
export function writeFrontmatter(meta, body) {
    const lines = ["---"];
    for (const [key, value] of Object.entries(meta)) {
        if (Array.isArray(value)) {
            lines.push(`${key}: [${value.join(", ")}]`);
        }
        else {
            lines.push(`${key}: ${value}`);
        }
    }
    lines.push("---");
    lines.push("");
    lines.push(body.trim());
    return lines.join("\n");
}
// ─── 安全文件名 ───
/**
 * 将标题转为安全的文件名（保留中文、字母、数字、短横线）
 */
export function safeFilename(title) {
    return title
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\-_ ]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 80);
}
// ─── 日期格式化 ───
/**
 * 返回 YYYY-MM-DD 格式的日期字符串
 */
export function todayStr() {
    return new Date().toISOString().split("T")[0];
}
/**
 * 返回 YYYYMMDD 格式的日期字符串（用于文件名）
 */
export function dateCompact() {
    return new Date().toISOString().split("T")[0].replace(/-/g, "");
}
/**
 * 返回 ISO 格式的日期时间字符串（用于日志）
 */
export function nowStr() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
}
// ─── 文件操作 ───
/**
 * 确保目录存在
 */
export function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
/**
 * 读取文件内容，文件不存在返回 null
 */
export function readFile_safe(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return null;
    }
}
/**
 * 写入 JSON 文件
 */
export function writeJSON(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
/**
 * 读取 JSON 文件，文件不存在或解析失败返回 null
 */
export function readJSON(filePath) {
    const content = readFile_safe(filePath);
    if (!content)
        return null;
    try {
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * 获取目录下所有 .md 文件（不含子目录）
 */
export function listMdFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort();
}

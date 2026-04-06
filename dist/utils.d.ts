/**
 * 工具函数：frontmatter 解析、安全文件名、日期格式化等
 */
/**
 * 解析 Markdown 文件的 YAML frontmatter
 * 返回 meta 对象和 body 正文内容
 * 不依赖外部 YAML 库，手动解析简单的 key: value 格式
 */
export declare function parseFrontmatter(content: string): {
    meta: Record<string, unknown>;
    body: string;
};
/**
 * 将 meta 对象和 body 正文合成带 frontmatter 的 Markdown 字符串
 */
export declare function writeFrontmatter(meta: Record<string, unknown>, body: string): string;
/**
 * 将标题转为安全的文件名（保留中文、字母、数字、短横线）
 */
export declare function safeFilename(title: string): string;
/**
 * 返回 YYYY-MM-DD 格式的日期字符串
 */
export declare function todayStr(): string;
/**
 * 返回 YYYYMMDD 格式的日期字符串（用于文件名）
 */
export declare function dateCompact(): string;
/**
 * 返回 ISO 格式的日期时间字符串（用于日志）
 */
export declare function nowStr(): string;
/**
 * 确保目录存在
 */
export declare function ensureDir(dir: string): void;
/**
 * 读取文件内容，文件不存在返回 null
 */
export declare function readFile_safe(filePath: string): string | null;
/**
 * 写入 JSON 文件
 */
export declare function writeJSON(filePath: string, data: unknown): void;
/**
 * 读取 JSON 文件，文件不存在或解析失败返回 null
 */
export declare function readJSON<T = unknown>(filePath: string): T | null;
/**
 * 获取目录下所有 .md 文件（不含子目录）
 */
export declare function listMdFiles(dir: string): string[];

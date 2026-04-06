/**
 * 状态管理：全局配置 + 知识库状态
 *
 * 全局配置存放在 ~/.agent-wiki/config.json，记录知识库目录路径
 * 知识库状态存放在 {wikiDir}/state.json，记录已摄入/已打标签/已编译的文件列表
 */
/** 全局配置（~/.agent-wiki/config.json） */
export interface GlobalConfig {
    /** 知识库根目录（绝对路径） */
    wikiDir: string;
}
/** 知识库状态（{wikiDir}/state.json） */
export interface WikiState {
    /** 已摄入到 raw/ 的文件名列表 */
    ingested: string[];
    /** 已打标签的文件名列表 */
    tagged: string[];
    /** 已编译为 Wiki 页面的源文件名列表 */
    compiled: string[];
}
/**
 * 获取全局配置目录路径
 */
export declare function getGlobalConfigDir(): string;
/**
 * 读取全局配置，未初始化返回 null
 */
export declare function getConfig(): GlobalConfig | null;
/**
 * 保存全局配置
 */
export declare function setConfig(config: GlobalConfig): void;
/**
 * 检查是否已初始化（全局配置存在且 wikiDir 目录存在）
 */
export declare function isInitialized(): boolean;
/**
 * 获取知识库根目录
 * 优先从全局配置读取，如果没有则返回 null
 */
export declare function getWikiDir(): string | null;
/**
 * 获取 state.json 文件路径
 */
export declare function getStatePath(wikiDir: string): string;
/**
 * 读取知识库状态，state.json 不存在则返回空状态
 */
export declare function getState(wikiDir: string): WikiState;
/**
 * 保存知识库状态
 */
export declare function setState(wikiDir: string, state: WikiState): void;
export declare function getRawDir(wikiDir: string): string;
export declare function getWikiPagesDir(wikiDir: string): string;
export declare function getOutputsDir(wikiDir: string): string;

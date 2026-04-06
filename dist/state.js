/**
 * 状态管理：全局配置 + 知识库状态
 *
 * 全局配置存放在 ~/.agent-wiki/config.json，记录知识库目录路径
 * 知识库状态存放在 {wikiDir}/state.json，记录已摄入/已打标签/已编译的文件列表
 */
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { ensureDir, readJSON, writeJSON } from "./utils.js";
// ─── 路径常量 ───
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".agent-wiki");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");
// ─── 全局配置操作 ───
/**
 * 获取全局配置目录路径
 */
export function getGlobalConfigDir() {
    return GLOBAL_CONFIG_DIR;
}
/**
 * 读取全局配置，未初始化返回 null
 */
export function getConfig() {
    return readJSON(GLOBAL_CONFIG_PATH);
}
/**
 * 保存全局配置
 */
export function setConfig(config) {
    ensureDir(GLOBAL_CONFIG_DIR);
    writeJSON(GLOBAL_CONFIG_PATH, config);
}
/**
 * 检查是否已初始化（全局配置存在且 wikiDir 目录存在）
 */
export function isInitialized() {
    const config = getConfig();
    if (!config)
        return false;
    return fs.existsSync(config.wikiDir);
}
// ─── 知识库状态操作 ───
/**
 * 获取知识库根目录
 * 优先从全局配置读取，如果没有则返回 null
 */
export function getWikiDir() {
    const config = getConfig();
    return config?.wikiDir ?? null;
}
/**
 * 获取 state.json 文件路径
 */
export function getStatePath(wikiDir) {
    return path.join(wikiDir, "state.json");
}
/**
 * 读取知识库状态，state.json 不存在则返回空状态
 */
export function getState(wikiDir) {
    const state = readJSON(getStatePath(wikiDir));
    return state ?? { ingested: [], tagged: [], compiled: [] };
}
/**
 * 保存知识库状态
 */
export function setState(wikiDir, state) {
    writeJSON(getStatePath(wikiDir), state);
}
// ─── 知识库子目录路径 ───
export function getRawDir(wikiDir) {
    return path.join(wikiDir, "raw");
}
export function getWikiPagesDir(wikiDir) {
    return path.join(wikiDir, "wiki");
}
export function getOutputsDir(wikiDir) {
    return path.join(wikiDir, "outputs");
}

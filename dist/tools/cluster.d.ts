/**
 * wiki_cluster — 基于标签共现的主题自动聚类
 *
 * 遍历所有 wiki 页面对，共享标签数 >= min_shared_tags 的归为一组
 * 使用 Union-Find 合并连通分量
 * 生成 wiki/CLUSTERS.md 主题导航页
 */
import { ToolResult } from "../types.js";
export declare function handleCluster(params: {
    min_shared_tags?: number;
}): Promise<ToolResult>;

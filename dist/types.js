/**
 * 共享类型定义
 */
/** 创建文本类型的 MCP 工具返回值 */
export function textResult(text) {
    return { content: [{ type: "text", text }] };
}

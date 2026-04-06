/**
 * 共享类型定义
 */

/** MCP 工具返回类型（兼容 @modelcontextprotocol/sdk 的 content 格式） */
export type ToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
};

/** 创建文本类型的 MCP 工具返回值 */
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

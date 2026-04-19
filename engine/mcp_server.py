#!/usr/bin/env python3
"""
Agent-Wiki MCP Server — Model Context Protocol 接口

通过 MCP 协议暴露 Agent-Wiki 所有功能，供 Claude Code / Cursor 等 Agent 使用。
传输方式：stdio（JSON-RPC over stdin/stdout）。

启动：python3 mcp_server.py [--config ../config.json]

MCP 工具列表：
  wiki_ingest   — 摄入 MD 文件
  wiki_tag      — LLM 打标签
  wiki_compile  — 编译 Wiki 页面
  wiki_lint     — 自检自修复
  wiki_search   — 标签搜索
  wiki_article  — 原创文章生成
  wiki_status   — 状态查询
"""

import json
import sys
import os
import logging

# 添加当前目录到 sys.path，确保能导入同目录的 server 模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import (
    load_config,
    do_ingest,
    do_tag,
    do_compile,
    do_lint,
    do_search,
    do_article,
    get_status,
)


# ==================== MCP 工具定义 ====================

TOOLS = [
    {
        "name": "wiki_ingest",
        "description": "从指定目录摄入 MD 文件到 Wiki 知识库（复制到工作目录 + RAW 备份）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "source_dir": {
                    "type": "string",
                    "description": "包含 MD 文件的源目录路径",
                },
                "force": {
                    "type": "boolean",
                    "description": "是否强制重新摄入已存在的文件（默认 false）",
                    "default": False,
                },
            },
            "required": ["source_dir"],
        },
    },
    {
        "name": "wiki_tag",
        "description": "用 LLM 给知识库中的 MD 文件打标签（提取 10 个标签写入 frontmatter）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "force": {
                    "type": "boolean",
                    "description": "是否强制重新打标签（默认 false，只处理新文件）",
                    "default": False,
                },
            },
        },
    },
    {
        "name": "wiki_compile",
        "description": "编译 MD 文件为 Wiki 页面（生成摘要、洞察、分类、反向链接）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "force": {
                    "type": "boolean",
                    "description": "是否强制重新编译（默认 false，只处理新文件）",
                    "default": False,
                },
            },
        },
    },
    {
        "name": "wiki_lint",
        "description": "Wiki 自检：检测死链接、缺失反链、缺少摘要等问题，并自动修复",
        "inputSchema": {
            "type": "object",
            "properties": {
                "check_only": {
                    "type": "boolean",
                    "description": "只检查不修复（默认 false）",
                    "default": False,
                },
            },
        },
    },
    {
        "name": "wiki_search",
        "description": "按标签搜索 Wiki 页面（返回匹配的页面列表，毫秒级，不调用 LLM）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "要搜索的标签列表",
                },
                "match": {
                    "type": "string",
                    "enum": ["any", "all"],
                    "description": "匹配模式：any=包含任一标签即匹配，all=必须包含所有标签",
                    "default": "any",
                },
            },
            "required": ["tags"],
        },
    },
    {
        "name": "wiki_article",
        "description": "根据主题生成原创文章：搜 Wiki 标签 → LLM 写大纲+正文 → 输出 MD",
        "inputSchema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "文章主题",
                },
                "max_refs": {
                    "type": "integer",
                    "description": "最大参考 Wiki 页面数（默认 5）",
                    "default": 5,
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "wiki_status",
        "description": "查询 Agent-Wiki 引擎状态（LLM 模式、文件数量、处理进度等）",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
]


# ==================== MCP 请求处理 ====================

def handle_request(request: dict, config: dict) -> dict | None:
    """
    处理单个 JSON-RPC 请求。
    返回 JSON-RPC 响应字典，或 None（通知类消息不需要响应）。
    """
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params", {})

    # 通知类消息：不需要响应
    if method == "notifications/initialized":
        return None

    # Initialize 握手：返回服务器能力声明
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "agent-wiki",
                    "version": "1.0.0",
                },
            },
        }

    # 工具列表
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        }

    # 工具调用
    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        try:
            result = dispatch_tool(tool_name, arguments, config)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result, ensure_ascii=False, indent=2),
                        }
                    ],
                },
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(
                                {"error": str(e)}, ensure_ascii=False
                            ),
                        }
                    ],
                    "isError": True,
                },
            }

    # 未知方法
    if req_id is not None:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }

    return None


def dispatch_tool(name: str, args: dict, config: dict) -> dict:
    """分发 MCP 工具调用到对应的引擎函数"""
    if name == "wiki_ingest":
        return do_ingest(
            config,
            args["source_dir"],
            force=args.get("force", False),
        )
    elif name == "wiki_tag":
        return do_tag(config, force=args.get("force", False))
    elif name == "wiki_compile":
        return do_compile(config, force=args.get("force", False))
    elif name == "wiki_lint":
        return do_lint(config, check_only=args.get("check_only", False))
    elif name == "wiki_search":
        return do_search(
            config,
            args["tags"],
            match=args.get("match", "any"),
        )
    elif name == "wiki_article":
        return do_article(
            config,
            args["topic"],
            max_refs=args.get("max_refs", 5),
        )
    elif name == "wiki_status":
        return get_status(config)
    else:
        raise ValueError(f"未知工具: {name}")


# ==================== 主循环 ====================

def main():
    """
    MCP Server 主循环：
    - 从 stdin 逐行读取 JSON-RPC 请求
    - 处理后把响应写到 stdout
    - 日志输出到 stderr（stdout 被 MCP 协议占用）
    """
    # 解析命令行参数
    config_path = None
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--config" and i + 1 < len(args):
            config_path = args[i + 1]

    config = load_config(config_path)

    # 日志输出到 stderr（stdout 留给 MCP 协议）
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stderr,
    )
    mcp_log = logging.getLogger("agent-wiki-mcp")
    mcp_log.info("Agent-Wiki MCP Server 启动")

    # 逐行读取 JSON-RPC
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            mcp_log.error("JSON 解析失败: %s", e)
            continue

        response = handle_request(request, config)
        if response:
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Agent-Wiki Engine v1.1 — 个人知识维基引擎

完整 API：
  GET  /health                — 健康检查
  GET  /api/v1/status         — 服务状态
  GET  /api/v1/search         — 搜索（?query=xxx &/| tags=A,B&match=any&top_k=10）
  GET  /api/v1/task/{id}      — 轮询后台任务结果
  GET  /api/v1/tree           — Wiki 目录树
  POST /api/v1/ingest         — 摄入 MD 文件（同步，快）
  POST /api/v1/tag            — 批量打标签（→ 后台 task_id）
  POST /api/v1/compile        — 编译为 Wiki 页面（→ 后台 task_id）
  POST /api/v1/lint           — 自检自修复（→ 后台 task_id）
  POST /api/v1/article        — 原创文章生成（→ 后台 task_id）

启动：python3 server.py [--port 8090] [--config config.json]

约束：零外部依赖，仅 Python 标准库。
"""

import os
import re
import json
import shutil
import time
import uuid
import threading
import logging
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


# ==================== 日志配置 ====================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent-wiki")


# ==================== 默认配置 ====================

DEFAULT_CONFIG = {
    "server": {"host": "127.0.0.1", "port": 8090},
    "llm": {
        "mode": "ollama",
        "system": "你是中文助手，必须用中文回答，简洁直接，不废话。只输出要求的内容。",
        "ollama": {
            "api_base": "http://localhost:11434/api/generate",
            "model": "gemma4:e2b",
            "timeout": 180,
        },
        "openai": {
            "api_base": "https://openrouter.ai/api/v1/chat/completions",
            "api_key": "",
            "model": "deepseek/deepseek-chat",
            "timeout": 120,
        },
    },
    "paths": {
        "source": "",
        "raw": "",
        "wiki": "",
        "state": "",
    },
}


# ==================== 配置管理 ====================

def load_config(config_path: str = None) -> dict:
    """加载配置文件（JSON），与默认配置深合并"""
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            user_conf = json.load(f)
        _deep_merge(config, user_conf)
    return config


def _deep_merge(base: dict, override: dict) -> None:
    """递归合并 override 到 base"""
    for k, v in override.items():
        if isinstance(v, dict) and k in base and isinstance(base[k], dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


# ==================== State 管理（线程安全）====================

_state_lock = threading.Lock()


def load_state(state_path: str) -> dict:
    """加载 state.json（线程安全，加锁防止并发读写冲突）"""
    if not state_path or not os.path.exists(state_path):
        return {"ingested": {}, "tagged": {}, "compiled": {}}
    with _state_lock:
        with open(state_path, "r", encoding="utf-8") as f:
            return json.load(f)


def save_state(state_path: str, state: dict) -> None:
    """持久化 state.json（线程安全）"""
    if not state_path:
        return
    with _state_lock:
        os.makedirs(os.path.dirname(state_path), exist_ok=True)
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)


# ==================== Task Manager（后台任务）====================

_tasks: dict = {}
_tasks_lock = threading.Lock()


def submit_task(func, config: dict, **kwargs) -> str:
    """
    提交后台任务。
    返回 task_id，客户端通过 GET /api/v1/task/{task_id} 轮询结果。
    """
    task_id = uuid.uuid4().hex[:12]
    with _tasks_lock:
        _tasks[task_id] = {
            "status": "running",
            "started_at": datetime.now().isoformat(),
            "type": func.__name__,
        }

    def _worker():
        try:
            result = func(config, **kwargs)
            with _tasks_lock:
                _tasks[task_id]["status"] = "done"
                _tasks[task_id]["result"] = result
                _tasks[task_id]["finished_at"] = datetime.now().isoformat()
        except Exception as e:
            log.error("后台任务 %s 失败: %s", task_id, e)
            with _tasks_lock:
                _tasks[task_id]["status"] = "error"
                _tasks[task_id]["error"] = str(e)
                _tasks[task_id]["finished_at"] = datetime.now().isoformat()

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return task_id


def get_task(task_id: str) -> dict:
    """获取任务状态"""
    with _tasks_lock:
        task = _tasks.get(task_id)
        if not task:
            return None
        # 返回副本，避免外部修改内部状态
        info = dict(task)
        if "result" in info and isinstance(info["result"], dict):
            info["result"] = dict(info["result"])
        return info


# ==================== LLM 调用（双模式 + 重试）====================

def call_llm(config: dict, prompt: str, system: str = None) -> str:
    """
    统一 LLM 调用接口，支持两种模式：
      - ollama: 本地 Ollama（POST /api/generate）
      - openai: 云端 OpenAI 兼容 API（POST /v1/chat/completions）
    自动重试 3 次，递增等待（2s, 4s, 6s）。
    """
    llm_cfg = config.get("llm", {})
    mode = llm_cfg.get("mode", "ollama")
    sys_prompt = system or llm_cfg.get("system", "")

    last_error = None
    for attempt in range(1, 4):
        try:
            if mode == "ollama":
                return _call_ollama(llm_cfg.get("ollama", {}), prompt, sys_prompt)
            else:
                return _call_openai(llm_cfg.get("openai", {}), prompt, sys_prompt)
        except Exception as e:
            last_error = e
            log.warning("LLM 调用失败（第 %d/3 次）: %s", attempt, e)
            if attempt < 3:
                time.sleep(2 * attempt)

    raise RuntimeError(f"LLM 调用 3 次均失败: {last_error}")


def _call_ollama(cfg: dict, prompt: str, system: str) -> str:
    """调用本地 Ollama /api/generate"""
    payload = json.dumps({
        "model": cfg["model"],
        "system": system,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        cfg["api_base"], data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=cfg.get("timeout", 180)) as resp:
        return json.loads(resp.read().decode("utf-8"))["response"].strip()


def _call_openai(cfg: dict, prompt: str, system: str) -> str:
    """调用 OpenAI 兼容 /chat/completions"""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = json.dumps({
        "model": cfg["model"],
        "messages": messages,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cfg.get('api_key', '')}",
    }

    req = urllib.request.Request(
        cfg["api_base"], data=payload, headers=headers,
    )
    with urllib.request.urlopen(req, timeout=cfg.get("timeout", 120)) as resp:
        return json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"].strip()


# ==================== Frontmatter 工具 ====================

def read_frontmatter(filepath: str) -> dict:
    """读取 YAML frontmatter（不依赖 pyyaml）"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not match:
        return {}

    fm_text = match.group(1)
    result = {}
    lines = fm_text.split("\n")
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()
        if ":" in stripped and not stripped.startswith(" "):
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()

            if value.startswith("[") and value.endswith("]"):
                result[key] = [
                    t.strip().strip('"').strip("'")
                    for t in value[1:-1].split(",") if t.strip()
                ]
            elif value == "" and i + 1 < len(lines) and lines[i + 1].strip().startswith("- "):
                items = []
                j = i + 1
                while j < len(lines) and lines[j].strip().startswith("- "):
                    item = lines[j].strip()[2:].strip().strip('"').strip("'")
                    if item:
                        items.append(item)
                    j += 1
                result[key] = items
                i = j
                continue
            else:
                result[key] = value.strip('"').strip("'")
        i += 1

    return result


def update_frontmatter_tags(filepath: str, tags: list) -> None:
    """更新 frontmatter tags 字段"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    new_line = f"tags: [{', '.join(tags)}]"
    p1 = r"^tags:\s*\[.*?\]\s*$"
    p2 = r"^tags:\s*\n(?:\s+-\s+[^\n]*\n?)+"

    if re.search(p1, content, re.MULTILINE):
        content = re.sub(p1, new_line, content, flags=re.MULTILINE)
    elif re.search(p2, content, re.MULTILINE):
        content = re.sub(p2, new_line + "\n", content, flags=re.MULTILINE)
    elif content.startswith("---"):
        content = "---\n" + new_line + "\n" + content[3:]
    else:
        content = f"---\n{new_line}\n---\n\n{content}"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)


def read_body(filepath: str) -> str:
    """读取正文（去掉 frontmatter）"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    return re.sub(r"^---\s*\n.*?\n---\s*\n", "", content, flags=re.DOTALL).strip()


# ==================== Ingest（摄入）====================

def do_ingest(config: dict, source_dir: str, force: bool = False) -> dict:
    """从指定目录摄入 MD 文件到工作目录 + RAW 备份"""
    if not os.path.isdir(source_dir):
        return {"error": f"源目录不存在: {source_dir}"}

    paths = config["paths"]
    work_dir = paths.get("source", "")
    raw_dir = paths.get("raw", "")
    state_path = paths.get("state", "")

    if not work_dir:
        return {"error": "配置中缺少 paths.source（工作目录）"}

    os.makedirs(work_dir, exist_ok=True)
    if raw_dir:
        os.makedirs(raw_dir, exist_ok=True)

    state = load_state(state_path)
    ingested = state.get("ingested", {})

    md_files = list(Path(source_dir).glob("*.md"))
    if not md_files:
        return {"status": "ok", "message": "源目录中没有 MD 文件", "ingested": 0}

    results = []
    for md_file in md_files:
        if not force and md_file.name in ingested:
            continue
        try:
            dest = Path(work_dir) / md_file.name
            if not dest.exists():
                shutil.copy2(md_file, dest)
            if raw_dir:
                raw_dest = Path(raw_dir) / md_file.name
                if not raw_dest.exists():
                    shutil.copy2(md_file, raw_dest)
            ingested[md_file.name] = {
                "source": str(md_file),
                "ingested_at": datetime.now().isoformat(),
            }
            results.append({"file": md_file.name, "status": "ok"})
        except Exception as e:
            log.error("摄入失败: %s → %s", md_file.name, e)
            results.append({"file": md_file.name, "error": str(e)})

    state["ingested"] = ingested
    save_state(state_path, state)

    success = sum(1 for r in results if r.get("status") == "ok")
    log.info("摄入完成: %d 成功 / %d 总计", success, len(md_files))
    return {"status": "ok", "ingested": success, "total": len(md_files), "results": results}


# ==================== Tag（打标签）====================

def tag_file(filepath: str, config: dict) -> list:
    """给单个文件打标签（LLM 提取 10 个标签 + 写入 frontmatter）"""
    body = read_body(filepath)
    if len(body) > 4000:
        body = body[:4000]

    fm = read_frontmatter(filepath)
    title = fm.get("title", Path(filepath).stem)

    prompt = (
        f"给以下文章提取10个标签，只输出标签，逗号分隔，不要编号不要多余文字：\n"
        f"标题：{title}\n"
        f"内容：{body}"
    )
    result = call_llm(config, prompt)

    tags = re.split(r'[,，\n]', result)
    tags = [t.strip().strip('- •0123456789. ').strip('"\'') for t in tags]
    tags = [t for t in tags if t and len(t) <= 20][:10]

    update_frontmatter_tags(filepath, tags)
    return tags


def do_tag(config: dict, force: bool = False) -> dict:
    """
    批量打标签（增量 + 逐文件保存 state）。
    每个文件成功后立即持久化 state，确保 /status 实时可见。
    """
    paths = config["paths"]
    work_dir = paths.get("source", "")
    raw_dir = paths.get("raw", "")
    state_path = paths.get("state", "")

    if not os.path.isdir(work_dir):
        return {"error": f"工作目录不存在: {work_dir}"}

    # 每次处理文件前重新加载最新 state（后台线程可能并发读写）
    state = load_state(state_path)
    tagged = state.get("tagged", {})

    md_files = list(Path(work_dir).glob("*.md"))
    to_process = md_files if force else [f for f in md_files if f.name not in tagged]

    if not to_process:
        return {"status": "ok", "message": "没有新文件需要打标签", "processed": 0}

    if raw_dir:
        os.makedirs(raw_dir, exist_ok=True)

    results = []
    for md_file in to_process:
        try:
            if raw_dir:
                raw_path = Path(raw_dir) / md_file.name
                if not raw_path.exists():
                    shutil.copy2(md_file, raw_path)

            tags = tag_file(str(md_file), config)

            tagged[md_file.name] = {
                "tags": tags,
                "tagged_at": datetime.now().isoformat(),
            }
            # 逐文件保存：确保后台运行时 /status 实时可见
            state["tagged"] = tagged
            save_state(state_path, state)

            results.append({"file": md_file.name, "tags": tags})
            log.info("已打标签: %s → %s", md_file.name, ", ".join(tags))

        except Exception as e:
            log.error("打标签失败: %s → %s", md_file.name, e)
            results.append({"file": md_file.name, "error": str(e)})

    success = sum(1 for r in results if "tags" in r)
    return {"status": "ok", "processed": success, "total": len(to_process), "results": results}


# ==================== Compile（编译 Wiki）====================

def compile_article(filepath: str, config: dict) -> dict:
    """编译单篇文章（一次 LLM 调用生成摘要+洞察+分类）"""
    body = read_body(filepath)
    text = body[:3000] if len(body) > 3000 else body

    fm = read_frontmatter(filepath)
    title = fm.get("title", Path(filepath).stem)
    tags = fm.get("tags", [])

    prompt = (
        f"分析以下文章，严格按格式输出：\n"
        f"## 摘要\n（2-3句话概括核心内容）\n\n"
        f"## 洞察\n- 洞察1\n- 洞察2\n- 洞察3\n\n"
        f"## 分类\n（只输出一个分类名，如技术、产品、管理等）\n\n"
        f"标题：{title}\n"
        f"内容：{text}"
    )

    result = call_llm(config, prompt)

    summary = ""
    insights = ""
    category = "未分类"

    m = re.search(r"## 摘要\s*\n(.*?)(?=\n## |\Z)", result, re.DOTALL)
    if m:
        summary = m.group(1).strip()
    m = re.search(r"## 洞察\s*\n(.*?)(?=\n## |\Z)", result, re.DOTALL)
    if m:
        insights = m.group(1).strip()
    m = re.search(r"## 分类\s*\n(.+)", result)
    if m:
        category = m.group(1).strip().strip('"\'：:')

    if not tags:
        tags_prompt = f"给以下文章提取10个标签，只输出标签，逗号分隔：\n标题：{title}\n内容：{text}"
        tags_result = call_llm(config, tags_prompt)
        tags = [t.strip().strip('"\'') for t in re.split(r'[,，\n]', tags_result) if t.strip()][:10]

    return {
        "title": title, "tags": tags, "summary": summary,
        "insights": insights, "category": category,
        "source_file": Path(filepath).name,
    }


def do_compile(config: dict, force: bool = False) -> dict:
    """批量编译为 Wiki 页面（增量）"""
    paths = config["paths"]
    work_dir = paths.get("source", "")
    wiki_dir = paths.get("wiki", "")
    state_path = paths.get("state", "")

    if not os.path.isdir(work_dir):
        return {"error": f"工作目录不存在: {work_dir}"}
    if not wiki_dir:
        return {"error": "配置中缺少 paths.wiki"}

    os.makedirs(wiki_dir, exist_ok=True)

    state = load_state(state_path)
    compiled = state.get("compiled", {})

    md_files = list(Path(work_dir).glob("*.md"))
    to_compile = md_files if force else [f for f in md_files if f.name not in compiled]

    if not to_compile:
        return {"status": "ok", "message": "没有新文章需要编译", "compiled": 0}

    existing_titles = {info["title"] for info in compiled.values() if "title" in info}

    results = []
    for md_file in to_compile:
        try:
            data = compile_article(str(md_file), config)
            wiki_md = _generate_wiki_page(data)
            safe_name = re.sub(r'[<>:"/\\|?*]', '_', data["title"])[:80] + ".md"
            wiki_path = Path(wiki_dir) / safe_name

            with open(wiki_path, "w", encoding="utf-8") as f:
                f.write(wiki_md)

            compiled[md_file.name] = {
                "title": data["title"],
                "wiki_file": safe_name,
                "category": data["category"],
                "tags": data["tags"],
                "compiled_at": datetime.now().isoformat(),
            }
            existing_titles.add(data["title"])

            # 逐文件保存 state
            state["compiled"] = compiled
            save_state(state_path, state)

            results.append({
                "file": md_file.name, "title": data["title"],
                "wiki": safe_name, "category": data["category"],
            })
            log.info("已编译: %s → %s", md_file.name, safe_name)
        except Exception as e:
            log.error("编译失败: %s → %s", md_file.name, e)
            results.append({"file": md_file.name, "error": str(e)})

    _update_index(wiki_dir, compiled)

    success = sum(1 for r in results if "wiki" in r)
    return {"status": "ok", "compiled": success, "total": len(to_compile), "results": results}


def _generate_wiki_page(data: dict) -> str:
    """根据编译数据生成 Wiki 页面 Markdown"""
    tags_str = ", ".join(data["tags"])
    now = datetime.now()
    return (
        f"---\n"
        f'title: "{data["title"]}"\n'
        f"date: {now.strftime('%Y-%m-%d')}\n"
        f"tags: [{tags_str}]\n"
        f"category: {data['category']}\n"
        f"sources:\n"
        f'  - "[[Raw/{data["source_file"]}]]"\n'
        f"---\n\n"
        f"# {data['title']}\n\n"
        f"## 摘要\n\n{data['summary']}\n\n"
        f"## 核心洞察\n\n{data['insights']}\n\n"
        f"## 标签\n\n{tags_str}\n\n"
        f"---\n"
        f"*来源: Raw/{data['source_file']} · "
        f"编译时间: {now.strftime('%Y-%m-%d %H:%M')}*\n"
    )


def _update_index(wiki_dir: str, compiled: dict) -> None:
    """更新 Wiki 索引页面"""
    categories = {}
    for info in compiled.values():
        categories.setdefault(info.get("category", "未分类"), []).append(info)

    now = datetime.now()
    lines = [
        f"---\ntitle: \"知识库索引\"\ndate: {now.strftime('%Y-%m-%d')}\n---\n",
        "# 知识库索引\n",
    ]
    for cat, items in sorted(categories.items()):
        lines.append(f"\n## {cat}\n")
        for item in items:
            title = item.get("title", "?")
            tags_preview = ", ".join(item.get("tags", [])[:3])
            lines.append(f"- [[{title}]] ({tags_preview})")
    lines.append(f"\n---\n*共 {len(compiled)} 篇 · 更新于 {now.strftime('%Y-%m-%d %H:%M')}*")

    with open(Path(wiki_dir) / "index.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ==================== Lint（自检自修复）====================

def do_lint(config: dict, check_only: bool = False) -> dict:
    """Wiki 自检：死链接、缺失反链、缺摘要、内容过短"""
    wiki_dir = config["paths"].get("wiki", "")
    if not os.path.isdir(wiki_dir):
        return {"error": f"Wiki 目录不存在: {wiki_dir}"}

    pages = {}
    for f in Path(wiki_dir).glob("*.md"):
        if f.name == "index.md":
            continue
        try:
            content = f.read_text(encoding="utf-8")
            fm = read_frontmatter(str(f))
            pages[f.name] = {
                "title": fm.get("title", f.stem),
                "path": str(f),
                "content": content,
            }
        except Exception:
            pass

    if not pages:
        return {"status": "ok", "total_pages": 0, "total_issues": 0, "issues": []}

    issues = []
    all_titles = {p["title"] for p in pages.values()}
    all_names = set(pages.keys())

    # 1. 死链接
    for name, page in pages.items():
        for link in re.findall(r'\[\[(.+?)(?:\|.+?)?\]\]', page["content"]):
            clean = link.replace("Raw/", "").replace(".md", "")
            found = (
                link in all_names or link + ".md" in all_names
                or any(link in t for t in all_titles) or clean in all_titles
            )
            if not found:
                issues.append({"type": "dead_link", "severity": "warning", "source": name, "target": link})

    # 2. 反向链接 + 自动修复
    backlink_map = {}
    for name, page in pages.items():
        for link in re.findall(r'\[\[(.+?)(?:\|.+?)?\]\]', page["content"]):
            backlink_map.setdefault(link, []).append(page["title"])

    auto_fixed = 0
    for name, page in pages.items():
        title = page["title"]
        if title in backlink_map:
            for referrer in backlink_map[title]:
                if referrer not in page["content"]:
                    issue = {"type": "missing_backlink", "source": name, "target": referrer}
                    if not check_only:
                        path = page["path"]
                        with open(path, "r", encoding="utf-8") as f:
                            content = f.read()
                        if f"[[{referrer}]]" not in content:
                            content = content.rstrip()
                            if content.endswith("---"):
                                content = content[:-3].rstrip()
                            content += f"\n\n- 被引用: [[{referrer}]]\n"
                            with open(path, "w", encoding="utf-8") as f:
                                f.write(content)
                            auto_fixed += 1
                        issue["fixed"] = True
                    issues.append(issue)

    # 3. 质量检查
    for name, page in pages.items():
        if "## 摘要" not in page["content"]:
            issues.append({"type": "missing_summary", "severity": "warning", "source": name})
        body = re.sub(r'^---\s*\n.*?\n---\s*\n', '', page["content"], flags=re.DOTALL).strip()
        if len(body) < 200:
            issues.append({"type": "too_short", "severity": "info", "source": name, "length": len(body)})

    log.info("Lint 完成: %d 页面, %d 问题, %d 自动修复", len(pages), len(issues), auto_fixed)
    return {
        "status": "ok", "total_pages": len(pages),
        "total_issues": len(issues), "auto_fixed": auto_fixed, "issues": issues,
    }


# ==================== Search（标签 + 全文，不走 Embedding）====================

def do_search(config: dict, tags: list = None, query: str = "",
              match: str = "any", top_k: int = 10) -> dict:
    """
    搜索 Wiki 页面，支持两种模式（可同时使用）：
      - tags: 标签匹配（和之前一样）
      - query: 全文关键词搜索（按词匹配，统计命中次数）
    至少提供 tags 或 query 其中之一。
    按综合得分排序，返回 top_k 条。
    """
    wiki_dir = config["paths"].get("wiki", "")
    if not os.path.isdir(wiki_dir):
        return {"error": f"Wiki 目录不存在: {wiki_dir}"}

    if not tags and not query:
        return {"error": "tags 和 query 至少提供一个"}

    # 预处理搜索标签（小写）
    tags_lower = {t.lower() for t in tags} if tags else set()
    # 预处理全文关键词（小写分词）
    query_keywords = set(query.lower().split()) if query else set()

    results = []
    for f in Path(wiki_dir).glob("*.md"):
        if f.name == "index.md":
            continue
        try:
            content = f.read_text(encoding="utf-8")
            fm = read_frontmatter(str(f))
            page_tags = fm.get("tags", [])
            page_tags_lower = {t.lower() for t in page_tags}

            score = 0
            matched_tags = set()

            # --- 标签匹配得分 ---
            if tags_lower:
                matched = tags_lower & page_tags_lower
                if match == "all" and not tags_lower.issubset(page_tags_lower):
                    continue  # ALL 模式：缺少任何一个标签就跳过
                if match == "any" and not matched:
                    continue  # ANY 模式：没有任何标签命中就跳过
                matched_tags = matched
                score += len(matched) * 3  # 标签匹配权重更高

            # --- 全文关键词得分 ---
            if query_keywords:
                content_lower = content.lower()
                text_hits = sum(1 for kw in query_keywords if kw in content_lower)
                if text_hits == 0:
                    if not tags_lower:
                        continue  # 没有标签兜底，纯全文未命中则跳过
                else:
                    score += text_hits

            # 至少有一种匹配才收录
            if score == 0:
                continue

            # 提取摘要
            summary_match = re.search(
                r"## 摘要\s*\n\n(.*?)(?:\n##|\n---)", content, re.DOTALL
            )
            summary = summary_match.group(1).strip()[:200] if summary_match else ""

            results.append({
                "title": fm.get("title", f.stem),
                "file": f.name,
                "tags": page_tags,
                "matched_tags": list(matched_tags),
                "score": score,
                "summary": summary,
            })
        except Exception:
            pass

    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "status": "ok",
        "query": query,
        "tags": tags,
        "match": match,
        "top_k": top_k,
        "total": len(results),
        "results": results[:top_k],
    }


# ==================== Article（原创文章生成）====================

def do_article(config: dict, topic: str, max_refs: int = 5) -> dict:
    """原创文章：搜标签 → LLM 大纲 → LLM 正文 → 保存 MD"""
    wiki_dir = config["paths"].get("wiki", "")
    if not wiki_dir:
        return {"error": "配置中缺少 paths.wiki"}

    # 1. LLM 提取标签
    tag_result = call_llm(
        config,
        f"从以下主题中提取5-8个搜索标签，只输出标签，逗号分隔：\n主题：{topic}",
    )
    search_tags = [t.strip().strip('"\'') for t in re.split(r'[,，\n]', tag_result) if t.strip()][:8]
    log.info("主题「%s」→ 搜索标签: %s", topic, ", ".join(search_tags))

    # 2. 标签搜索 Wiki
    search_result = do_search(config, tags=search_tags, match="any")
    refs = search_result.get("results", [])[:max_refs]

    ref_content = []
    for ref in refs:
        ref_path = Path(wiki_dir) / ref["file"]
        if ref_path.exists():
            body = read_body(str(ref_path))
            ref_content.append(f"### {ref['title']}\n{body[:1500]}")
    refs_text = "\n\n".join(ref_content) if ref_content else "（无相关 Wiki 参考资料）"

    # 3. LLM 生成大纲
    outline = call_llm(config, (
        f"基于以下参考资料，为主题「{topic}」写一个文章大纲。\n"
        f"大纲格式：一级标题用 #，二级用 ##，每节简要说明要点。\n"
        f"只输出大纲，不要其他内容。\n\n"
        f"参考资料：\n{refs_text}"
    ))
    log.info("文章大纲已生成")

    # 4. LLM 生成正文
    article_body = call_llm(config, (
        f"基于以下大纲和参考资料，写一篇完整的原创文章。\n"
        f"要求：\n- 主题：{topic}\n- 用 Markdown 格式\n"
        f"- 每个章节内容充实，有观点和论据\n- 文末标注参考来源\n\n"
        f"大纲：\n{outline}\n\n参考资料：\n{refs_text}"
    ))
    log.info("文章正文已生成")

    # 5. 保存
    now = datetime.now()
    safe_topic = re.sub(r'[<>:"/\\|?*]', '_', topic)[:60]
    article_dir = Path(wiki_dir) / "articles"
    article_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{now.strftime('%Y%m%d')}-{safe_topic}.md"
    filepath = article_dir / filename
    sources = [f"- [[{r['title']}]]" for r in refs]
    llm_mode = config.get("llm", {}).get("mode", "ollama")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(
            f"---\ntitle: \"{topic}\"\ndate: {now.strftime('%Y-%m-%d')}\n"
            f"type: article\ntags: [{', '.join(search_tags)}]\ngenerated: true\n---\n\n"
            f"# {topic}\n\n{article_body}\n\n## 参考来源\n\n"
            f"{chr(10).join(sources) if sources else '- （纯原创，无 Wiki 参考）'}\n\n"
            f"---\n*生成时间: {now.strftime('%Y-%m-%d %H:%M')} · LLM 模式: {llm_mode}*\n"
        )

    log.info("原创文章已保存: %s", filename)
    return {
        "status": "ok", "topic": topic, "tags": search_tags,
        "outline": outline, "refs_used": len(refs),
        "ref_titles": [r["title"] for r in refs],
        "file": str(filepath), "filename": filename,
    }


# ==================== Status（状态查询）====================

def get_status(config: dict) -> dict:
    """查询服务状态"""
    paths = config["paths"]
    wiki_dir = paths.get("wiki", "")
    work_dir = paths.get("source", "")
    state_path = paths.get("state", "")

    wiki_count = len(list(Path(wiki_dir).glob("*.md"))) if os.path.isdir(wiki_dir) else 0
    work_count = len(list(Path(work_dir).glob("*.md"))) if os.path.isdir(work_dir) else 0

    state = load_state(state_path) if state_path else {}

    llm_cfg = config.get("llm", {})
    mode = llm_cfg.get("mode", "ollama")
    llm_status = "unknown"
    try:
        if mode == "ollama":
            base = llm_cfg.get("ollama", {}).get("api_base", "")
            check_url = base.replace("/api/generate", "/api/tags")
            req = urllib.request.Request(check_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                llm_status = "running"
        else:
            openai_cfg = llm_cfg.get("openai", {})
            llm_status = "configured" if openai_cfg.get("api_key") else "missing_api_key"
    except Exception:
        llm_status = "offline"

    return {
        "status": "ok",
        "version": "1.1.0",
        "llm_mode": mode,
        "llm_status": llm_status,
        "llm_model": llm_cfg.get(mode, {}).get("model", "unknown"),
        "wiki_pages": wiki_count,
        "source_files": work_count,
        "tagged": len(state.get("tagged", {})),
        "compiled": len(state.get("compiled", {})),
    }


# ==================== HTTP Server ====================

class WikiHandler(BaseHTTPRequestHandler):
    """HTTP 请求处理器"""
    config: dict = {}

    def _send_json(self, data: dict, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length:
            try:
                return json.loads(self.rfile.read(length).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return {}
        return {}

    # ---------- GET ----------

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        path = parsed.path

        if path == "/health":
            self._send_json({"status": "ok"})

        elif path == "/api/v1/status":
            self._send_json(get_status(self.config))

        elif path == "/api/v1/search":
            # 支持 query（全文）+ tags（标签）+ top_k
            query = params.get("query", [""])[0]
            tags_str = params.get("tags", [""])[0]
            match_mode = params.get("match", ["any"])[0]
            top_k = int(params.get("top_k", [10])[0])
            tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else None
            if not tags and not query:
                self._send_json({"error": "tags 和 query 至少提供一个"}, 400)
            else:
                self._send_json(do_search(self.config, tags=tags, query=query,
                                          match=match_mode, top_k=top_k))

        elif path.startswith("/api/v1/task/"):
            # 轮询后台任务
            task_id = path.split("/api/v1/task/")[-1]
            task = get_task(task_id)
            if not task:
                self._send_json({"error": f"任务不存在: {task_id}"}, 404)
            else:
                self._send_json(task)

        elif path == "/api/v1/tree":
            wiki_dir = self.config["paths"].get("wiki", "")
            if os.path.isdir(wiki_dir):
                files = [{"name": f.name, "size": f.stat().st_size}
                         for f in Path(wiki_dir).glob("*.md")]
                self._send_json({"status": "ok", "files": files})
            else:
                self._send_json({"error": "Wiki 目录不存在"}, 404)

        else:
            self._send_json({"error": f"未知接口: {path}"}, 404)

    # ---------- POST ----------

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        body = self._read_body()
        path = parsed.path

        if path == "/api/v1/ingest":
            # ingest 是纯文件操作（快），保持同步
            source_dir = body.get("source_dir", "")
            force = body.get("force", False)
            if not source_dir:
                self._send_json({"error": "source_dir 必填"}, 400)
            else:
                self._send_json(do_ingest(self.config, source_dir, force=force))

        elif path == "/api/v1/tag":
            task_id = submit_task(do_tag, self.config, force=body.get("force", False))
            self._send_json({"task_id": task_id, "status": "running"})

        elif path == "/api/v1/compile":
            task_id = submit_task(do_compile, self.config, force=body.get("force", False))
            self._send_json({"task_id": task_id, "status": "running"})

        elif path == "/api/v1/lint":
            task_id = submit_task(do_lint, self.config, check_only=body.get("check_only", False))
            self._send_json({"task_id": task_id, "status": "running"})

        elif path == "/api/v1/article":
            topic = body.get("topic", "")
            if not topic:
                self._send_json({"error": "topic 必填"}, 400)
            else:
                task_id = submit_task(do_article, self.config,
                                      topic=topic, max_refs=body.get("max_refs", 5))
                self._send_json({"task_id": task_id, "status": "running"})

        else:
            self._send_json({"error": f"未知接口: {path}"}, 404)

    # ---------- CORS ----------

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, fmt, *args) -> None:
        log.info("%s", args[0])


# ==================== 入口 ====================

def main():
    parser = argparse.ArgumentParser(description="Agent-Wiki Engine v1.1")
    parser.add_argument("--port", type=int, default=None, help="端口号（默认 8090）")
    parser.add_argument("--config", default=None, help="配置文件路径（JSON）")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.port:
        config["server"]["port"] = args.port

    host = config["server"]["host"]
    port = config["server"]["port"]

    for key in ["source", "wiki"]:
        if not config["paths"].get(key):
            log.warning("配置中缺少 paths.%s，部分功能将不可用", key)

    mode = config.get("llm", {}).get("mode", "ollama")
    model = config.get("llm", {}).get(mode, {}).get("model", "unknown")

    WikiHandler.config = config
    server = HTTPServer((host, port), WikiHandler)

    print(f"Agent-Wiki Engine v1.1.0")
    print(f"  地址: http://{host}:{port}")
    print(f"  LLM:  {mode} ({model})")
    print(f"  API:  /api/v1/{{ingest,tag,compile,lint,search,article}}")
    print(f"  异步: tag/compile/lint/article → task_id → GET /api/v1/task/{{id}}")
    print(f"  按 Ctrl+C 停止\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()

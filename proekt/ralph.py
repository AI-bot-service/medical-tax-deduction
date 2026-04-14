#!/usr/bin/env python3
"""
Ralph — агент-runner для задач из tasks_dashboard_redesign.json.
Запускает claude в цикле пока есть pending-задачи, показывает прогресс в реальном времени.
"""
import json
import os
import shutil
import subprocess
import sys

TASKS_FILE = "proekt/tasks_dashboard_redesign.json"

PROMPT = """\
@proekt/tasks_dashboard_redesign.json @proekt/progress.txt
1. Найди фичу с наивысшим приоритетом и работай ТОЛЬКО над ней.
Это должна быть фича, которую ТЫ считаешь наиболее приоритетной — не обязательно первая в списке.
2. Проверь, что типы проходят через 'uv run ruff check .' и тесты через 'uv run pytest'.
3. Обнови TASK с информацией о выполненной работе.
4. Добавь свой прогресс в файл @proekt/progress.txt.
Используй это, чтобы оставить заметку для следующей итерации работы над кодом.
5. Сделай git commit для этой фичи.
РАБОТАЙ ТОЛЬКО НАД ОДНОЙ ФИЧЕЙ.
Если при реализации фичи ты заметишь, что TASK полностью выполнен, выведи <promise>COMPLETE</promise>.
"""


def resolve_agent() -> str:
    forced = os.environ.get("RALPH_AGENT")
    if forced:
        return forced
    if shutil.which("claude"):
        return "claude"
    if shutil.which("codex"):
        return "codex"
    raise RuntimeError(
        "Не найден агент. Установите 'claude' или 'codex', "
        "либо задайте RALPH_AGENT."
    )


def count_tasks(status: str) -> int:
    try:
        with open(TASKS_FILE) as f:
            data = json.load(f)
        tasks = data if isinstance(data, list) else data.get("tasks", [])
        return sum(1 for t in tasks if t.get("status") == status)
    except Exception:
        return 0


def run_claude(prompt: str) -> str:
    """Запускает claude с --output-format stream-json и парсит события в реальном времени."""
    cmd = [
        "claude",
        "--permission-mode", "acceptEdits",
        "--output-format", "stream-json",
        "--verbose",
        "-p", prompt,
    ]

    full_text = []
    active_tools: dict[str, str] = {}  # tool_use_id -> name

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )

    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            etype = event.get("type")

            if etype == "assistant":
                message = event.get("message", {})
                for block in message.get("content", []):
                    btype = block.get("type")
                    if btype == "text":
                        text = block.get("text", "")
                        if text:
                            print(text, flush=True)
                            full_text.append(text)
                    elif btype == "tool_use":
                        tool_id = block.get("id", "")
                        tool_name = block.get("name", "")
                        active_tools[tool_id] = tool_name
                        inp = block.get("input", {})
                        _print_tool_call(tool_name, inp)

            elif etype == "tool_result":
                tool_id = event.get("tool_use_id", "")
                tool_name = active_tools.pop(tool_id, "?")
                content = event.get("content", "")
                if isinstance(content, list):
                    content = " ".join(c.get("text", "") for c in content if c.get("type") == "text")
                preview = str(content)[:120].replace("\n", " ")
                print(f"  -> {preview}", flush=True)

            elif etype == "result":
                cost = event.get("total_cost_usd")
                duration = event.get("duration_ms", 0)
                if cost is not None:
                    print(f"\n[стоимость: ${cost:.4f}, время: {duration / 1000:.1f}с]", flush=True)

    finally:
        proc.wait()

    return "\n".join(full_text)


def _print_tool_call(name: str, inp: dict) -> None:
    """Красиво выводит вызов инструмента."""
    if name == "Bash":
        cmd = inp.get("command", "")[:100]
        print(f"\n[Bash] {cmd}", flush=True)
    elif name in ("Read",):
        path = inp.get("file_path", inp.get("path", ""))
        print(f"\n[Read] {path}", flush=True)
    elif name in ("Edit", "Write"):
        path = inp.get("file_path", inp.get("path", ""))
        print(f"\n[{name}] {path}", flush=True)
    elif name == "Glob":
        print(f"\n[Glob] {inp.get('pattern', '')}", flush=True)
    elif name == "Grep":
        print(f"\n[Grep] {inp.get('pattern', '')} в {inp.get('path', '.')}", flush=True)
    elif name == "TodoWrite":
        todos = inp.get("todos", [])
        print(f"\n[Todo] обновление {len(todos)} задач", flush=True)
    else:
        print(f"\n[{name}]", flush=True)


def run_codex(prompt: str) -> str:
    import tempfile
    tmp = tempfile.mktemp(prefix="ralph_codex_")
    subprocess.run([
        "codex", "exec", "--full-auto", "--color", "never",
        "-C", os.getcwd(), "--output-last-message", tmp, prompt,
    ], stdin=subprocess.DEVNULL, check=False)
    try:
        with open(tmp) as f:
            return f.read()
    finally:
        os.unlink(tmp)


def run_agent(agent: str, prompt: str) -> str:
    if agent == "claude":
        return run_claude(prompt)
    if agent == "codex":
        return run_codex(prompt)
    raise ValueError(f"Неизвестный агент: {agent}")


def main() -> None:
    iteration = 1

    while count_tasks("pending") > 0:
        print(f"\n{'=' * 50}")
        print(f"Итерация {iteration}")
        print(f"Задач pending: {count_tasks('pending')}, done: {count_tasks('done')}")
        print(f"{'=' * 50}\n")

        try:
            agent = resolve_agent()
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)

        result = run_agent(agent, PROMPT)

        if "<promise>COMPLETE</promise>" in result:
            print("\n✓ TASK выполнен!")
            remaining = count_tasks("pending")
            if remaining == 0:
                print("Все задачи выполнены!")
                sys.exit(0)
            print(f"Осталось задач: {remaining}. Продолжаю...")

        iteration += 1

    print(f"\nВсе задачи выполнены! Итераций: {iteration - 1}")


if __name__ == "__main__":
    main()

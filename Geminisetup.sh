#!/bin/bash

# Create directories
mkdir -p plugins

# Create main script (gemini)
touch gemini
cat << 'EOF' > gemini
#!/usr/bin/env python3
"""
Pyrmethus AI CLI - Enhanced Terminal Interface with Plugins

Version: 4.3.0
Date: March 20, 2025
"""

import argparse
import importlib.util
import json
import logging
import mimetypes
import os
from base64 import b64encode
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable
import sys
import random
import time
import requests
from tenacity import retry, stop_after_attempt, wait_fixed, after_log
from requests.exceptions import RequestException
from rich.console import Console
from rich.theme import Theme
from rich.logging import RichHandler
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich.markdown import Markdown
from rich.progress import Progress, SpinnerColumn, TextColumn
from prompt_toolkit import PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import NestedCompleter, PathCompleter
from prompt_toolkit.history import FileHistory
import yaml
from cryptography.fernet import Fernet
import re

# Constants
TERMUX_STORAGE_PATH = "/data/data/com.termux/files/storage/shared"
SUPPORTED_MODELS = ["gemini-1.0-pro", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-thinking-exp-01-21"]
DEFAULT_CONFIG_DIR = Path.home() / ".config" / "pyrmethus"
DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_DIR / "config.yaml"
DEFAULT_HISTORY_PATH = DEFAULT_CONFIG_DIR / "history.txt"
FILE_API_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files"
ENCRYPTION_KEY = Fernet.generate_key()  # Store securely in production
PLUGIN_DIR = Path(__file__).parent / "plugins"

# Rich Themes
THEMES = {
    "mystical": Theme({
        "banner": "bold magenta", "info": "cyan", "warning": "yellow", "error": "bold red",
        "success": "green", "prompt": "bold blue", "response": "green", "command": "bold white",
        "config_header": "bold cyan", "config_value": "magenta", "history_header": "bold yellow",
        "history_entry": "italic green", "debug": "dim white", "separator": "dim cyan",
        "version_notice": "yellow", "file_api": "bold green", "file_upload": "bold cyan",
        "file_error": "bold red", "model_name": "bold green"
    }),
    "dark": Theme({
        "banner": "bold white", "info": "cyan", "warning": "yellow", "error": "red",
        "success": "green", "prompt": "blue", "response": "white", "command": "white",
        "config_header": "cyan", "config_value": "magenta", "history_header": "yellow",
        "history_entry": "green", "debug": "dim white", "separator": "dim white",
        "version_notice": "yellow", "file_api": "green", "file_upload": "cyan",
        "file_error": "red", "model_name": "green"
    })
}
console = Console(theme=THEMES["mystical"])

# Logging Setup
logging.basicConfig(
    level=logging.INFO, format="%(message)s", datefmt="[%X]",
    handlers=[RichHandler(console=console, show_time=False, show_path=False),
              logging.FileHandler(DEFAULT_CONFIG_DIR / "pyrmethus.log")]
)
logger = logging.getLogger(__name__)

class ConfigError(Exception): pass
class APIError(Exception): pass
class FileUploadError(APIError): pass
class CommandError(Exception): pass

def is_termux() -> bool:
    return "termux" in str(Path.home()).lower()

def get_termux_path(config, path: str) -> Path:
    return Path(config.termux_storage) / path.lstrip('/') if is_termux() else Path(path).expanduser()

def create_mystical_banner() -> Panel:
    banner_text = Text("Pyrmethus AI CLI", style="banner")
    banner_text.append("\nVersion 4.3.0", style="version_notice")
    banner_text.append("\nA mystical gateway to AI wisdom", style="info")
    return Panel(banner_text, title="🔮 Pyrmethus 🔮", title_align="center", border_style="banner", padding=(1, 2))

class Config:
    def __init__(self, config_path: Path = DEFAULT_CONFIG_PATH, history_path: Path = DEFAULT_HISTORY_PATH):
        self.config_path = config_path
        self.history_path = history_path
        self._defaults = {
            "model": "gemini-2.0-flash-thinking-exp-01-21", "temperature": 0.7, "top_p": 0.95,
            "max_tokens": 8096, "stream": True, "safe_mode": "BLOCK_NONE", "timeout": 30,
            "max_history": 20, "termux_storage": TERMUX_STORAGE_PATH if is_termux() else "",
            "supported_mime_types": ["image/png", "image/jpeg", "image/gif", "image/webp", "audio/mpeg", "audio/wav", "application/pdf", "text/plain"],
            "auto_save": True, "debug": False, "cache_enabled": True, "use_file_api": True,
            "max_file_size_mb": 32, "version": "4.3.0", "log_level": "INFO", "theme": "mystical", "verbose": False
        }
        for key, value in self._defaults.items():
            setattr(self, key, value)
        self.conversation_history: List[Dict[str, str]] = []
        self.api_keys: Dict[str, str] = {}
        self.current_api_key: str = "default"
        self.load()

    def load(self):
        if self.config_path.exists():
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            for key in self._defaults:
                if key in data:
                    setattr(self, key, data[key])
            fernet = Fernet(ENCRYPTION_KEY)
            if "api_keys" in data:
                self.api_keys = {k: fernet.decrypt(v.encode()).decode() for k, v in data["api_keys"].items()}
            self.current_api_key = data.get("current_api_key", "default")
            logger.setLevel(getattr(logging, self.log_level.upper()))
            console.theme = THEMES.get(self.theme, THEMES["mystical"])

    def save(self):
        data = {key: getattr(self, key) for key in self._defaults}
        fernet = Fernet(ENCRYPTION_KEY)
        data["api_keys"] = {k: fernet.encrypt(v.encode()).decode() for k, v in self.api_keys.items()}
        data["current_api_key"] = self.current_api_key
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.dump(data, f)

    def get_display_config(self) -> Table:
        table = Table(title="[config_header]Configuration[/config_header]", show_header=False)
        for key, value in self._defaults.items():
            table.add_row(f"[config_header]{key}[/config_header]", f"[config_value]{getattr(self, key)}[/config_value]")
        return table

class GeminiClient:
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.attachments: List[Dict[str, str]] = []
        self.uploaded_files: List[Dict[str, str]] = []
        self.start_time = datetime.now()
        self.last_call_duration = 0.0
        self.retry_count = 0

    def _validate_file(self, full_path: Path) -> Optional[str]:
        if not full_path.exists():
            console.print(f"[file_error]File not found: {full_path}[/file_error]")
            return None
        mime_type, _ = mimetypes.guess_type(str(full_path))
        if mime_type not in self.config.supported_mime_types:
            console.print(f"[file_error]Unsupported file type: {mime_type}[/file_error]")
            return None
        if full_path.stat().st_size / (1024 * 1024) > self.config.max_file_size_mb:
            console.print(f"[file_error]File size exceeds {self.config.max_file_size_mb}MB[/file_error]")
            return None
        return mime_type or "application/octet-stream"

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2), after=after_log(logger, logging.WARNING))
    def query(self, prompt: str) -> Dict[str, Any]:
        url = self.BASE_URL.format(model=self.config.model)
        params = {"key": self.config.api_keys[self.config.current_api_key]}
        payload = self._build_payload(prompt)
        start_time = time.time()
        with Progress(SpinnerColumn(), TextColumn("[progress.description]Querying AI..."), transient=True) as progress:
            task = progress.add_task("Querying", total=None)
            response = self.session.post(url, params=params, json=payload, timeout=self.config.timeout, stream=self.config.stream)
            response.raise_for_status()
            progress.update(task, completed=True)
        self.last_call_duration = time.time() - start_time
        if response.status_code == 429:  # Rate limit
            console.print("[warning]Rate limit exceeded[/warning]")
        return self._handle_streaming_response(response) if self.config.stream else response.json()

    def _handle_streaming_response(self, response: requests.Response) -> Dict[str, Any]:
        all_text = []
        with Live(console=console, refresh_per_second=10) as live:
            live.update("[response]Response:[/response]\n" + "═" * 60)
            for line in response.iter_lines():
                if line:
                    try:
                        json_line = json.loads(line.decode("utf-8"))
                        text = self._extract_text(json_line)
                        if text:
                            all_text.append(text)
                            live.update(f"[response]Response:[/response]\n{'═' * 60}\n{Markdown(''.join(all_text))}")
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON in stream: {line.decode('utf-8')}")
        return {"candidates": [{"content": {"parts": [{"text": "".join(all_text)}]}}]}

    def _extract_text(self, response: Dict) -> str:
        if "candidates" not in response or not response["candidates"]:
            return f"[warning]No response: {response.get('promptFeedback', {}).get('blockReasonMessage', 'Unknown')}[/warning]"
        return "".join(part["text"] for candidate in response["candidates"] for part in candidate.get("content", {}).get("parts", []) if "text" in part)

    def _build_payload(self, prompt: str) -> Dict[str, Any]:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": self.config.temperature, "top_p": self.config.top_p, "maxOutputTokens": self.config.max_tokens},
            "safetySettings": [{"category": cat, "threshold": self.config.safe_mode} for cat in ["HARASSMENT", "HATE_SPEECH", "SEXUALLY_EXPLICIT", "DANGEROUS_CONTENT"]]
        }
        if self.uploaded_files and self.config.use_file_api:
            payload["contents"][0]["parts"].extend({"fileData": {"mimeType": f["mime_type"], "fileUri": f["uri"]}} for f in self.uploaded_files)
            self.uploaded_files = []
        elif self.attachments:
            for att in self.attachments:
                with open(att["path"], "rb") as f:
                    payload["contents"][0]["parts"].append({"inlineData": {"mimeType": att["mime_type"], "data": b64encode(f.read()).decode("utf-8")}})
            self.attachments = []
        return payload

class CommandHandler:
    def __init__(self, config: Config, client: GeminiClient):
        self.config = config
        self.client = client
        self.history: List[Dict[str, str]] = config.conversation_history
        self.history_undo_stack: List[List[Dict[str, str]]] = []
        self.commands: Dict[str, Dict[str, Any]] = {}
        self.aliases: Dict[str, str] = {"/h": "/help", "/e": "/exit"}
        self.queries_made = 0
        self._register_commands()
        self._load_plugins()
        self.session = PromptSession(
            multiline=True, history=FileHistory(config.history_path), auto_suggest=AutoSuggestFromHistory(),
            completer=NestedCompleter.from_nested_dict({cmd: None for cmd in self.commands} | self.aliases | {"/attach": PathCompleter(), "/batch": PathCompleter()})
        )

    def register_command(self, name: str, desc: str, func: Callable, version: str = "1.0", author: str = "Unknown"):
        self.commands[name] = {"func": func, "desc": desc, "version": version, "author": author}

    def _register_commands(self):
        self.register_command("/help", "Show this help message or detailed command info [command]", self.show_help)
        self.register_command("/config", "Show current configuration", lambda args: console.print(self.config.get_display_config()))
        self.register_command("/history", "Show conversation history [regex]", self.show_history)
        self.register_command("/clear", "Clear conversation history", lambda args: self.clear_history())
        self.register_command("/undo", "Undo last history change", lambda args: self.undo_history())
        self.register_command("/attach", "Attach file [path]", self.attach_file)
        self.register_command("/detach", "Clear attachments", lambda args: self.client.attachments.clear() or self.client.uploaded_files.clear() or console.print("[info]Attachments cleared[/info]"))
        self.register_command("/model", f"Set model ({', '.join(SUPPORTED_MODELS)})", self.set_model)
        self.register_command("/exit", "Exit the CLI", lambda args: console.print("[info]Exiting...[/info]") or sys.exit(0))
        self.register_command("/key", "Set API key [name] [key]", self.set_api_key)
        self.register_command("/batch", "Process prompts from file [path]", self.batch_process)
        self.register_command("/export", "Export history to file [path]", self.export_history)
        self.register_command("/verbose", "Toggle verbose mode", self.toggle_verbose)
        self.register_command("/theme", "Set theme (mystical, dark)", self.set_theme)

    def _load_plugins(self):
        if not PLUGIN_DIR.exists():
            PLUGIN_DIR.mkdir()
            return
        for plugin_file in PLUGIN_DIR.glob("*.py"):
            spec = importlib.util.spec_from_file_location(plugin_file.stem, plugin_file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if hasattr(module, "register"):
                module.register(self)

    def show_help(self, args: List[str]):
        if not args:
            table = Table(title="Commands", show_header=False)
            for cmd, info in self.commands.items():
                table.add_row(f"[command]{cmd}[/command]", info["desc"])
            console.print(table)
        else:
            cmd = args[0].lower()
            if cmd in self.commands:
                info = self.commands[cmd]
                console.print(f"[command]{cmd}[/command]: {info['desc']}\nVersion: {info['version']}\nAuthor: {info['author']}")
            else:
                console.print(f"[error]Unknown command: {cmd}[/error]")

    def show_history(self, args: List[str]):
        pattern = re.compile(args[0]) if args else None
        if not self.history:
            console.print("[info]No history[/info]")
            return
        for i, entry in enumerate(self.history, 1):
            if pattern and not (pattern.search(entry["user"]) or pattern.search(entry["ai"])):
                continue
            console.print(f"[history_header]Entry {i}:[/history_header]\n[prompt]User:[/prompt] {entry['user']}")
            console.print(Panel(Markdown(entry["ai"]), title="AI Response", border_style="response"))

    def clear_history(self):
        self.history_undo_stack.append(self.history.copy())
        self.history = []
        self.config.conversation_history = []
        if self.config.auto_save:
            self.config.save()
        console.print("[info]History cleared[/info]")

    def undo_history(self):
        if not self.history_undo_stack:
            console.print("[warning]Nothing to undo[/warning]")
            return
        self.history = self.history_undo_stack.pop()
        self.config.conversation_history = self.history
        if self.config.auto_save:
            self.config.save()
        console.print("[info]History restored[/info]")

    def attach_file(self, args: List[str]):
        if not args:
            raise CommandError("File path required")
        full_path = get_termux_path(self.config, args[0])
        mime_type = self.client._validate_file(full_path)
        if mime_type:
            self.client.attachments.append({"path": str(full_path), "mime_type": mime_type})
            console.print(f"[info]Attached: [file_upload]{full_path.name}[/file_upload] ({mime_type})[/info]")

    def set_model(self, args: List[str]):
        if not args or args[0] not in SUPPORTED_MODELS:
            raise CommandError(f"Invalid model. Use: {', '.join(SUPPORTED_MODELS)}")
        self.config.model = args[0]
        self.config.save()
        console.print(f"[info]Model set to {args[0]}[/info]")

    def set_api_key(self, args: List[str]):
        if len(args) < 2:
            raise CommandError("Usage: /key [name] [key]")
        self.config.api_keys[args[0]] = args[1]
        self.config.current_api_key = args[0]
        self.config.save()
        console.print(f"[info]API key '{args[0]}' set[/info]")

    def batch_process(self, args: List[str]):
        if not args:
            raise CommandError("File path required")
        file_path = get_termux_path(self.config, args[0])
        with open(file_path, "r", encoding="utf-8") as f:
            prompts = [line.strip() for line in f if line.strip()]
        for prompt in prompts:
            self.process_query(prompt)

    def export_history(self, args: List[str]):
        if not args:
            raise CommandError("File path required")
        file_path = get_termux_path(self.config, args[0])
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(self.history, f, indent=2)
        console.print(f"[info]History exported to {file_path}[/info]")

    def toggle_verbose(self, args: List[str]):
        self.config.verbose = not self.config.verbose
        self.config.save()
        console.print(f"[info]Verbose mode {'enabled' if self.config.verbose else 'disabled'}[/info]")

    def set_theme(self, args: List[str]):
        if not args or args[0] not in THEMES:
            raise CommandError(f"Invalid theme. Use: {', '.join(THEMES.keys())}")
        self.config.theme = args[0]
        console.theme = THEMES[args[0]]
        self.config.save()
        console.print(f"[info]Theme set to {args[0]}[/info]")

    def handle_command(self, command: str):
        parts = command.split()
        cmd = parts[0].lower()
        args = parts[1:]
        cmd = self.aliases.get(cmd, cmd)
        if cmd in self.commands:
            self.commands[cmd]["func"](args)
        else:
            raise CommandError(f"Unknown command: {cmd}")

    def process_query(self, query: str):
        if not query.strip() or not self.config.api_keys.get(self.config.current_api_key):
            console.print("[error]No API key or empty query[/error]")
            return
        try:
            self.history.append({"user": query, "ai": ""})
            response = self.client.query(query)
            ai_text = self.client._extract_text(response)
            self.history[-1]["ai"] = ai_text
            self.config.conversation_history = self.history[-self.config.max_history:]
            if self.config.auto_save:
                self.config.save()
            self.queries_made += 1
            if self.config.verbose:
                console.print(f"[debug]Raw response: {response}\nDuration: {self.client.last_call_duration:.2f}s[/debug]")
            console.print(Panel(Markdown(ai_text), title="AI Response", border_style="response"))
        except Exception as e:
            console.print(f"[error]Query failed: {e}[/error]")

    def run(self):
        console.print(create_mystical_banner())
        while True:
            try:
                prompt_text = Text(f"Pyrmethus [{self.config.model}] {'#' if self.config.debug else '>'}", style="debug" if self.config.debug else "prompt")
                if self.client.attachments:
                    prompt_text.append(f" ({len(self.client.attachments)} attached)", style="info")
                if self.client.retry_count:
                    prompt_text.append(f" (retries: {self.client.retry_count})", style="warning")
                user_input = self.session.prompt(prompt_text)
                if not user_input.strip():
                    continue
                if user_input.startswith("/"):
                    self.handle_command(user_input)
                else:
                    self.process_query(user_input)
                if len(self.history) > self.config.max_history:
                    self.history = self.history[-self.config.max_history:]
                    self.config.conversation_history = self.history
            except KeyboardInterrupt:
                console.print("[info]Press Ctrl+D or use /exit to quit[/info]")
                continue
            except EOFError:
                break
            except Exception as e:
                console.print(f"[error]Unexpected error: {e}[/error]")

def main():
    config = Config()
    client = GeminiClient(config)
    argparser = argparse.ArgumentParser(description="Pyrmethus AI CLI for Gemini API")
    argparser.add_argument("--config", type=str, default=str(DEFAULT_CONFIG_PATH), help="Path to config file")
    args = argparser.parse_args()
    config.config_path = Path(args.config).expanduser()
    config.load()
    handler = CommandHandler(config, client)
    try:
        handler.run()
    finally:
        if config.auto_save:
            config.conversation_history = handler.history[-config.max_history:]
            config.save()
        runtime = datetime.now() - client.start_time
        console.print(f"[info]Session ended. Queries: {handler.queries_made}, Runtime: {runtime}, Avg Call: {client.last_call_duration:.2f}s[/info]")

if __name__ == "__main__":
    main()
EOF

# Create plugin files
touch plugins/echo.py
cat << 'EOF' > plugins/echo.py
def register(handler):
    def echo_command(args):
        handler.console.print(" ".join(args))
    handler.register_command("/echo", "Echo back the input", echo_command, version="1.0", author="Grok")
EOF

touch plugins/time.py
cat << 'EOF' > plugins/time.py
import datetime
def register(handler):
    def time_command(args):
        uptime = datetime.now() - handler.client.start_time
        handler.console.print(f"Current time: {datetime.now()}, Uptime: {uptime}")
    handler.register_command("/time", "Show current time and uptime", time_command, version="1.0", author="Grok")
EOF

touch plugins/math.py
cat << 'EOF' > plugins/math.py
def register(handler):
    def calc_command(args):
        try:
            result = eval(" ".join(args), {"__builtins__": {}})
            handler.console.print(f"Result: {result}")
        except Exception as e:
            handler.console.print(f"Calculation failed: {e}")
    handler.register_command("/calc", "Perform simple arithmetic (e.g., /calc 2 + 3)", calc_command, version="1.0", author="Grok")
EOF

touch plugins/weather.py
cat << 'EOF' > plugins/weather.py
def register(handler):
    def weather_command(args):
        city = " ".join(args) if args else "Unknown"
        handler.console.print(f"Weather in {city}: Sunny, 25°C (mock data)")
    handler.register_command("/weather", "Get weather for a city (mock)", weather_command, version="1.0", author="Grok")
EOF

touch plugins/quote.py
cat << 'EOF' > plugins/quote.py
import random
quotes = ["The only way to do great work is to love what you do.", "Be the change you wish to see."]
def register(handler):
    def quote_command(args):
        handler.console.print(f"Quote: {random.choice(quotes)}")
    handler.register_command("/quote", "Display a random quote", quote_command, version="1.0", author="Grok")
EOF

# Make the main script executable
chmod +x gemini

echo "Setup complete! Run './gemini' to start the CLI."

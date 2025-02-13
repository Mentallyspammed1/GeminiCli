#!/bin/sh

# --- Setup script for gemini_cli ---

# This script will create the directory structure for gemini_cli,
# create the necessary Python files, and inject the provided code into them.
#
# To run this script in Termux:
# 1. Save this code to a file named, for example, setup_gemini_cli.sh
# 2. Make the script executable: chmod +x setup_gemini_cli.sh
# 3. Run the script: ./setup_gemini_cli.sh

# --- Step 1: Create Directories ---
echo "Creating directories..."
mkdir -p gemini_cli/gemini_cli
if [ $? -eq 0 ]; then
  echo "Directories created successfully."
else
  echo "Error creating directories. Please check permissions or if directories already exist."
  exit 1
fi

# --- Step 2: Create and Populate __init__.py ---
echo "Creating gemini_cli/__init__.py..."
touch gemini_cli/gemini_cli/__init__.py
if [ $? -eq 0 ]; then
  echo "gemini_cli/__init__.py created."
  echo "Injecting content into gemini_cli/__init__.py..."
  cat <<'EOF' > gemini_cli/gemini_cli/__init__.py
# This file can be empty or contain package-level docstring
"""
Gemini AI CLI - An enhanced command-line interface for interacting with Google's Gemini AI.
"""
EOF
  if [ $? -eq 0 ]; then
    echo "Content injected into gemini_cli/__init__.py."
  else
    echo "Error injecting content into gemini_cli/__init__.py."
    exit 1
  fi
else
  echo "Error creating gemini_cli/__init__.py."
  exit 1
fi

# --- Step 3: Create and Populate cli.py ---
echo "Creating gemini_cli/cli.py..."
touch gemini_cli/gemini_cli/cli.py
if [ $? -eq 0 ]; then
  echo "gemini_cli/cli.py created."
  echo "Injecting content into gemini_cli/cli.py..."
  cat <<'EOF' > gemini_cli/gemini_cli/cli.py
#!/usr/bin/env python3

"""
Gemini AI CLI - An enhanced command-line interface for interacting with Google's Gemini AI.
Features PEP8 compliance and neon styling for improved visual feedback.
"""

import argparse
import json
import logging
import mimetypes
import os
import sys
import time
from base64 import b64encode
from pathlib import Path
from typing import Any, Dict, List, Optional

# Third-party imports
import autopep8
import requests
import yaml
from dotenv import load_dotenv
from prompt_toolkit import HTML, PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.logging import RichHandler
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.syntax import Syntax
from rich.table import Table

# Color constants for consistent styling
NEON_GREEN = "#39FF14"
NEON_CYAN = "#00FFFF"
NEON_RED = "#FF0000"
NEON_PINK = "#FF10F0"
NEON_YELLOW = "#FFFF00"

# Initialize environment and logging
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger(__name__)


class Config:
    """Configuration management for Gemini AI CLI with enhanced validation."""

    def __init__(self):
        """Initialize configuration with default values and neon theming."""
        self.api_key: str = os.environ.get("GEMINI_API_KEY", "")
        self.model_name: str = "gemini-pro"
        self.system_prompt: str = ""
        self.temperature: float = 0.9
        self.top_p: float = 1.0
        self.max_output_tokens: int = 2048
        self.history_file: Path = Path("~/.gemini_history").expanduser()
        self.max_history_entries: int = 2048
        self.history_load_limit: int = 100
        self.log_level: str = "INFO"
        self.theme: str = "monokai"
        self.auto_save: bool = True
        self.conversation_history: List[Dict[str, str]] = []
        self.auto_complete: bool = True
        self.stream: bool = False
        self.timeout: int = 60
        self.pep8_format: bool = True
        self.operation_timeout: int = 300
        self.operation_poll_interval: int = 5

    def __setattr__(self, name: str, value: Any) -> None:
        """
        Enhanced attribute validation with detailed error messages.

        Args:
            name: Attribute name to set
            value: Value to assign

        Raises:
            ValueError: If validation fails with neon-highlighted error message
        """
        try:
            if name == "api_key" and value:
                if not value.startswith("AI"):
                    raise ValueError(
                        f"[bold {NEON_RED}]Invalid API key format. Must start with 'AI'[/bold {NEON_RED}]"
                    )
            elif name == "max_output_tokens" and value > 8192:
                raise ValueError(
                    f"[bold {NEON_RED}]max_output_tokens cannot exceed 8192[/bold {NEON_RED}]"
                )
            super().__setattr__(name, value)
        except Exception as e:
            logger.error(f"Configuration error: {str(e)}", exc_info=True)
            raise

    @classmethod
    def load(cls, path: Path) -> "Config":
        """
        Load configuration from YAML file with enhanced error handling.

        Args:
            path: Path to configuration file

        Returns:
            Config: Initialized configuration object
        """
        cfg = cls()
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    config_data = yaml.safe_load(f)
                if config_data:
                    for key, value in config_data.items():
                        if hasattr(cfg, key):
                            if key == "history_file":
                                setattr(cfg, key, Path(value).expanduser())
                            else:
                                setattr(cfg, key, value)
            except Exception as e:
                logger.error(f"Error loading config: {e}", exc_info=True)
                Console().print(
                    f"[bold {NEON_RED}]Error loading config: {e}[/bold {NEON_RED}]"
                )
        return cfg

    def save(self, path: Path) -> None:
        """
        Save configuration to YAML file with secure handling.

        Args:
            path: Path to save configuration
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(path, "w", encoding="utf-8") as f:
                data_to_save = {
                    k: v for k, v in self.__dict__.items()
                    if not k.startswith('_') and k != 'api_key'
                }
                yaml.dump(data_to_save, f)
            Console().print(
                f"[bold {NEON_GREEN}]Configuration saved successfully[/bold {NEON_GREEN}]"
            )
        except Exception as e:
            logger.error(f"Error saving config: {e}", exc_info=True)
            Console().print(
                f"[bold {NEON_RED}]Error saving config: {e}[/bold {NEON_RED}]"
            )

    def _truncate_history_file(self):
        """Truncate the history file if it exceeds max_history_entries."""
        if self.history_file.exists():
            try:
                with open(self.history_file, "r") as f:
                    lines = f.readlines()
                if len(lines) > self.max_history_entries:
                    lines_to_keep = lines[-self.max_history_entries:]
                    with open(self.history_file, "w") as f:
                        f.writelines(lines_to_keep)
            except FileNotFoundError:
                logger.warning(f"[{NEON_YELLOW}]History file not found at {self.history_file}. Creating a new one.[/{NEON_YELLOW}]")
                self.history_file.touch()
            except Exception as e:
                logger.error(f"[{NEON_RED}]Error truncating history file at {self.history_file}: {e}[/{NEON_RED}]", exc_info=True)


def _get_file_content_and_mime(file_path: Path) -> Optional[Dict[str, str]]:
    """Reads file content and determines MIME type, returns None on error."""
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
        file_name = file_path.name
        mime_type, _ = mimetypes.guess_type(file_name)
        if not mime_type:
            mime_type = "application/octet-stream"  # default if type can't be guessed
        return {
            "mime_type": mime_type,
            "data": b64encode(file_content).decode("utf-8"),  # Convert to string
            "file_name": file_name,
        }
    except FileNotFoundError:
        logger.error(f"File not found: {file_path}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}", exc_info=True)
        return None


def _render_rich_output(text: str, theme: str, console: Console) -> str:
    """Renders text containing Markdown and code blocks to a string using Rich."""
    in_code_block = False
    formatted_lines = []
    code_buffer = []
    language = ""

    for line in text.split("\n"):
        if line.startswith("```"):
            if in_code_block:
                code = "\n".join(code_buffer)
                # Apply PEP8 formatting if enabled and it's a Python block
                if language == "python":
                    try:
                        code = autopep8.fix_code(code)
                    except Exception as e:
                        logger.error(
                            f"Error applying PEP8 formatting: {e}", exc_info=True
                        )
                        console.print(
                            "[yellow]Warning: Could not apply PEP8 formatting to code block:"
                            f" {e}. Ensure 'autopep8' is installed (pip install"
                            " autopep8).[/yellow]"
                        )
                syntax = Syntax(code, language or "text", theme=theme)
                formatted_lines.append(syntax)
                code_buffer = []
                in_code_block = False
            else:
                language = line[3:].strip()
                in_code_block = True
        elif in_code_block:
            code_buffer.append(line)
        else:
            # Render markdown for non-code content
            formatted_lines.append(Markdown(line))

    # Render the Markdown/Syntax objects to strings *before* joining
    rendered_lines = []
    for line in formatted_lines:
        if isinstance(line, Markdown):
            rendered_lines.append(
                "".join(str(segment.text) for segment in console.render(line))
            )  # render to text
        elif isinstance(line, Syntax):
            rendered_lines.append(
                "".join(str(segment.text) for segment in console.render(line))
            )  # render to text
        else:
            rendered_lines.append(str(line))  # Ensure everything is a string

    return "\\n".join(rendered_lines)


class GeminiClient:
    """
    Enhanced Gemini API client with streaming support and operation management.
    """

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, config: Config):
        """
        Initialize Gemini client with configuration.

        Args:
            config: Configuration object
        """
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.console = Console()

    def create_progress_bar(self, description: str) -> Progress:
        """
        Create a styled progress indicator for operations.

        Args:
            description: Progress bar description

        Returns:
            Progress: Configured progress bar instance
        """
        return Progress(
            SpinnerColumn(),
            TextColumn(f"[{NEON_CYAN}]{description}[/{NEON_CYAN}]"),
            transient=True,
        )

    def make_api_request(
        self,
        url: str,
        params: Dict[str, str],
        payload: Dict[str, Any],
        stream: bool = False,
    ) -> Optional[Any]:
        """
        Make API request with enhanced error handling and visual feedback.

        Args:
            url: API endpoint URL
            params: Query parameters
            payload: Request payload
            stream: Whether to stream the response

        Returns:
            API response or stream iterator
        """
        try:
            with self.create_progress_bar(
                "[bold]Generating response..."
            ) as progress:
                task_id = progress.add_task("", total=None)

                if stream:
                    response = self.session.post(
                        url,
                        json=payload,
                        params=params,
                        timeout=self.config.timeout,
                        stream=True,
                    )
                    response.raise_for_status()
                    return response.iter_lines()

                response = self.session.post(
                    url, json=payload, params=params, timeout=self.config.timeout
                )
                response.raise_for_status()
                progress.update(task_id, completed=1)
                return response.json()

        except requests.HTTPError as e:
            try:
                error_detail = (
                    e.response.json()
                    .get("error", {})
                    .get("message", "Unknown error")
                )
                self.console.print(
                    f"[bold {NEON_RED}]HTTP error {e.response.status_code}: "
                    f"{error_detail}[/bold {NEON_RED}]"
                )
            except ValueError:
                self.console.print(
                    f"[bold {NEON_RED}]HTTP error {e.response.status_code}: "
                    f"{e.response.text}[/bold {NEON_RED}]"
                )
            logger.error(f"API HTTP error: {e}", exc_info=True)

        except Exception as e:
            self.console.print(
                f"[bold {NEON_RED}]Error: {str(e)}[/bold {NEON_RED}]"
            )
            logger.error(f"API error: {e}", exc_info=True)
        return None

    def get_operation(self, operation_name: str) -> Dict:
        """
        Get operation status with enhanced feedback.

        Args:
            operation_name: Operation identifier

        Returns:
            Dict containing operation status
        """
        url = f"{self.BASE_URL}/operations/{operation_name}"
        params = {"key": self.config.api_key}

        with self.create_progress_bar(
            f"[bold]Checking operation {operation_name}..."
        ) as progress:
            progress.add_task("", total=None)
            return self.make_api_request(url, params, {})

    def wait_for_operation(self, operation_name: str) -> Dict:
        """
        Wait for operation completion with timeout and visual feedback.

        Args:
            operation_name: Operation identifier

        Returns:
            Dict containing operation result

        Raises:
            TimeoutError: If operation exceeds timeout
        """
        start_time = time.time()
        with self.create_progress_bar(
            f"[bold]Waiting for operation {operation_name}..."
        ) as progress:
            task_id = progress.add_task("", total=None)

            while time.time() - start_time < self.config.operation_timeout:
                op = self.get_operation(operation_name)
                if op.get("done", False):
                    progress.update(task_id, completed=1)
                    return op

                time.sleep(self.config.operation_poll_interval)

        raise TimeoutError(
            f"[bold {NEON_RED}]Operation {operation_name} timed out after "
            f"{self.config.operation_timeout} seconds[/bold {NEON_RED}]"
        )

    async def process_message_stream(self, stream_response: Any) -> str:
        """
        Process streaming response with visual feedback.

        Args:
            stream_response: Iterator of response chunks

        Returns:
            Accumulated response content
        """
        full_response = ""
        try:
            for line in stream_response:
                if line:
                    json_line = json.loads(line)
                    if "candidates" in json_line and json_line["candidates"]:
                        part_text = (
                            json_line["candidates"][0]["content"]["parts"][0].get(
                                "text", ""
                            )
                        )
                        full_response += part_text
                        self.console.print(
                            f"[{NEON_CYAN}]{part_text}[/{NEON_CYAN}]",
                            end="",
                            flush=True,
                        )
            print()  # New line after stream ends
            return full_response

        except json.JSONDecodeError as e:
            logger.error(
                f"Stream decode error: {e}, line: {line}", exc_info=True
            )
            self.console.print(
                f"[bold {NEON_RED}]Error decoding stream data: {e}[/bold {NEON_RED}]"
            )
        return full_response

    def send_message(self, prompt: str, max_output_tokens: Optional[int] = None) -> str:
        """
        Send a message to the Gemini API and get the response.

        Args:
            prompt: User prompt to send
            max_output_tokens: Maximum output tokens for the response

        Returns:
            str: API response text
        """
        payload = {
            "prompt": prompt,
            "max_tokens": max_output_tokens or self.config.max_output_tokens,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
        }
        response = self.make_api_request("generateContent", payload)
        if response and "choices" in response:
            text_response = response["choices"][0]["text"]
            self.config.conversation_history.append({"role": "user", "content": prompt})
            self.config.conversation_history.append(
                {"role": "assistant", "content": text_response}
            )
            return text_response
        self.console.print(
            f"[bold {NEON_RED}]Error: No valid response received from the API.[/bold {NEON_RED}]"
        )
        return ""


class CommandHandler:
    """
    Handles CLI commands with enhanced feedback and error handling.
    """

    def __init__(self, config: Config, client: GeminiClient):
        """
        Initialize command handler with configuration and client.
EOF
  if [ $? -eq 0 ]; then
    echo "Content injected into gemini_cli/cli.py."
  else
    echo "Error injecting content into gemini_cli/cli.py."
    exit 1
  fi
else
  echo "Error creating gemini_cli/cli.py."
  exit 1
fi

# --- Step 4: Create and Populate setup.py ---
echo "Creating setup.py..."
touch setup.py
if [ $? -eq 0 ]; then
  echo "setup.py created."
  echo "Injecting content into setup.py..."
  cat <<'EOF' > setup.py
from setuptools import setup, find_packages

setup(
    name="gemini_cli",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "autopep8",
        "requests",
        "pyyaml",
        "python-dotenv",
        "prompt_toolkit",
        "rich"
    ],
    entry_points={
        "console_scripts": [
            "gemini-cli=gemini_cli.cli:main",
        ],
    },
    author="Mentallyspammed1",
    author_email="your-email@example.com",
    description="Gemini AI CLI - An enhanced command-line interface for interacting with Google's Gemini AI.",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/Mentallyspammed1/GeminiCli",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.6',
)
EOF
  if [ $? -eq 0 ]; then
    echo "Content injected into setup.py."
  else
    echo "Error injecting content into setup.py."
    exit 1
  fi
else
  echo "Error creating setup.py."
  exit 1
fi

# --- Step 5: Create and Populate README.md ---
echo "Creating README.md..."
touch README.md
if [ $? -eq 0 ]; then
  echo "README.md created."
  echo "Injecting content into README.md..."
  cat <<'EOF' > README.md
# Gemini AI CLI

An enhanced command-line interface for interacting with Google's Gemini AI. Features PEP8 compliance and neon styling for improved visual feedback.

## Installation

\`\`\`bash
pip install .
\`\`\`
EOF
  if [ $? -eq 0 ]; then
    echo "Content injected into README.md."
  else
    echo "Error injecting content into README.md."
    exit 1
  fi
else
  echo "Error creating README.md."
  exit 1
fi

echo "Setup script finished."
echo "Directory structure and files for gemini_cli have been created."
echo "You can now navigate into the 'gemini_cli' directory and proceed with installation using 'pip install .' and configuration."

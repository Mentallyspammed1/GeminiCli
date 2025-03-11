#!/bin/bash

# --- Configuration ---
CONFIG_DIR="$HOME/.config/gemini"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
PLUGIN_DIR="$HOME/.gemini/plugins"
HISTORY_DIR="$HOME/.gemini"
HISTORY_FILE="$HISTORY_DIR/history"
GEMINI_CLI_SCRIPT="$HOME/gemini_cli.py" # Replace with your actual python script name if different
GEMINI_LAUNCHER_SCRIPT="$HOME/bin/gemini"
PYTHON_EXECUTABLE=$(command -v python3)

# --- Create Directories if they don't exist ---
echo -e "\n[cyan]Creating directories if needed...[/cyan]"
mkdir -p "$CONFIG_DIR"
mkdir -p "$PLUGIN_DIR"
mkdir -p "$HISTORY_DIR"
mkdir -p "$HOME/bin"

# --- Create Default Configuration File if it doesn't exist ---
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "[cyan]Creating default configuration file: $CONFIG_FILE[/cyan]"
    echo -e "model: gemini-1.5-pro\n\
temperature: 0.7\n\
top_p: 0.95\n\
max_tokens: 4096\n\
stream: true\n\
safe_mode: BLOCK_NONE\n\
theme: default\n\
timeout: 30\n\
max_history: 20\n\
api_keys:\n\
  default: YOUR_GEMINI_API_KEY  # Replace with your API key or set GOOGLE_API_KEY env variable\n\
current_api_key: default\n\
cache_enabled: true\n\
use_file_api: true\n\
history_path: $HOME/.gemini/history\n\
plugin_dir: $HOME/.gemini/plugins\n\
debug_mode: false" > "$CONFIG_FILE"
    echo -e "[green]Default configuration file created at: $CONFIG_FILE[/green]"
else
    echo -e "[info]Configuration file already exists: $CONFIG_FILE[/info]"
fi

# --- Create Gemini Launcher Script if it doesn't exist ---
if [ ! -f "$GEMINI_LAUNCHER_SCRIPT" ]; then
    echo -e "[cyan]Creating Gemini launcher script: $GEMINI_LAUNCHER_SCRIPT[/cyan]"
    echo -e "#!/bin/bash\n\n\
# Path to Python 3 executable\n\
PYTHON_EXECUTABLE=\"\$(${PYTHON_EXECUTABLE} -c 'import sys, os; print(os.path.realpath(sys.executable))')\"\n\
\n\
# Path to your Gemini CLI Python script\n\
GEMINI_CLI_SCRIPT=\"$GEMINI_CLI_SCRIPT\"\n\n\
if [ -z \"\$PYTHON_EXECUTABLE\" ]; then\n\
    echo \"Error: python3 executable not found. Please ensure Python 3 is installed in Termux.\"\n\
    exit 1\n\
fi\n\n\
if [ ! -f \"\$GEMINI_CLI_SCRIPT\" ]; then\n\
    echo \"Error: Gemini CLI script not found at '\$GEMINI_CLI_SCRIPT'. Please adjust GEMINI_CLI_SCRIPT variable in the gemini script.\"\n\
    exit 1\n\
fi\n\n\
# Execute the Python script\n\
\"\$PYTHON_EXECUTABLE\" \"\$GEMINI_CLI_SCRIPT\" \"\$@\"" > "$GEMINI_LAUNCHER_SCRIPT"
    echo -e "[green]Gemini launcher script created at: $GEMINI_LAUNCHER_SCRIPT[/green]"
else
    echo -e "[info]Gemini launcher script already exists: $GEMINI_LAUNCHER_SCRIPT[/info]"
fi

# --- Make Gemini Launcher Script Executable ---
echo -e "[cyan]Making Gemini launcher script executable...[/cyan]"
chmod +x "$GEMINI_LAUNCHER_SCRIPT"
echo -e "[green]Gemini launcher script is now executable.[/green]"

echo -e "\n[bold green]Setup complete![/bold green]"
echo -e "[info]You can now run Gemini AI CLI by typing '[bold]gemini[/bold]' in Termux.[/info]"
echo -e "[warning]Please remember to replace '[bold]YOUR_GEMINI_API_KEY[/bold]' in '$CONFIG_FILE' with your actual Gemini API key.[/warning]\n"
```

**Explanation of the Script:**

1.  **`#!/bin/bash`**: Shebang line, indicating it's a Bash script.
2.  **Configuration Variables**: Defines variables for directory and file paths, making the script configurable at the top.  **Important:**  `GEMINI_CLI_SCRIPT="$HOME/gemini_cli.py"` - **You might need to adjust this if your Python script has a different name or location.**
3.  **Create Directories**:
    *   `echo -e "\n[cyan]Creating directories if needed...[/cyan]"`:  Prints a cyan colored message using `echo -e` (for enabling escape sequences like colors). `\n` adds a newline for better formatting.
    *   `mkdir -p "$CONFIG_DIR"`, `mkdir -p "$PLUGIN_DIR"`, `mkdir -p "$HISTORY_DIR"`, `mkdir -p "$HOME/bin"`: Uses `mkdir -p` to create directories recursively. The `-p` flag ensures that parent directories are created if they don't exist, and it doesn't error out if the directory already exists.
4.  **Create Default Configuration File**:
    *   `if [ ! -f "$CONFIG_FILE" ]; then`: Checks if the configuration file (`$CONFIG_FILE`) **does not exist** (`! -f`).
    *   `echo -e "[cyan]Creating default configuration file: $CONFIG_FILE[/cyan]"`:  Prints a cyan message.
    *   `echo -e "..." > "$CONFIG_FILE"`:  Uses `echo -e` to print the multi-line YAML configuration content and redirects (`>`) the output to the `$CONFIG_FILE`.
        *   **Important**:  **`YOUR_GEMINI_API_KEY` is a placeholder in the `api_keys: default:` section. The user must manually edit the `config.yaml` file and replace this placeholder with their actual Gemini API key.**
    *   `echo -e "[green]Default configuration file created at: $CONFIG_FILE[/green]"`: Prints a green success message.
    *   `else`: If the file already exists.
    *   `echo -e "[info]Configuration file already exists: $CONFIG_FILE[/info]"`: Prints an info message.
5.  **Create Gemini Launcher Script**:
    *   Similar `if [ ! -f "$GEMINI_LAUNCHER_SCRIPT" ]; then` check to see if the launcher script exists.
    *   `echo -e "[cyan]Creating Gemini launcher script: $GEMINI_LAUNCHER_SCRIPT[/cyan]"`: Prints a cyan message.
    *   `echo -e "..." > "$GEMINI_LAUNCHER_SCRIPT"`:  Uses `echo -e` to print the multi-line Bash script content and redirects (`>`) it to `$GEMINI_LAUNCHER_SCRIPT`.
        *   The Bash script code is similar to what was described in the previous response, dynamically finding the `python3` executable and executing your Gemini CLI Python script.
    *   `echo -e "[green]Gemini launcher script created at: $GEMINI_LAUNCHER_SCRIPT[/green]"`: Prints a green success message.
    *   `else`: If the script already exists.
    *   `echo -e "[info]Gemini launcher script already exists: $GEMINI_LAUNCHER_SCRIPT[/info]"`: Prints an info message.
6.  **Make Launcher Script Executable**:
    *   `echo -e "[cyan]Making Gemini launcher script executable...[/cyan]"`: Prints a cyan message.
    *   `chmod +x "$GEMINI_LAUNCHER_SCRIPT"`: Uses `chmod +x` to make the launcher script executable.
    *   `echo -e "[green]Gemini launcher script is now executable.[/green]"`: Prints a green success message.
7.  **Completion Messages**:
    *   `echo -e "\n[bold green]Setup complete![/bold green]"`: Prints a bold green "Setup complete!" message.
    *   `echo -e "[info]You can now run Gemini AI CLI by typing '[bold]gemini[/bold]' in Termux.[/info]"`:  Prints an info message on how to run the CLI.
    *   `echo -e "[warning]Please remember to replace '[bold]YOUR_GEMINI_API_KEY[/bold]' in '$CONFIG_FILE' with your actual Gemini API key.[/warning]\n"`: Prints a warning message reminding the user to set their API key in the configuration file.

**How to Use the Setup Script:**

1.  **Save the code:** Copy the entire code block above and save it as a file, for example, `setup_gemini_cli.sh` in your Termux home directory (`~`).
2.  **Make the setup script executable:**
    ```bash
    chmod +x setup_gemini_cli.sh
    ```
3.  **Run the setup script:**
    ```bash
    ./setup_gemini_cli.sh
    ```

After running this script, you should have:

*   The necessary directories created.
*   A default `config.yaml` file in `~/.config/gemini/`.
*   A `gemini` launcher script in `~/bin/` that is executable.

You should then be able to type `gemini` in Termux to launch your Gemini AI CLI. **Remember to edit the `config.yaml` file and replace `YOUR_GEMINI_API_KEY` with your actual API key!**

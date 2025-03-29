import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import mime from 'mime-types';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// --- Neon Sigils (Chalk Theme) ---
const neon = {
    userPrompt: chalk.cyan.bold,
    aiResponse: chalk.white,
    aiThinking: chalk.yellow.dim,
    systemInfo: chalk.blue.bold,
    commandHelp: chalk.green,
    filePath: chalk.magenta,
    warning: chalk.yellow.bold,
    error: chalk.red.bold,
    debug: chalk.gray.dim,
    promptMarker: chalk.cyan.bold("You: "),
    aiMarker: chalk.green.bold("AI: "),
    pasteMarker: chalk.yellow.bold("Paste> "),
    sysMarker: chalk.blue.bold("[System] "),
    errorMarker: chalk.red.bold("[Error] "),
    warnMarker: chalk.yellow.bold("[Warning] "),
};

// --- Configuration Glyphs (Argument Parsing) ---
const argv = yargs(hideBin(process.argv))
    .option('api-key', {
        alias: 'k',
        type: 'string',
        description: 'Google Generative AI API Key (or use GEMINI_API_KEY env var)',
    })
    .option('model', {
        alias: 'm',
        type: 'string',
        default: process.env.GEMINI_MODEL || 'gemini-2.0-flash-thinking-exp-01-21',
        description: 'Gemini model name (e.g., gemini-1.5-pro-latest) (or use GEMINI_MODEL env var)',
    })
    .option('temperature', {
        alias: 't',
        type: 'number',
        default: parseFloat(process.env.GEMINI_DEFAULT_TEMP || '0.8'),
        description: 'Generation temperature (0.0-1.0+) (or use GEMINI_DEFAULT_TEMP env var)',
    })
    .option('history-file', {
        alias: 'h',
        type: 'string',
        default: process.env.GEMINI_HISTORY_FILE || './gemini_chat_history.json',
        description: 'Path to chat history JSON file (or use GEMINI_HISTORY_FILE env var)',
    })
    .option('safety', {
        alias: 's',
        type: 'string',
        default: (process.env.GEMINI_SAFETY_SETTING || 'BLOCK_NONE').toUpperCase(),
        description: 'Safety threshold (BLOCK_NONE, BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH) (or use GEMINI_SAFETY_SETTING env var)',
        choices: ['BLOCK_NONE', 'BLOCK_LOW_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_ONLY_HIGH'],
        coerce: (val) => val.toUpperCase(), // Ensure uppercase for matching
    })
    .option('debug', {
        type: 'boolean',
        default: process.env.DEBUG_MODE === 'true',
        description: 'Enable verbose debug logging (or set DEBUG_MODE=true env var)',
    })
    .help()
    .alias('help', 'H')
    .argv;

// --- Environment Weaving (.env) ---
dotenv.config();

// --- Core Constants & Settings ---
const API_KEY = argv.apiKey || process.env.GEMINI_API_KEY;
const MODEL_NAME = argv.model;
const HISTORY_FILE = path.resolve(argv.historyFile);
const MAX_HISTORY_LENGTH = parseInt(process.env.GEMINI_MAX_HISTORY || '50', 10);
let IS_DEBUG_MODE = argv.debug;

// --- Configurable Safety Wards ---
const SAFETY_MAP = {
    'BLOCK_NONE': HarmBlockThreshold.BLOCK_NONE,
    'BLOCK_LOW_AND_ABOVE': HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    'BLOCK_MEDIUM_AND_ABOVE': HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    'BLOCK_ONLY_HIGH': HarmBlockThreshold.BLOCK_ONLY_HIGH,
};
const requestedSafety = argv.safety;
const SAFETY_THRESHOLD = SAFETY_MAP[requestedSafety] || HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: SAFETY_THRESHOLD },
];

// --- System Instruction ---
const SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT ||
    `You are a helpful and versatile AI assistant running in a command-line interface.
    Your output is styled with neon colors via chalk.
    Focus on being concise, accurate, and efficient.
    Prioritize tasks related to coding (explanation, generation, debugging in various languages like JavaScript, Python, Shell, etc.), text creation, summarization, and general problem-solving.
    Format code snippets using Markdown fences (\`\`\`language\\ncode\n\`\`\`).
    Be mindful that the user is interacting via a command line. Assume the user is in a Unix-like environment (like Termux or Linux) unless specified otherwise.
    If asked to generate files, provide the content formatted within code blocks.`;

// --- Default Generation Config ---
const DEFAULT_TEMPERATURE = argv.temperature;
const generationConfigDefaults = {
    maxOutputTokens: 8192,
};

// --- Command Constants ---
const CMD_PREFIX = '/';
const PASTE_CMD = `${CMD_PREFIX}paste`;
const ENDPASTE_CMD = `${CMD_PREFIX}endpaste`;
const TEMP_CMD = `${CMD_PREFIX}temp`;
const SAVE_CMD = `${CMD_PREFIX}save`;
const FILE_CMD = `${CMD_PREFIX}file`; // Alias /f, /load, /l
const LOAD_CMD = `${CMD_PREFIX}load`;
const SAFETY_CMD = `${CMD_PREFIX}safety`;
const HELP_CMD = `${CMD_PREFIX}help`; // Alias /?
const EXIT_CMD = `${CMD_PREFIX}exit`; // Alias /quit, /q
const CLEAR_CMD = `${CMD_PREFIX}clear`;
const HISTORY_CMD = `${CMD_PREFIX}history`;
const MODEL_CMD = `${CMD_PREFIX}model`;
const DEBUG_CMD = `${CMD_PREFIX}debug`;

// --- Text File Extensions ---
const TEXT_LIKE_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte',
    '.py', '.pyw', '.java', '.scala', '.kt', '.kts', '.groovy',
    '.cs', '.fs', '.vb', '.c', '.cpp', '.h', '.hpp', '.hxx', '.cc', '.hh', '.cxx',
    '.go', '.rs', '.swift', '.dart', '.lua', '.php', '.phtml', '.rb', '.pl', '.pm', '.t',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.sql', '.gql', '.graphql', '.cypher', '.r', '.jl',
    '.html', '.htm', '.xhtml', '.xml', '.md', '.markdown', '.rst', '.txt', '.rtf', '.log',
    '.css', '.scss', '.sass', '.less', '.styl',
    '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.envrc', '.properties',
    '.csv', '.tsv', '.conf', '.cfg',
    '.dockerfile', 'makefile', 'cmakelists.txt', '.gitignore', '.gitattributes', '.editorconfig',
    '.patch', '.diff', '.gradle', '.kts', '.pom', '.csproj', '.sln',
    '.tex', '.bib', '.sty', '.svg',
    '.plantuml', '.puml', '.mermaid', '.mmd', '.hcl', '.tf', '.pem', '.crt', '.key'
]);

// --- State Variables ---
let conversationHistory = [];
let chatSession;
let generativeModelInstance;
let isPasting = false;
let pasteBuffer = [];
let currentTemperature = DEFAULT_TEMPERATURE;
let lastAiTextResponse = null;
let fileToSaveTo = null;
let rl = null;
let aiIsResponding = false;

// --- Utility Functions ---
function logDebug(message, data = null) {
    if (IS_DEBUG_MODE) {
        console.log(neon.debug(`[Debug] ${message}`), data ? neon.debug(JSON.stringify(data, null, 2)) : '');
    }
}

function logError(message, error = null) {
    console.error(neon.errorMarker + neon.error(message));
    if (error) {
        let details = error.message || String(error);
        if (IS_DEBUG_MODE && error.stack) details += `\nStack: ${error.stack}`;
        if (error.response?.data) details += `\nAPI Response Data: ${JSON.stringify(error.response.data, null, 2)}`;
        console.error(neon.error(`  > Details: ${details}`));
    }
}

function logWarning(message) {
    console.log(neon.warnMarker + neon.warning(message));
}

function logSystem(message) {
    console.log(neon.sysMarker + neon.systemInfo(message));
}

function clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1Bc');
}

async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function loadHistory() {
    if (!HISTORY_FILE) {
        logWarning("History file path is not configured. Skipping history load.");
        return [];
    }
    logDebug(`Loading history from: ${neon.filePath(HISTORY_FILE)}`);
    try {
        if (!(await fileExists(HISTORY_FILE))) {
            logSystem(`No history file found at ${neon.filePath(HISTORY_FILE)}. Starting fresh.`);
            return [];
        }
        const historyData = await fs.promises.readFile(HISTORY_FILE, 'utf8');
        if (!historyData.trim()) {
            logDebug(`History file ${neon.filePath(HISTORY_FILE)} is empty. Starting.`);
            return [];
        }
        let parsedHistory;
        try {
            parsedHistory = JSON.parse(historyData);
        } catch (parseError) {
            logError(`JSON parsing failed for history file ${neon.filePath(HISTORY_FILE)}. Starting fresh.`, parseError);
            return [];
        }
        if (Array.isArray(parsedHistory)) {
            conversationHistory = parsedHistory; // Directly assign loaded history
            logSystem(`Loaded ${neon.commandHelp(conversationHistory.length)} history entries.`);
        } else {
            logWarning(`Invalid history format in ${neon.filePath(HISTORY_FILE)}. Starting fresh.`);
        }
    } catch (error) {
        logError(`Error loading history from ${neon.filePath(HISTORY_FILE)}. Starting fresh.`, error);
    }
    return conversationHistory; // Return current history, which might be empty or loaded
}


async function saveHistory() {
    if (!HISTORY_FILE) {
        logDebug("History file path not configured. Skipping history save.");
        return;
    }
    logDebug(`Saving history to: ${neon.filePath(HISTORY_FILE)}`);
    try {
        await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(conversationHistory, null, 2), 'utf8');
        logDebug(`History saved to ${neon.filePath(HISTORY_FILE)}.`);
    } catch (error) {
        logError('Failed to save chat history.', error);
    }
}

async function fileToGenerativePart(filePath) {
    const resolvedPath = path.resolve(filePath);
    logDebug(`Processing file: ${resolvedPath}`);

    try {
        await fs.promises.access(resolvedPath, fs.constants.R_OK);
        const stats = await fs.promises.stat(resolvedPath);

        if (!stats.isFile()) {
            logError(`Path is not a file: ${neon.filePath(resolvedPath)}`);
            return null;
        }
        if (stats.size > 50 * 1024 * 1024) {
            logWarning(`File exceeds 50MB limit: ${neon.filePath(resolvedPath)}`);
            return null;
        }

        const fileExtension = path.extname(resolvedPath).toLowerCase();
        let mimeType = mime.lookup(resolvedPath) || 'application/octet-stream';
        let data = await fs.promises.readFile(resolvedPath);

        if (TEXT_LIKE_EXTENSIONS.has(fileExtension) || mimeType.startsWith('text/')) {
            logDebug(`Sending as text: ${neon.filePath(resolvedPath)}, MIME: ${mimeType}`);
            return { text: `\`\`\`${fileExtension.slice(1)}\n${data.toString('utf8')}\n\`\`\`` };
        } else if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
            logDebug(`Sending as inline data: ${neon.filePath(resolvedPath)}, MIME: ${mimeType}`);
            return { inlineData: { mimeType, data: data.toString('base64') } };
        } else {
            logWarning(`Sending as generic data: ${neon.filePath(resolvedPath)}, MIME: ${mimeType}`);
            return { inlineData: { mimeType: 'application/octet-stream', data: data.toString('base64') } };
        }
    } catch (error) {
        logError(`Failed to process file: ${neon.filePath(resolvedPath)}`, error);
        return null;
    }
}

function showHelp() {
    logSystem("\n--- Gemini Chat Client Commands ---");
    console.log(`${neon.commandHelp(EXIT_CMD + ", /quit, /q")}: Exit the chat.`);
    console.log(`${neon.commandHelp(CLEAR_CMD)}:         Clear chat history and reset session.`);
    console.log(`${neon.commandHelp(HISTORY_CMD)}:       Show the current session history.`);
    console.log(`${neon.commandHelp(FILE_CMD + ", /f, /load, /l")} ${neon.filePath('<path>')} [prompt]: Send file (text, code, image, etc.).`);
    console.log(`  ${chalk.gray('Example: /f script.js Explain this code')}`);
    console.log(`${neon.commandHelp(PASTE_CMD)}:         Enter multi-line paste mode.`);
    console.log(`${neon.commandHelp(ENDPASTE_CMD)}:      Exit multi-line paste mode and send.`);
    console.log(`${neon.commandHelp(TEMP_CMD)} ${neon.filePath('<value>')}:    Set temperature (0.0-1.0+).`);
    console.log(`${neon.commandHelp(SAVE_CMD)} ${neon.filePath('<filename>')}: Save next AI response to file.`);
    console.log(`${neon.commandHelp(MODEL_CMD)}:         Show current model name.`);
    console.log(`${neon.commandHelp(SAFETY_CMD)}:        Show current safety setting.`);
    console.log(`${neon.commandHelp(DEBUG_CMD)}:         Toggle debug logging.`);
    console.log(`${neon.commandHelp(HELP_CMD + ", /?")}:         Show this help message.`);
    logSystem("---------------------------------\n");
}

// --- Initialization ---
async function initializeChat() {
    if (!API_KEY) {
        logError('GEMINI_API_KEY is not set. Provide via .env or --api-key flag.');
        process.exit(1);
    }

    try {
        const aiClient = new GoogleGenerativeAI(API_KEY);
        generativeModelInstance = aiClient.getGenerativeModel({ model: MODEL_NAME, safetySettings, systemInstruction: SYSTEM_PROMPT });
        logSystem(`Using model: ${neon.filePath(MODEL_NAME)}, Safety: ${neon.filePath(requestedSafety)}`);
        if (IS_DEBUG_MODE) logSystem(neon.debug('Debug mode enabled'));

        await loadHistory();
        chatSession = generativeModelInstance.startChat({ history: conversationHistory });
        logDebug('Chat session initialized.');
    } catch (error) {
        logError('Initialization error.', error);
        process.exit(1);
    }
}

// --- Core Chat Logic ---
async function handleSendMessage(messageParts) {
    aiIsResponding = true;
    process.stdout.write(neon.aiMarker + neon.aiThinking('Thinking...'));
    try {
        const result = await chatSession.sendMessageStream(messageParts, { generationConfig: generationConfigDefaults });
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(neon.aiMarker);

        let fullTextResponse = '';
        for await (const chunk of result.stream) {
            const textChunk = chunk.text();
            process.stdout.write(neon.aiResponse(textChunk));
            fullTextResponse += textChunk;
        }
        process.stdout.write('\n');
        conversationHistory.push({ role: 'user', parts: messageParts });
        conversationHistory.push({ role: 'model', parts: [{ text: fullTextResponse }] });
        await saveHistory();
        lastAiTextResponse = fullTextResponse;
        if (fileToSaveTo) {
            await fs.promises.writeFile(fileToSaveTo, lastAiTextResponse, 'utf8');
            logSystem(`AI response saved to ${neon.filePath(fileToSaveTo)}`);
            fileToSaveTo = null;
        }
    } catch (error) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        logError('Error during message generation.', error);
    } finally {
        aiIsResponding = false;
        rl.prompt();
    }
}

// --- Command Handlers ---
async function handleFileCommand(filePathArg) {
    if (!filePathArg) {
        logWarning(`Usage: ${FILE_CMD} <file_path> [prompt text]`);
        return;
    }
    const [filePath, promptText] = filePathArg.split(' ');
    const fileContent = await fileToGenerativePart(filePath);
    if (fileContent) {
        const messageParts = promptText ? [fileContent, { text: promptText }] : [fileContent];
        await handleSendMessage(messageParts);
    }
}

function handleTempCommand(tempValue) {
    const temp = parseFloat(tempValue);
    if (temp >= 0 && temp <= 1) {
        generationConfigDefaults.temperature = temp;
        logSystem(`Temperature set to ${neon.filePath(temp)}`);
    } else {
        logWarning('Temperature value must be between 0 and 1.');
    }
}

function handleSaveCommand(filename) {
    if (!filename) {
        logWarning(`Usage: ${SAVE_CMD} <filename>`);
        return;
    }
    fileToSaveTo = path.resolve(filename);
    logSystem(`Will save next response to ${neon.filePath(fileToSaveTo)}`);
}

async function handleClearCommand() {
    conversationHistory = [];
    await saveHistory();
    logSystem('Chat history cleared.');
}

function handleHistoryCommand() {
    logSystem("\n--- Chat History ---");
    conversationHistory.forEach((msg, index) => {
        const prefix = msg.role === 'user' ? neon.promptMarker : neon.aiMarker;
        const text = msg.parts.map(part => part.text).join(' ');
        console.log(`${prefix}Turn ${index + 1}: ${text.slice(0, 100)}...`);
    });
    logSystem("--------------------\n");
}

function handleDebugCommand() {
    IS_DEBUG_MODE = !IS_DEBUG_MODE;
    logSystem(`Debug mode ${IS_DEBUG_MODE ? neon.commandHelp('enabled') : neon.warning('disabled')}`);
}


// --- Readline Interface ---
async function setupReadline() {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: neon.promptMarker });

    rl.on('line', async (line) => {
        if (aiIsResponding) return;
        const input = line.trim();

        if (input.startsWith(CMD_PREFIX)) {
            const [command, ...argsArray] = input.slice(1).split(' ');
            const args = argsArray.join(' ');

            switch (command.toLowerCase()) {
                case 'exit': case 'quit': case 'q': rl.close(); return;
                case 'clear': await handleClearCommand(); break;
                case 'history': handleHistoryCommand(); break;
                case 'file': case 'f': case 'load': case 'l': await handleFileCommand(args); break;
                case 'paste': isPasting = true; pasteBuffer = []; logSystem('Paste mode ON. Type /endpaste to send.'); break;
                case 'temp': handleTempCommand(args); break;
                case 'save': handleSaveCommand(args); break;
                case 'model': logSystem(`Current model: ${neon.filePath(MODEL_NAME)}`); break;
                case 'safety': logSystem(`Safety setting: ${neon.filePath(requestedSafety)}`); break;
                case 'debug': handleDebugCommand(); break;
                case 'help': case '?': showHelp(); break;
                default: logWarning(`Unknown command: ${command}. Type /help for commands.`);
            }
        } else if (isPasting) {
            if (input.toLowerCase() === ENDPASTE_CMD) {
                isPasting = false;
                await handleSendMessage([{ text: pasteBuffer.join('\n') }]);
                pasteBuffer = [];
                logSystem('Pasted content sent.');
            } else {
                pasteBuffer.push(input);
            }
        } else if (input) {
            await handleSendMessage([{ text: input }]);
        }
        rl.prompt();
    }).on('close', () => {
        logSystem('Chat session ended.');
        process.exit(0);
    });

    logSystem(`Type ${neon.commandHelp(HELP_CMD)} or ${neon.commandHelp('/?')} for help.`);
    rl.prompt();
}

// --- Main ---
async function main() {
    clearConsole();
    logSystem('--- Gemini AI Chat Client ---');

    await initializeChat();
    await setupReadline();
}

main().catch(error => logError('Fatal error', error));

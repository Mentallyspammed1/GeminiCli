import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import mime from 'mime-types';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { highlight } from 'cli-highlight';

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

// --- Configuration Glyphs (Argument Parsing with Fallbacks) ---
const argv = yargs(hideBin(process.argv))
    .option('api-key', { alias: 'k', type: 'string', description: 'Google Generative AI API Key' })
    .option('model', { alias: 'm', type: 'string', default: process.env.GEMINI_MODEL || 'gemini-2.0-flash-thinking-exp-01-21', description: 'Gemini model name' })
    .option('temperature', { alias: 't', type: 'number', default: parseFloat(process.env.GEMINI_DEFAULT_TEMP || '0.8'), description: 'Generation temperature (0.0-1.0+)' })
    .option('history-file', { alias: 'h', type: 'string', default: process.env.GEMINI_HISTORY_FILE || './gemini_chat_history.json', description: 'Chat history JSON file path' })
    .option('safety', {
        alias: 's', type: 'string', default: (process.env.GEMINI_SAFETY_SETTING || 'BLOCK_NONE').toUpperCase(),
        description: 'Safety threshold', choices: ['BLOCK_NONE', 'BLOCK_LOW_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_ONLY_HIGH'], coerce: (val) => val.toUpperCase()
    })
    .option('debug', { type: 'boolean', default: process.env.DEBUG_MODE === 'true', description: 'Enable debug logging' })
    .option('highlight', { type: 'boolean', default: true, description: 'Enable syntax highlighting' })
    .option('max-history', { type: 'number', default: parseInt(process.env.GEMINI_MAX_HISTORY || '50', 10), description: 'Max history turns to keep' })
    .help().alias('help', 'H').argv;

// --- Environment Setup ---
dotenv.config();

// --- Settings & Constants ---
const API_KEY = argv.apiKey || process.env.GEMINI_API_KEY;
const MODEL_NAME = argv.model;
const HISTORY_FILE = path.resolve(argv.historyFile);
const MAX_HISTORY_LENGTH = argv.maxHistory;
let IS_DEBUG_MODE = argv.debug;
const IS_HIGHLIGHT_ENABLED = argv.highlight;

// --- Safety Settings ---
const SAFETY_MAP = {
    BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,
    BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH
};
const requestedSafety = argv.safety;
const SAFETY_THRESHOLD = SAFETY_MAP[requestedSafety] || HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: SAFETY_THRESHOLD }
];

// --- System Prompt ---
const SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT || `You are a helpful AI assistant in a command-line interface.
    Use standard language names (javascript, python, etc.) for syntax highlighting in Markdown code blocks (\`\`\`language\ncode\n\`\`\`).
    Provide concise, accurate, and efficient responses for coding, text tasks, and problem-solving.`;

// --- Generation Config ---
const generationConfigDefaults = { temperature: argv.temperature, maxOutputTokens: 8192 };

// --- Command Definitions ---
const CMD = {
    PREFIX: '/',
    PASTE: '/paste', END_PASTE: '/endpaste', TEMP: '/temp', SAVE: '/save',
    FILE: '/file', LOAD: '/load', SAFETY: '/safety', HELP: '/help',
    EXIT: '/exit', CLEAR: '/clear', HISTORY: '/history', MODEL: '/model',
    DEBUG: '/debug', HIGHLIGHT: '/highlight', SEARCH: '/search', // New command
    ALIAS: { F: '/f', L: '/l', Q: '/q', QUIT: '/quit', '?': '/?' }
};

// --- Supported Languages for Highlighting ---
const supportedLanguages = new Set(['javascript', 'python', 'java', 'cpp', 'html', 'css', 'json', 'yaml', 'markdown', 'sql', 'bash', 'typescript']);

// --- Text-Based File Extensions ---
const TEXT_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'swift', 'php', 'rb', 'sh', 'sql', 'html', 'md', 'css', 'json', 'yaml', 'txt']);

// --- State Variables ---
let chatHistory = [];
let currentChatSession;
let aiModelInstance;
let isPastingMode = false;
let pasteBufferContent = [];
let currentGenTemperature = argv.temperature;
let lastTextResponse = null;
let saveFilePath = null;
let readlineInterface = null;
let isAiThinking = false;
let isHighlightingActive = IS_HIGHLIGHT_ENABLED;

// --- Utility Functions ---
const logDebug = (message, data = null) => IS_DEBUG_MODE && console.log(neon.debug(`[Debug] ${message}`), data ? neon.debug(JSON.stringify(data, null, 2)) : '');
const logError = (message, error = null) => {
    console.error(neon.errorMarker + neon.error(message));
    if (error) {
        let details = error.message || String(error);
        if (IS_DEBUG_MODE && error.stack) details += `\nStack: ${error.stack}`;
        console.error(neon.error(`  > Details: ${details}`));
    }
};
const logWarning = (message) => console.log(neon.warnMarker + neon.warning(message));
const logSystem = (message) => console.log(neon.sysMarker + neon.systemInfo(message));
const clearConsole = () => process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1Bc');
const checkFileExists = async (filePath) => {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
};

// --- History Load/Save ---
async function loadChatHistory() {
    if (!HISTORY_FILE) {
        logWarning("History file not configured, history will not be loaded or saved.");
        return;
    }
    logDebug(`Loading chat history from: ${neon.filePath(HISTORY_FILE)}`);
    try {
        if (!await checkFileExists(HISTORY_FILE)) {
            logSystem(`No history file found at ${neon.filePath(HISTORY_FILE)}. Starting new chat.`);
            return;
        }
        const historyData = await fs.promises.readFile(HISTORY_FILE, 'utf8');
        if (!historyData.trim()) {
            logDebug(`History file ${neon.filePath(HISTORY_FILE)} is empty.`);
            return;
        }
        chatHistory = JSON.parse(historyData);
        logSystem(`Loaded ${neon.commandHelp(chatHistory.length)} chat history entries.`);
    } catch (error) {
        logError(`Error loading chat history from ${neon.filePath(HISTORY_FILE)}. Starting new chat.`, error);
        chatHistory = [];
    }
}

async function saveChatHistory() {
    if (!HISTORY_FILE) {
        logDebug("History file path not set, skipping history save.");
        return;
    }
    logDebug(`Saving chat history to: ${neon.filePath(HISTORY_FILE)}`);
    try {
        await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2), 'utf8');
        logDebug('Chat history saved successfully.');
    } catch (error) {
        logError('Failed to save chat history.', error);
    }
}

// --- File to Generative Part ---
async function convertFileToGenerativePart(filePath) {
    const resolvedPath = path.resolve(filePath);
    logDebug(`Converting file to generative part: ${resolvedPath}`);
    try {
        if (!await checkFileExists(resolvedPath)) {
            logError(`Invalid file path provided: ${neon.filePath(resolvedPath)}`);
            return null;
        }
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isFile()) {
            logError(`Path is not a file: ${neon.filePath(resolvedPath)}`);
            return null;
        }
        if (stats.size > 50 * 1024 * 1024) {
            logWarning(`File size exceeds 50MB limit: ${neon.filePath(resolvedPath)}`);
            return null;
        }

        const fileExtension = path.extname(resolvedPath).slice(1).toLowerCase();
        const mimeType = mime.lookup(resolvedPath) || 'application/octet-stream';
        const fileData = await fs.promises.readFile(resolvedPath);

        if (TEXT_EXTENSIONS.has(fileExtension) || mimeType.startsWith('text/')) {
            logDebug(`Treating as text file, MIME type: ${mimeType}`);
            return { text: `\`\`\`${fileExtension || 'text'}\n${fileData.toString('utf8')}\n\`\`\`` };
        } else if (mimeType.startsWith('image/')) {
            logDebug(`Treating as image, MIME type: ${mimeType}`);
            return { inlineData: { mimeType, data: fileData.toString('base64') } };
        } else {
            logWarning(`Unsupported file type treated as binary, MIME type: ${mimeType}`);
            return { inlineData: { mimeType: 'application/octet-stream', data: fileData.toString('base64') } };
        }
    } catch (error) {
        logError(`Error processing file: ${neon.filePath(resolvedPath)}`, error);
        return null;
    }
}

// --- Help Display with Detailed Messages ---
const helpMessages = {
    [CMD.HELP]: "Display this help message",
    [CMD.EXIT]: "Exit the chat session",
    [CMD.CLEAR]: "Clear chat history",
    [CMD.HISTORY]: "Show chat history",
    [CMD.FILE]: "Load a file and optionally provide a prompt: /file <file_path> [prompt_text] or /f",
    [CMD.LOAD]: "Alias for /file",
    [CMD.PASTE]: "Start multi-line paste mode (end with /endpaste)",
    [CMD.TEMP]: "Set generation temperature (0.0-1.0): /temp <value>",
    [CMD.SAVE]: "Save next AI response to file: /save <filename>",
    [CMD.MODEL]: "Display current model",
    [CMD.SAFETY]: "Display current safety setting",
    [CMD.DEBUG]: "Toggle debug mode",
    [CMD.HIGHLIGHT]: "Toggle syntax highlighting",
    [CMD.SEARCH]: "Search chat history: /search <query>"
};

function displayHelp() {
    logSystem("\n--- Command Help ---");
    Object.entries(helpMessages).forEach(([cmd, desc]) => {
        const aliases = Object.entries(CMD.ALIAS).filter(([, v]) => v === cmd).map(([k]) => `/${k}`).join(', ');
        console.log(`${neon.commandHelp(cmd + (aliases ? ` (${aliases})` : ''))}: ${neon.systemInfo(desc)}`);
    });
    logSystem("--------------------\n");
}

// --- Chat Initialization ---
async function initializeChatSession() {
    if (!API_KEY) {
        logError('GEMINI_API_KEY is missing. Configure via environment or CLI.');
        process.exit(1);
    }
    try {
        aiModelInstance = new GoogleGenerativeAI(API_KEY).getGenerativeModel({
            model: MODEL_NAME,
            safetySettings,
            systemInstruction: SYSTEM_PROMPT
        });
        logSystem(`AI Model: ${neon.filePath(MODEL_NAME)}, Safety: ${neon.filePath(requestedSafety)}`);
        if (IS_DEBUG_MODE) logDebug('Debug mode is enabled.');

        await loadChatHistory();
        currentChatSession = aiModelInstance.startChat({ history: chatHistory });
        logDebug('Chat session initialized.');
    } catch (error) {
        logError('Failed to initialize chat session.', error);
        process.exit(1);
    }
}

// --- Send Message to AI with Enhanced Highlighting and History Management ---
async function sendMessageToAI(messageParts) {
    if (isAiThinking) return;
    isAiThinking = true;
    process.stdout.write(neon.aiMarker + neon.aiThinking('Thinking...'));
    try {
        const streamResult = await currentChatSession.sendMessageStream(messageParts, { generationConfig: generationConfigDefaults });
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(neon.aiMarker);

        let aiResponseText = '';
        for await (const chunk of streamResult.stream) {
            aiResponseText += chunk.text();
        }

        let highlightedResponse = aiResponseText;
        if (isHighlightingActive) {
            const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
            highlightedResponse = aiResponseText.replace(codeBlockRegex, (match, languageHint, code) => {
                if (!languageHint || languageHint.toLowerCase() === 'neon') return match;
                const lang = supportedLanguages.has(languageHint.toLowerCase()) ? languageHint.toLowerCase() : 'text';
                try {
                    return `\`\`\`${lang}\n${highlight(code, { language: lang, ignoreIllegals: true })}\n\`\`\``;
                } catch (error) {
                    logWarning(`Highlighting failed for '${languageHint}'. Using plain text.`);
                    return `\`\`\`text\n${code}\n\`\`\``;
                }
            });
        }

        process.stdout.write(neon.aiResponse(highlightedResponse) + '\n');
        chatHistory.push({ role: 'user', parts: messageParts });
        chatHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
        
        // Enhanced History Management: Trim history if exceeds max length
        if (chatHistory.length > MAX_HISTORY_LENGTH) {
            chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
            logDebug(`Trimmed history to last ${MAX_HISTORY_LENGTH} entries.`);
        }
        
        await saveChatHistory();
        lastTextResponse = aiResponseText;
        if (saveFilePath) {
            await fs.promises.writeFile(saveFilePath, lastTextResponse, 'utf8');
            logSystem(`AI response saved to ${neon.filePath(saveFilePath)}`);
            saveFilePath = null;
        }
    } catch (apiError) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        logError('Error generating response from AI.', apiError);
    } finally {
        isAiThinking = false;
        readlineInterface.prompt();
    }
}

// --- Command Handling with Input Validation ---
async function processFileCommand(filePathArg) {
    if (!filePathArg) {
        logWarning(`Usage: ${CMD.FILE} <file_path> [prompt_text]`);
        return;
    }
    const [filePath, ...promptParts] = filePathArg.split(' ');
    const promptText = promptParts.join(' ');
    const fileContent = await convertFileToGenerativePart(filePath);
    if (fileContent) {
        await sendMessageToAI(promptText ? [fileContent, { text: promptText }] : [fileContent]);
    }
}

function processTempCommand(tempValue) {
    if (!tempValue) {
        logWarning(`Usage: ${CMD.TEMP} <value>`);
        return;
    }
    const temp = parseFloat(tempValue);
    if (isNaN(temp) || temp < 0 || temp > 1) {
        logWarning('Temperature must be a number between 0.0 and 1.0.');
        return;
    }
    currentGenTemperature = temp;
    generationConfigDefaults.temperature = temp;
    logSystem(`Temperature set to ${neon.filePath(temp)}`);
}

function processSaveCommand(filename) {
    if (!filename) {
        logWarning(`Usage: ${CMD.SAVE} <filename>`);
        return;
    }
    saveFilePath = path.resolve(filename);
    if (fs.existsSync(saveFilePath)) {
        logWarning(`File ${neon.filePath(saveFilePath)} exists and will be overwritten.`);
    }
    logSystem(`Next AI response will be saved to: ${neon.filePath(saveFilePath)}`);
}

async function processClearCommand() {
    chatHistory = [];
    await saveChatHistory();
    logSystem('Chat history cleared.');
}

function processHistoryCommand() {
    logSystem("\n--- Chat History ---");
    if (chatHistory.length === 0) {
        console.log(chalk.gray('(Empty history)'));
    } else {
        chatHistory.forEach((message, index) => {
            const sender = message.role === 'user' ? neon.promptMarker : neon.aiMarker;
            const content = message.parts.map(part => part.text).join(' ').slice(0, 200) + (message.parts[0].text.length > 200 ? '...' : '');
            console.log(`${sender}Turn ${index + 1}: ${content}`);
        });
    }
    logSystem("--------------------\n");
}

function processSearchCommand(query) {
    if (!query) {
        logWarning(`Usage: ${CMD.SEARCH} <query>`);
        return;
    }
    const results = chatHistory.filter((message, index) =>
        message.parts.some(part => part.text.toLowerCase().includes(query.toLowerCase()))
    );
    logSystem(`\n--- Search Results for "${query}" ---`);
    if (results.length === 0) {
        console.log(chalk.gray('(No matches found)'));
    } else {
        results.forEach((message, index) => {
            const sender = message.role === 'user' ? neon.promptMarker : neon.aiMarker;
            const content = message.parts.map(part => part.text).join(' ').slice(0, 200) + '...';
            console.log(`${sender}Turn ${chatHistory.indexOf(message) + 1}: ${content}`);
        });
    }
    logSystem("--------------------\n");
}

function toggleDebugCommand() {
    IS_DEBUG_MODE = !IS_DEBUG_MODE;
    logSystem(`Debug mode ${IS_DEBUG_MODE ? neon.commandHelp('enabled') : neon.warning('disabled')}`);
}

function toggleHighlightCommand() {
    isHighlightingActive = !isHighlightingActive;
    logSystem(`Syntax highlighting ${isHighlightingActive ? neon.commandHelp('enabled') : neon.warning('disabled')}`);
}

// --- Auto-Completion for Readline ---
function completer(line) {
    const input = line.trim();
    const commandList = Object.keys(CMD).filter(k => typeof CMD[k] === 'string' && CMD[k].startsWith('/'))
        .map(k => CMD[k]).concat(Object.values(CMD.ALIAS));
    
    if (input.startsWith(CMD.PREFIX)) {
        const [cmdPart] = input.slice(1).split(' ');
        const hits = commandList.filter(c => c.startsWith(input));
        
        if (cmdPart && (cmdPart === 'file' || cmdPart === 'f' || cmdPart === 'load' || cmdPart === 'l' || cmdPart === 'save')) {
            const args = input.split(' ').slice(1).join(' ');
            const dirPath = args ? path.dirname(args) || '.' : '.';
            try {
                const files = fs.readdirSync(dirPath).filter(f => f.includes(path.basename(args || '')));
                return [files.map(f => `${CMD.PREFIX}${cmdPart} ${path.join(dirPath, f)}`), input];
            } catch {
                return [hits, input];
            }
        }
        return [hits.length ? hits : commandList, input];
    }
    return [[], input];
}

// --- Readline Setup with Auto-Completion ---
async function setupReadlineInterface() {
    readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: neon.promptMarker,
        completer
    });

    readlineInterface.on('line', async (line) => {
        if (isAiThinking) return;
        const input = line.trim();

        if (input.startsWith(CMD.PREFIX)) {
            const [command, args] = [input.slice(1).split(' ')[0].toLowerCase(), input.slice(1).split(' ').slice(1).join(' ')];
            switch (command) {
                case CMD.EXIT.slice(1): case CMD.ALIAS.QUIT.slice(1): case CMD.ALIAS.Q.slice(1):
                    readlineInterface.close();
                    return;
                case CMD.CLEAR.slice(1):
                    await processClearCommand();
                    break;
                case CMD.HISTORY.slice(1):
                    processHistoryCommand();
                    break;
                case CMD.FILE.slice(1): case CMD.ALIAS.F.slice(1): case CMD.LOAD.slice(1): case CMD.ALIAS.L.slice(1):
                    await processFileCommand(args);
                    break;
                case CMD.PASTE.slice(1):
                    isPastingMode = true;
                    pasteBufferContent = [];
                    logSystem('Paste mode ON. Type /endpaste to send.');
                    break;
                case CMD.END_PASTE.slice(1):
                    if (isPastingMode) {
                        isPastingMode = false;
                        await sendMessageToAI([{ text: pasteBufferContent.join('\n') }]);
                        pasteBufferContent = [];
                        logSystem('Pasted content sent.');
                    }
                    break;
                case CMD.TEMP.slice(1):
                    processTempCommand(args);
                    break;
                case CMD.SAVE.slice(1):
                    processSaveCommand(args);
                    break;
                case CMD.MODEL.slice(1):
                    logSystem(`Current model: ${neon.filePath(MODEL_NAME)}`);
                    break;
                case CMD.SAFETY.slice(1):
                    logSystem(`Safety setting: ${neon.filePath(requestedSafety)}`);
                    break;
                case CMD.DEBUG.slice(1):
                    toggleDebugCommand();
                    break;
                case CMD.HIGHLIGHT.slice(1):
                    toggleHighlightCommand();
                    break;
                case CMD.SEARCH.slice(1):
                    processSearchCommand(args);
                    break;
                case CMD.HELP.slice(1): case CMD.ALIAS['?'].slice(1):
                    displayHelp();
                    break;
                default:
                    logWarning(`Unknown command: ${command}. Type /help for commands.`);
            }
        } else if (isPastingMode) {
            pasteBufferContent.push(input);
        } else if (input) {
            await sendMessageToAI([{ text: input }]);
        }
        readlineInterface.setPrompt(isPastingMode ? neon.pasteMarker : neon.promptMarker);
        readlineInterface.prompt();
    }).on('close', async () => {
        logSystem('Chat session ended. Saving history...');
        await saveChatHistory();
        console.log(neon.magenta.bold('Goodbye!'));
        process.exit(0);
    }).on('SIGINT', () => {
        if (isPastingMode) {
            isPastingMode = false;
            pasteBufferContent = [];
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            logWarning('Paste mode cancelled.');
            readlineInterface.prompt();
        } else if (isAiThinking) {
            logWarning("AI is responding, please wait... (Ctrl+C again to force quit)");
        } else {
            readlineInterface.question(neon.warning('Exit session? (y/N) '), (answer) => {
                if (answer.match(/^y(es)?$/i)) readlineInterface.close();
                else readlineInterface.prompt();
            });
        }
    });

    displayHelp();
    readlineInterface.prompt();
}

// --- Main Function ---
async function main() {
    clearConsole();
    logSystem('--- Gemini AI Chat Client ---');
    await initializeChatSession();
    await setupReadlineInterface();
}

// --- Run the Main Function ---
main().catch(error => logError('Fatal error during execution.', error));
Ah, seeker! You return, seeking not just modification, but a true *enhancement*—a metamorphosis of the Javascript spell. You desire deeper power, greater resilience, and a visual manifestation akin to the ethereal glow of neon sigils in the digital ether.

As Pyrmethus, I accept this challenge. I shall delve into the script's core, analyzing its currents and reinforcing its structure. We shall weave in new capabilities, refine its existing magic, and infuse it with the vibrant, high-contrast luminescence you desire, using the potent `chalk` library within the Javascript realm itself.

**Analysis & Enhancement Strategy:**

1.  **Visual Metamorphosis (Neon):** We will conjure a dedicated `chalk` theme using bright, bold colors (Cyan, Magenta, Green, Yellow) against dimmer backgrounds or text, evoking a neon glow for prompts, AI responses, system messages, and errors.
2.  **Streaming Consciousness:** The most profound upgrade! We shall modify the script to *stream* the AI's response. No longer will you wait in silence; you shall witness the AI's thoughts manifest character by character, a dynamic flow of information.
3.  **Robust Configuration:** We will empower the script with `yargs` to accept command-line arguments, allowing overrides for the API key, model, temperature, and history file, enhancing flexibility beyond environment variables.
4.  **Safety Ward Reconfiguration:** The previously disabled safety settings will be restored, but made *configurable* via an environment variable (`GEMINI_SAFETY_SETTING`), allowing you to choose the desired level of protection (e.g., `BLOCK_NONE`, `BLOCK_LOW_AND_ABOVE`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_ONLY_HIGH`).
5.  **Error Resilience:** Fortify error handling, especially around file operations and API interactions, providing clearer feedback within the neon interface.
6.  **Code Refinement:** Improve structure and readability where possible, breaking down larger functions for clarity.

Prepare yourself. The incantation is about to be reforged!

```python
# -*- coding: utf-8 -*-
# Pyrmethus channeling enhancements...
from colorama import init, Fore, Style

# Initialize Colorama for Termux compatibility
init()

# --- Enhanced Javascript Code (as a string in Python) ---
enhanced_js_code = """#!/usr/bin/env node

// --- Arcane Imports ---
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
        description: 'Google Generative AI API Key',
    })
    .option('model', {
        alias: 'm',
        type: 'string',
        description: 'Gemini model name (e.g., gemini-1.5-pro-latest)',
    })
    .option('temperature', {
        alias: 't',
        type: 'number',
        description: 'Generation temperature (0.0-1.0+)',
    })
    .option('history-file', {
        alias: 'h',
        type: 'string',
        description: 'Path to chat history JSON file',
    })
    .option('safety', {
        alias: 's',
        type: 'string',
        description: 'Safety threshold (BLOCK_NONE, BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH)',
        choices: ['BLOCK_NONE', 'BLOCK_LOW_AND_ABOVE', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_ONLY_HIGH']
    })
    .help()
    .alias('help', 'H')
    .argv;

// --- Environment Weaving (.env) ---
dotenv.config();

// --- Core Constants & Settings ---
const API_KEY = argv.apiKey || process.env.GEMINI_API_KEY;
// ** MODEL HAS BEEN CHANGED BACK TO A STABLE DEFAULT - OVERRIDE WITH ENV OR FLAG **
const MODEL_NAME = argv.model || process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest';
const HISTORY_FILE = path.resolve(argv.historyFile || process.env.GEMINI_HISTORY_FILE || './gemini_chat_history.json');
const MAX_HISTORY_LENGTH = parseInt(process.env.GEMINI_MAX_HISTORY || '50', 10); // Max history turns

// --- Configurable Safety Wards ---
const SAFETY_MAP = {
    'BLOCK_NONE': HarmBlockThreshold.BLOCK_NONE,
    'BLOCK_LOW_AND_ABOVE': HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    'BLOCK_MEDIUM_AND_ABOVE': HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    'BLOCK_ONLY_HIGH': HarmBlockThreshold.BLOCK_ONLY_HIGH,
};
const requestedSafety = (argv.safety || process.env.GEMINI_SAFETY_SETTING || 'BLOCK_MEDIUM_AND_ABOVE').toUpperCase();
const SAFETY_THRESHOLD = SAFETY_MAP[requestedSafety] || HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: SAFETY_THRESHOLD },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: SAFETY_THRESHOLD },
];

// --- System Instruction ---
const SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT ||
    `You are a helpful and versatile AI assistant running in a Termux terminal environment.
    Your output is styled with neon colors via chalk.
    Focus on being concise, accurate, and efficient.
    Prioritize tasks related to coding (explanation, generation, debugging in various languages like JavaScript, Python, Shell, etc.), text creation, summarization, and general problem-solving.
    Format code snippets using Markdown fences (\`\`\`language\\ncode\\n\`\`\`).
    Be mindful that the user is interacting via a command line.`;

// --- Default Generation Config ---
const DEFAULT_TEMPERATURE = argv.temperature ?? parseFloat(process.env.GEMINI_DEFAULT_TEMP || '0.8');
const generationConfigDefaults = {
    // topP: 0.95, // Often controlled by temperature, uncomment if needed
    // topK: 64, // Often controlled by temperature, uncomment if needed
    maxOutputTokens: 8192, // Max tokens *per response turn*
};

// --- Command Constants ---
const CMD_PREFIX = '/';
const PASTE_CMD = `${CMD_PREFIX}paste`;
const ENDPASTE_CMD = `${CMD_PREFIX}endpaste`;
const TEMP_CMD = `${CMD_PREFIX}temp`;
const SAVE_CMD = `${CMD_PREFIX}save`;
const FILE_CMD = `${CMD_PREFIX}file`; // Alias /f
const LOAD_CMD = `${CMD_PREFIX}load`; // Alias /l
const SAFETY_CMD = `${CMD_PREFIX}safety`;
const HELP_CMD = `${CMD_PREFIX}help`; // Alias /?
const EXIT_CMD = `${CMD_PREFIX}exit`; // Alias /quit, /q
const CLEAR_CMD = `${CMD_PREFIX}clear`;
const HISTORY_CMD = `${CMD_PREFIX}history`;
const MODEL_CMD = `${CMD_PREFIX}model`;

// --- Text File Extensions (MIME Type Override Hint) ---
const TEXT_LIKE_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.oh', // JavaScript family
    '.py', '.pyw',             // Python
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', // Data/Config formats
    '.md', '.txt', '.rtf', '.log', '.conf', '.cfg', // Text formats
    '.csv', '.tsv',             // Tabular data
    '.html', '.htm', '.css', '.scss', '.less', // Web
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', // Programming
    '.sh', '.bash', '.zsh', '.ps1', // Shell scripts
    '.sql', '.dockerfile', 'makefile', '.gitignore' // Other dev files
]);

// --- State Variables ---
let conversationHistory = [];
let chatSession;
let generativeModelInstance;
let isPasting = false;
let pasteBuffer = [];
let currentTemperature = DEFAULT_TEMPERATURE;
let lastAiTextResponse = null; // Store the last AI text response for /save
let fileToSaveTo = null; // Store filename for the next /save command
let rl = null; // Readline interface instance
let aiIsResponding = false; // Flag to prevent user input during AI streaming

// --- Utility Functions ---

function logError(message, error = null) {
    console.error(neon.errorMarker + neon.error(message));
    if (error) {
        // Show more detail, but keep it concise for the terminal
        console.error(neon.error(`  > Details: ${error.message || error.toString()}`));
        // Optional: Add more debug logging based on an env var
        if (process.env.DEBUG_MODE === 'true' && error.stack) {
             console.error(neon.debug(error.stack));
        }
    }
}

function logWarning(message) {
    console.log(neon.warnMarker + neon.warning(message));
}

function logSystem(message) {
    console.log(neon.sysMarker + neon.systemInfo(message));
}

function clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\\x1B[2J\\x1B[0f' : '\\x1Bc');
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
    try {
        if (await fileExists(HISTORY_FILE)) {
            const historyData = await fs.promises.readFile(HISTORY_FILE, 'utf8');
            if (!historyData.trim()) {
                logSystem(`History file ${neon.filePath(HISTORY_FILE)} is empty. Starting fresh.`);
                return [];
            }
            const parsedHistory = JSON.parse(historyData);
            if (Array.isArray(parsedHistory)) {
                const turns = Math.floor(MAX_HISTORY_LENGTH / 2);
                const startIndex = Math.max(0, parsedHistory.length - turns * 2);
                logSystem(`Loaded ${neon.commandHelp(parsedHistory.length - startIndex)} entries from history.`);
                return parsedHistory.slice(startIndex);
            } else {
                logWarning(`Invalid history file format at ${neon.filePath(HISTORY_FILE)}. Starting fresh.`);
                await fs.promises.writeFile(HISTORY_FILE, '[]', 'utf8'); // Clear invalid file
                return [];
            }
        }
        return [];
    } catch (error) {
        if (error instanceof SyntaxError) {
            logError(`Failed to parse JSON in history file ${neon.filePath(HISTORY_FILE)}. Starting fresh.`, error);
            // Attempt to backup corrupted history
            try { await fs.promises.rename(HISTORY_FILE, `${HISTORY_FILE}.corrupted_${Date.now()}`); } catch {}
            await fs.promises.writeFile(HISTORY_FILE, '[]', 'utf8');
        } else {
            logError(`Failed to read history from ${neon.filePath(HISTORY_FILE)}. Starting fresh.`, error);
        }
        return [];
    }
}

async function saveHistory(history) {
    try {
        const turns = Math.floor(MAX_HISTORY_LENGTH / 2);
        const startIndex = Math.max(0, history.length - turns * 2);
        const historyToSave = history.slice(startIndex);
        await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(historyToSave, null, 2), 'utf8');
    } catch (error) {
        logError('Failed to save chat history.', error);
    }
}

async function fileToGenerativePart(filePath) {
    const resolvedPath = path.resolve(filePath);
    try {
        // Check readability first
        await fs.promises.access(resolvedPath, fs.constants.R_OK);

        let detectedMimeType = mime.lookup(resolvedPath);
        const fileExtension = path.extname(resolvedPath).toLowerCase();
        let effectiveMimeType = detectedMimeType;
        let isSupported = false;

        // Prioritize text-like extensions
        if (TEXT_LIKE_EXTENSIONS.has(fileExtension)) {
            isSupported = true;
            if (!detectedMimeType || !detectedMimeType.startsWith('text/')) {
                effectiveMimeType = 'text/plain'; // Force text
            }
        }
        // Check standard supported non-text MIME types
        else if (detectedMimeType && /^(image\\/(jpeg|png|webp|heic|heif)|video\\/|audio\\/)/.test(detectedMimeType)) {
            isSupported = true;
        }
        // Allow any detected text/* type
        else if (detectedMimeType && detectedMimeType.startsWith('text/')) {
            isSupported = true;
        }

        if (!isSupported) {
            logWarning(`Unsupported file type: MIME "${detectedMimeType || 'unknown'}", extension "${fileExtension}". Trying as text/plain.`);
            // Attempt to send as text/plain as a fallback
             effectiveMimeType = 'text/plain';
             // logSystem(`Supported types include common images, video, audio, text, and code extensions.`);
             // return null; // Strict - uncomment to disallow unsupported types
        }
         if (!effectiveMimeType) {
            logWarning(`Could not determine MIME for ${fileExtension}, using application/octet-stream.`);
            effectiveMimeType = 'application/octet-stream';
        }


        const data = await fs.promises.readFile(resolvedPath);
        return { inlineData: { data: data.toString('base64'), mimeType: effectiveMimeType } };

    } catch (error) {
        if (error.code === 'ENOENT') {
             logError(`File not found: ${neon.filePath(resolvedPath)}`);
        } else if (error.code === 'EACCES') {
             logError(`Permission denied reading file: ${neon.filePath(resolvedPath)}`);
        } else {
             logError(`Failed to process file: ${neon.filePath(resolvedPath)}`, error);
        }
        return null;
    }
}

function showHelp() {
    logSystem("\n--- Gemini Chat Client Commands ---");
    console.log(`${neon.commandHelp(EXIT_CMD + ", /quit, /q")}: Exit the chat.`);
    console.log(`${neon.commandHelp(CLEAR_CMD)}:         Clear chat history and reset session.`);
    console.log(`${neon.commandHelp(HISTORY_CMD)}:       Show the current session history.`);
    console.log(`${neon.commandHelp(FILE_CMD + ", /f, " + LOAD_CMD + ", /l")} ${neon.filePath('<path>')} [prompt]: Send a file (text, code, image, video, audio)`);
    console.log(`  ${chalk.gray('Example: /f script.js Explain this code')}`);
    console.log(`${neon.commandHelp(PASTE_CMD)}:         Enter multi-line paste mode.`);
    console.log(`${neon.commandHelp(ENDPASTE_CMD)}:      Exit multi-line paste mode and send.`);
    console.log(`${neon.commandHelp(TEMP_CMD)} ${neon.filePath('<value>')}:    Set AI temperature (creativity, 0.0-1.0+). Current: ${neon.filePath(currentTemperature)}`);
    console.log(`${neon.commandHelp(SAVE_CMD)} ${neon.filePath('<filename>')}: Save the *next* AI text response to a file.`);
    console.log(`${neon.commandHelp(MODEL_CMD)}:         Show the current AI model name.`);
    console.log(`${neon.commandHelp(SAFETY_CMD)}:        Show the current safety setting (${neon.filePath(requestedSafety)}).`);
    console.log(`${neon.commandHelp(HELP_CMD + ", /?")}:         Show this help message.`);
    logSystem("---------------------------------\n");
}

// --- Initialization ---
async function initializeChat() {
    if (!API_KEY) {
        logError('GEMINI_API_KEY is not set. Provide it via .env file or --api-key flag.');
        process.exit(1);
    }

    try {
        const aiClient = new GoogleGenerativeAI(API_KEY);
        generativeModelInstance = aiClient.getGenerativeModel({
            model: MODEL_NAME,
            safetySettings, // Use the configured settings
            systemInstruction: SYSTEM_PROMPT
        });
        logSystem(`Using AI model: ${neon.filePath(MODEL_NAME)}`);
        logSystem(`Safety threshold: ${neon.filePath(requestedSafety)}`);

        conversationHistory = await loadHistory();
        chatSession = generativeModelInstance.startChat({
            history: conversationHistory.map(msg => ({
                role: msg.role,
                parts: msg.parts // Assuming parts are already in the correct format
            })),
            // generationConfig passed per-message
        });

    } catch (error) {
        logError(`Failed to initialize AI model "${MODEL_NAME}". Check model name, API key permissions, and safety settings.`, error);
        process.exit(1);
    }
}

// --- Core Chat Logic (Streaming) ---
async function handleSendMessage(messageParts) {
    aiIsResponding = true;
    let fullResponseText = '';
    let responseParts = []; // To store parts for history
    let thinkingMessage = neon.aiThinking('AI is thinking...');
    process.stdout.write(neon.aiMarker + thinkingMessage);

    try {
        const currentGenerationConfig = {
            ...generationConfigDefaults,
            temperature: currentTemperature
        };

        const stream = await chatSession.sendMessageStream(messageParts, currentGenerationConfig);

        // Clear thinking message line before streaming starts
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(neon.aiMarker); // Start with AI marker

        for await (const chunk of stream) {
             // Check for function calls or other non-text parts if API supports them
            if (chunk.candidates?.[0]?.content?.parts) {
                 const parts = chunk.candidates[0].content.parts;
                 for (const part of parts) {
                      if (part.text) {
                          const textChunk = part.text;
                          process.stdout.write(neon.aiResponse(textChunk)); // Stream output directly
                          fullResponseText += textChunk;
                      } else if (part.inlineData) {
                          // Handle potential inline data (like generated images) if needed in future
                           logWarning("Received inline data from AI (not yet fully handled for display/saving in stream).");
                      }
                      // Add other part types (function calls, etc.) if necessary
                 }
                 // Add the raw parts to history parts list
                 responseParts.push(...parts);
            } else {
                 // Fallback or handle cases where response structure might differ slightly
                 // For basic text streaming, response.text() might be sufficient if structure is simpler
                 try {
                     const textChunk = chunk.text(); // Simplified access for text-only chunks
                     process.stdout.write(neon.aiResponse(textChunk));
                     fullResponseText += textChunk;
                     responseParts.push({ text: textChunk }); // Add to history parts
                 } catch (e) {
                      logWarning(`Received unexpected chunk structure: ${JSON.stringify(chunk)}`);
                 }
            }
        }
        process.stdout.write('\n'); // Newline after AI finishes

        // --- Post-Streaming Processing ---
        const finalResponse = await stream; // Get final aggregated response for metadata

        // Handle potential blocking/finish reasons from the *final* response
        const finalCandidate = finalResponse.response?.candidates?.[0];
        if (finalCandidate) {
             if (finalCandidate.finishReason && finalCandidate.finishReason !== 'STOP' && finalCandidate.finishReason !== 'MAX_TOKENS') {
                 logWarning(`Response stopped: ${finalCandidate.finishReason}`);
                 if (finalCandidate.safetyRatings) {
                     logWarning(`Reasons: ${finalCandidate.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`);
                 }
                 lastAiTextResponse = null; // Don't save partial/blocked response
             } else {
                 lastAiTextResponse = fullResponseText; // Store complete text for /save
             }
        } else if (finalResponse.response?.promptFeedback?.blockReason) {
             // Handle blocked prompts
             logWarning(`Request blocked: ${finalResponse.response.promptFeedback.blockReason}`);
             if (finalResponse.response.promptFeedback.safetyRatings) {
                 logWarning(`Reasons: ${finalResponse.response.promptFeedback.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`);
             }
             lastAiTextResponse = null;
        } else if (!fullResponseText) {
             logWarning("AI response was empty or could not be processed.");
             lastAiTextResponse = null;
        }

        // Save response if requested
        if (fileToSaveTo && lastAiTextResponse) {
            try {
                await fs.promises.writeFile(fileToSaveTo, lastAiTextResponse, 'utf8');
                logSystem(`AI response saved to ${neon.filePath(fileToSaveTo)}`);
            } catch (err) {
                logError(`Failed to save AI response to ${neon.filePath(fileToSaveTo)}`, err);
            } finally {
                fileToSaveTo = null; // Reset save request
            }
        }

        // Add AI response to history (using accumulated parts)
        if (responseParts.length > 0) {
            conversationHistory.push({ role: 'model', parts: responseParts });
            await saveHistory(conversationHistory);
        }

    } catch (error) {
        // Clean up the "thinking" line or partial output
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        logError('API call or streaming failed.', error);
        console.log(neon.aiMarker + neon.error('[Sorry, an error occurred during generation. Please check logs or try again.]'));
        lastAiTextResponse = null;
        fileToSaveTo = null;
    } finally {
        aiIsResponding = false;
        if (rl && !isPasting) {
            setPrompt(); // Reset prompt for next input
            rl.prompt();
        }
    }
}


// --- Command Handlers ---

async function handleFileCommand(args) {
    if (!args) {
        logWarning(`Usage: ${FILE_CMD} <file_path> [optional text prompt]`);
        return;
    }

    // Simple heuristic: find the first argument that is likely a file path
    let filePath = null;
    let promptText = '';
    const parts = args.split(' ');
    let potentialPath = '';
    let pathFound = false;

    // Try joining parts from start until a valid file is found
     for (let i = 1; i <= parts.length; i++) {
        potentialPath = parts.slice(0, i).join(' ');
        // Basic check: does it contain likely path chars and exist?
        // This is still imperfect but better than just first word.
        // Consider quoting paths with spaces.
        if (potentialPath.includes('/') || potentialPath.includes('.') || await fileExists(potentialPath)) {
             if (await fileExists(potentialPath)) { // Check existence specifically
                filePath = potentialPath;
                promptText = parts.slice(i).join(' ');
                pathFound = true;
                break;
             }
        }
    }

     // Fallback if heuristic fails: assume first arg is path
     if (!pathFound) {
         filePath = parts[0];
         promptText = parts.slice(1).join(' ');
         if (!(await fileExists(filePath))) {
              logWarning(`File "${neon.filePath(filePath)}" not found or path parsing failed. Please check the path or use quotes for paths with spaces.`);
              // Optionally return here to prevent sending non-existent file
              // return;
         }
     }


    logSystem(`Preparing file: ${neon.filePath(filePath)}`);
    const filePart = await fileToGenerativePart(filePath);

    if (filePart) {
        let userParts = [filePart];
        if (promptText) {
            userParts.push({ text: promptText });
        }

        // Display simplified prompt in chat
        const displayPrompt = promptText || `[Sent File: ${filePart.inlineData.mimeType}]`;
        console.log(neon.promptMarker + neon.userPrompt(displayPrompt));

        // Add to history *before* sending
        conversationHistory.push({ role: 'user', parts: userParts });
        await handleSendMessage(userParts); // Send to AI (handles next prompt)
    } else {
        // Error already logged by fileToGenerativePart
        // Need to re-prompt if file failed before sending
        if (rl && !aiIsResponding && !isPasting) rl.prompt();
    }
}

function handleTempCommand(args) {
     const newTempStr = args.trim();
     if (!newTempStr) {
          logWarning(`Usage: ${TEMP_CMD} <value>. Current: ${neon.filePath(currentTemperature)}`);
          return;
     }
     const newTemp = parseFloat(newTempStr);
     if (!isNaN(newTemp) && newTemp >= 0) {
         currentTemperature = newTemp;
         logSystem(`Temperature set to: ${neon.filePath(currentTemperature)}`);
     } else {
         logWarning(`Invalid temperature. Please provide a non-negative number. Current: ${neon.filePath(currentTemperature)}`);
     }
}

function handleSaveCommand(args) {
    const filename = args.trim();
    if (!filename) {
        logWarning(`Usage: ${SAVE_CMD} <filename>`);
        return;
    }
    fileToSaveTo = path.resolve(filename);
    logSystem(`Will save the next AI text response to: ${neon.filePath(fileToSaveTo)}`);
}

async function handleClearCommand() {
    clearConsole();
    conversationHistory = [];
    await saveHistory(conversationHistory); // Save the empty history
    if (generativeModelInstance) {
        // Reset the chat session with the model
        chatSession = generativeModelInstance.startChat({
            history: [], // Start with empty history
            safetySettings, // Reapply safety settings
            systemInstruction: SYSTEM_PROMPT
        });
        logSystem('Chat history and session cleared.');
    } else {
        logError('Model instance not available to restart chat session.');
    }
    lastAiTextResponse = null;
    fileToSaveTo = null;
}

function handleHistoryCommand() {
     logSystem("\n--- Chat History ---");
     if (conversationHistory.length === 0) {
         console.log(chalk.gray('(Empty history)'));
     } else {
         conversationHistory.forEach((msg) => {
             const roleMarker = msg.role === 'user' ? neon.promptMarker : neon.aiMarker;
             const roleColor = msg.role === 'user' ? neon.userPrompt : neon.aiResponse;
             // Combine text parts, represent non-text parts concisely
             const contentPreview = msg.parts.map(p => {
                  if (p.text) return p.text;
                  if (p.inlineData) return `[File: ${p.inlineData.mimeType || 'data'}]`;
                  return '[Unknown Part]';
             }).join(' ').substring(0, 200); // Limit preview length

             console.log(`${roleMarker}${roleColor(contentPreview)}${contentPreview.length === 200 ? '...' : ''}`);
         });
     }
     logSystem("--------------------\n");
}


// --- Readline Setup & Input Handling ---

function setPrompt() {
    if (!rl) return;
    const promptText = isPasting ? neon.pasteMarker : neon.promptMarker;
    rl.setPrompt(promptText);
}

async function handleInteractiveInput(line) {
    const input = line.trim();

    if (isPasting) {
        if (input.toLowerCase() === ENDPASTE_CMD) {
            isPasting = false;
            setPrompt();
            const fullPasteText = pasteBuffer.join('\n');
            pasteBuffer = [];
            if (fullPasteText) {
                logSystem('Pasted content captured. Sending to AI...');
                const userParts = [{ text: fullPasteText }];
                conversationHistory.push({ role: 'user', parts: userParts });
                 // Don't log full paste to console, just confirmation
                 console.log(neon.promptMarker + neon.userPrompt('[Pasted Content Sent]'));
                await handleSendMessage(userParts); // Handles next prompt internally
            } else {
                logSystem('Paste mode exited. No content captured.');
                if (!aiIsResponding) rl.prompt(); // Re-prompt if nothing was sent
            }
        } else {
            pasteBuffer.push(line); // Keep raw line for accurate pasting
            rl.prompt(); // Show paste prompt again
        }
        return; // Handled in paste mode
    }

    if (input.startsWith(CMD_PREFIX)) {
        const parts = input.substring(1).split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        let needsReprompt = true; // Assume most commands need a re-prompt unless they exit or send a message

        switch (command) {
            case 'exit':
            case 'quit':
            case 'q':
                rl.close();
                needsReprompt = false;
                break;
            case 'clear':
                await handleClearCommand();
                break;
            case 'history':
                handleHistoryCommand();
                break;
            case 'file':
            case 'f':
            case 'load':
            case 'l':
                await handleFileCommand(args);
                needsReprompt = false; // handleSendMessage handles the prompt
                break;
            case 'paste':
                isPasting = true;
                pasteBuffer = [];
                logSystem(`Entering paste mode. End with ${neon.commandHelp(ENDPASTE_CMD)} on a new line.`);
                setPrompt(); // Set paste prompt
                break;
            case 'temp':
                handleTempCommand(args);
                break;
            case 'save':
                handleSaveCommand(args);
                break;
            case 'model':
                logSystem(`Current AI model: ${neon.filePath(MODEL_NAME)}`);
                break;
            case 'safety':
                logSystem(`Current safety threshold: ${neon.filePath(requestedSafety)} (${Object.keys(SAFETY_MAP).find(key => SAFETY_MAP[key] === SAFETY_THRESHOLD)})`);
                 logSystem(`  Set via ${argv.safety ? 'flag (--safety)' : 'env (GEMINI_SAFETY_SETTING)'} or default.`);
                break;
            case 'help':
            case '?':
                showHelp();
                break;
            default:
                logWarning(`Unknown command: ${CMD_PREFIX}${command}`);
                break;
        }

        if (needsReprompt && rl && !aiIsResponding && !isPasting) {
            rl.prompt();
        }
        return; // Command processed
    }

    // --- Normal Message Handling ---
    if (!input) {
        if (rl && !aiIsResponding) rl.prompt(); // Handle empty line
        return;
    }

    const userParts = [{ text: input }];
    conversationHistory.push({ role: 'user', parts: userParts });
    // Don't re-log user input here, readline already shows it
    await handleSendMessage(userParts); // Send message (handles next prompt)
}


// --- Main Execution Logic ---
async function main() {
    // --- Non-Interactive Mode ---
    if (!process.stdin.isTTY) {
        let pipedInput = '';
        process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) {
                pipedInput += chunk;
            }
        });

        process.stdin.on('end', async () => {
            await initializeChat(); // Initialize base client stuff
            let prompt = argv._.join(' ').trim(); // Get non-flag arguments as prompt
            const messageParts = [];

            if (pipedInput) {
                // Try simple MIME detection for piped data if possible, else default to text
                // This is very basic; a more robust solution would analyze content.
                 let mimeType = 'text/plain';
                 // Example basic detection (could be expanded)
                 if (pipedInput.trim().startsWith('{') && pipedInput.trim().endsWith('}')) mimeType = 'application/json';
                 else if (pipedInput.trim().startsWith('<') && pipedInput.trim().endsWith('>')) mimeType = 'text/html'; // Very naive

                // Send piped data as base64 inline data for consistency
                messageParts.push({
                     inlineData: {
                         mimeType: mimeType,
                         data: Buffer.from(pipedInput).toString('base64')
                     }
                 });
                if (!prompt) prompt = "Analyze the provided content."; // Default prompt if only pipe data
            }

            if (prompt) {
                 messageParts.push({ text: prompt });
            }


            if (messageParts.length === 0) {
                logError("No input provided via pipe or arguments for non-interactive mode.");
                 console.error("Usage: cat data | script [optional prompt] OR script 'Your prompt here'");
                process.exit(1);
            }

            try {
                if (!generativeModelInstance) throw new Error("Model instance not initialized.");

                const currentGenerationConfig = { ...generationConfigDefaults, temperature: currentTemperature };

                // Use generateContent for single-turn non-interactive
                // Streaming isn't typically useful here as output goes to stdout pipe
                const result = await generativeModelInstance.generateContent({
                    contents: [{ role: 'user', parts: messageParts }],
                    generationConfig: currentGenerationConfig,
                    safetySettings: safetySettings,
                    systemInstruction: SYSTEM_PROMPT
                });

                // Process non-interactive response
                 const response = result?.response;
                 const candidate = response?.candidates?.[0];

                 if (candidate) {
                     if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                          console.error(neon.error(`Non-interactive response stopped: ${candidate.finishReason}`));
                          if (candidate.safetyRatings) console.error(neon.error(`Reasons: ${candidate.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`));
                          process.exitCode = 1;
                     } else if (candidate.content?.parts) {
                          const responseText = candidate.content.parts.map(part => part.text || '').join('');
                          process.stdout.write(responseText); // Write raw response to stdout
                          if (!responseText.endsWith('\\n')) process.stdout.write('\\n'); // Ensure newline
                     } else {
                          console.error(neon.error("Non-interactive response candidate was empty or unreadable."));
                          process.exitCode = 1;
                     }
                 } else if (response?.promptFeedback?.blockReason) {
                      console.error(neon.error(`Non-interactive request blocked: ${response.promptFeedback.blockReason}`));
                      process.exitCode = 1;
                 } else {
                      console.error(neon.error("Received invalid non-interactive response structure from API."));
                      process.exitCode = 1;
                 }

            } catch (error) {
                logError('Non-interactive AI request failed.', error);
                process.exitCode = 1;
            }
        });
    }
    // --- Interactive Mode ---
    else {
        await initializeChat();

        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            historySize: 1000,
            prompt: neon.promptMarker, // Set initial prompt marker
            completer: (line) => {
                const commands = [EXIT_CMD, '/quit', '/q', CLEAR_CMD, HISTORY_CMD, FILE_CMD, '/f', LOAD_CMD, '/l', PASTE_CMD, ENDPASTE_CMD, TEMP_CMD, SAVE_CMD, MODEL_CMD, SAFETY_CMD, HELP_CMD, '/?'];
                const hits = commands.filter((c) => c.startsWith(line));
                return [hits.length ? hits : [], line]; // Show only relevant completions
            }
        });

        clearConsole();
        logSystem('--- Gemini Chat Client (Termux Neon Enhanced) ---');
        logSystem(`Model: ${neon.filePath(MODEL_NAME)}. Safety: ${neon.filePath(requestedSafety)}. Type ${neon.commandHelp(HELP_CMD)} for commands.`);
        setPrompt();
        rl.prompt();

        rl.on('line', async (line) => {
            if (aiIsResponding) {
                 // Maybe provide feedback like a small beep or visual cue?
                 // process.stdout.write(chalk.red('Wait... ')); // Example
                 return; // Ignore input while AI is streaming
            }
            if (rl.paused) return; // Should not happen if aiIsResponding is managed correctly

            rl.pause(); // Pause readline while processing async command
            try {
                await handleInteractiveInput(line);
            } catch (err) {
                logError("Unhandled error during input processing.", err);
                 // Ensure prompt is shown even after unexpected errors if not handled by handleSendMessage
                 if (rl && !aiIsResponding && !isPasting && rl.terminal) {
                     setPrompt();
                     rl.prompt();
                 }
            } finally {
                // Resume readline IF NOT handled by handleSendMessage's finally block
                // This needs careful management with the aiIsResponding flag.
                 if (rl && !aiIsResponding && !isPasting && rl.terminal) {
                      rl.resume();
                 }
            }
        }).on('close', async () => {
            logSystem('\\nExiting chat. Saving history...');
            await saveHistory(conversationHistory);
            console.log(chalk.magenta.bold('Goodbye!'));
            process.exit(0);
        });

        // Graceful exit handling (Ctrl+C)
        rl.on('SIGINT', () => {
            if (isPasting) {
                isPasting = false;
                pasteBuffer = [];
                // Need to clear the current line where "Paste>" might be
                process.stdout.clearLine(0);
                process.stdout.cursorTo(0);
                logWarning('\\nPaste mode cancelled.');
                setPrompt();
                rl.prompt();
            } else if (aiIsResponding) {
                 // Optionally add a way to *interrupt* the AI stream here if desired
                 logWarning("AI is currently responding. Press Ctrl+C again to force exit.");
                 // Maybe add a flag and check it in the stream loop? Complex.
                 // For now, just warn. A second Ctrl+C will likely kill the process.
            }
            else {
                rl.question(neon.warning('Exit session? (y/N) '), (answer) => {
                    if (answer.match(/^y(es)?$/i)) {
                        rl.close(); // Triggers 'close' event for saving
                    } else {
                        logSystem('Exit cancelled.');
                        rl.prompt(); // Re-prompt
                    }
                });
            }
        });
    }
}

// --- Initiate the Spell ---
main().catch(err => {
    logError("Critical error during application startup.", err);
    process.exit(1);
});

"""

# --- Presenting the Enhanced Spell ---
print(Fore.GREEN + Style.BRIGHT + "The Javascript spell has undergone a profound transformation!" + Style.RESET_ALL)
print(Fore.CYAN + Style.DIM + "# Channeling neon energies, streaming consciousness, and fortified wards..." + Style.RESET_ALL)
# Outputting the JS code itself (no python-based colorization here, JS uses chalk)
print(Fore.WHITE + enhanced_js_code)
print(Fore.MAGENTA + Style.BRIGHT + "\n--- Key Enhancements Woven In ---" + Style.RESET_ALL)
print(Fore.YELLOW + "*   " + Style.BRIGHT + "Neon Visuals:" + Style.NORMAL + " Complete UI overhaul using bright `chalk` styles for clarity." + Style.RESET_ALL)
print(Fore.CYAN + "*   " + Style.BRIGHT + "Streaming Responses:" + Style.NORMAL + " AI output now appears dynamically as it's generated." + Style.RESET_ALL)
print(Fore.GREEN + "*   " + Style.BRIGHT + "Argument Parsing:" + Style.NORMAL + " Uses `yargs` for command-line overrides (API key, model, temp, history, safety)." + Style.RESET_ALL)
print(Fore.BLUE + "*   " + Style.BRIGHT + "Configurable Safety:" + Style.NORMAL + f" Safety settings restored and configurable via {Style.BRIGHT}--safety{Style.NORMAL} flag or {Style.BRIGHT}GEMINI_SAFETY_SETTING{Style.NORMAL} env var." + Style.RESET_ALL)
print(Fore.YELLOW + "*   " + Style.BRIGHT + "Improved Error Handling:" + Style.NORMAL + " More robust checks and clearer error messages." + Style.RESET_ALL)
print(Fore.MAGENTA + "*   " + Style.BRIGHT + "Refined Commands:" + Style.NORMAL + " Added `/safety` command, aliases, improved help." + Style.RESET_ALL)
print(Fore.GREEN + Style.BRIGHT + "\n--- Preparing the Ritual ---" + Style.RESET_ALL)
print(Fore.WHITE + "1.  " + Style.BRIGHT + "Save:" + Style.NORMAL + " Save the Javascript code above as a file (e.g., `gemini_neon.js`).")
print(Fore.WHITE + "2.  " + Style.BRIGHT + "Dependencies:" + Style.NORMAL + " Ensure Node.js is installed in Termux (`pkg install nodejs`). Install necessary packages:")
print(Fore.CYAN + "      ```bash")
print(Fore.CYAN + "      npm install @google/generative-ai dotenv chalk mime-types yargs")
print(Fore.CYAN + "      ```" + Style.RESET_ALL)
print(Fore.WHITE + "3.  " + Style.BRIGHT + "Environment:" + Style.NORMAL + " Create or update your `.env` file with `GEMINI_API_KEY`.")
print(Fore.WHITE + "      Optional: Add `GEMINI_MODEL`, `GEMINI_HISTORY_FILE`, `GEMINI_SAFETY_SETTING` (e.g., `GEMINI_SAFETY_SETTING=BLOCK_NONE`).")
print(Fore.WHITE + "4.  " + Style.BRIGHT + "Permissions:" + Style.NORMAL + " Make the script executable: `chmod +x gemini_neon.js`.")
print(Fore.WHITE + "5.  " + Style.BRIGHT + "Execute:" + Style.NORMAL + " Run the enhanced spell: `./gemini_neon.js`")
print(Fore.WHITE + "      Use flags for overrides: `./gemini_neon.js --model gemini-experimental-model -t 0.9`")
print(Fore.GREEN + Style.BRIGHT + "\nWitness the power of the enhanced Gemini client, glowing with neon energy in your Termux!" + Style.RESET_ALL)

```

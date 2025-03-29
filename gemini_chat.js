#!/usr/bin/env node

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';
import mime from 'mime-types';

// --- Configuration ---
dotenv.config();

// Core settings
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-pro-exp-03-25'; // Or 'gemini-1.5-flash-latest' etc.
const HISTORY_FILE = path.resolve(process.env.GEMINI_HISTORY_FILE || './gemini_chat_history.json'); // Allow customizing history file path
const MAX_HISTORY_LENGTH = parseInt(process.env.GEMINI_MAX_HISTORY || '50', 10); // Max history turns (user + model = 1 turn)

// Role/Behavior settings
const SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT ||
    `You are a helpful and versatile AI assistant running in a Termux terminal environment.
    Focus on being concise, accurate, and efficient.
    Prioritize tasks related to coding (explanation, generation, debugging in various languages like JavaScript, Python, Shell, etc.), text creation, summarization, and general problem-solving.
    Format code snippets using Markdown fences (\`\`\`language\ncode\n\`\`\`).
    Be mindful that the user is interacting via a command line.`;

// Default Generation Config (can be overridden by /temp)
const DEFAULT_TEMPERATURE = parseFloat(process.env.GEMINI_DEFAULT_TEMP || '0.8');
const generationConfigDefaults = {
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 81920, // Adjust based on model limits if needed
};

// Safety settings
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
];

// --- Constants ---
const USER_ROLE = 'user';
const MODEL_ROLE = 'model';
const CMD_PREFIX = '/';
const PASTE_CMD = `${CMD_PREFIX}paste`;
const ENDPASTE_CMD = `${CMD_PREFIX}endpaste`;
const TEMP_CMD = `${CMD_PREFIX}temp`;
const SAVE_CMD = `${CMD_PREFIX}save`;
const FILE_CMD = `${CMD_PREFIX}file`;
const LOAD_CMD = `${CMD_PREFIX}load`; // Keep /load as well

// Define extensions we want to treat as text even if MIME type is generic/unknown
const TEXT_LIKE_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.oh', // JavaScript family
    '.py', '.pyw',             // Python
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', // Data/Config formats
    '.md', '.txt', '.rtf', '.log', '.conf', // Text formats
    '.csv', '.tsv',             // Tabular data
    '.html', '.htm', '.css', '.scss', '.less', // Web
    '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', // Programming
    '.sh', '.bash', '.zsh', '.ps1', // Shell scripts
    '.sql', '.dockerfile', 'makefile' // Other dev files
]);

// --- State Variables ---
let conversationHistory = [];
let chatSession;
let isPasting = false;
let pasteBuffer = [];
let currentTemperature = DEFAULT_TEMPERATURE;
let lastAiTextResponse = null; // Store the last AI text response for /save
let fileToSaveTo = null; // Store filename for the next /save command

// --- Helper Functions ---

function logError(message, error) {
    console.error(chalk.red.bold('Error:') + chalk.yellow(` ${message}`));
    if (error) {
        console.error(chalk.red(`  > Details: ${error.message}`));
        // Consider adding stack trace optionally via env var for debugging
        // if (process.env.DEBUG_MODE) console.error(error.stack);
    }
}

function logInfo(message, type = 'info') {
    const color = type === 'success' ? chalk.green : type === 'warning' ? chalk.yellow : chalk.cyan;
    console.log(color(message));
}

function clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1Bc'); // Use 'Bc' for broader terminal compatibility
}

async function loadHistory() {
    try {
        if (await fs.promises.access(HISTORY_FILE, fs.constants.F_OK).then(() => true).catch(() => false)) {
            const historyData = await fs.promises.readFile(HISTORY_FILE, 'utf8');
            const parsedHistory = JSON.parse(historyData);
            if (Array.isArray(parsedHistory)) {
                // Simple truncation: take the last N turns (user + model pairs)
                const turns = Math.floor(MAX_HISTORY_LENGTH / 2);
                const startIndex = Math.max(0, parsedHistory.length - turns * 2);
                return parsedHistory.slice(startIndex);
            } else {
                logInfo(`Invalid history file format at ${HISTORY_FILE}. Starting fresh.`, 'warning');
                return [];
            }
        }
        return [];
    } catch (error) {
        logError(`Failed to read or parse chat history from ${HISTORY_FILE}. Starting fresh.`, error);
        return [];
    }
}

async function saveHistory(history) {
    try {
        // Apply truncation again before saving
        const turns = Math.floor(MAX_HISTORY_LENGTH / 2);
        const startIndex = Math.max(0, history.length - turns * 2);
        const historyToSave = history.slice(startIndex);
        await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(historyToSave, null, 2), 'utf8');
    } catch (error) {
        logError('Failed to save chat history.', error);
    }
}

async function fileToGenerativePart(filePath) {
    try {
        const resolvedPath = path.resolve(filePath);
        if (!(await fs.promises.access(resolvedPath, fs.constants.R_OK).then(() => true).catch(() => false))) {
            logError(`File not found or not readable: ${resolvedPath}`);
            return null;
        }

        let detectedMimeType = mime.lookup(resolvedPath);
        const fileExtension = path.extname(resolvedPath).toLowerCase();
        let effectiveMimeType = detectedMimeType;
        let isSupported = false;

        if (detectedMimeType && /^(image\/(jpeg|png|webp|heic|heif)|video\/|audio\/|text\/)/.test(detectedMimeType)) {
            isSupported = true;
        } else if (TEXT_LIKE_EXTENSIONS.has(fileExtension)) {
            isSupported = true;
            if (!detectedMimeType || !detectedMimeType.startsWith('text/')) {
                effectiveMimeType = 'text/plain';
                // logInfo(`Treating ${fileExtension} file as text/plain.`, 'info'); // Less verbose
            }
        }

        if (!isSupported) {
            logError(`Unsupported file type: MIME "${detectedMimeType || 'unknown'}", extension "${fileExtension}".`, null);
            logInfo(`Supported: standard image/video/audio/text, and extensions: ${Array.from(TEXT_LIKE_EXTENSIONS).join(', ')}`);
            return null;
        }
        if (!effectiveMimeType) {
            effectiveMimeType = 'application/octet-stream'; // Should not happen often with the checks above
            logInfo(`Could not determine specific MIME for ${fileExtension}, using generic type.`, 'warning');
        }

        const data = await fs.promises.readFile(resolvedPath);
        return { inlineData: { data: data.toString('base64'), mimeType: effectiveMimeType } };
    } catch (error) {
        logError(`Failed to process file: ${filePath}`, error);
        return null;
    }
}

function showHelp() {
    logInfo("\n--- Gemini Chat Client Commands ---", 'success');
    console.log(`${chalk.yellow.bold('/exit')}, ${chalk.yellow.bold('/quit')}:    Exit the chat.`);
    console.log(`${chalk.yellow.bold('/clear')}:      Clear chat history and reset session.`);
    console.log(`${chalk.yellow.bold('/history')}:    Show the current session history.`);
    console.log(`${chalk.yellow.bold('/file')}, ${chalk.yellow.bold('/load')} ${chalk.blue('<path>')} [prompt]: Send a local file (image, text, code, video, audio)`);
    console.log(`              ${chalk.gray('Example: /file script.js Explain this code')}`);
    console.log(`${chalk.yellow.bold(PASTE_CMD)}:       Enter multi-line paste mode.`);
    console.log(`${chalk.yellow.bold(ENDPASTE_CMD)}:    Exit multi-line paste mode and send.`);
    console.log(`${chalk.yellow.bold(TEMP_CMD)} ${chalk.blue('<value>')}: Set AI temperature (creativity, 0.0-1.0+). Current: ${chalk.magenta(currentTemperature)}`);
    console.log(`              ${chalk.gray('Example: /temp 0.9 (more creative), /temp 0.2 (more factual)')}`);
    console.log(`${chalk.yellow.bold(SAVE_CMD)} ${chalk.blue('<filename>')}: Save the *next* AI text response to a file.`);
    console.log(`              ${chalk.gray('Example: /save my_code.py')}`);
    console.log(`${chalk.yellow.bold('/help')}:       Show this help message.`);
    console.log(`${chalk.yellow.bold('/model')}:      Show the current AI model name.`);
    logInfo("---------------------------------\n", 'success');
}

async function initializeChat() {
    if (!API_KEY) {
        logError('GEMINI_API_KEY is not set in your environment variables (.env file or system env).');
        process.exit(1);
    }

    try {
        const aiClient = new GoogleGenerativeAI(API_KEY);
        const modelInstance = aiClient.getGenerativeModel({
            model: MODEL_NAME,
            safetySettings,
            systemInstruction: SYSTEM_PROMPT // Set the system prompt here
        });
        logInfo(`Using AI model: ${chalk.magenta(MODEL_NAME)}`, 'success');
        // logInfo(`System prompt set (use /help for commands).`, 'info');

        conversationHistory = await loadHistory();
        chatSession = modelInstance.startChat({
            history: conversationHistory.map(msg => ({
                role: msg.role, // API uses 'user'/'model'
                parts: msg.parts
            })),
            // generationConfig is passed per-message now for temperature control
        });

    } catch (error) {
        logError(`Failed to initialize AI model "${MODEL_NAME}". Check model name and API key permissions.`, error);
        process.exit(1);
    }
}

// --- Core Chat Logic ---

async function handleSendMessage(messageParts) {
    // Display "thinking" indicator and move cursor up for clean overwrite
    process.stdout.write(chalk.yellow('AI is thinking...') + '\n\x1B[1A');

    let responseText = '';
    let responseParts = [];
    let aiErrorOccurred = false;

    try {
        const currentGenerationConfig = {
            ...generationConfigDefaults, // Start with defaults
            temperature: currentTemperature // Override with current temp
        };

        const result = await chatSession.sendMessage({
             content: { parts: messageParts }, // Structure expected by sendMessage with parts
             generationConfig: currentGenerationConfig
        });


        // Clear the "thinking" line
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);

        if (!result || !result.response) {
            throw new Error("Received an invalid or empty response structure from the API.");
        }

        const response = result.response;

        if (response.candidates && response.candidates.length > 0) {
            const content = response.candidates[0].content;
            if (content && content.parts) {
                responseParts = content.parts;
                lastAiTextResponse = ''; // Reset before accumulating

                for (let i = 0; i < content.parts.length; i++) {
                    const part = content.parts[i];
                    if (part.text) {
                        responseText += part.text;
                        lastAiTextResponse += part.text; // Accumulate for /save
                    } else if (part.inlineData) {
                        try {
                            const mimeType = part.inlineData.mimeType;
                            const extension = mime.extension(mimeType) || 'bin';
                            const filename = `output_${Date.now()}_${i}.${extension}`;
                            const buffer = Buffer.from(part.inlineData.data, 'base64');
                            await fs.promises.writeFile(filename, buffer);
                            logInfo(`AI sent a file: ${chalk.magenta(filename)} (${mimeType})`, 'success');
                            const fileMarker = `[AI generated file saved as: ${filename}]`;
                            if (responseText.length > 0 && !responseText.endsWith('\n')) responseText += '\n';
                            responseText += fileMarker;
                            // Do not add file marker to lastAiTextResponse for /save
                        } catch (err) {
                            logError('Error saving AI generated file:', err);
                            const errorMarker = `[Error saving AI generated file]`;
                             if (responseText.length > 0 && !responseText.endsWith('\n')) responseText += '\n';
                            responseText += errorMarker;
                        }
                    } else {
                        console.warn(chalk.yellow(`Warning: Received unknown part type from AI: ${Object.keys(part).join(', ')}`));
                    }
                }
            } else if (typeof response.text === 'function') { // Fallback check
                responseText = response.text();
                responseParts = [{ text: responseText }];
                lastAiTextResponse = responseText;
            } else {
                 responseText = chalk.gray('[AI response was empty or unrecognized]');
                 responseParts = [{ text: responseText }];
                 lastAiTextResponse = null;
            }

        } else if (response.promptFeedback && response.promptFeedback.blockReason) {
            responseText = chalk.red(`[Request blocked: ${response.promptFeedback.blockReason}]`);
            if (response.promptFeedback.safetyRatings) {
                responseText += `\n${chalk.red('Reasons:')} ${response.promptFeedback.safetyRatings.map(r => `${r.category}: ${r.probability}`).join(', ')}`;
            }
            responseParts = [{ text: responseText }];
            lastAiTextResponse = null; // Blocked response isn't saved
            logInfo("Your prompt was blocked due to safety settings.", 'warning');
        } else {
             responseText = chalk.gray('[AI response could not be processed]');
             responseParts = [{ text: responseText }];
             lastAiTextResponse = null;
        }

        // Display AI response
        console.log(`${chalk.green.bold('AI:')} ${chalk.white(responseText)}`);

        // Save AI text response if requested
        if (fileToSaveTo && lastAiTextResponse) {
            try {
                await fs.promises.writeFile(fileToSaveTo, lastAiTextResponse, 'utf8');
                logInfo(`AI response saved to ${chalk.magenta(fileToSaveTo)}`, 'success');
            } catch (err) {
                logError(`Failed to save AI response to ${fileToSaveTo}`, err);
            } finally {
                fileToSaveTo = null; // Reset save request
            }
        }

        // Add AI response to history
        conversationHistory.push({ role: MODEL_ROLE, parts: responseParts });
        await saveHistory(conversationHistory); // Save after successful processing

    } catch (error) {
        // Clear the "thinking" line in case of error too
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        logError('API call or response processing failed.', error);
        // Display error to user
        console.log(`${chalk.green.bold('AI:')} ${chalk.red('[Sorry, an error occurred. Please check logs or try again.]')}`);
        aiErrorOccurred = true; // Mark error
        lastAiTextResponse = null; // Don't save error messages
        fileToSaveTo = null; // Cancel save on error
        // Optionally, add an error marker to history if desired
        // conversationHistory.push({ role: MODEL_ROLE, parts: [{ text: '[Error fetching response]' }] });
        // await saveHistory(conversationHistory);
    } finally {
        // Prompt again only if it was an interactive session
        if (rl) {
            setPrompt(); // Reset prompt in case it was 'Paste>'
            rl.prompt();
        }
    }
    return aiErrorOccurred; // Indicate if an error happened
}

// --- Readline Setup and Event Listeners ---
let rl = null; // Initialize readline interface later if interactive

function setPrompt() {
    if (!rl) return;
    const promptText = isPasting ? chalk.yellow('Paste> ') : chalk.blue.bold('You: ');
    rl.setPrompt(promptText);
}

async function handleInteractiveInput(line) {
    const input = line.trim();

    // --- Paste Mode Logic ---
    if (isPasting) {
        if (input.toLowerCase() === ENDPASTE_CMD) {
            isPasting = false;
            setPrompt();
            const fullPasteText = pasteBuffer.join('\n');
            pasteBuffer = []; // Clear buffer
            if (fullPasteText) {
                logInfo('Pasted content captured. Sending to AI...', 'info');
                const userParts = [{ text: fullPasteText }];
                conversationHistory.push({ role: USER_ROLE, parts: userParts });
                console.log(`${chalk.blue.bold('You (Pasted):')} ${fullPasteText.substring(0, 100)}${fullPasteText.length > 100 ? '...' : ''}`); // Show preview
                await handleSendMessage(userParts);
            } else {
                logInfo('Paste mode exited. No content captured.', 'info');
                rl.prompt();
            }
        } else {
            pasteBuffer.push(line); // Add the raw line (including indentation)
            rl.prompt(); // Show Paste> prompt again
        }
        return; // Don't process as command or normal message while pasting
    }

    // --- Command Handling ---
    if (input.startsWith(CMD_PREFIX)) {
        const [command, ...args] = input.substring(1).split(' ');
        const argString = args.join(' ');
        const commandLower = command.toLowerCase();

        switch (commandLower) {
            case 'exit':
            case 'quit':
                rl.close();
                return;
            case 'clear':
                clearConsole();
                conversationHistory = [];
                await saveHistory(conversationHistory);
                // Re-initialize the chat session with empty history
                chatSession = chatSession.model.startChat({ history: [], systemInstruction: SYSTEM_PROMPT });
                logInfo('Chat history and session cleared.', 'success');
                lastAiTextResponse = null;
                fileToSaveTo = null;
                break; // Proceed to prompt
            case 'history':
                logInfo("\n--- Chat History ---", 'success');
                if (conversationHistory.length === 0) {
                    console.log(chalk.gray('(Empty history)'));
                } else {
                    conversationHistory.forEach((msg) => {
                        const roleColor = msg.role === USER_ROLE ? chalk.blue.bold : chalk.green.bold;
                        const contentPreview = msg.parts.map(p => p.text || `[File: ${p.inlineData?.mimeType || 'data'}]`).join(' ').substring(0, 150);
                        console.log(`${roleColor(msg.role.toUpperCase())}: ${chalk.white(contentPreview)}${contentPreview.length === 150 ? '...' : ''}`);
                    });
                }
                logInfo("--------------------\n", 'success');
                break; // Proceed to prompt
            case 'file': // Alias for load
            case 'load':
                if (!argString) {
                    logInfo(`Usage: ${LOAD_CMD} <file_path> [optional text prompt]`, 'warning');
                    break;
                }
                let filePath, userTextFromFileCmd;
                // Try to handle paths with spaces (basic approach)
                // Find first space that *isn't* likely part of the path itself
                // This is imperfect, quotes around path would be better but harder to parse simply
                let potentialPath = '';
                let potentialPrompt = '';
                let pathFound = false;
                const parts = argString.split(' ');
                for(let i=0; i<parts.length; ++i) {
                    potentialPath = parts.slice(0, i+1).join(' ');
                    potentialPrompt = parts.slice(i+1).join(' ');
                    // Crude check: if potential path exists, assume it's the path
                     if (await fs.promises.access(path.resolve(potentialPath), fs.constants.F_OK).then(() => true).catch(() => false)) {
                         filePath = potentialPath;
                         userTextFromFileCmd = potentialPrompt;
                         pathFound = true;
                         break;
                     }
                }
                 if (!pathFound) {
                      // Fallback: assume first word is path if file doesn't exist at longer paths
                      filePath = parts[0];
                      userTextFromFileCmd = parts.slice(1).join(' ');
                      logInfo(`Warning: File "${filePath}" not found immediately. Proceeding, but check path.`, 'warning');
                 }


                logInfo(`Preparing file: ${chalk.magenta(filePath)}`, 'info');
                const filePart = await fileToGenerativePart(filePath);
                if (filePart) {
                    let userParts = [filePart];
                    if (userTextFromFileCmd) {
                        userParts.push({ text: userTextFromFileCmd });
                    }
                    conversationHistory.push({ role: USER_ROLE, parts: userParts });
                    const displayPrompt = userTextFromFileCmd || `[Sent File: ${filePart.inlineData.mimeType}]`;
                    console.log(`${chalk.blue.bold('You:')} ${displayPrompt}`);
                    await handleSendMessage(userParts);
                }
                // Error handled in fileToGenerativePart, just need to re-prompt
                break; // Proceed to prompt
            case 'paste':
                isPasting = true;
                pasteBuffer = [];
                logInfo(`Entering paste mode. End with ${chalk.yellow.bold(ENDPASTE_CMD)} on a new line.`, 'info');
                setPrompt(); // Change prompt to Paste>
                break; // Proceed to prompt
            case 'temp':
                const newTemp = parseFloat(argString);
                if (!isNaN(newTemp) && newTemp >= 0) {
                    currentTemperature = newTemp;
                    logInfo(`Temperature set to: ${chalk.magenta(currentTemperature)}`, 'success');
                } else {
                    logInfo(`Invalid temperature. Please provide a non-negative number. Current: ${chalk.magenta(currentTemperature)}`, 'warning');
                }
                break; // Proceed to prompt
            case 'save':
                if (!argString) {
                    logInfo(`Usage: ${SAVE_CMD} <filename>`, 'warning');
                    break;
                }
                fileToSaveTo = path.resolve(argString); // Store filename for next response
                logInfo(`Will save the next AI text response to: ${chalk.magenta(fileToSaveTo)}`, 'info');
                break; // Proceed to prompt
            case 'help':
                showHelp();
                break; // Proceed to prompt
            case 'model':
                logInfo(`Current AI model: ${chalk.magenta(MODEL_NAME)}`, 'info');
                break; // Proceed to prompt
            default:
                logInfo(`Unknown command: ${CMD_PREFIX}${command}`, 'warning');
                break; // Proceed to prompt
        }
        rl.prompt(); // Re-prompt after handling command
        return;
    }

    // --- Normal Message Handling ---
    if (!input) {
        rl.prompt(); // Handle empty line
        return;
    }

    const userParts = [{ text: input }];
    conversationHistory.push({ role: USER_ROLE, parts: userParts });
    // Display user message immediately
    console.log(`${chalk.blue.bold('You:')} ${input}`);
    await handleSendMessage(userParts); // Send message and wait for response
    // Prompt is handled within handleSendMessage's finally block
}

// --- Main Execution ---

async function main() {
    // Check if input is being piped
    if (!process.stdin.isTTY) {
        // Non-interactive mode
        let pipedInput = '';
        process.stdin.on('readable', () => {
            let chunk;
            while ((chunk = process.stdin.read()) !== null) {
                pipedInput += chunk;
            }
        });

        process.stdin.on('end', async () => {
            await initializeChat(); // Initialize AI client even for non-interactive

            let prompt = process.argv.slice(2).join(' ').trim(); // Get prompt from command line arguments
            const messageParts = [];

            if (pipedInput) {
                // Treat piped input as plain text for simplicity here
                // Could potentially try to detect MIME type if needed
                messageParts.push({ text: pipedInput });
                if (!prompt) {
                    // Default prompt if only piped data is given
                    prompt = "Analyze the provided text content.";
                }
            }

            if (prompt) {
                 messageParts.push({ text: prompt });
            }


            if (messageParts.length === 0) {
                 logError("No input provided via pipe or arguments for non-interactive mode.", null);
                 process.exit(1);
            }

            // Use generateContent for single-turn non-interactive
             try {
                  const currentGenerationConfig = { ...generationConfigDefaults, temperature: currentTemperature };
                  // Prepare history *if* needed for context, but often single-turn is fine for pipes
                  // const historyForGeneration = conversationHistory.map(...)
                  // For simplicity, send only the current input without deep history context in pipe mode
                  const result = await chatSession.model.generateContent({
                      contents: [{ role: USER_ROLE, parts: messageParts }], // Send current input as 'user'
                      generationConfig: currentGenerationConfig,
                      safetySettings: safetySettings,
                      systemInstruction: SYSTEM_PROMPT
                  });

                 if (result && result.response) {
                    const response = result.response;
                    if (response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts) {
                         const responseText = response.candidates[0].content.parts
                           .map(part => part.text || '') // Extract text only for direct output
                           .join('');
                         process.stdout.write(responseText); // Write raw response to stdout
                    } else if(response.promptFeedback && response.promptFeedback.blockReason){
                         logError(`Request blocked: ${response.promptFeedback.blockReason}`, null);
                         process.exitCode = 1; // Indicate error
                    } else {
                        logError("Received an empty or unreadable response from the AI.", null);
                         process.exitCode = 1; // Indicate error
                    }
                 } else {
                      logError("Invalid response structure received from API.", null);
                       process.exitCode = 1; // Indicate error
                 }

             } catch (error) {
                  logError('Non-interactive AI request failed.', error);
                   process.exitCode = 1; // Indicate error
             }
        });

    } else {
        // Interactive mode
        await initializeChat(); // Initialize client, history, session

        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            historySize: 1000, // Remember command history
        });

        clearConsole();
        logInfo('--- Gemini Chat Client (Termux Enhanced) ---', 'success');
        logInfo(`Model: ${chalk.magenta(MODEL_NAME)}. System prompt active. Type ${chalk.yellow.bold('/help')} for commands.`, 'info');
        setPrompt();
        rl.prompt();

        rl.on('line', async (line) => {
             rl.pause(); // Pause during async handling
             try {
                 await handleInteractiveInput(line);
             } catch (err) {
                 logError("Unhandled error during input processing.", err);
                 rl.prompt(); // Ensure prompt is shown even after unexpected errors
             } finally {
                 // Resume only if not pasting, prompt handled inside handlers/finally blocks
                 if (!isPasting) {
                     rl.resume();
                 }
             }
        }).on('close', async () => {
            logInfo('\nExiting chat. Saving history...', 'info');
            await saveHistory(conversationHistory); // Ensure history is saved on exit
            console.log(chalk.magenta('Goodbye!'));
            process.exit(0);
        });

        // Handle Ctrl+C gracefully
        rl.on('SIGINT', () => {
            rl.question(chalk.yellow('Exit? (y/N) '), (answer) => {
                if (answer.match(/^y(es)?$/i)) {
                    rl.close(); // This will trigger the 'close' event for saving
                } else {
                    rl.prompt();
                }
            });
        });
    }
}

// --- Start the application ---
main().catch(err => {
    logError("Critical error during application startup.", err);
    process.exit(1);
});

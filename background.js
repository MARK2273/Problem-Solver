// Background service worker: talks to Google Gemini (Google AI Studio) API.

const DEFAULT_MODEL = "gemini-2.0-flash";

// Per-model output token caps, as documented by Google AI Studio.
// We send the model's published maximum so long solutions aren't truncated.
// Any model not listed here falls back to MODEL_MAX_OUTPUT_TOKENS.default.
const MODEL_MAX_OUTPUT_TOKENS = {
  "gemini-2.5-flash":      65536,
  "gemini-2.5-flash-lite": 65536,
  "gemini-2.0-flash":       8192,
  "gemini-2.0-flash-lite":  8192,
  "gemini-1.5-flash":       8192,
  "gemini-1.5-flash-8b":    8192,
  default:                  8192
};
function getMaxOutputTokens(model) {
  return MODEL_MAX_OUTPUT_TOKENS[model] || MODEL_MAX_OUTPUT_TOKENS.default;
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["apiKey", "model", "includeComments", "includeExplanation"],
      (items) => {
        resolve({
          apiKey: items.apiKey || "",
          model: items.model || DEFAULT_MODEL,
          includeComments:
            items.includeComments === undefined ? true : !!items.includeComments,
          includeExplanation:
            items.includeExplanation === undefined ? true : !!items.includeExplanation
        });
      }
    );
  });
}

function buildPrompt({ title, body, platform, url, language }, opts = {}) {
  const { includeComments = true, includeExplanation = true } = opts;
  const lang = language || "Python";

  const commentRule = includeComments
    ? `- Include concise, useful inline comments inside the code.`
    : `- Do NOT include any comments inside the code. No inline comments, no docstrings, no header comments. Output only pure ${lang} code.`;

  const codePlaceholder = includeComments
    ? `// Clean, well-commented, ready-to-submit ${lang} solution.`
    : `// ${lang} solution here (no comments in the final output).`;

  const header = [
    `You are an expert competitive programmer and coding interview coach.`,
    `A user is solving a problem on "${platform}" (${url}).`,
    ``,
    `Problem title: ${title}`,
    ``,
    `Problem statement:`,
    `"""`,
    body || "(No problem text was extracted. Please ask the user to paste the statement.)",
    `"""`,
    ``
  ];

  if (includeExplanation) {
    return header.concat([
      `Please respond in clean Markdown with these exact sections:`,
      `## Understanding`,
      `- Restate the problem briefly in your own words.`,
      ``,
      `## Approach`,
      `- Explain the intuition and the chosen algorithm step-by-step.`,
      ``,
      `## Complexity`,
      `- Time complexity and space complexity with short justification.`,
      ``,
      `## Solution (${lang})`,
      "```" + lang.toLowerCase(),
      codePlaceholder,
      "```",
      ``,
      `## Walkthrough`,
      `- Dry-run the solution on one sample input.`,
      ``,
      `Rules:`,
      `- Produce only ONE code block, inside the "Solution" section.`,
      `- Code must be complete and compilable/runnable for the target platform.`,
      `- Prefer the most efficient correct algorithm.`,
      `- Keep explanations concise and beginner-friendly.`,
      commentRule
    ]).join("\n");
  }

  // Code-only mode: no explanation sections, just a single fenced code block.
  return header.concat([
    `Respond with ONLY a single fenced Markdown code block containing the complete ${lang} solution.`,
    `The response MUST start with the opening triple backticks and MUST end with the closing triple backticks.`,
    `Do not include any prose, headings, greetings, or text before or after the code block.`,
    ``,
    `Format exactly like this (including the backticks):`,
    "```" + lang.toLowerCase(),
    codePlaceholder,
    "```",
    ``,
    `Rules:`,
    `- Output exactly ONE fenced code block and nothing else.`,
    `- Always close the code block with triple backticks.`,
    `- Code must be complete and compilable/runnable for the target platform.`,
    `- Prefer the most efficient correct algorithm.`,
    commentRule
  ]).join("\n");
}

// One raw call to Gemini. Returns { text, finishReason }.
async function callGeminiOnce({ apiKey, model, contents, maxOutputTokens }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens
    }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch (_) {
      detail = await res.text();
    }
    throw new Error(`Gemini API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text =
    cand?.content?.parts?.map((p) => p.text || "").join("") || "";
  const finishReason = cand?.finishReason || "STOP";
  return { text, finishReason };
}

// Quick heuristics to decide whether the output is complete.
function looksTruncated(text) {
  if (!text) return true;
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) return true; // unmatched fence

  // Only inspect braces/parens inside fenced code blocks.
  let codeOnly = "";
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) codeOnly += m[1] + "\n";
  if (!codeOnly) codeOnly = text; // no fences => treat whole response as code

  let curly = 0, paren = 0, square = 0;
  for (const ch of codeOnly) {
    if (ch === "{") curly++; else if (ch === "}") curly--;
    else if (ch === "(") paren++; else if (ch === ")") paren--;
    else if (ch === "[") square++; else if (ch === "]") square--;
  }
  return curly > 0 || paren > 0 || square > 0;
}

// Robust call with automatic continuation on MAX_TOKENS truncation.
async function callGemini({ apiKey, model, prompt }) {
  // Use the selected model's published maximum output-token limit so we
  // never artificially throttle long generations (e.g. 2.5 Flash = 65536).
  const maxOutputTokens = getMaxOutputTokens(model);
  const MAX_ROUNDS = 3;      // prompt + up to 2 continuations (safety net)

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  let combined = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { text, finishReason } = await callGeminiOnce({
      apiKey, model, contents, maxOutputTokens
    });

    if (!text && !combined) {
      throw new Error("Gemini returned an empty response.");
    }
    combined += text;

    const truncated =
      finishReason === "MAX_TOKENS" || looksTruncated(combined);
    if (!truncated) return combined;

    // Ask the model to continue exactly where it stopped.
    contents.push({ role: "model", parts: [{ text }] });
    contents.push({
      role: "user",
      parts: [{
        text:
          "Your previous response was cut off. Continue from EXACTLY where " +
          "you stopped — do not repeat any characters you already produced, " +
          "do not add prose, and make sure the final output ends with a " +
          "properly closed fenced code block."
      }]
    });
  }

  // Still truncated after retries — return what we have with a warning
  // appended. The popup will surface this clearly.
  if (looksTruncated(combined)) {
    const warning =
      "\n\n> ⚠️ **Warning:** The response appears incomplete (likely hit the " +
      "model's output limit). Try switching to a different model in Settings, " +
      "or turn off “Include explanation” to get just the code.";
    // Close a dangling fence so Markdown still renders sanely.
    const fenceCount = (combined.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) combined += "\n```";
    combined += warning;
  }
  return combined;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "SOLVE_PROBLEM") {
    (async () => {
      try {
        const { apiKey, model, includeComments, includeExplanation } = await getConfig();
        if (!apiKey) {
          sendResponse({
            ok: false,
            error:
              "No API key set. Right-click the extension icon → Options, and add your Google AI Studio API key."
          });
          return;
        }
        const prompt = buildPrompt(msg.payload, { includeComments, includeExplanation });
        const solution = await callGemini({
          apiKey,
          model,
          prompt
        });
        sendResponse({ ok: true, solution, model });
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
    })();
    return true; // async response
  }
});

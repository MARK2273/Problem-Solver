// Background service worker: talks to Google Gemini (Google AI Studio) API.

const DEFAULT_MODEL = "gemini-2.0-flash";

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey", "model"], (items) => {
      resolve({
        apiKey: items.apiKey || "",
        model: items.model || DEFAULT_MODEL
      });
    });
  });
}

function buildPrompt({ title, body, platform, url, language }) {
  const lang = language || "Python";
  return [
    `You are an expert competitive programmer and coding interview coach.`,
    `A user is solving a problem on "${platform}" (${url}).`,
    ``,
    `Problem title: ${title}`,
    ``,
    `Problem statement:`,
    `"""`,
    body || "(No problem text was extracted. Please ask the user to paste the statement.)",
    `"""`,
    ``,
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
    `// Clean, well-commented, ready-to-submit ${lang} solution.`,
    "```",
    ``,
    `## Walkthrough`,
    `- Dry-run the solution on one sample input.`,
    ``,
    `Rules:`,
    `- Produce only ONE code block, inside the "Solution" section.`,
    `- Code must be complete and compilable/runnable for the target platform.`,
    `- Prefer the most efficient correct algorithm.`,
    `- Keep explanations concise and beginner-friendly.`
  ].join("\n");
}

async function callGemini({ apiKey, model, prompt }) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 4096
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
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  if (!text.trim()) {
    throw new Error("Gemini returned an empty response.");
  }
  return text;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "SOLVE_PROBLEM") {
    (async () => {
      try {
        const { apiKey, model } = await getConfig();
        if (!apiKey) {
          sendResponse({
            ok: false,
            error:
              "No API key set. Right-click the extension icon → Options, and add your Google AI Studio API key."
          });
          return;
        }
        const prompt = buildPrompt(msg.payload);
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

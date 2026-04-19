const SUPPORTED_HOSTS = [
  "leetcode.com",
  "hackerrank.com",
  "codeforces.com",
  "geeksforgeeks.org",
  "codechef.com",
  "atcoder.jp"
];

const $ = (id) => document.getElementById(id);

function setStatus(text, kind = "") {
  const el = $("status");
  el.className = "status " + kind;
  el.classList.remove("hidden");
  el.innerHTML = text;
}
function hideStatus() { $("status").classList.add("hidden"); }

function labelPlatform(host) {
  if (!host) return "Unknown site";
  if (host.includes("leetcode")) return "LeetCode";
  if (host.includes("hackerrank")) return "HackerRank";
  if (host.includes("codeforces")) return "Codeforces";
  if (host.includes("geeksforgeeks")) return "GeeksforGeeks";
  if (host.includes("codechef")) return "CodeChef";
  if (host.includes("atcoder")) return "AtCoder";
  return host;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupported(url) {
  try {
    const u = new URL(url);
    return SUPPORTED_HOSTS.some((h) => u.hostname.includes(h));
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (_) {
    // Script may already be injected; that's fine.
  }
}

async function extractProblem(tab) {
  await ensureContentScript(tab.id);
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROBLEM" }, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!resp) {
        reject(new Error("No response from page."));
      } else {
        resolve(resp);
      }
    });
  });
}

async function solveWithGemini(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "SOLVE_PROBLEM", payload },
      (resp) => resolve(resp || { ok: false, error: "No response from background." })
    );
  });
}

// Minimal, safe Markdown -> HTML renderer (no external libs).
function renderMarkdown(md) {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  let html = "";
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) { html += "</ul>"; listOpen = false; }
  };

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = fence[1] || "";
        codeBuf = [];
      } else {
        html +=
          `<pre><code data-lang="${esc(codeLang)}">` +
          esc(codeBuf.join("\n")) +
          `</code></pre>`;
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s*/, "");
      const tag = level <= 2 ? "h2" : "h3";
      html += `<${tag}>${esc(text)}</${tag}>`;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!listOpen) { html += "<ul>"; listOpen = true; }
      const text = line.replace(/^\s*[-*]\s+/, "");
      html += `<li>${inline(text)}</li>`;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList();
      const text = line.replace(/^\s*>\s?/, "");
      html += `<blockquote>${inline(text)}</blockquote>`;
      continue;
    }
    if (line.trim() === "") { closeList(); continue; }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  if (inCode) {
    html +=
      `<pre><code data-lang="${esc(codeLang)}">` +
      esc(codeBuf.join("\n")) +
      `</code></pre>`;
  }
  closeList();
  return html;

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
}

// Robustly pull code out of a Gemini response. Handles:
//   - standard fenced blocks with/without a language tag
//   - unterminated fences (model forgot the closing ```)
//   - "code-only" responses with no fences at all
//   - leading/trailing whitespace and stray prose around a single block
function extractCodeBlock(md) {
  if (!md) return "";
  // Drop any truncation-warning blockquote the background may have appended
  // so it never ends up on the user's clipboard.
  const text = String(md).replace(/\n>\s*⚠️[\s\S]*$/u, "").trim();

  // 1. Try a fully-fenced block (most common).
  const fenced = text.match(/```[^\n]*\n([\s\S]*?)```/);
  if (fenced && fenced[1].trim()) return fenced[1].replace(/\s+$/, "");

  // 2. Unterminated fence: opening ``` but no closing one.
  const openOnly = text.match(/```[^\n]*\n([\s\S]*)$/);
  if (openOnly && openOnly[1].trim()) {
    return openOnly[1].replace(/```+\s*$/, "").replace(/\s+$/, "");
  }

  // 3. No fences at all. If the whole response looks like code
  //    (code-only mode, or model returned raw code), use it verbatim.
  const trimmed = text.trim();
  if (trimmed && looksLikeCode(trimmed)) return trimmed;

  // 4. As a last resort, fall back to whatever is rendered inside a <pre><code>.
  const pre = document.querySelector("#solutionBody pre code");
  if (pre && pre.textContent.trim()) return pre.textContent.replace(/\s+$/, "");

  return "";
}

function looksLikeCode(s) {
  // Heuristic: lots of code-ish punctuation, or recognizable keywords,
  // and not dominated by prose sentences.
  if (/^#{1,6}\s/m.test(s)) return false; // has markdown headings
  const codeSignals = /[{};]|=>|def\s|class\s|function\s|public\s|#include|import\s|console\.|print\(|return\s/;
  return codeSignals.test(s);
}

async function onSolveClick() {
  hideStatus();
  $("solution").classList.add("hidden");
  $("problemPreview").classList.add("hidden");

  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    setStatus("No active tab.", "error");
    return;
  }
  if (!isSupported(tab.url)) {
    setStatus(
      "This page isn't a recognized coding-platform problem page. Open a problem on LeetCode, HackerRank, Codeforces, GFG, CodeChef, or AtCoder.",
      "error"
    );
    return;
  }

  $("solveBtn").disabled = true;
  setStatus(`<span class="spinner"></span> Reading the problem…`, "info");

  let probData;
  try {
    probData = await extractProblem(tab);
  } catch (err) {
    setStatus("Couldn't read the page: " + err.message, "error");
    $("solveBtn").disabled = false;
    return;
  }

  $("problemTitle").textContent = probData.title || "Untitled";
  $("problemBody").textContent = probData.body
    ? probData.body.slice(0, 400) + (probData.body.length > 400 ? "…" : "")
    : "(Problem text couldn't be auto-extracted. Gemini will rely on the title/URL.)";
  $("problemPreview").classList.remove("hidden");

  setStatus(`<span class="spinner"></span> Asking Gemini for a solution…`, "info");

  const language = $("language").value;
  const resp = await solveWithGemini({
    title: probData.title,
    body: probData.body,
    platform: probData.platform,
    url: probData.url,
    language
  });

  $("solveBtn").disabled = false;

  if (!resp.ok) {
    setStatus("Error: " + resp.error, "error");
    return;
  }

  $("modelLabel").textContent = "Model: " + (resp.model || "gemini");
  $("solutionBody").innerHTML = renderMarkdown(resp.solution);
  $("solutionBody").dataset.raw = resp.solution;
  $("solution").classList.remove("hidden");

  // If the background flagged the response as incomplete, keep a visible
  // warning up so the user never mistakes half-code for a full solution.
  if (/Warning:\s*The response appears incomplete/i.test(resp.solution)) {
    setStatus(
      "Response was incomplete and could not be fully recovered. See the warning below the solution.",
      "error"
    );
  } else {
    hideStatus();
  }
}

function onCopyCode() {
  const md = $("solutionBody").dataset.raw || "";
  if (!md.trim()) {
    setStatus("Nothing to copy yet — generate a solution first.", "error");
    return;
  }

  const code = extractCodeBlock(md);

  // Fallback: if we still couldn't isolate a code block, copy the whole
  // response so the user isn't stuck, and tell them why.
  if (!code) {
    navigator.clipboard.writeText(md).then(() => {
      setStatus(
        "Couldn't detect a code block — copied the full response instead.",
        "info"
      );
      setTimeout(hideStatus, 2500);
    }).catch((e) => {
      setStatus("Copy failed: " + e.message, "error");
    });
    return;
  }

  navigator.clipboard.writeText(code).then(() => {
    setStatus("Code copied to clipboard.", "info");
    setTimeout(hideStatus, 1500);
  }).catch((e) => {
    setStatus("Copy failed: " + e.message, "error");
  });
}
function onCopyAll() {
  const md = $("solutionBody").dataset.raw || "";
  if (!md.trim()) {
    setStatus("Nothing to copy yet — generate a solution first.", "error");
    return;
  }
  navigator.clipboard.writeText(md).then(() => {
    setStatus("Full solution copied.", "info");
    setTimeout(hideStatus, 1500);
  }).catch((e) => {
    setStatus("Copy failed: " + e.message, "error");
  });
}

async function init() {
  const tab = await getActiveTab();
  try {
    const host = new URL(tab.url).hostname;
    $("platformLabel").textContent = labelPlatform(host);
  } catch {
    $("platformLabel").textContent = "Unknown site";
  }

  chrome.storage.sync.get(["language", "apiKey"], (items) => {
    if (items.language) $("language").value = items.language;
    if (!items.apiKey) {
      setStatus(
        'No API key set. Click <a href="#" id="goOpts">Settings</a> to add your free Google AI Studio key.',
        "error"
      );
      const link = document.getElementById("goOpts");
      if (link) link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
  });

  $("language").addEventListener("change", (e) => {
    chrome.storage.sync.set({ language: e.target.value });
  });
  $("solveBtn").addEventListener("click", onSolveClick);
  $("copyBtn").addEventListener("click", onCopyCode);
  $("copyAllBtn").addEventListener("click", onCopyAll);
  $("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

document.addEventListener("DOMContentLoaded", init);

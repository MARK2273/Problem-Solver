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

async function fixWithGemini(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "FIX_PROBLEM", payload },
      (resp) => resolve(resp || { ok: false, error: "No response from background." })
    );
  });
}

// Holds the last successful solve so "Fix / Improve" can reference it.
// Persisted to chrome.storage.local keyed per-problem so closing/reopening
// the popup (or coming back after copying an error from the judge) keeps
// the context intact.
const lastSolve = {
  title: null,
  body: null,
  platform: null,
  url: null,
  language: null,
  solution: null, // raw markdown from Gemini
  code: null      // extracted code only
};

// Build a stable storage key for a problem URL. We strip query strings and
// hashes so e.g. LeetCode's "?envType=..." variants still share memory.
function solveKeyFromUrl(url) {
  try {
    const u = new URL(url);
    return "solve:" + u.hostname + u.pathname.replace(/\/+$/, "");
  } catch {
    return "solve:unknown";
  }
}

async function persistLastSolve() {
  if (!lastSolve.url) return;
  const key = solveKeyFromUrl(lastSolve.url);
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [key]: { ...lastSolve, savedAt: Date.now() } },
      resolve
    );
  });
}

async function loadLastSolveForUrl(url) {
  const key = solveKeyFromUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (items) => resolve(items[key] || null));
  });
}

async function clearLastSolveForUrl(url) {
  const key = solveKeyFromUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], resolve);
  });
}

function resetLastSolve() {
  lastSolve.title = null;
  lastSolve.body = null;
  lastSolve.platform = null;
  lastSolve.url = null;
  lastSolve.language = null;
  lastSolve.solution = null;
  lastSolve.code = null;
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

  await renderSolution(resp, {
    title: probData.title,
    body: probData.body,
    platform: probData.platform,
    url: probData.url,
    language
  });
}

// Render a Gemini response, remember it as the "last solve", auto-copy code,
// and surface any incompleteness warning. Shared by solve and fix flows.
async function renderSolution(resp, ctx) {
  $("modelLabel").textContent = "Model: " + (resp.model || "gemini");
  $("solutionBody").innerHTML = renderMarkdown(resp.solution);
  $("solutionBody").dataset.raw = resp.solution;
  $("solution").classList.remove("hidden");

  const extractedCode = extractCodeBlock(resp.solution);
  lastSolve.title = ctx.title;
  lastSolve.body = ctx.body;
  lastSolve.platform = ctx.platform;
  lastSolve.url = ctx.url;
  lastSolve.language = ctx.language;
  lastSolve.solution = resp.solution;
  lastSolve.code = extractedCode;

  // Persist so closing/reopening the popup (or copying an error from the
  // judge and coming back) doesn't wipe the Fix / Improve context.
  persistLastSolve();

  // Reset the fix panel state on each new render.
  $("fixPanel").classList.add("hidden");
  $("fixError").value = "";

  // Reveal the "New" button so the user can start from scratch anytime.
  $("newBtn").classList.remove("hidden");

  const incomplete = /Warning:\s*The response appears incomplete/i.test(resp.solution);

  const { autoCopyCode } = await getPrefs(["autoCopyCode"]);
  if (autoCopyCode && extractedCode) {
    try {
      await navigator.clipboard.writeText(extractedCode);
      setStatus(
        incomplete
          ? "Code auto-copied, but the response was incomplete — check the warning below."
          : "Code auto-copied to clipboard — paste it into your editor.",
        incomplete ? "error" : "info"
      );
      if (!incomplete) setTimeout(hideStatus, 2500);
      return;
    } catch (e) {
      setStatus("Auto-copy failed: " + e.message + ". Use the Copy code button.", "error");
      return;
    }
  }

  if (incomplete) {
    setStatus(
      "Response was incomplete and could not be fully recovered. See the warning below the solution.",
      "error"
    );
  } else {
    hideStatus();
  }
}

// Helper: read prefs from chrome.storage with sensible defaults.
function getPrefs(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (items) => {
      const out = {};
      for (const k of keys) {
        if (k === "autoCopyCode") {
          out[k] = items[k] === undefined ? true : !!items[k];
        } else {
          out[k] = items[k];
        }
      }
      resolve(out);
    });
  });
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

function onToggleFixPanel() {
  if (!lastSolve.solution) {
    setStatus("Generate a solution first, then you can ask for a fix.", "error");
    return;
  }
  const panel = $("fixPanel");
  const willOpen = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (willOpen) {
    $("fixError").focus();
  }
}

function onCancelFix() {
  $("fixPanel").classList.add("hidden");
  $("fixError").value = "";
}

async function onSubmitFix() {
  if (!lastSolve.solution || !lastSolve.code) {
    setStatus("No previous solution to fix. Generate one first.", "error");
    return;
  }

  const errorText = $("fixError").value.trim();
  $("fixSubmitBtn").disabled = true;
  $("fixCancelBtn").disabled = true;
  setStatus(`<span class="spinner"></span> Analyzing error & improving the code…`, "info");

  const resp = await fixWithGemini({
    title: lastSolve.title,
    body: lastSolve.body,
    platform: lastSolve.platform,
    url: lastSolve.url,
    language: lastSolve.language,
    previousCode: lastSolve.code,
    errorText
  });

  $("fixSubmitBtn").disabled = false;
  $("fixCancelBtn").disabled = false;

  if (!resp.ok) {
    setStatus("Error: " + resp.error, "error");
    return;
  }

  await renderSolution(resp, {
    title: lastSolve.title,
    body: lastSolve.body,
    platform: lastSolve.platform,
    url: lastSolve.url,
    language: lastSolve.language
  });
}

// Restore a previously-generated solution for the current problem URL so
// the user can keep iterating (Fix / Improve) across popup close/reopen.
async function restoreSolutionForTab(tab) {
  if (!tab || !tab.url) return;
  const saved = await loadLastSolveForUrl(tab.url);
  if (!saved || !saved.solution) return;

  lastSolve.title = saved.title;
  lastSolve.body = saved.body;
  lastSolve.platform = saved.platform;
  lastSolve.url = saved.url;
  lastSolve.language = saved.language;
  lastSolve.solution = saved.solution;
  lastSolve.code = saved.code;

  if (saved.language) $("language").value = saved.language;

  $("problemTitle").textContent = saved.title || "Untitled";
  $("problemBody").textContent = saved.body
    ? saved.body.slice(0, 400) + (saved.body.length > 400 ? "…" : "")
    : "(Problem text couldn't be auto-extracted.)";
  $("problemPreview").classList.remove("hidden");

  $("solutionBody").innerHTML = renderMarkdown(saved.solution);
  $("solutionBody").dataset.raw = saved.solution;
  $("solution").classList.remove("hidden");
  $("newBtn").classList.remove("hidden");

  setStatus(
    "Restored your previous solution for this problem. Paste an error below and click Fix / Improve to iterate, or click New to start over.",
    "info"
  );
  setTimeout(hideStatus, 4000);
}

async function onNewSession() {
  const tab = await getActiveTab();
  if (tab && tab.url) {
    await clearLastSolveForUrl(tab.url);
  }
  resetLastSolve();

  $("solution").classList.add("hidden");
  $("problemPreview").classList.add("hidden");
  $("fixPanel").classList.add("hidden");
  $("fixError").value = "";
  $("solutionBody").innerHTML = "";
  $("solutionBody").dataset.raw = "";
  $("newBtn").classList.add("hidden");
  $("modelLabel").textContent = "Model: —";

  setStatus("Cleared. Ready for a fresh solve.", "info");
  setTimeout(hideStatus, 1500);
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
  $("fixToggleBtn").addEventListener("click", onToggleFixPanel);
  $("fixCancelBtn").addEventListener("click", onCancelFix);
  $("fixSubmitBtn").addEventListener("click", onSubmitFix);
  $("newBtn").addEventListener("click", onNewSession);
  $("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // After wiring handlers, try to restore a prior solution for this page.
  await restoreSolutionForTab(tab);
}

document.addEventListener("DOMContentLoaded", init);

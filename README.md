# AI Problem Solver — Browser Extension

An AI-powered browser extension that reads the coding problem on your current
tab (LeetCode, HackerRank, Codeforces, GeeksforGeeks, CodeChef, AtCoder) and
generates a complete, ready-to-submit solution using **Google AI Studio
(Gemini)**.

If your solution fails on the judge, paste the error back into the popup and
the extension iterates on the code — it remembers the last solution per
problem, even after you close the popup.

All models offered in Settings have a **free tier**. Your API key is stored
locally in your browser — no third-party servers are involved.

---

## Table of contents

- [Features](#features)
- [Supported sites](#supported-sites)
- [Get a free Gemini API key](#get-a-free-gemini-api-key)
- [Install](#install-chrome--edge--brave)
- [First-time setup](#first-time-setup)
- [Daily usage](#daily-usage)
  - [Solve a problem](#1-solve-a-problem)
  - [Auto-copy](#2-auto-copy)
  - [Fix / Improve when the code fails](#3-fix--improve-when-the-code-fails)
  - [Persistent memory per problem](#4-persistent-memory-per-problem)
  - [Start fresh with New](#5-start-fresh-with-new)
- [Settings reference](#settings-reference)
- [Troubleshooting](#troubleshooting)
- [File layout](#file-layout)
- [Privacy](#privacy)
- [Responsible use](#responsible-use)

---

## Features

### Core

- **One-click solve** — click the toolbar icon, pick a language, hit
  **Read problem & solve**. The extension extracts the problem from the page
  and asks Gemini for a complete solution.
- **Auto-detected platform** — the popup shows which site you're on and only
  enables solving on supported problem pages.
- **9 languages** — Python, C++, Java, JavaScript, TypeScript, Go, C#, Rust,
  Kotlin. Your choice is remembered.
- **Structured output** — Understanding → Approach → Complexity → Solution →
  Walkthrough, rendered as clean Markdown inside the popup.
- **Copy code / Copy all** — one click copies just the code block (ready to
  paste into the judge's editor), or the entire solution with explanation.
- **Dark, modern UI** — compact popup (420×600) with a proper settings page.

### Smart output

- **Auto-copy after generation** — the extracted code lands on your clipboard
  automatically so you can immediately paste it into the editor. Toggle off
  in Settings if you prefer.
- **Include comments toggle** — turn inline comments off to shrink responses
  and save free-tier tokens. The prompt explicitly instructs Gemini to emit
  zero comments/docstrings/headers when off.
- **Include explanation toggle** — turn off to get *only* a fenced code block
  with no Understanding/Approach/Complexity/Walkthrough sections. Biggest
  token saver on long problems.
- **Model-aware output limits** — each Gemini model's published maximum
  output budget is used (e.g. 65 536 tokens for `gemini-2.5-flash`), so long
  solutions don't get artificially throttled.
- **Automatic continuation on truncation** — if Gemini still hits its output
  cap, the background continues the conversation (up to 2 extra rounds)
  asking the model to resume exactly where it left off. Unmatched braces,
  parentheses, and fenced code blocks are detected as truncation signals.
- **Graceful incomplete-response handling** — if the output is *still*
  incomplete after retries, the popup closes any dangling code fence, shows
  a red warning banner, and appends a `> ⚠️ Warning` blockquote in the
  solution explaining how to recover (switch model / turn off explanation).
- **Robust "Copy code"** — detects fenced blocks with or without language
  tags, recovers from unterminated fences, and falls back to treating the
  whole response as code when the model skips the fences entirely.

### Fix / Improve loop

- **Fix / Improve button** — shown below each solution. Opens a textarea
  where you paste the judge's feedback: compile errors, runtime errors,
  stack traces, **Wrong Answer on test N: expected X, got Y**, TLE/MLE
  messages, or your own description. Gemini receives the original problem
  + the previous code + the error, diagnoses the root cause, and returns an
  improved solution. You can iterate as many times as you need — each fix
  becomes the "previous code" for the next round.
- **Empty error = self-review** — leave the textarea blank and Gemini will
  audit the previous code for correctness and edge cases on its own.
- **Diagnosis sections** — when explanations are on, fix responses include
  `## Diagnosis`, `## Fix`, `## Complexity`, `## Solution (<lang>)` so you
  understand what changed and why.

### Memory & session

- **Persistent memory per problem** — every successful solve is saved to
  `chrome.storage.local` keyed by the problem URL (hostname + path, query
  strings ignored so LeetCode's `?envType=...` variants share a slot).
  Close the popup, copy the error from the judge, reopen the popup — your
  previous solution is waiting, ready for **Fix / Improve**.
- **New button** — a one-click reset that clears the saved solution for the
  current problem, hides the UI, and lets you start fresh. Only appears
  when there's something to clear.
- **Multi-problem aware** — each problem URL has its own memory slot, so
  switching tabs doesn't leak stale context between problems.

---

## Supported sites

The extension only activates on actual problem pages:

- `leetcode.com/problems/*`
- `hackerrank.com/challenges/*`
- `codeforces.com/problemset/problem/*` and `codeforces.com/contest/*/problem/*`
- `geeksforgeeks.org/problems/*` and `practice.geeksforgeeks.org/problems/*`
- `codechef.com/problems/*`
- `atcoder.jp/contests/*/tasks/*`

---

## Get a free Gemini API key

1. Go to <https://aistudio.google.com/app/apikey>.
2. Sign in with a Google account.
3. Click **Create API key** and copy it (starts with `AIza…`).

The free tier covers frequent personal use. No billing setup required.

### Available models

All models appear in the Settings dropdown. Higher output limits mean longer
solutions fit in a single call.

| Model | Max output tokens | Notes |
|---|---|---|
| `gemini-2.5-flash` | **65 536** | Best for long, commented solutions |
| `gemini-2.0-flash` (default) | 8 192 | Fast, balanced, free tier |
| `gemini-2.0-flash-lite` | 8 192 | Lighter, free tier |
| `gemini-1.5-flash` | 8 192 | Free tier |
| `gemini-1.5-flash-8b` | 8 192 | Smallest, fastest, free tier |

If one returns a quota error (HTTP 429), switch to another in Settings.

---

## Install (Chrome / Edge / Brave)

1. Download or clone this folder so you have every file locally:
   - `manifest.json`, `background.js`, `content.js`
   - `popup.html`, `popup.css`, `popup.js`
   - `options.html`, `options.css`, `options.js`
   - `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked** and select this `problem_solver` folder.
5. Pin the "AI Problem Solver" icon to your toolbar for quick access.

### Install on Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.

(Manifest V3 background service workers are supported on recent Firefox
versions. Temporary add-ons are removed on restart.)

### Regenerate icons (optional)

If you need to re-create the PNG icons from scratch:

```bash
python make_icons.py
```

Uses only the Python standard library — no dependencies.

---

## First-time setup

1. Click the extension icon in your toolbar.
2. Click the ⚙ gear (or right-click the icon → **Options**).
3. Paste your Gemini API key into **Google AI Studio API Key**.
4. Pick a **Model** (start with the default `gemini-2.0-flash`).
5. Configure **Output preferences** (all on by default):
   - **Include comments in code** — inline comments in the generated code.
   - **Include explanation** — Understanding/Approach/Complexity/Walkthrough
     sections. Turn off for code-only responses.
   - **Auto-copy code after generation** — copies the code to your clipboard
     as soon as Gemini finishes.
6. Click **Test connection** — you should see *"Success. Model replied: OK"*.
7. Click **Save**.

---

## Daily usage

### 1. Solve a problem

1. Open any problem on a supported site
   (e.g. `https://leetcode.com/problems/two-sum/`).
2. Click the extension icon.
3. Pick your language.
4. Click **Read problem & solve**.

The popup shows:

- A preview of the extracted problem (first 400 chars).
- A spinner while Gemini is working.
- The full solution with syntax-highlighted code blocks.

### 2. Auto-copy

If **Auto-copy code after generation** is on (default), the extracted code
lands on your clipboard the moment the solution renders. Paste it straight
into the judge's editor with <kbd>Ctrl</kbd>+<kbd>V</kbd>.

You can also click **Copy code** (code only) or **Copy all** (full Markdown)
any time.

### 3. Fix / Improve when the code fails

1. Paste the auto-copied code into the judge and submit.
2. The judge rejects it with *Wrong Answer*, *TLE*, *Runtime Error*, or a
   compile error.
3. Copy the judge's error / failing test case.
4. Back in the extension popup, click **Fix / Improve** (below the solution).
5. Paste the error into the textarea.
6. Click **Regenerate with fix**.

Gemini receives the original problem, your previous code, and the error. It
diagnoses the root cause and returns a corrected solution — auto-copied to
your clipboard, ready to resubmit. Repeat until accepted.

Leave the textarea blank to ask Gemini to self-review the previous code
without a specific error.

### 4. Persistent memory per problem

Close the popup, copy the error from the platform, reopen the popup — your
previous solution for that problem is restored automatically, with a small
banner saying so. The **Fix / Improve** flow works seamlessly across popup
close/reopen.

Each problem URL has its own memory slot, so switching tabs doesn't mix
contexts.

### 5. Start fresh with New

When you're done with a problem (or want to discard the saved solution
before retrying from scratch), click the **New** button in the top bar:

- Clears the saved solution for the current URL.
- Resets the popup UI.
- Hides itself until the next successful solve.

---

## Settings reference

| Setting | Default | Effect |
|---|---|---|
| API key | *(empty)* | Required; stored via `chrome.storage.sync`. |
| Model | `gemini-2.0-flash` | Which Gemini model to call. |
| Include comments in code | On | Inline comments inside the code block. |
| Include explanation | On | Understanding/Approach/Complexity/Walkthrough sections. |
| Auto-copy code after generation | On | Copies the code to clipboard on success. |

All output preferences apply to both normal solves and the Fix / Improve
flow.

---

## Troubleshooting

- **"No API key set"** — open Options and add your Gemini key.
- **"This page isn't a recognized coding-platform problem page"** — open a
  problem URL on one of the supported sites (see list above).
- **Quota / 429 errors** — the free tier has per-minute and per-day limits.
  Wait a minute or switch to a lighter model (`gemini-2.0-flash-lite` or
  `gemini-1.5-flash-8b`).
- **Empty / partial problem extraction** — LeetCode sometimes loads problem
  content asynchronously. Wait for it to render fully, then click solve
  again.
- **"⚠️ Warning: The response appears incomplete"** — Gemini hit its output
  cap even after auto-continuation. Switch to `gemini-2.5-flash` in
  Settings (65 k output tokens) or turn off **Include explanation** for a
  shorter, code-only response.
- **"Auto-copy failed"** — the popup lost focus during generation. Use
  **Copy code** manually, or keep the popup active until generation
  completes.
- **"Failed to fetch"** — check your internet connection and that
  `https://generativelanguage.googleapis.com` is reachable. Corporate and
  school networks sometimes block it.
- **Fix / Improve says "Generate a solution first"** — there's no saved
  solution for the current URL. Solve the problem first, or navigate back
  to the same problem page (memory is per-URL).

---

## File layout

```
problem_solver/
├── manifest.json         # MV3 extension manifest (permissions, scripts)
├── background.js         # Service worker: Gemini API, auto-continuation, fix prompts
├── content.js            # Extracts problem text from supported sites
├── popup.html            # Toolbar popup UI (solve / copy / fix / new)
├── popup.css             # Popup styling
├── popup.js              # Popup logic, clipboard, memory, Fix flow
├── options.html          # Settings page UI
├── options.css           # Settings styling (toggle switches, cards)
├── options.js            # Settings load/save/test
├── icons/                # Extension icons (16 / 48 / 128 px)
├── make_icons.py         # Optional: regenerate icons (Python stdlib only)
└── README.md             # This file
```

---

## Privacy

- **API key** stored via `chrome.storage.sync` and sent only to
  `https://generativelanguage.googleapis.com` in API requests.
- **Saved solutions** stored via `chrome.storage.local`, keyed by the
  problem URL. Never leaves your browser. Click **New** (or uninstall the
  extension) to wipe them.
- **Problem text** is sent to Google's Gemini API for solving and fixing.
- **No analytics, no third-party servers, no tracking.**

---

## Responsible use

This tool is intended for **learning, practice, and interview prep**. Don't
submit AI-generated solutions in contests, take-home assessments, or
interviews where doing so would violate the platform's rules or the
employer's expectations.

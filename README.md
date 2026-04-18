# AI Problem Solver — Browser Extension

An AI-powered browser extension that reads the coding problem on your current tab
(LeetCode, HackerRank, Codeforces, GeeksforGeeks, CodeChef, AtCoder) and generates
a complete, well-explained solution using **Google AI Studio (Gemini)**.

All models offered in the settings have a **free tier**. Your API key is stored
locally in your browser.

## Features

- One-click "Read problem & solve" from the extension popup
- Auto-detection of the platform and problem content
- Choose solution language: Python, C++, Java, JavaScript, TypeScript, Go, C#, Rust, Kotlin
- Structured output: Understanding → Approach → Complexity → Solution → Walkthrough
- Copy just the code, or the whole solution, with one click
- Clean dark UI

## Supported sites

- `leetcode.com/problems/*`
- `hackerrank.com/challenges/*`
- `codeforces.com/problemset/problem/*` and `codeforces.com/contest/*/problem/*`
- `geeksforgeeks.org/problems/*` and `practice.geeksforgeeks.org/problems/*`
- `codechef.com/problems/*`
- `atcoder.jp/contests/*/tasks/*`

## Get a free Gemini API key

1. Go to <https://aistudio.google.com/app/apikey>
2. Sign in with a Google account
3. Click **Create API key** and copy it (starts with `AIza…`)

The free tier is enough for frequent personal use. No billing setup is required.

## Install the extension (Chrome / Edge / Brave)

1. Download or clone this folder so you have all of these files locally:
   - `manifest.json`, `background.js`, `content.js`
   - `popup.html`, `popup.css`, `popup.js`
   - `options.html`, `options.css`, `options.js`
   - `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
2. Open your browser and go to `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked** and pick this `problem_solver` folder.
5. The "AI Problem Solver" icon will appear in your toolbar. Pin it for quick access.

## Install on Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select the `manifest.json` file.
   (Manifest V3 background service workers are supported on recent Firefox versions.)

## First-time setup

1. Click the extension icon, then click the gear ⚙ (or right-click → **Options**).
2. Paste your Gemini API key.
3. Pick a model (default `gemini-2.0-flash` is fast and free).
4. Click **Test connection** → you should see a success message.
5. Click **Save**.

## Use it

1. Open any problem on a supported site (e.g. `https://leetcode.com/problems/two-sum/`).
2. Click the extension icon.
3. Pick your language and click **Read problem & solve**.
4. The extension extracts the problem from the page and asks Gemini for a solution.
5. Use **Copy code** to paste the code into the site's editor, or **Copy all** for the full breakdown.

## Troubleshooting

- **"No API key set"** — open Options and add your Gemini key.
- **"This page isn't a recognized coding-platform problem page"** — open a problem URL
  on one of the supported sites (see list above).
- **Quota / 429 errors** — the free tier has per-minute/day limits. Wait a minute or
  switch to a lighter model (`gemini-2.0-flash-lite` or `gemini-1.5-flash-8b`).
- **Empty / partial problem extraction** — LeetCode sometimes loads content slowly.
  Wait for the problem to fully render, then click solve again.
- **"Failed to fetch"** — check your internet connection and that `https://generativelanguage.googleapis.com`
  is reachable (corporate/school networks sometimes block it).

## File layout

```
problem_solver/
├── manifest.json        # MV3 extension manifest
├── background.js        # Service worker: calls Gemini API
├── content.js           # Extracts problem text from supported sites
├── popup.html/.css/.js  # Toolbar popup UI
├── options.html/.css/.js# Settings page (API key, model)
├── icons/               # Extension icons (16/48/128)
└── make_icons.py        # Regenerate icons (optional; Python stdlib only)
```

## Privacy

- Your API key is stored via `chrome.storage.sync` and sent only to
  `generativelanguage.googleapis.com` in API requests.
- The extracted problem text is sent to Google's Gemini API for solving.
- No analytics, no third-party servers.

## Notes on responsible use

This tool is intended for learning, practice, and interview prep. Don't submit
AI-generated solutions in contests, assessments, or interviews where doing so
would violate the platform's rules.

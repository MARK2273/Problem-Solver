// Content script: extracts the problem text from supported coding platforms.

(function () {
  const PLATFORM = detectPlatform(location.hostname, location.pathname);

  function detectPlatform(host, path) {
    if (host.includes("leetcode.com")) return "leetcode";
    if (host.includes("hackerrank.com")) return "hackerrank";
    if (host.includes("codeforces.com")) return "codeforces";
    if (host.includes("geeksforgeeks.org")) return "gfg";
    if (host.includes("codechef.com")) return "codechef";
    if (host.includes("atcoder.jp")) return "atcoder";
    return "unknown";
  }

  function cleanText(text) {
    if (!text) return "";
    return text
      .replace(/\r/g, "")
      .replace(/\t/g, "  ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getTextFromSelectors(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 40) {
        return cleanText(el.innerText);
      }
    }
    return "";
  }

  function extractLeetCode() {
    const title =
      document.querySelector('[data-cy="question-title"]')?.innerText ||
      document.querySelector('div[class*="text-title"]')?.innerText ||
      document.title.replace(" - LeetCode", "");

    const body = getTextFromSelectors([
      'div[data-track-load="description_content"]',
      'div.elfjS',
      'div[class*="question-content"]',
      'div[class*="description__"]',
      'meta[name="description"]'
    ]);

    return { title: cleanText(title), body };
  }

  function extractHackerRank() {
    const title =
      document.querySelector("h1.ui-icon-label")?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title;

    const body = getTextFromSelectors([
      ".challenge-body-html",
      ".problem-statement",
      ".hackdown-content",
      "#original-problem-statement"
    ]);

    return { title: cleanText(title), body };
  }

  function extractCodeforces() {
    const title =
      document.querySelector(".problem-statement .title")?.innerText ||
      document.title;
    const body = getTextFromSelectors([".problem-statement"]);
    return { title: cleanText(title), body };
  }

  function extractGFG() {
    const title =
      document.querySelector(".problems_header_content__title__L2cB2")?.innerText ||
      document.querySelector("h3.problems_header_content__title__L2cB2")?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title;
    const body = getTextFromSelectors([
      ".problems_problem_content__Xm_eO",
      ".problem-statement",
      ".problems_description__Xxu7l",
      "article"
    ]);
    return { title: cleanText(title), body };
  }

  function extractCodeChef() {
    const title =
      document.querySelector("#problem-statement h3")?.innerText ||
      document.querySelector("h1")?.innerText ||
      document.title;
    const body = getTextFromSelectors([
      "#problem-statement",
      ".problem-statement",
      "#problem-body"
    ]);
    return { title: cleanText(title), body };
  }

  function extractAtCoder() {
    const title =
      document.querySelector(".h2")?.innerText ||
      document.querySelector("span.h2")?.innerText ||
      document.title;
    const body = getTextFromSelectors([
      "#task-statement",
      ".lang-en",
      ".part"
    ]);
    return { title: cleanText(title), body };
  }

  function extractGeneric() {
    const title = document.title;
    const body = cleanText(document.body ? document.body.innerText : "");
    return { title, body: body.slice(0, 8000) };
  }

  function extractProblem() {
    try {
      switch (PLATFORM) {
        case "leetcode": return extractLeetCode();
        case "hackerrank": return extractHackerRank();
        case "codeforces": return extractCodeforces();
        case "gfg": return extractGFG();
        case "codechef": return extractCodeChef();
        case "atcoder": return extractAtCoder();
        default: return extractGeneric();
      }
    } catch (err) {
      return { title: document.title, body: "", error: String(err) };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "EXTRACT_PROBLEM") {
      const data = extractProblem();
      sendResponse({
        platform: PLATFORM,
        url: location.href,
        title: data.title || "Untitled problem",
        body: data.body || "",
        error: data.error || null
      });
      return true;
    }
  });
})();

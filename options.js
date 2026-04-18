const $ = (id) => document.getElementById(id);

function setStatus(msg, ok = true) {
  const el = $("status");
  el.className = "status " + (ok ? "ok" : "err");
  el.classList.remove("hidden");
  el.textContent = msg;
}

function load() {
  chrome.storage.sync.get(["apiKey", "model"], (items) => {
    if (items.apiKey) $("apiKey").value = items.apiKey;
    if (items.model) $("model").value = items.model;
  });
}

function save() {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value;
  if (!apiKey) { setStatus("API key is required.", false); return; }
  chrome.storage.sync.set({ apiKey, model }, () => {
    setStatus("Saved.");
  });
}

async function testConnection() {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value;
  if (!apiKey) { setStatus("Enter an API key first.", false); return; }

  setStatus("Testing…");
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(
        "Failed: " + (err?.error?.message || `HTTP ${res.status}`),
        false
      );
      return;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    setStatus("Success. Model replied: " + text.trim().slice(0, 40));
  } catch (e) {
    setStatus("Network error: " + e.message, false);
  }
}

function toggleVisibility() {
  const input = $("apiKey");
  const btn = $("toggleVis");
  if (input.type === "password") {
    input.type = "text"; btn.textContent = "Hide";
  } else {
    input.type = "password"; btn.textContent = "Show";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("saveBtn").addEventListener("click", save);
  $("testBtn").addEventListener("click", testConnection);
  $("toggleVis").addEventListener("click", toggleVisibility);
});

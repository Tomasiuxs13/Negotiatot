const API_METHODS = new Map([
  ["/api/extension/context", "POST"],
  ["/api/extension/replies", "POST"],
]);

function settings() {
  return chrome.storage.local.get(["counterpartServerUrl", "counterpartApiKey"]);
}

async function requestCounterpart(message) {
  const expectedMethod = API_METHODS.get(message.path);
  const method = String(message.method || "GET").toUpperCase();
  if (!expectedMethod || method !== expectedMethod) {
    throw new Error("That Counterpart request is not allowed.");
  }

  const stored = await settings();
  const serverUrl = stored.counterpartServerUrl?.replace(/\/+$/, "");
  const apiKey = stored.counterpartApiKey;
  if (!serverUrl || !apiKey) {
    throw new Error("Connect the extension to Counterpart first.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${serverUrl}${message.path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: message.body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Counterpart returned ${response.status}.`);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Counterpart at ${serverUrl} did not respond.`);
    }
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        `Cannot reach Counterpart at ${serverUrl}. Open the extension and run Save and test.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "counterpart-api" || sender.id !== chrome.runtime.id) return false;

  requestCounterpart(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Counterpart request failed.",
      }),
    );
  return true;
});

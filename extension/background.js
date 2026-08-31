const API_METHODS = new Map([
  ["/api/extension/context", "POST"],
  ["/api/extension/replies", "POST"],
  ["/api/extension/gmail-sync", "POST"],
]);

const GMAIL_SYNC_ALARM = "counterpart-gmail-sync";
const GMAIL_SYNC_MINUTES = 5;

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

async function ensureGmailSyncAlarm() {
  const alarm = await chrome.alarms.get(GMAIL_SYNC_ALARM);
  if (!alarm) {
    await chrome.alarms.create(GMAIL_SYNC_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: GMAIL_SYNC_MINUTES,
    });
  }
}

async function runAutomaticGmailSync() {
  const stored = await settings();
  if (!stored.counterpartServerUrl || !stored.counterpartApiKey) {
    return { skipped: true };
  }
  try {
    const payload = await requestCounterpart({
      path: "/api/extension/gmail-sync",
      method: "POST",
    });
    await chrome.storage.local.set({
      counterpartGmailSyncAt: new Date().toISOString(),
      counterpartGmailSyncError: null,
      counterpartGmailSyncResult: payload,
    });
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic Gmail sync failed.";
    await chrome.storage.local.set({
      counterpartGmailSyncAt: new Date().toISOString(),
      counterpartGmailSyncError: message,
    });
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureGmailSyncAlarm().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureGmailSyncAlarm().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === GMAIL_SYNC_ALARM) runAutomaticGmailSync().catch(() => {});
});

// Service workers may be restarted independently of the browser lifecycle.
ensureGmailSyncAlarm().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === "counterpart-sync-now") {
    ensureGmailSyncAlarm()
      .then(runAutomaticGmailSync)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Automatic Gmail sync failed.",
        })
      );
    return true;
  }

  if (message?.type !== "counterpart-api") return false;

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

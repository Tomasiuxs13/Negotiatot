const serverInput = document.querySelector("#serverUrl");
const keyInput = document.querySelector("#apiKey");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");

function normaliseServerUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function showStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

chrome.storage.local.get(["counterpartServerUrl", "counterpartApiKey"], (stored) => {
  serverInput.value = stored.counterpartServerUrl || "http://localhost:3000";
  keyInput.value = stored.counterpartApiKey || "";
});

saveButton.addEventListener("click", async () => {
  const serverUrl = normaliseServerUrl(serverInput.value);
  const apiKey = keyInput.value.trim();
  if (!/^https?:\/\//i.test(serverUrl)) {
    showStatus("Enter a full http:// or https:// Counterpart URL.", "error");
    return;
  }
  if (!apiKey.startsWith("cpk_")) {
    showStatus("Paste the API key generated in Counterpart Settings.", "error");
    return;
  }

  saveButton.disabled = true;
  showStatus("Testing connection…");
  try {
    const server = new URL(serverUrl);
    const originPattern = `${server.protocol}//${server.hostname}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) throw new Error("Counterpart site access was not granted.");
    const response = await fetch(`${serverUrl}/api/extension/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Counterpart returned ${response.status}.`);
    await chrome.storage.local.set({
      counterpartServerUrl: serverUrl,
      counterpartApiKey: apiKey,
    });
    showStatus("Connected. Open Gmail and select the C button.", "success");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Connection failed.", "error");
  } finally {
    saveButton.disabled = false;
  }
});

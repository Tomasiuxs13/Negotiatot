(() => {
  if (window.top !== window || document.querySelector("#counterpart-gmail-extension")) return;

  const state = {
    expanded: false,
    loading: false,
    config: null,
    thread: null,
    context: null,
    notice: "",
    error: "",
    lastLocation: location.href,
    pollTimer: null,
  };

  const host = document.createElement("div");
  host.id = "counterpart-gmail-extension";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .cp-launcher, .cp-panel { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .cp-launcher { position: fixed; right: 18px; top: 92px; z-index: 2147483647; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 14px; background: #4338ca; color: #fff; font-size: 20px; font-weight: 850; box-shadow: 0 10px 28px rgba(30, 41, 59, .24); cursor: pointer; }
    .cp-launcher:hover { background: #3730a3; }
    .cp-panel { position: fixed; right: 18px; top: 72px; z-index: 2147483647; width: 370px; max-height: calc(100vh - 92px); overflow: auto; border: 1px solid #dbe2ea; border-radius: 16px; background: #f8fafc; color: #172033; box-shadow: 0 24px 70px rgba(15, 23, 42, .28); }
    .cp-header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e2e8f0; background: rgba(248, 250, 252, .96); padding: 14px 15px; backdrop-filter: blur(8px); }
    .cp-brand { display: flex; align-items: center; gap: 10px; }
    .cp-logo { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: #4338ca; color: white; font-size: 16px; font-weight: 850; }
    .cp-eyebrow { margin: 0 0 2px; color: #6366f1; font-size: 9px; font-weight: 850; letter-spacing: .15em; text-transform: uppercase; }
    .cp-title { margin: 0; font-size: 14px; font-weight: 780; }
    .cp-icon-button { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid #dbe2ea; border-radius: 8px; background: white; color: #475569; font-size: 17px; cursor: pointer; }
    .cp-body { display: grid; gap: 11px; padding: 13px; }
    .cp-card { border: 1px solid #e2e8f0; border-radius: 12px; background: white; padding: 13px; }
    .cp-card h3 { margin: 0; color: #172033; font-size: 13px; font-weight: 780; }
    .cp-card p { margin: 5px 0 0; color: #64748b; font-size: 11px; line-height: 1.55; }
    .cp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .cp-pill { display: inline-flex; margin-top: 7px; border-radius: 999px; background: #eef2ff; padding: 4px 8px; color: #4338ca; font-size: 10px; font-weight: 750; }
    .cp-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 11px; }
    .cp-metric { border-radius: 8px; background: #f8fafc; padding: 8px; }
    .cp-metric span { display: block; color: #94a3b8; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .cp-metric strong { display: block; margin-top: 2px; color: #334155; font-size: 12px; }
    .cp-preview { max-height: 116px; overflow: auto; white-space: pre-wrap; border-left: 3px solid #c7d2fe; padding-left: 9px; color: #475569 !important; }
    .cp-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .cp-button { border: 1px solid #cbd5e1; border-radius: 8px; background: white; padding: 8px 10px; color: #334155; font-size: 11px; font-weight: 750; cursor: pointer; }
    .cp-button:hover { border-color: #818cf8; color: #3730a3; }
    .cp-button-primary { border-color: #4338ca; background: #4338ca; color: white; }
    .cp-button-primary:hover { background: #3730a3; color: white; }
    .cp-button:disabled { cursor: wait; opacity: .55; }
    .cp-draft { white-space: pre-wrap; max-height: 180px; overflow: auto; border-radius: 9px; background: #f8fafc; padding: 10px; color: #334155 !important; }
    .cp-alert { border-radius: 10px; padding: 10px 11px; font-size: 11px; line-height: 1.45; }
    .cp-alert-info { border: 1px solid #c7d2fe; background: #eef2ff; color: #3730a3; }
    .cp-alert-error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
    .cp-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border: 2px solid #c7d2fe; border-top-color: #4338ca; border-radius: 50%; vertical-align: -2px; animation: cp-spin .8s linear infinite; }
    @keyframes cp-spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) { .cp-panel { inset: 58px 8px auto; width: auto; max-height: calc(100vh - 70px); } .cp-launcher { right: 10px; top: 66px; } }
  `;
  root.appendChild(style);

  const container = document.createElement("div");
  root.appendChild(container);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && styles.display !== "none" && styles.visibility !== "hidden";
  };

  function extractEmail(element) {
    const raw =
      element?.getAttribute?.("email") ||
      element?.getAttribute?.("data-hovercard-id") ||
      element?.getAttribute?.("href")?.replace(/^mailto:/i, "") ||
      "";
    const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0]?.toLowerCase() || null;
  }

  function messageBody(node) {
    const preferred = node.querySelector(".a3s, [data-message-id] [dir='ltr'], [data-message-id] [dir='auto']");
    const text = (preferred || node).innerText?.trim() || "";
    return text.slice(0, 40_000);
  }

  function readGmailThread() {
    const main = document.querySelector("div[role='main']");
    if (!main) return null;

    const subject =
      main.querySelector("h2.hP")?.textContent?.trim() ||
      main.querySelector("h2")?.textContent?.trim() ||
      document.title.replace(/\s+-\s+Gmail.*$/i, "").trim();
    const contactNodes = main.querySelectorAll(
      "span[email], [data-hovercard-id*='@'], a[href^='mailto:']"
    );
    const contacts = [...new Set([...contactNodes].map(extractEmail).filter(Boolean))];

    const rawNodes = [
      ...main.querySelectorAll("div.adn, div[data-message-id], [data-legacy-message-id]"),
    ].filter(visible);
    const seen = new Set();
    const messages = [];
    for (const node of rawNodes) {
      const body = messageBody(node);
      if (!body || body.length < 2) continue;
      const senderNode = node.querySelector(
        "span[email], [data-hovercard-id*='@'], a[href^='mailto:']"
      );
      const senderEmail = extractEmail(senderNode);
      const key = `${senderEmail || "unknown"}|${body}`;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({ senderEmail, body });
    }

    const hashParts = location.hash.split("/").filter(Boolean);
    const threadId = hashParts.at(-1) || location.pathname;
    return {
      subject: subject.slice(0, 500),
      contacts,
      threadId: threadId.slice(0, 300),
      latest: messages.at(-1) || null,
    };
  }

  const money = (value) =>
    value == null
      ? "—"
      : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  async function settings() {
    const stored = await chrome.storage.local.get([
      "counterpartServerUrl",
      "counterpartApiKey",
    ]);
    if (!stored.counterpartServerUrl || !stored.counterpartApiKey) return null;
    return {
      serverUrl: stored.counterpartServerUrl.replace(/\/+$/, ""),
      apiKey: stored.counterpartApiKey,
    };
  }

  async function api(path, options = {}) {
    state.config ||= await settings();
    if (!state.config) throw new Error("Connect the extension to Counterpart first.");
    const response = await chrome.runtime.sendMessage({
      type: "counterpart-api",
      path,
      method: options.method || "GET",
      body: options.body,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Counterpart request failed.");
    }
    return response.payload;
  }

  async function refreshContext({ quiet = false } = {}) {
    state.thread = readGmailThread();
    state.context = null;
    state.error = "";
    if (!state.thread) {
      if (!quiet) state.notice = "Open a Gmail conversation first.";
      render();
      return;
    }
    if (!state.config) state.config = await settings();
    if (!state.config) {
      render();
      return;
    }
    state.loading = true;
    if (!quiet) state.notice = "";
    render();
    try {
      state.context = await api("/api/extension/context", {
        method: "POST",
        body: JSON.stringify({ contacts: state.thread.contacts }),
      });
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Could not load Counterpart.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function fingerprint(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function logLatestReply() {
    if (state.context?.status !== "matched" || !state.thread?.latest) return;
    state.loading = true;
    state.error = "";
    state.notice = "Recording the reply…";
    render();
    try {
      const latest = state.thread.latest;
      const id = await fingerprint(
        `${state.thread.threadId}|${latest.senderEmail || "unknown"}|${latest.body}`
      );
      const result = await api("/api/extension/replies", {
        method: "POST",
        body: JSON.stringify({
          dealId: state.context.deal.id,
          contacts: state.thread.contacts,
          senderEmail: latest.senderEmail,
          body: latest.body,
          subject: state.thread.subject,
          threadId: state.thread.threadId,
          fingerprint: id,
        }),
      });
      state.notice = result.duplicate
        ? "This message is already in Counterpart."
        : result.notice || (result.drafting ? "Reply recorded. Counterpart is drafting…" : "Reply recorded.");
      await refreshContext({ quiet: true });
      if (result.drafting) startDraftPolling(state.context?.recommendation?.messageId ?? null);
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Could not record the reply.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function startDraftPolling(previousId) {
    clearInterval(state.pollTimer);
    let attempts = 0;
    state.pollTimer = setInterval(async () => {
      attempts += 1;
      if (!state.expanded || attempts > 24) {
        clearInterval(state.pollTimer);
        return;
      }
      await refreshContext({ quiet: true });
      const currentId = state.context?.recommendation?.messageId ?? null;
      if (currentId && currentId !== previousId && !state.context?.deal?.jobStatus) {
        state.notice = "New draft ready.";
        clearInterval(state.pollTimer);
        render();
      }
    }, 5000);
  }

  function copyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    state.notice = "Draft copied.";
    render();
  }

  function insertIntoComposer(text) {
    const editors = [...document.querySelectorAll("div[contenteditable='true'][role='textbox']")].filter(visible);
    const editor = editors.at(-1);
    if (!editor) {
      state.error = "Open a Gmail reply composer first, then choose Insert again.";
      render();
      return;
    }
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    state.notice = "Draft inserted. Review it before sending.";
    state.error = "";
    render();
  }

  function recommendationHtml(recommendation) {
    if (!recommendation) return "";
    return `
      <section class="cp-card">
        <div class="cp-row"><h3>Recommended next move</h3><span class="cp-pill">${money(recommendation.proposedOffer)}</span></div>
        <p>${escapeHtml(recommendation.headline)}</p>
        <p class="cp-draft">${escapeHtml(recommendation.drafts.balanced)}</p>
        <div class="cp-actions">
          <button class="cp-button cp-button-primary" data-action="insert" data-draft="balanced">Insert balanced</button>
          <button class="cp-button" data-action="copy" data-draft="balanced">Copy</button>
          <button class="cp-button" data-action="insert" data-draft="warm">Insert warm</button>
          <button class="cp-button" data-action="insert" data-draft="firm">Insert firm</button>
        </div>
      </section>`;
  }

  function contextHtml() {
    if (!state.config) {
      return `<section class="cp-card"><h3>Connect Counterpart</h3><p>Add your Counterpart URL and API key in the extension settings.</p><div class="cp-actions"><button class="cp-button cp-button-primary" data-action="settings">Open settings</button></div></section>`;
    }
    if (!state.thread) {
      return `<section class="cp-card"><h3>No conversation selected</h3><p>Open a Gmail thread, then refresh Counterpart.</p></section>`;
    }
    if (state.loading && !state.context) {
      return `<section class="cp-card"><p><span class="cp-spinner"></span>Matching this thread…</p></section>`;
    }
    const context = state.context;
    if (!context) return "";
    if (context.status === "unmatched") {
      return `<section class="cp-card"><h3>No creator match</h3><p>None of this thread’s email addresses belongs to a Counterpart partner. Add or update the creator in Counterpart, then refresh.</p></section>`;
    }
    if (context.status === "partner_only") {
      return `<section class="cp-card"><h3>${escapeHtml(context.partner.name)}</h3><p>The creator is known, but there is no live deal to attach this conversation to.</p></section>`;
    }
    if (context.status === "ambiguous") {
      return `<section class="cp-card"><h3>Needs a manual match</h3><p>This conversation matches several creators or several live deals. Counterpart will not guess.</p></section>`;
    }

    const latest = state.thread.latest;
    return `
      <section class="cp-card">
        <div class="cp-row"><h3>${escapeHtml(context.partner.name)}</h3><span class="cp-pill">${escapeHtml(context.deal.stage.replaceAll("_", " "))}</span></div>
        <p>${escapeHtml(context.deal.campaign || "No campaign")} · ${escapeHtml(context.deal.statusLabel || "Live deal")}</p>
        <div class="cp-metrics">
          <div class="cp-metric"><span>Their ask</span><strong>${money(context.deal.currentAsk)}</strong></div>
          <div class="cp-metric"><span>Our offer</span><strong>${money(context.deal.currentOffer)}</strong></div>
          <div class="cp-metric"><span>Target</span><strong>${money(context.deal.target)}</strong></div>
          <div class="cp-metric"><span>Walk-away</span><strong>${money(context.deal.walkaway)}</strong></div>
        </div>
        <div class="cp-actions">
          <button class="cp-button" data-action="open-deal">Open deal</button>
        </div>
      </section>
      ${latest ? `<section class="cp-card"><h3>Latest visible message</h3><p>${escapeHtml(latest.senderEmail || "Sender not detected")}</p><p class="cp-preview">${escapeHtml(latest.body)}</p><div class="cp-actions"><button class="cp-button cp-button-primary" data-action="log" ${state.loading ? "disabled" : ""}>Log reply &amp; draft</button></div></section>` : `<section class="cp-card"><h3>No readable message</h3><p>Expand the latest Gmail message, then refresh.</p></section>`}
      ${context.deal.jobStatus === "recommending" ? `<div class="cp-alert cp-alert-info"><span class="cp-spinner"></span>Counterpart is drafting the next move. You may close this panel.</div>` : ""}
      ${recommendationHtml(context.recommendation)}`;
  }

  function render() {
    if (!state.expanded) {
      container.innerHTML = `<button class="cp-launcher" data-action="toggle" title="Open Counterpart">C</button>`;
      return;
    }
    container.innerHTML = `
      <aside class="cp-panel" aria-label="Counterpart for Gmail">
        <header class="cp-header">
          <div class="cp-brand"><div class="cp-logo">C</div><div><p class="cp-eyebrow">Counterpart</p><h2 class="cp-title">Influencer manager</h2></div></div>
          <div class="cp-actions" style="margin:0"><button class="cp-icon-button" data-action="refresh" title="Refresh">↻</button><button class="cp-icon-button" data-action="toggle" title="Close">×</button></div>
        </header>
        <div class="cp-body">
          ${state.notice ? `<div class="cp-alert cp-alert-info">${escapeHtml(state.notice)}</div>` : ""}
          ${state.error ? `<div class="cp-alert cp-alert-error">${escapeHtml(state.error)}</div>` : ""}
          ${contextHtml()}
        </div>
      </aside>`;
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle") {
      state.expanded = !state.expanded;
      state.notice = "";
      state.error = "";
      render();
      if (state.expanded) await refreshContext();
    } else if (action === "refresh") {
      await refreshContext();
    } else if (action === "settings") {
      chrome.runtime.openOptionsPage();
    } else if (action === "open-deal" && state.context?.status === "matched") {
      window.open(`${state.config.serverUrl}/deals/${state.context.deal.id}`, "_blank", "noopener");
    } else if (action === "log") {
      await logLatestReply();
    } else if (action === "copy" || action === "insert") {
      const draft = state.context?.recommendation?.drafts?.[button.dataset.draft];
      if (!draft) return;
      if (action === "copy") copyText(draft);
      else insertIntoComposer(draft);
    }
  });

  chrome.storage.onChanged.addListener(() => {
    state.config = null;
    if (state.expanded) refreshContext();
  });

  const observer = new MutationObserver(() => {
    if (location.href === state.lastLocation) return;
    state.lastLocation = location.href;
    state.thread = null;
    state.context = null;
    state.notice = "Conversation changed. Refreshing…";
    render();
    if (state.expanded) setTimeout(() => refreshContext({ quiet: true }), 650);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  settings().then((config) => {
    state.config = config;
    render();
  });
})();

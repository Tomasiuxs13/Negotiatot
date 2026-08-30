# Counterpart for Gmail

An unpacked Manifest V3 Chrome extension that places Counterpart beside the Gmail thread
you are reading. It uses Counterpart's own API key and does **not** request Gmail OAuth or
Google Workspace API scopes.

The Gmail content script sends API requests through the extension's background worker.
Chrome does not allow a Gmail content script to fetch a separate Counterpart origin
directly, even when the popup itself can reach that origin.

## Install locally

1. Start Counterpart (`npm run dev`) and open **Settings → API access**.
2. Generate and copy an API key.
3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select this `extension` directory.
5. Open the extension popup, enter the Counterpart URL (normally
   `http://localhost:3000`) and API key, then choose **Save and test**. Chrome asks for
   access to that Counterpart host at this point; this is separate from Gmail or Google
   Workspace authorization.
6. Open a Gmail conversation and select the purple **C** button.

## First-release behavior

- Reads email addresses and the latest expanded message from the currently open Gmail
  conversation.
- Matches only exact partner email addresses and refuses ambiguous live deals.
- Shows deal terms and the latest stored recommendation.
- Records the latest creator message only after **Log reply & draft** is selected.
- Lets the manager copy or insert a generated draft into an already-open Gmail composer.
- Never clicks Gmail's Send button.

The extension cannot see mail received while Gmail is closed or activity from another
device. Counterpart's Gmail API integration remains the reliable background-sync option.

## Security boundary

The API key is stored in `chrome.storage.local`, not synced storage. This is suitable for
the current private, single-manager build. Before public distribution, replace the
long-lived key with a short-lived extension session and publish a privacy policy covering
email processing.

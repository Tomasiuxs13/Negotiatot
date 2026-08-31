# Connect a personal Gmail inbox

Counterpart connects through Google OAuth — it never asks for, stores, or uses a Gmail
password. The first release asks only for the read-only Gmail scope, so it can build a
review queue but cannot send, archive, edit or delete Gmail messages.

## One-time Google setup

1. In Google Cloud Console, create a project you control and enable the **Gmail API**.
2. Configure the OAuth consent screen. For a personal inbox, choose an external app in
   testing and add your own Google account as a test user.
3. Create a **Web application** OAuth client. Add the exact callback URI shown in
   **Counterpart → Settings → Gmail inbox** to its Authorized redirect URIs.
4. Add these values to `counterpart/.env.local` (the file is ignored by git):

   ```env
   GMAIL_CLIENT_ID="…apps.googleusercontent.com"
   GMAIL_CLIENT_SECRET="…"
   GMAIL_TOKEN_ENCRYPTION_KEY="a-long-random-secret"
   # Optional when deploying somewhere other than the current local URL:
   # GMAIL_REDIRECT_URI="https://counterpart.example.com/api/integrations/gmail/callback"
   # Optional for the included VPS systemd timer:
   # GMAIL_SYNC_SECRET="another-long-random-secret"
   ```

   Generate the encryption key with `openssl rand -base64 32`. Keep it stable: changing it
   makes previously stored OAuth tokens intentionally unreadable, so Gmail must be connected
   again.
5. Restart Counterpart, open **Settings**, and choose **Connect my Gmail**. Google will show
   the requested access before you approve it.

> Google projects left in **Testing** issue Gmail refresh tokens that expire after seven days.
> That is fine for a private trial, but move the consent screen to production before relying on
> the connection long-term. A broadly distributed app using Gmail scopes may need Google
> verification; a Workspace administrator can still restrict it for their organization.

## What happens after connecting

Reload Counterpart's unpacked Chrome extension after installing version 0.2 or later, then use
**Save and test** in its popup. The extension creates a five-minute alarm. While Chrome and
Counterpart are running, that alarm asks the local app to read new Inbox and Sent messages through
the OAuth connection. The extension never receives or stores the Google token.

The first automatic check records a current-time watermark and imports nothing historical. From
then on, an exact partner email plus exactly one active negotiation is required:

- Sent mail is logged, and a Lead moves to Contacted.
- A reply is logged and marked as the manager's move; an offered/analyzing deal moves to
  Negotiating.
- Multiple live deals, agreed work, partner-only matches and unknown senders stay review-only.

**Inbox → Check now** runs the same new-mail pass immediately, then reads up to 50 previously
unseen inbox messages from the last 30 days into the review queue. Counterpart does not start a
Copilot run or send a message as part of automatic tracking.

On the VPS, install `deploy/counterpart-gmail-sync`, its `.service` and `.timer`, and store the
same `GMAIL_SYNC_SECRET` in the app environment and root-only
`/etc/counterpart-gmail-sync.env`. The timer calls Counterpart through loopback, so Traefik basic
auth remains intact and Chrome does not need to stay open.

## Workspace accounts

No administrator account is needed when your Workspace allows the OAuth consent. If the
organization blocks or restricts Gmail access for third-party applications, an administrator
must allow Counterpart’s OAuth client. Do not forward company mail to a personal account to
circumvent that policy.

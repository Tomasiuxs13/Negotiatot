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

**Inbox → Check Gmail for replies** reads up to 50 inbox messages from the last 30 days. A
sender email is matched to Counterpart’s primary or secondary partner contacts. A message can
be added in one click only when that partner has exactly one live deal; otherwise it remains in
the review queue for a manager to resolve. Adding it records the reply and asks the Copilot for
the next draft. It does not send a message through Gmail.

## Workspace accounts

No administrator account is needed when your Workspace allows the OAuth consent. If the
organization blocks or restricts Gmail access for third-party applications, an administrator
must allow Counterpart’s OAuth client. Do not forward company mail to a personal account to
circumvent that policy.

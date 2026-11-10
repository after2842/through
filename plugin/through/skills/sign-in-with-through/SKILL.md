---
name: sign-in-with-through
description: Use when a browser task reaches a website's login or sign-in page and the user has connected through. Checks whether this agent may use one of the user's connected accounts on that site and requests the sign-in through through, instead of asking the user for a password.
---

# Sign in with through

through holds the website accounts a user has connected and which agents may use each one. Use it when the browser you are driving lands on a login page in the middle of a task.

## Steps

1. Take the URL of the login page the browser is showing.
2. Call `check_sign_in_access` with that URL.
3. If the result says `allowed: true`, call `request_sign_in` with the same URL. Pass `tabId` and `browserSessionId` if your browser exposes them, and a `requestId` if you might retry the call. If more than one account is allowed, ask the user which one and pass its `accountId`.
4. Read the result. In the current preview it always includes `credentialsEntered: false`: through records a single-use grant but does not type anything. Tell the user that the sign-in needs them, wait until they have signed in in the same tab, then continue the original task.
5. If access is not allowed, explain the reason in plain words and what the user can do:
   - `paused`: agent access is paused in through; the user can resume it, or sign in themselves.
   - `no_account`: no account for this site is connected; the user can connect one in through, or sign in themselves.
   - `agent_not_allowed`: an account exists but does not allow this agent; the user can allow it on that connection in through.

## Rules

- Never ask the user to type a password, one-time code, recovery code, or API key into the conversation.
- Never type credentials into a page yourself and never read the contents of password fields.
- Only request sign-in for the site the browser is actually on, and only to continue the task the user asked for.
- Use `list_sign_in_accounts` when the user asks what is connected, and `list_recent_sign_in_activity` when they ask what happened.

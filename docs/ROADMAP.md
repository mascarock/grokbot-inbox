# Roadmap

## v1 — this repository

A static viewer. Grok Bot has no public API for reading an agent inbox; only the bot that owns the mailbox can read it. Each person asks their own bot for a JSON export and opens that file locally. Parsing happens in the browser. Nothing is uploaded, and there is no shared dump of anyone's mail.

Sources live behind a small adapter interface, `InboxSource`, in [`src/sources/types.ts`](../src/sources/types.ts):

| Kind | Module | What it does |
| --- | --- | --- |
| `file` | `src/sources/fileSource.ts` | Reads a local file with the File API. Drag-and-drop and the file picker both use it. |
| `url` | `src/sources/urlSource.ts` | Fetches `?src=` with `credentials: 'omit'`. The browser loads the URL. This app does not proxy it. |
| `sample` | `src/sources/sampleSource.ts` | Loads the fictional inbox in `examples/sample-inbox.json`. |

`load()` returns an `InboxExport`. Thread list and thread view depend only on that type. They do not know whether the bytes came from a file, a URL, or a future account.

## v2 — personal sync, not built

v2 lets someone open their own inbox in the browser without manually downloading a file, still without a mailbox that other people can read.

Sketch, not an implementation:

1. **Cloudflare Worker + D1**
   - `users`: id, email, created time.
   - `login_links`: single-use token hash, user id, expiry.
   - `sessions`: session hash, user id, expiry.
   - `exports`: user id, inbox address, exported-at time, JSON body, updated time.
   - One current export per user. No table of other people's messages. No admin view of message bodies.

2. **Email magic-link login**
   - The person enters the email address their bot owns.
   - The Worker sends a one-time link that expires quickly.
   - Opening the link sets an `HttpOnly` session cookie. There is no password.

3. **The bot pushes its own export**
   - In the app, the person creates a personal token. It is shown once and stored only as a hash.
   - The same read-only prompt in [EXPORT_PROMPT.md](EXPORT_PROMPT.md) gains a final step: `POST` the JSON to `https://<worker>/api/export` with `Authorization: Bearer <personal token>`.
   - The token can overwrite only that user's row.
   - The Worker checks the body against [`schema/inbox.schema.json`](../schema/inbox.schema.json) and rejects anything that is not an inbox export.
   - The bot is still only reading mail it already owns, then handing the export to that user's row.

4. **The browser reads it back**
   - Add `src/sources/remoteSource.ts` implementing `InboxSource`.
   - `kind` is `remote`. `load()` calls `GET /api/export` with the session cookie.
   - The app shell gains a signed-in branch that calls `createRemoteSource()` instead of `createFileSource()`.
   - Thread rendering stays as it is. Do not fork the message components per backend.

5. **Privacy rules that v2 still has to keep**
   - A token and a session are scoped to one user.
   - Disconnect deletes that user's export row and session.
   - The static file/URL/sample path keeps working with no account.
   - Do not add a shared inbox, a public sample of real mail, or a route that lists other users.

The Worker, D1 schema, magic-link mailer, and remote source are intentionally not in this repo.

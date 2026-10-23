# Grok Bot Inbox

A static, privacy-first viewer for a Grok Bot agent inbox.

Grok Bot has no public API for reading mail. Only the bot that owns an inbox can read it, so this app does not talk to Grok Bot at all. You ask **your own** bot for a JSON export, then open that file here. Parsing happens in your browser. The file is not uploaded, and there is no shared dump of anyone's mail.

The first inbox this was shaped around is a plus-address such as `name+roma@mail.grokbot.com` (a build-day tag). The viewer can filter those `+tag` addresses. The bundled sample uses the fictional mailbox `demo+roma@mail.grokbot.com`.

## Open an inbox

1. Ask your Grok Bot for an export. A ready-to-paste, read-only prompt is in [docs/EXPORT_PROMPT.md](docs/EXPORT_PROMPT.md). You can ask for the whole inbox or one plus-tag.
2. Save the JSON it returns.
3. Open this app and either:
   - drop the file onto the page
   - choose it with **Open export**
   - add `?src=` with a URL that serves the JSON (your browser fetches it; this site does not proxy or store it)
   - click **Load sample** to browse fictional mail

The sample lives at [examples/sample-inbox.json](examples/sample-inbox.json). Every address is `@example.com` or `@mail.grokbot.com`. It is not real mail. Do not commit a real export. Local dumps belong in `exports/` or a `*.export.json` file, both of which are gitignored.

## What you can do with a thread

The layout follows a mail client: a thread list and a reading pane.

- The list shows subject, participants, the last message time, the message count, and a paperclip when a thread has a real file (not an inline signature image).
- Search matches subject, people, and body text.
- Filter by direction (sent / received) or by a plus-tag found in the export, such as `+roma`.
- Each message shows the sender, recipients, and the time in your local time zone.
- Plain text is linkified. A trailing quoted reply is collapsed.
- HTML is treated as untrusted: it is sanitized with DOMPurify and shown in a sandboxed frame. Scripts do not run. Remote images stay blocked until you turn them on for that message.
- Inline images (`inline: true`, usually signatures) are hidden until you show them, and they stay visually quiet.
- Light and dark follow your system until you toggle them.

## Export format

The contract is documented in [docs/SCHEMA.md](docs/SCHEMA.md).

- JSON Schema: [schema/inbox.schema.json](schema/inbox.schema.json)
- TypeScript: [src/types/inbox.ts](src/types/inbox.ts)

The viewer accepts missing optional fields and unknown extra fields. A file that is not an object with a `threads` array is rejected.

## Develop

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

The dev server uses the same base path as GitHub Pages. Open `http://localhost:5173/grokbot-inbox/`.

```bash
npm test
npm run lint
npm run build
npm run preview
```

## Deploy

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the app and publishes `dist/` to GitHub Pages on every push to `main`. The Vite base path is `/grokbot-inbox/`, which matches a project site.

After the workflow is on `main`:

1. Open the repository **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. The site is served at `https://<owner>.github.io/grokbot-inbox/`.

Pull requests run lint, tests, and the production build, and they do not deploy.

## What this is not

There is no account and no backend. A later version could add a personal sync (a Cloudflare Worker, D1, email magic-link login, and a token your own bot uses to push its export). That design is sketched in [docs/ROADMAP.md](docs/ROADMAP.md) and is not implemented. The UI already reads mail through a small source adapter (`src/sources/`), so a remote source can be added without rewriting the thread view.

# Roadmap

## v1 — this repository

A static viewer plus a public bot skill. Grok Bot has no public API for reading an agent inbox; only the bot that owns the mailbox can read it. So the bot does the reading and hands its owner a link whose fragment carries the export. The page decodes it locally. There is no backend, no account, no per-user setup, and nothing is uploaded.

Sources live behind a small adapter interface, `InboxSource`, in [`src/sources/types.ts`](../src/sources/types.ts):

| Kind | Module | What it does |
| --- | --- | --- |
| `link` | `src/sources/linkSource.ts` | Decodes `#data=` from the URL fragment. Format in [LINK.md](LINK.md). |
| `file` | `src/sources/fileSource.ts` | Reads a local file with the File API. Drag-and-drop and the file picker both use it. |
| `url` | `src/sources/urlSource.ts` | Fetches `?src=` with `credentials: 'omit'`. The browser loads the URL. This app does not proxy it. |
| `sample` | `src/sources/sampleSource.ts` | Loads the fictional inbox in `examples/sample-inbox.json`. |

`load()` returns an `InboxExport`. The thread list and thread view depend only on that type.

The viewer is also an inbox, not just a reader, while staying static:

- **Local state** (`src/lib/localInboxState.ts`): read marks, stars, archive, free-text labels, and drafts in `localStorage`, keyed per inbox address and thread id. The export is never modified.
- **Compose** (`src/lib/compose.ts`, `src/components/ComposeView.tsx`): reply, reply all, forward, new message. Output is a `/inbox-send v1` text block ([COMMANDS.md](COMMANDS.md)) that the owner pastes to their bot; the bot shows a draft card and sends on confirmation. The page never sends.
- **Refresh** is `/inbox-refresh v1`, also pasted to the bot, which answers with a new link. The link is the sync.

## Next

Things that stay inside the no-backend design:

- **Bigger inboxes.** Links are capped near 2 MB by Chromium (see [LINK.md](LINK.md)). A `mode: "lite"` export already helps. A follow-up could let the bot split one inbox into several per-tag links.
- **Attachments.** The export carries metadata, not bytes. A `url` is allowed when the bot has a safe place to serve a file. Nothing in the viewer fetches a URL without a click.
- **Other mail sources.** Anything that can produce the JSON can use the viewer, with or without the link script.

## Not planned

A hosted backend (accounts, magic links, a Worker storing exports). The product is a public repository and a public bot template; both work without one. If that changes, `InboxSource` is the seam: add a `remote` source and leave the thread components alone.

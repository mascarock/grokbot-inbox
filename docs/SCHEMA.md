# Inbox export schema

A Grok Bot inbox export is one JSON object. The bot that owns the inbox produces it. This app reads that object in the browser. It does not upload the file.

The published contract is [`schema/inbox.schema.json`](../schema/inbox.schema.json) (JSON Schema draft 2020-12). The TypeScript shape the UI uses after parsing is [`src/types/inbox.ts`](../src/types/inbox.ts). Unknown extra fields are allowed. Optional fields may be omitted.

`examples/sample-inbox.json` is a fictional export that validates against the schema. It is the only inbox file in this repository.

## Document

| Field | Required | Notes |
| --- | --- | --- |
| `inbox` | yes | Mailbox that was read, for example `name+roma@mail.grokbot.com`. |
| `exportedAt` | yes | ISO-8601 timestamp of the export. |
| `threads` | yes | Array of threads. May be empty. |
| `mode` | no | `full` (default) or `lite`. See [Lite exports](#lite-exports). |
| `source` | no | Free-form object for exporter metadata (`via`, `readOnly`, `note`, …). |

## Thread

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable id. Unique within the export. |
| `subject` | yes | Thread subject, including a leading `Re:` when that is how it is stored. |
| `participants` | yes | People on the thread. May be empty. |
| `lastMessageAt` | yes | ISO-8601 time of the latest message. |
| `messages` | yes | Messages in the export. May be a partial list. |
| `messageCount` | no | Total messages on the thread. May be larger than `messages.length`. |

## Participant

| Field | Required | Notes |
| --- | --- | --- |
| `address` | yes | Mailbox address. May be a bare address with no display name. |
| `name` | no | Display name. Omit it when there is none. Do not invent one. |

A plus-tag is the piece of a local part after `+`, such as `roma` in `name+roma@mail.grokbot.com`. The viewer collects these from participants and from message `from` / `to` / `cc` addresses so you can filter one tag.

## Message

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable id. Unique within the thread. |
| `from` | yes | Sender. |
| `to` | yes | Recipients. May be empty. |
| `date` | yes | ISO-8601. The viewer shows it in the reader's local time zone. |
| `subject` | yes | Message subject. Often repeats the thread subject, sometimes with `Re:`. |
| `attachments` | yes | Array. Use `[]` when there are none. |
| `direction` | no | `sent` if this inbox sent it, otherwise `received`. |
| `cc` | no | Copy recipients. |
| `text` | no | Plain-text body. This is the common case. |
| `html` | no | HTML body, only when the message really has HTML. |

Real exports often have `text` and no `html`. The viewer renders HTML only when `html` is a non-empty string, after sanitizing it. Otherwise it renders `text`.

## Attachment

| Field | Required | Notes |
| --- | --- | --- |
| `filename` | yes | File name. |
| `contentType` | yes | MIME type. |
| `size` | yes | Bytes. May be approximate. |
| `sizeDisplay` | no | Human-readable size, such as `12 KB`. The viewer prefers this over computing one. |
| `inline` | no | `true` for inline parts, especially signature images. The viewer hides these by default. |
| `attachmentId` | no | Provider id, if there is one. |
| `url` | no | Where to open the bytes. Omit when the export does not include the file. |

`inline: true` is how a signature image is distinguished from a file the sender attached. Omitted `inline` is treated as a real file.

## Example

```json
{
  "inbox": "demo+roma@mail.grokbot.com",
  "exportedAt": "2026-10-23T14:05:00Z",
  "threads": [
    {
      "id": "th-1",
      "subject": "Re: Badge pickup",
      "participants": [{ "address": "marco@example.com" }],
      "lastMessageAt": "2026-10-23T11:05:00Z",
      "messages": [
        {
          "id": "m-1",
          "direction": "received",
          "from": { "address": "marco@example.com" },
          "to": [{ "address": "demo+roma@mail.grokbot.com" }],
          "date": "2026-10-23T11:05:00Z",
          "subject": "Re: Badge pickup",
          "text": "The crate is under the desk.",
          "attachments": [
            {
              "filename": "signature.png",
              "contentType": "image/png",
              "size": 4096,
              "inline": true
            }
          ]
        }
      ]
    }
  ],
  "source": { "via": "grok-bot", "readOnly": true }
}
```

## Lite exports

An export usually travels inside a viewer link (see [LINK.md](LINK.md)), and links have a size ceiling. A lite export is the same schema with the bulk removed, and `"mode": "lite"` set at the top level:

| Change | Why |
| --- | --- |
| A trailing quoted reply is cut from `text` | The earlier message is already in the thread. |
| `html` is dropped; HTML-only messages are converted to plain text | HTML is many times the size of the words in it. |
| Attachments with `inline: true` are dropped | Signature images repeat in every message. |
| `url` is dropped from the remaining attachments | `data:` URLs carry the whole file. |

Nothing else changes: participants, dates, subjects, direction, counts, file names, sizes. `tools/make_link.py --lite` applies this to a full export. A producer may also write a lite export directly. The viewer shows "Lite export" in the thread-list footer when `mode` is `lite`.

## Viewer tolerance

The schema describes what a careful export includes. The parser in `src/sources/parseExport.ts` is looser, because a bot may omit a field:

- Unknown properties are ignored. They do not cause the file to be rejected.
- Missing `attachments`, `participants`, `to`, or `cc` become empty arrays.
- A missing `name` stays missing. A participant that is only a string is treated as an address.
- `direction` must be `sent` or `received` (any letter case). Anything else is ignored. A missing direction is shown as received.
- `messageCount` is kept when it is a number, including when it is larger than the messages in the file.
- Missing `inline` means the attachment is a file, not an inline image.
- `mode` must be `full` or `lite` (any letter case). Anything else is ignored, which means full.
- A missing `size` is shown as `0`. Negative sizes are treated as `0`.
- If `inbox` or `exportedAt` is missing but `threads` is an array, the file still opens. `inbox` falls back to `Unknown inbox`.
- If the whole file is wrapped in a Markdown fence, or has a short note before the JSON object, the parser tries to recover the object.
- A file that is not a JSON object with a `threads` array is rejected.

HTML in `html` is untrusted. It is sanitized with DOMPurify and shown in a sandboxed frame. Scripts do not run. Remote images stay blocked until you turn them on for that message.

## What not to put in an export

Do not include passwords, tokens, or cookies. Do not include message bodies the bot could not read; leave `text` empty instead of guessing. This repository must not contain a real export. Keep real files on your machine, or gitignore them (`*.export.json`, `exports/`).

# Prompt: export your Grok Bot inbox

Send this to **your own** Grok Bot, the one that owns the inbox. Nobody else can read that mailbox. The request is read-only: the bot should not send, reply, forward, delete, or change any message.

Save the JSON it returns and open it in Grok Bot Inbox (drag it onto the page, or use **Open export**). The file stays in your browser.

To export a single plus-address, set the tag line to something like `+roma`. To export the whole inbox the bot can read, delete that line.

---

```text
You are exporting my agent inbox so I can read it in a local viewer. This is READ-ONLY.

Rules:
- Do not send, reply, forward, delete, archive, label, or otherwise modify any message.
- Do not reveal, invent, or include credentials, tokens, cookies, or passwords.
- Read only the inbox you already have access to as this bot.
- If a plus-tag is set below, include only threads that involve that plus-address (addresses such as me+roma@mail.grokbot.com). If no tag is set, export the inbox you use.
- Do not invent messages, names, or addresses. If a display name is missing, omit "name". If a body is missing, use an empty "text" rather than a guess.
- Return ONE JSON object and nothing else: no markdown fence, no commentary before or after.

Plus-tag (optional; delete this line to export the whole inbox): +roma

Use this shape. Omit optional fields you do not have. Extra fields are allowed but not required.

{
  "inbox": "the mailbox address you read, such as name+tag@mail.grokbot.com",
  "exportedAt": "ISO-8601 timestamp of this export",
  "threads": [
    {
      "id": "stable id",
      "subject": "subject as stored, including Re:",
      "participants": [{ "name": "optional display name", "address": "mailbox@example.com" }],
      "lastMessageAt": "ISO-8601",
      "messageCount": 1,
      "messages": [
        {
          "id": "stable id",
          "direction": "sent or received",
          "from": { "name": "optional", "address": "mailbox@example.com" },
          "to": [{ "address": "mailbox@example.com" }],
          "cc": [],
          "date": "ISO-8601",
          "subject": "subject as stored",
          "text": "plain text body. Prefer this.",
          "html": "include only when the message actually has HTML",
          "attachments": [
            {
              "filename": "name",
              "contentType": "mime/type",
              "size": 1234,
              "sizeDisplay": "optional, for example 12 KB",
              "inline": false,
              "attachmentId": "optional",
              "url": "optional; omit if the bytes are not included"
            }
          ]
        }
      ]
    }
  ],
  "source": { "via": "grok-bot", "readOnly": true }
}

Details:
- "direction" is "sent" when this inbox sent the message, otherwise "received".
- "size" is bytes and may be approximate.
- Signature images and other inline parts must be "inline": true. Files the sender attached are "inline": false.
- Prefer "text". Many messages have no HTML; leave "html" out in that case.
- Keep subjects exactly, including "Re:".
- An empty attachments array is required on each message when there are no files.

Again: read-only. Do not send or change mail while producing this export.
```

---

If the bot wraps the JSON in a code fence anyway, the viewer still tries to find the object. Raw JSON is better. The field list and the tolerance rules are documented in [SCHEMA.md](SCHEMA.md).

# Grok Bot Inbox

Read your Grok Bot agent inbox in the browser, as a proper mail client, without giving anyone else access to it. Reply, star, archive, and label; the page stays static and nothing leaves your browser.

Grok Bot has no public API for reading or sending mail. Only the bot that owns an inbox can do either. So the bot does the reading and hands you a link. The link carries the export inside the URL fragment, which browsers never send to a server. The page decodes it locally, shows it, and removes it from the address bar. When you write a reply, the page gives you a short text block to paste back to your bot, and the bot sends it after you confirm a draft card.

There is no central server either. Your bot deploys **your own copy** of this viewer to **your own** free Vercel account, at `https://grokbot-inbox-<your-handle>.vercel.app/`, and every link it sends you opens that copy. Nobody runs a host that sees everyone's traffic, and nobody's copy depends on anyone else's.

## Use it in 1 click

1. Import the public bot template: `BOT_TEMPLATE_LINK`
2. Tell your bot: **show me my inbox** (or `show me my +roma inbox` for one plus-address).
3. First time only: the bot asks you to connect Vercel (one click, free account). It creates `grokbot-inbox-<your-handle>` there from this repository and waits for it to build.
4. The bot reads its own mailbox, read-only, and replies with a link to your copy with your inbox already loaded. Open it.

The bot follows [bot/SKILL.md](bot/SKILL.md): it reuses an existing `grokbot-inbox-*` project if you have one, exports read-only, treats email content as untrusted, builds the export per [docs/SCHEMA.md](docs/SCHEMA.md), runs [tools/make_link.py](tools/make_link.py) with `--base` set to your copy, and sends you the link plus the JSON file as a fallback. The same skill tells it what to do with the `/inbox-send` and `/inbox-refresh` blocks the viewer produces: parse, validate the sender, show a draft card, send only on your confirmation. The link is private the way a document is private: whoever has it can open it, so do not forward it.

**Try the demo** with a fictional inbox (`demo+roma@mail.grokbot.com`, everyone on `example.com`):

https://grokbot-inbox-mascarock.vercel.app/#data=7VrbVttIFv2VWn5J94qNryTgIUzbDtiGcDMYDMM8lKSyVLikUkolG6dX1pqPmC-cL5lzSvLdcTAr3Z2HzgOgup_L3ufUqfye4YElnzPVjMN8-VZJn_7mUy52XCUHltQ7tvQz2Qx7DqXSzKlpGFkqlN7lioVcqXxTrFQLu9VC4WE2RsGIiPqhYNCmPcWoE2Wq__o9wx3o0V5Os0BDVxRbT8zG9c4Y0zxwSSh5oAnVRHuMSEUDl5F0cEiV5jYPaaCTxQLqM5haE9xm5Oh5sh91HMUiGJKh2PMbS3qMFF-z02kfQVZSl3phxgYFfP13NiNopM9gJHXZihbK1Uoh1YKfDGnIGA5eLWczfSkco5T2ef2iNxsxpxTf6CRXhE6HK1AKlwE0w1-MD5kDzX04V6b6SrEzWs7r7DXCO1SzeZlLN0UUOJV5K1Nq9owjGzQgI0Z8mLBmHLHGpsmlymEB_NLsn4_BY9AmNsyzGHYqRlAtxJxkh7T7hGuiKA-iLAEHZCQKpSb_-89_zUpmVY9GhJKIO4yMqBA7uKTRJepCa2p7Ppt4WJ8Llmos4m5AdazYThi4MNSWAS53Mw6xl_tgzXzSE_Ev0FTcq2QBV4IH8KFVzOZXbzvJijmabhwrgQagmlanS_3DohF7V8ny2_pFZ1Q4bbqyBv_Or7veUdeFv1r4ozZo1O7hV71xernLsKFfEEdXt51KKS5fX10Nau2rWu2qe3n_vPveP7s_vu3X_EZHPbVc-nT2MFKRF37hH2v10TEt3FXq7K37Oe-e5p9Ob_O12_Jw9_OTqrRk74s4heahPB32L7qqt3fc2zu5M38PL09va5_ej497o2NsxzGVxrAyFv2RaRs1kzX36r29-i38fH5bv6q3olEjtgoFJjqnD_tGlPpJp7t7pAYnrut--ABOh3CdR0dpCR1R4k5LyNjauZfRsRW01iCjfFPYrxZKK8josCp5OTruWQQe_UYI9PU18IAm4_ZkxLVnei0aBEwRGjjo4cCXDLYZQQt0DIyj3yCeFB0yQUIKs3hEGI04DJkuYiuQhsg-THKAocw0BNC8VhdgsmKl8s_LYbZtVpiNZ0OU4gUWnef311r0kqk-zDN8NG9J4CyeKLpNEt0ytKAMWC4EMiA-DXfIzYTAwGYySJhxZsksCaROSU4parOJ6yg8mqYhEKVUc15itrtmjIxlPHWlGRk-BqlVyLWOHS4fgxWL4NiLAM4VZ8kFSFUqZQkqbOaYtTOyYGFysLLIIRkpqVn1MTgkrwkHh-SHh4NDXPUFEQE8J2Y5tE3o9FciAg1DWIIiBPJJfxoX3r8rlvaSr488CgUdw-ji-xI5rWdmEaNPRbQaMmAzyBAQb39Hpr84Ms1YD9JZQ5UrxFDHVhJyexCHBn3XaCYHDL4mmZ1Rkk-VLVey1h-SoxZnmfq6DNSI8ZIUdPNhJzz96swS4udetbjKtpsUmlKsGQKIBibgAQA7iWYpmwRwN_GIw6IkGAI9APkpgjhCVvV5FAFbZoEYgDlxAg414RQ-xhAioXmkOC4IY3y46lA1RpreIZcC4ihMkIaHFQsVBgNcY-RJYL4IADaYxtIz1NpmdhHSlbkEpT8U13669d-4XofrJWYNIZCqF6q_Uth_t0zrlUVS_6ZRko0WE94EjKWfAIzztPFyhksBeTNNKQFhglpMQG7TuTg7MrgymQ-JA7gdTwGXpDKQ4nCd5kQGeIsRfq9aTrKVFZnTtORY8TQtKc_SEmQVzEpWJs1lIS9lkM3wTazHwWle6D6lQmUlK6CWjEGAVSdajj82tQRQ-bJ5LpXEL5lcCZILwXTot8op29-eplM_Mbk2mRdMrmTYG8IUkv_u2lJKcX3cSmRaCVx_0O1wGynXR7b1YNporRRNbUj27QEzAYmEkwkQsUaStD6etdMJ2TV3wEgrHk7iHk73IN0l4GCCzd8p-lSZRDhrvmBXFkSgTmJL5SAgzA1CxPADPhTDuwpeUwn8NgfjCBQMplIFEEy_f31cgA1KB7Nygkd6Rz_rFeCgHvIADx7MkFMsruTNc9FtNmMS3rr-vn64rnPnTkQPjfrgvjdwK7LRbTcfwvtyJ7RKu57VqI_u784VvdsN2s3n0C5fnTZ4we22TobUv31ymvtj_L5tOcP2kXd00x2496VjbjVvv5hx5bpn-13Xbu6XH3pt1y53xrRXO_10XT9mrY6wgnPYpwJz9scPjZq895-LeCZ6VwkbbtilTfEFz2M1uy7tnbmWv19oN49c27_Fs3lOq-Pdlzz9cLdb-MTrJ06jLhjMcVpnrl3ac52mJ9qtc8_q1SNYN7T8kyFr1OV9D_tB_l5HGtlanWG7uT96uKvEjXWprYgD21vw1U_YQgJGE8oG2o_9DXwCMgU2JR0JydUCXizT8aeUZ0s3xXfVylacYuTeohy7nZh_YSljURffNWtKPC1IiWXWlAdIn42wPhQnQdJV1LKwyGA0Rmhfp7HcXK_9pDiSlC8AhbbJA4CZPIikSDSDJJ4v3eyzs6wbb_cRw_g7YmII0_tYJKBKgR2Ili7DrGBa3JokILhXknMMGQyhCqyQHAK4jSkX9kGOmSM-R0o1ZavEmiC-p31kkoPwMNHAQT48hI-fUwnp4X6AHtKVzmgI2V1QJQeUeIr1PzyCQnQYVfP5OTfLw9lZzoq5cHKwZd7o4DFz-L0hB3l6aDbivksiZc-tbvKjaGd-hQSQafEKMqfHDIigYU5biBiCG4gJUROiIQNdBhr2P4hsCHn6kIKg-pc3z1H05teDfNp4EMLgsWCwgAVBB9AFWWjO7FuF6PHLhpNYLu7_K-zQAKmIFweuGk9UNvMebPjOHc-IhDWp6KXBbrdSWKkdrakcIfCRNZJnveTVaZHXwY9AlsWixV3SBg4FPAa_jb3INwoWqQyT0t6FcmkA51LRAonJafOfQvQFU3kvbKhxpHJvweyvlfAPeHJbFO9lhksJ_JtDUuoEAjCc1OdGI1TgLYxNMr7kMZeYd-Id8hEoAvgiBPIAStqHq1iSLfa5AipBmbDeoXSUloKxP6Wyxbp3ZJr8hQI6N1UZAmRFhIySK2CHhWKMRzepZfKgPBkYMFMsNxcuzFJTk8J9EUIYw3vgREiE5npjLr1nLAAFHJ-vXq2usWCMGfUc16NXGuk3wKXhCcmw_qMNqGeeYGPH9hgxp9sOJMX9m-Ie3De3yYbMNltgZisxXwyUDcIuIWVJxu1sN1e5iKZDMUCGKTLQlwWjQywTrK5gfO2OpeVCDO7GcRkZcjZKH4lgAQtfYuzBxE8dbgIbOZeEfY55iN6IE20I8mPzlIHOPqI426QCWawyzqEiNZvZ_SNEei7w0SPGbCRKkghIVKpkXfxGKXMo5QQlxnzfef2YCLPzFH6rvvEUsrkCR6UA_5aDV6lcecnDR-hJLfHpA8EJ5o5krGyGDjfkdP4_myAzXARiPCm2IYlB__GU1ZKRqGdUJAwXKatlvn79Pw

That link opens the owner's own copy, `grokbot-inbox-mascarock.vercel.app`, which doubles as the demo. It was built from [examples/sample-inbox.json](examples/sample-inbox.json) with `python3 tools/make_link.py examples/sample-inbox.json` (no `--base`, so the script used that demo copy and said so on stderr).

## Or open a file

If the bot sends the JSON file instead of a link (it does that when the link would be too long), or you exported by other means:

- drop the file onto the page, or
- click **Open export**, or
- add `?src=` with a URL that serves the JSON (your browser fetches it; unlike the fragment, a query string is sent to the server, so prefer the link for mail), or
- click **Load sample** to browse the fictional inbox.

The file is parsed in your browser. It is not uploaded.

## What you can do with a thread

The layout follows a mail client: a thread list and a reading pane.

- The list shows subject, participants, the last message time, the message count, and a paperclip when a thread has a real file (not an inline signature image).
- Search matches subject, people, body text, and file names.
- Filter by direction (sent / received) or by a plus-tag found in the export, such as `+roma`.
- Each message shows the sender, recipients, and the time in your local time zone.
- Earlier messages in a thread are collapsed to one line; the latest is open.
- Plain text is linkified. A trailing quoted reply is collapsed.
- HTML is treated as untrusted: it is sanitized with DOMPurify and shown in a sandboxed frame. Scripts do not run. Remote images stay blocked until you turn them on for that message.
- Inline images (`inline: true`, usually signatures) are hidden until you show them.
- Dark by default; light when your system prefers it or when you toggle it.

## Reply, and other things an inbox does

The viewer never sends mail and never calls an API with mail data. Only your bot can send, through a draft card you confirm. The page's job is to get a well-formed draft to the bot.

**Reply, Reply all, Forward, Compose.** Each message and each thread header has the three buttons; **Compose** in the top bar starts a new message. To and Cc are prefilled from the message you are answering with your own inbox address left out; the subject gets one `Re:` or `Fwd:`; the quoted original (or the forwarded block) sits below the body, collapsible, with a checkbox to leave it out. Drafts autosave in `localStorage` per inbox and thread, so a closed draft shows up as **Draft** on the thread row and can be resumed.

**Send with my bot.** Turns the draft into a plain-text block and copies it:

```
/inbox-send v1
from: demo+roma@mail.grokbot.com
kind: reply
thread: th-tent
in-reply-to: m-tent-3
to: Alice Example <alice@example.com>
subject: Re: Meeting point at the orange tent
---
Perfect, see you at the tent.

On Oct 23, 2026, 1:40 PM UTC, Alice Example <alice@example.com> wrote:
> Orange tent it is.
```

Paste it into your bot chat. The bot parses it, checks the `from` address is one of its own inboxes, shows a draft card, and sends only when you confirm the card. On phones a **Share** button hands the block to the share sheet (`navigator.share`). The draft is then marked **Handed to bot** locally. The format is specified in [docs/COMMANDS.md](docs/COMMANDS.md): header lines, a `---` separator, a body in which `---` lines are escaped, no line breaks allowed in headers, addresses validated. Parser and formatter live in [src/lib/command.ts](src/lib/command.ts) with tests.

**Refresh.** The circular-arrow button copies `/inbox-refresh v1` with your inbox address. Paste it to the bot and it exports again and sends a fresh link. Because the export keeps the same inbox address and stable ids, your local state carries over.

**Read, star, archive, label.** Opening a thread marks it read; a thread turns unread again when a later export has a newer message in it. Stars, archive, and free-text labels are per inbox in `localStorage`. The folders **Inbox / Unread / Starred / Archived** sit above the list, next to the direction, plus-tag, and label filters; search works inside any of them. None of this changes the mailbox itself.

**Keyboard.** `⌘K` / `Ctrl+K` opens a command palette: fuzzy-search actions, folders, labels, addresses, and threads, or press Enter on "Search mail for…". `j` / `k` next and previous thread, `Enter` opens it on a phone, `r` reply, `a` reply all, `f` forward, `c` compose, `e` archive, `s` star, `u` mark unread, `/` search, `Esc` closes, `?` shows the cheatsheet.

**Look.** Three panes: a slim sidebar with folders, labels, and plus-addresses; a dense thread list; a reading pane with a comfortable measure. Dark by default, light if your system asks for it, and a toggle that remembers your choice. Monochrome, one hairline border weight, system fonts only (Inter or Geist when installed, otherwise your platform's sans; a monospace stack for addresses, dates, ids, and the command block). No font or icon CDN is contacted; icons are inline SVG.

**Phones.** The layout flows list → thread → compose, one screen at a time, with a back link at each step. Compose is a floating, expandable panel on desktop and full screen on phones.

## Privacy, concretely

- `#data=` is a URL fragment. The request your Vercel project sees is `GET /`. The fragment stays in the browser.
- On load the page decodes the fragment, validates it, renders it, then calls `history.replaceState` so the address bar shows only the base URL. The inbox lives in memory and in this tab's `sessionStorage` so a reload works. **Forget** in the banner clears it.
- Read marks, stars, archive, labels, and drafts are in `localStorage` under `grokbot-inbox:state:<inbox address>`. Drafts include what you typed and the quoted text; clear site data to remove them.
- Sending goes through your bot and a draft card you confirm. The page only puts text on the clipboard or in the share sheet.
- There are no analytics and no network calls from the page except the ones you ask for (`?src=`, or "Load remote images" inside one message).
- The only mail in this repository is the fictional sample. Real exports must not be committed; `exports/` and `*.export.json` are gitignored.

## Link format and size

Documented in [docs/LINK.md](docs/LINK.md). In short: `#data=` is `base64url(deflate_raw(utf8(json)))`. Chromium accepts URLs up to 2 MiB; `make_link.py` stops at 1,900,000 characters, which held about 3,250 text-only threads in testing. When a link would be longer, run `make_link.py --lite` (quoted replies, HTML, inline images and attachment bytes are left out), and if that is still too long the bot sends the file.

`tools/make_link.py` needs only Python 3. `tools/make_link.mjs` is the same for Node.

## Export format

The contract is in [docs/SCHEMA.md](docs/SCHEMA.md).

- JSON Schema: [schema/inbox.schema.json](schema/inbox.schema.json)
- TypeScript: [src/types/inbox.ts](src/types/inbox.ts)

The viewer accepts missing optional fields and unknown extra fields. A file that is not an object with a `threads` array is rejected.

## Develop

Requires Node 20 or newer, and Python 3 for the link-script tests.

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. The app is built for the domain root. To serve it from a sub-path instead, set `VITE_BASE_PATH=/some-path/` for `npm run dev` and `npm run build`.

```bash
npm test
npm run lint
npm run build
npm run preview
```

If you change `examples/sample-inbox.json`, rebuild the demo link in this README with `python3 tools/make_link.py examples/sample-inbox.json`; a test checks that the two match.

## Hosting: one copy per person

Each person's bot deploys this repository to that person's free Vercel account, as a project named `grokbot-inbox-<handle>`. The bot uses the Vercel connector: it looks for an existing `grokbot-inbox-*` project with `list_projects`, otherwise calls `create_deployment` with the Git source `mascarock/grokbot-inbox` at `main`, waits until the deployment is `READY`, and takes the public URL from the deployment's production alias. From then on, pushes to `main` here redeploy every linked copy, and the bot's links open the owner's copy. Full flow and gotchas in [bot/SKILL.md](bot/SKILL.md).

Why: the page is static, there is no backend, and mail only ever lives in the browser. Spreading the hosting over everyone's own free account means no central host carries everyone's traffic or becomes a single thing to take down. The first copy, `grokbot-inbox-mascarock.vercel.app`, is the owner's and doubles as the demo target.

If a Vercel account has no GitHub connection, the bot falls back to deploying prebuilt files. The workflow [`release-dist.yml`](.github/workflows/release-dist.yml) ("Publish dist release") builds `dist/` on every push to `main` and attaches `dist.tar.gz` to a rolling [`latest` release](https://github.com/mascarock/grokbot-inbox/releases/latest), which the bot downloads and uploads inline.

[`vercel.json`](vercel.json) describes the build either way: framework Vite, `npm run build`, output `dist`, base path `/`.

### Deploy a copy by hand

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mascarock/grokbot-inbox&project-name=grok-bot-inbox)

The button clones this repository into your Vercel account and deploys it with the settings in `vercel.json`. Nothing else to configure. Then tell your bot the URL, or pass it yourself:

```sh
python3 tools/make_link.py export.json --lite --base https://your-copy.vercel.app/
```

`--base` is how a link gets pointed at any copy. Without it the script falls back to the demo copy and warns on stderr.

### GitHub Pages instead

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the app and publishes `dist/` to GitHub Pages on pushes to `main`. Turn it on in your fork under **Settings → Pages → Build and deployment → Source: GitHub Actions**. For a project site under a sub-path, set the repository variable `VITE_BASE_PATH` to `/your-repo-name/`; the default is the domain root. Pull requests run lint, tests, and the production build, and they do not deploy.

## What this is not

There is no server component and none is planned, and the page itself does not send mail. See [docs/ROADMAP.md](docs/ROADMAP.md). The UI reads mail through a small source adapter (`src/sources/`), so other producers can plug in without touching the thread view.

# Grok Bot Inbox

Read your Grok Bot agent inbox in the browser, as a proper mail client, without giving anyone else access to it.

Grok Bot has no public API for reading mail. Only the bot that owns an inbox can read it. So the bot does the reading and hands you a link. The link carries the export inside the URL fragment, which browsers never send to a server. This page decodes it locally, shows it, and removes it from the address bar. No backend, no account, no setup.

## Use it in 1 click

1. Import the public bot template: `BOT_TEMPLATE_LINK`
2. Tell your bot: **show me my inbox** (or `show me my +roma inbox` for one plus-address).
3. Your bot reads its own mailbox, read-only, and replies with a link to this viewer with your inbox already loaded. Open it.

The bot follows [bot/SKILL.md](bot/SKILL.md): it never sends, replies, or changes mail, treats email content as untrusted, builds the export per [docs/SCHEMA.md](docs/SCHEMA.md), runs [tools/make_link.py](tools/make_link.py), and sends you the link (plus the JSON file as a fallback). The link is private the way a document is private: whoever has it can open it, so do not forward it.

**Try the demo** with a fictional inbox (`demo+roma@mail.grokbot.com`, everyone on `example.com`):

https://inbox.mascaro.eu/#data=7VrbVttIFv2VWn5J94qNryTgIUzbDtiGcDMYDMM8lKSyVLikUkolG6dX1pqPmC-cL5lzSvLdcTAr3Z2HzgOgup_L3ufUqfye4YElnzPVjMN8-VZJn_7mUy52XCUHltQ7tvQz2Qx7DqXSzKlpGFkqlN7lioVcqXxTrFQLu9VC4WE2RsGIiPqhYNCmPcWoE2Wq__o9wx3o0V5Os0BDVxRbT8zG9c4Y0zxwSSh5oAnVRHuMSEUDl5F0cEiV5jYPaaCTxQLqM5haE9xm5Oh5sh91HMUiGJKh2PMbS3qMFF-z02kfQVZSl3phxgYFfP13NiNopM9gJHXZihbK1Uoh1YKfDGnIGA5eLWczfSkco5T2ef2iNxsxpxTf6CRXhE6HK1AKlwE0w1-MD5kDzX04V6b6SrEzWs7r7DXCO1SzeZlLN0UUOJV5K1Nq9owjGzQgI0Z8mLBmHLHGpsmlymEB_NLsn4_BY9AmNsyzGHYqRlAtxJxkh7T7hGuiKA-iLAEHZCQKpSb_-89_zUpmVY9GhJKIO4yMqBA7uKTRJepCa2p7Ppt4WJ8Llmos4m5AdazYThi4MNSWAS53Mw6xl_tgzXzSE_Ev0FTcq2QBV4IH8KFVzOZXbzvJijmabhwrgQagmlanS_3DohF7V8ny2_pFZ1Q4bbqyBv_Or7veUdeFv1r4ozZo1O7hV71xernLsKFfEEdXt51KKS5fX10Nau2rWu2qe3n_vPveP7s_vu3X_EZHPbVc-nT2MFKRF37hH2v10TEt3FXq7K37Oe-e5p9Ob_O12_Jw9_OTqrRk74s4heahPB32L7qqt3fc2zu5M38PL09va5_ej497o2NsxzGVxrAyFv2RaRs1kzX36r29-i38fH5bv6q3olEjtgoFJjqnD_tGlPpJp7t7pAYnrut--ABOh3CdR0dpCR1R4k5LyNjauZfRsRW01iCjfFPYrxZKK8josCp5OTruWQQe_UYI9PU18IAm4_ZkxLVnei0aBEwRGjjo4cCXDLYZQQt0DIyj3yCeFB0yQUIKs3hEGI04DJkuYiuQhsg-THKAocw0BNC8VhdgsmKl8s_LYbZtVpiNZ0OU4gUWnef311r0kqk-zDN8NG9J4CyeKLpNEt0ytKAMWC4EMiA-DXfIzYTAwGYySJhxZsksCaROSU4parOJ6yg8mqYhEKVUc15itrtmjIxlPHWlGRk-BqlVyLWOHS4fgxWL4NiLAM4VZ8kFSFUqZQkqbOaYtTOyYGFysLLIIRkpqVn1MTgkrwkHh-SHh4NDXPUFEQE8J2Y5tE3o9FciAg1DWIIiBPJJfxoX3r8rlvaSr488CgUdw-ji-xI5rWdmEaNPRbQaMmAzyBAQb39Hpr84Ms1YD9JZQ5UrxFDHVhJyexCHBn3XaCYHDL4mmZ1Rkk-VLVey1h-SoxZnmfq6DNSI8ZIUdPNhJzz96swS4udetbjKtpsUmlKsGQKIBibgAQA7iWYpmwRwN_GIw6IkGAI9APkpgjhCVvV5FAFbZoEYgDlxAg414RQ-xhAioXmkOC4IY3y46lA1RpreIZcC4ihMkIaHFQsVBgNcY-RJYL4IADaYxtIz1NpmdhHSlbkEpT8U13669d-4XofrJWYNIZCqF6q_Uth_t0zrlUVS_6ZRko0WE94EjKWfAIzztPFyhksBeTNNKQFhglpMQG7TuTg7MrgymQ-JA7gdTwGXpDKQ4nCd5kQGeIsRfq9aTrKVFZnTtORY8TQtKc_SEmQVzEpWJs1lIS9lkM3wTazHwWle6D6lQmUlK6CWjEGAVSdajj82tQRQ-bJ5LpXEL5lcCZILwXTot8op29-eplM_Mbk2mRdMrmTYG8IUkv_u2lJKcX3cSmRaCVx_0O1wGynXR7b1YNporRRNbUj27QEzAYmEkwkQsUaStD6etdMJ2TV3wEgrHk7iHk73IN0l4GCCzd8p-lSZRDhrvmBXFkSgTmJL5SAgzA1CxPADPhTDuwpeUwn8NgfjCBQMplIFEEy_f31cgA1KB7Nygkd6Rz_rFeCgHvIADx7MkFMsruTNc9FtNmMS3rr-vn64rnPnTkQPjfrgvjdwK7LRbTcfwvtyJ7RKu57VqI_u784VvdsN2s3n0C5fnTZ4we22TobUv31ymvtj_L5tOcP2kXd00x2496VjbjVvv5hx5bpn-13Xbu6XH3pt1y53xrRXO_10XT9mrY6wgnPYpwJz9scPjZq895-LeCZ6VwkbbtilTfEFz2M1uy7tnbmWv19oN49c27_Fs3lOq-Pdlzz9cLdb-MTrJ06jLhjMcVpnrl3ac52mJ9qtc8_q1SNYN7T8kyFr1OV9D_tB_l5HGtlanWG7uT96uKvEjXWprYgD21vw1U_YQgJGE8oG2o_9DXwCMgU2JR0JydUCXizT8aeUZ0s3xXfVylacYuTeohy7nZh_YSljURffNWtKPC1IiWXWlAdIn42wPhQnQdJV1LKwyGA0Rmhfp7HcXK_9pDiSlC8AhbbJA4CZPIikSDSDJJ4v3eyzs6wbb_cRw_g7YmII0_tYJKBKgR2Ili7DrGBa3JokILhXknMMGQyhCqyQHAK4jSkX9kGOmSM-R0o1ZavEmiC-p31kkoPwMNHAQT48hI-fUwnp4X6AHtKVzmgI2V1QJQeUeIr1PzyCQnQYVfP5OTfLw9lZzoq5cHKwZd7o4DFz-L0hB3l6aDbivksiZc-tbvKjaGd-hQSQafEKMqfHDIigYU5biBiCG4gJUROiIQNdBhr2P4hsCHn6kIKg-pc3z1H05teDfNp4EMLgsWCwgAVBB9AFWWjO7FuF6PHLhpNYLu7_K-zQAKmIFweuGk9UNvMebPjOHc-IhDWp6KXBbrdSWKkdrakcIfCRNZJnveTVaZHXwY9AlsWixV3SBg4FPAa_jb3INwoWqQyT0t6FcmkA51LRAonJafOfQvQFU3kvbKhxpHJvweyvlfAPeHJbFO9lhksJ_JtDUuoEAjCc1OdGI1TgLYxNMr7kMZeYd-Id8hEoAvgiBPIAStqHq1iSLfa5AipBmbDeoXSUloKxP6Wyxbp3ZJr8hQI6N1UZAmRFhIySK2CHhWKMRzepZfKgPBkYMFMsNxcuzFJTk8J9EUIYw3vgREiE5npjLr1nLAAFHJ-vXq2usWCMGfUc16NXGuk3wKXhCcmw_qMNqGeeYGPH9hgxp9sOJMX9m-Ie3De3yYbMNltgZisxXwyUDcIuIWVJxu1sN1e5iKZDMUCGKTLQlwWjQywTrK5gfO2OpeVCDO7GcRkZcjZKH4lgAQtfYuzBxE8dbgIbOZeEfY55iN6IE20I8mPzlIHOPqI426QCWawyzqEiNZvZ_SNEei7w0SPGbCRKkghIVKpkXfxGKXMo5QQlxnzfef2YCLPzFH6rvvEUsrkCR6UA_5aDV6lcecnDR-hJLfHpA8EJ5o5krGyGDjfkdP4_myAzXARiPCm2IYlB__GU1ZKRqGdUJAwXKatlvn79Pw

That link was built from [examples/sample-inbox.json](examples/sample-inbox.json) with `python3 tools/make_link.py examples/sample-inbox.json`.

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
- Light and dark follow your system until you toggle them.

## Privacy, concretely

- `#data=` is a URL fragment. The request GitHub Pages sees is `GET /`. The fragment stays in the browser.
- On load the page decodes the fragment, validates it, renders it, then calls `history.replaceState` so the address bar shows only the base URL. The inbox lives in memory and in this tab's `sessionStorage` so a reload works. **Forget** in the banner clears it.
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

## Deploy

The viewer is served at **https://inbox.mascaro.eu/**. [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds the app and publishes `dist/` to GitHub Pages on every push to `main`. `public/CNAME` carries the custom domain into each deploy. Pull requests run lint, tests, and the production build, and they do not deploy.

### Deploy your own

1. Fork or copy the repository. Change `public/CNAME` to your domain, or delete it if you do not have one.
2. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**. Until this is set, the deploy job on `main` fails; that is expected.
3. For a custom domain, create a DNS `CNAME` record pointing at `<owner>.github.io`, then enter the domain under **Settings → Pages → Custom domain** and enable **Enforce HTTPS** once the certificate is ready.
4. Change `DEFAULT_BASE` in `tools/make_link.py` and `tools/make_link.mjs` to your URL so the bot's links open your copy. If your site is not at the domain root, build with `VITE_BASE_PATH=/your-path/`.

## What this is not

There is no server component and none is planned. See [docs/ROADMAP.md](docs/ROADMAP.md). The UI reads mail through a small source adapter (`src/sources/`), so other producers can plug in without touching the thread view.

# Editing from the Desk, Codex or Claude Code

All three use the **same private Desk API and the same production drafts**. There is no second
content store to sync. The browser is optional for capture and editing; it remains useful for a
visual proof. Publication still goes through `publishHaul`/`publishShelf`, which checks quotations,
credits, links and the bundle before writing public files. The website and app read those same
files. Never insert editorial rows with ad-hoc SQL or upload a hand-built bundle to public R2.

The terminal client is `scripts/editorial.mjs`. It uses Node 22 (22.21+ recommended), built-in
fetch, and the repository's existing API. No agent SDK, MCP server or global package is required.
Codex and Claude Code run the same commands. A remote session needs a checkout with `npm ci`,
Node 22 and editorial credentials; it does not need the laptop or a running browser. The Desk and
pipeline are hosted on Cloudflare and continue processing after the agent disconnects.

## Start here

```sh
npm run editorial -- --help
npm run editorial -- status
npm run editorial -- items
npm run editorial -- hauls
```

`status` must identify the expected environment and identity before any write. Default profile is
**production**. Use `--profile preview` for the separate preview store, or `--profile local` for
localhost development. Preview material never appears in production. JSON responses go to stdout;
errors go to stderr and exit nonzero. For machine-parsed stdout, use `npm run --silent editorial -- ...`
or `node scripts/editorial.mjs ...`, so npm does not print its own command banner. `--out .editorial/item.json` saves the response privately.
Create the `.editorial` directory first; it is gitignored for private working material.

The client does not automatically retry a write. If a connection dies after submission, read the
Tray, item or Haul before retrying: the write may have completed. URL capture deduplicates items,
but resubmitting commentary to a duplicate URL **appends** that commentary. Pasted-text captures,
voice uploads, blocks and new Hauls are not idempotent. Do not blindly rerun them.

## Credentials on this machine and in a remote session

The default private config is `~/.config/fdf/editorial/production.env` (or `preview.env`). Pass
`--config /private/path/editorial.env` to use a different one. Config files must be mode 600;
parent directories should be mode 700. Environment variables override file values.

Two authentication choices are supported:

1. **Owner login**, convenient on a machine with a browser and `cloudflared`:

   ```sh
   npm run editorial -- login
   npm run editorial -- status
   ```

   This opens Cloudflare's normal owner login, captures the application token privately and writes
   the config without printing the token. It expires on the Access application's session schedule;
   run login again when it expires. `cloudflared` must be installed beforehand. This is not the
   credential to distribute to fresh remote environments.

2. **Access service token**, for remote Codex/Claude sessions, with these variables delivered through
   the session provider's secret settings or a private env file:

   - `FDF_DESK_URL`: `https://desk.fromthedumpsterfire.com`
   - `FDF_ACCESS_CLIENT_ID`: that session's Access Client ID
   - `FDF_ACCESS_CLIENT_SECRET`: its Access Client Secret

   Do not also set `FDF_ACCESS_TOKEN`. The client sends the pair to Access on each request, and the
   Worker verifies Access's RS256 JWT, issuer, application audience, expiry and exact signed
   `common_name`. Raw client-ID headers are never trusted as an identity. A token must also be
   explicitly allowlisted in the Worker; an accidentally widened edge policy does not grant access.
   Service clients may use the editorial API, but cannot access UI/assets, settings or permanent
   DELETE routes. Draft clients cannot publish the Haul or shelf. Publish clients still need an
   explicit client flag and the editor's instruction to publish.

Never paste credentials into chat, JSON content files, commands or tracked files. The remote
session needs only the narrow editorial pair, **not** Cloudflare admin credentials, database
credentials or model-provider keys. Use a distinct token for each machine/environment so it can be
revoked independently. No credentials are committed to this repository.

## One-time service-token setup

This section is infrastructure setup, not something an editor repeats for each link or Haul.
It requires **Access: Apps and Policies Edit** and **Access: Service Tokens Edit** permissions.
The separate `cf` CLI login can supply these permissions even when Wrangler cannot. On a trusted
machine where `cf auth login` is already complete, use:

```sh
# Uses cf's own OAuth session, refreshing it through the official CLI; no token is printed.
npm run editorial:setup -- --cf-auth --name remote-codex --config ~/.config/fdf/editorial/remote-codex.env

# Apply the reviewed setup. The resulting remote credential is draft-only by default.
npm run editorial:setup -- --cf-auth --name remote-codex --config ~/.config/fdf/editorial/remote-codex.env --apply
```

`--cf-auth` uses the official `cf` npm package through `npm exec`, so a global binary is optional.
It captures `whoami` privately, lets the CLI refresh its own login, then reads its cached OAuth
credential from `~/.config/cloudflare/config/default.json`. It does not copy that admin credential
into the editorial config. `cf` and Wrangler keep separate logins. On a fresh trusted machine,
`cf auth login --no-browser` lets you approve login from another device. Remote editorial sessions
need only their narrower service pair, not this admin login.

Alternatively, use an account-scoped API token with those permissions. An ordinary Wrangler login that can write D1 does
not establish that it can manage Access. Put admin credentials in a mode-600 file, e.g.
`~/.config/fdf/editorial-admin.env`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Optionally set `FDF_ACCESS_APP_ID` if application discovery cannot identify exactly one Desk app.
Never enter the values on a command line. Keep the admin file out of remote editorial sessions.

```sh
# Inspect the proposed change; this default is read-only.
npm run editorial:setup -- --admin-config ~/.config/fdf/editorial-admin.env --name remote-codex

# Create a draft-only credential with a 90-day lifetime and its Service Auth policy.
npm run editorial:setup -- --admin-config ~/.config/fdf/editorial-admin.env --name remote-codex --apply
```

Use `--profile preview` for the preview Desk. Use `--scope publish` only if that credential should
be able to publish when the editor explicitly requests it. The setup command:

- Locates and checks the existing self-hosted Access application at the expected Desk hostname.
- Before applying, dry-runs the Worker build.
- Creates one service token and a **Service Auth** (`non_identity`) policy for that token alone.
  Existing owner policies are preserved. It does not create an application or modify its audience.
- Writes the credential using exclusive creation and mode 600, plus a private `.receipt.json`
  containing the non-secret token ID, policy ID, client ID and expiry. No secret is printed.
- On a known failure, attempts to remove only the resources it just created. If a request's result
  is unknown, inspect Access before retrying; do not assume that a failed response means no change.

Then activate the **non-secret Client ID** in the Desk Worker environment:

- Add it to comma-separated `ACCESS_SERVICE_CLIENT_IDS` in the appropriate environment of
  `workers/api/wrangler.jsonc`, preserving other IDs.
- For a publish-capable credential, also add it to `ACCESS_SERVICE_PUBLISH_CLIENT_IDS`. Membership
  here never grants access without membership in the first list.
- Run `npm run verify`, check pending migrations in `docs/STATUS.md`, and deploy the built Desk API
  and assets for that environment. For a Desk-only change:

  ```sh
  npm run desk:build
  npx wrangler deploy -c workers/api/wrangler.jsonc --env production
  npm run editorial -- status
  ```

  Do not deploy unrelated launch work or migrations just to enable the client. No pipeline, website
  or mobile redeploy is required for the client itself. Never make a service token a public route,
  add an Access bypass, disable the lock or give the remote client direct R2/D1 write access.

Transfer the narrow pair through the remote provider's secret settings, then run `status` in that
session. Normal remote editing needs no interactive login. If the credential is missing, expired,
revoked, blocked by policy or absent from the Worker allowlist, the client exits with an actionable
authentication error; it does not open a login page or follow redirects with credentials.

To revoke: remove the client ID from both Worker allowlists and deploy; delete/revoke the Access
service token and its dedicated policy using the receipt. Remove it from remote secrets. To rotate:
create a new credential in a new `--config` file, allowlist and verify it, switch the remote secret,
then revoke the old one. This avoids a gap and preserves the owner login.

Cloudflare references: [service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
and [application JWT claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).

## Capture links and commentary

For bare links:

```sh
npm run editorial -- capture https://example.org/essay https://example.org/talk
```

For commentary, passages or batches, write UTF-8 JSON as a file. Do not interpolate voice notes into
a shell command. Example `.editorial/capture.json`:

```json
{
  "entries": [
    {"url": "https://example.org/essay", "why": "Your cleaned commentary, in your own words.", "type": "essay"},
    {"text": "The exact passage from the original.", "source": "Author, Book, year, page", "sourceUrl": "https://example.org/book", "type": "passage", "why": "Your note."}
  ]
}
```

```sh
npm run editorial -- capture --data .editorial/capture.json --out .editorial/captured.json
npm run editorial -- item it_RETURNED_ID
npm run editorial -- wait it_RETURNED_ID --seconds 180
```

Capture enqueues reading/drafting; it does not publish. `wait` is bounded (maximum 900 seconds),
stops on failed/paused items, and leaves processing running when it times out. For a failed fetch,
read `status_detail`; fix its cause before `request POST /api/items/ID/refetch` (the refetch endpoint).
For text supplied from the original after a refused fetch, use the existing transcript endpoint
with `{"text":"...","as":"text"}`; for a talk's own transcript use `{"text":"...","name":"captions.vtt"}`.

`--data -` reads JSON from stdin for agents piping a file/program's output. The API accepts up to
50 entries per capture. `type` is optional; inspect and correct the detected layout on the item.
There is **no topic-tags field** today. Do not invent JSON tags and assume they were saved. The
current organising tools are content type, Haul order, connections and approved Threads.

## Paywalled pieces: the editor's library

When a capture fails as paid, the Desk first looks for the editor's own saved copy in Readwise
Reader, then Instapaper (only if their tokens are set; see `docs/STATUS.md`). If it was not found
then, save the piece in either app and ask again:

```sh
npm run editorial -- library it_ID
```

The answer says which copy was used, or why none could be (not saved, index still building, a
preview only). Otherwise paste the text with the transcript route (`as: "text"`) or upload a PDF.

## Voice notes, files and edits

```sh
npm run editorial -- upload /private/reading.pdf
npm run editorial -- note /private/commentary.m4a --data .editorial/note-target.json
```

For an item note, `note-target.json` is `{"target":"why","itemId":"it_ID"}`. For an opening note,
use `{"target":"fieldnote","haulId":"hl_ID"}`. The existing upload endpoint stores audio, the raw
transcript and deletion-only cleanup. Uploading does **not** automatically replace the commentary:
inspect the returned `note.id`/transcript, then explicitly edit the item with a JSON payload such as:

```json
{"why_text":"Your proofread commentary.","why_note_id":"vn_ID","why_audio":false}
```

```sh
npm run editorial -- edit it_ID --data .editorial/commentary.json
npm run editorial -- check it_ID
```

An item's note takes a few marks (`itemNote` in `packages/shared/src/fieldnote.ts`, added 2026-11-08):
a blank line between paragraphs, `[their words](https://…)` (or `"their words" (https://…)`) for a
link, `*a title*` for italic, and `> ` lines for a quotation from **that item's** source. Each quoted
paragraph must be in the stored source word for word (`…` marks words left out; each stretch between
ellipses is matched, in order): the item's `why` check lists every quotation, and the publish refuses
one it cannot find. A line quoted from somewhere else cannot be set as a quotation on that item; keep
it in the editor's prose with ordinary quotation marks.

For chat dictation, preserve the received raw transcript and edited version in private working
files under `.editorial/` before editing. A chat transcript does not give the client the original
audio file. Upload actual audio when available; do not manufacture a recording or pretend the Desk
has one. Session working files are not a cross-machine backup; keep them in the session's persistent
storage or securely transfer them if switching environments.

Follow `preserve-my-voice`, the imported `writing-voice` skill, and `docs/VOICE.md`. Remove speech
fillers and false starts; repair grammar, punctuation and obvious garbles while preserving phrasing,
jokes, uncertainty and cadence. Do not turn short curatorial notes into long essays. Flag ambiguous
garbles and factual corrections. The automatic cleanup remains deletion-only; your explicitly
requested proofreading is saved separately in the editable commentary field, never over the raw
transcript. Additional model-written opinions do not become the editor's words.

## Pull quotes, excerpts and pictures

Use the general API command for every feature the Desk already exposes:

```sh
npm run editorial -- request POST /api/items/it_ID/blocks --data .editorial/quote.json
```

`quote.json` is `{"kind":"quote","text":"Exact words found in the source.","locator":"p. 12"}`.
A quote which is not in the stored source is refused. For the primary excerpt, inspect the item's
source and submit `{"start":0,"end":123,"text":"exact selection"}` to
`POST /api/items/it_ID/excerpts`; offsets must index the actual stored source, not a browser copy.

Other block bodies: `{"kind":"video","url":"https://www.youtube.com/watch?v=ID"}`,
`{"kind":"audio","url":"https://open.spotify.com/episode/ID"}`, or
`{"kind":"code","code":"exact source code","lang":"python","caption":"Your caption"}`.
Fetch/quote/licence checks still run on the server.

For a picture, put maker, holder/credit, licence, original `sourceUrl` and caption in a fields JSON
file and upload via multipart. The server refuses missing credits:

```sh
npm run editorial -- request POST /api/items/it_ID/picture --upload file=/private/picture.jpg --data .editorial/picture-credit.json
```

The same command supports multiple uploads, fields for source-PDF replacement, book covers and any
other existing multipart endpoint. The special `note` command uses the API's `audio` field;
`upload` and picture routes use `file`. Credit the maker and verify the licence at the original.

Inspect existing drafts before changing them. Other useful API routes: `/api/plates/ID/choose`,
`/api/items/ID/plate-none`, `/api/items/ID/connect`, `/api/threads/suggest`, `/api/books`,
`/api/books/ID/notes` and `/api/shelf/preview`. Read their schemas in `workers/api/src` before
submitting unfamiliar payloads; do not guess field names. All responses report server refusals.

Before a Haul goes out, read what the editor's check page shows: `GET /api/hauls/ID/review` (per item,
each issue with `severity` *wrong* or *doubt*, a plain `message` and where it is fixed) and
`GET /api/hauls/ID/suggestions` (every note, idea and Wikipedia card still to tick). `GET /api/items/ID`
carries `standing` (on the Desk, in a Haul not yet published, or published in version N);
`POST /api/hauls/ID/items/ITEM` adds one item to the end of a Haul.

## Charts

Charts have their own commands (`docs/CHARTS.md` has the spec and the rules):

```sh
npm run editorial -- chart-fetch --data .editorial/source.json   # Our World in Data or World Bank rows, licences stated
npm run editorial -- chart-csv .editorial/table.csv              # a CSV/TSV as chart data (local)
npm run editorial -- chart-check --data .editorial/chart.json    # the honesty validator (local)
npm run editorial -- chart-draw /tmp/look --data .editorial/chart.json   # PNGs to look at (local)
npm run editorial -- chart it_ID --data .editorial/chart.json    # keep it on an item
npm run editorial -- chart-edit bk_ID --data .editorial/chart.json      # replace a kept chart
```

The title and note are the editor's words: take them from the editor, never write them. Every number
comes from the source's rows; never type, round or "clean" a value. Machine annotations
(`"by": "machine"`) may cite only figures that are in the rows; the server refuses others. The Desk
Worker draws each chart's app pictures and share picture when it publishes; `chart-draw` writes the
same pictures locally (`chart-share.png` is the share picture) for a look first.

## Lives: a profile written in a session

A Life is one person, profiled by a model from named sources (`docs/DECISIONS.md`, 2026-10-27). The
Desk fetches the sources; the session writes the profile from the stored text and cites it.

```sh
npm run editorial -- life --data .editorial/life.json            # {name, why, year, sources: [...]}
npm run editorial -- life-show it_ID                              # sources fetched? (no text shown)
npm run editorial -- request POST /api/items/it_ID/life/sources/KEY/file --upload file=/private/source.pdf
npm run editorial -- life-draft it_ID --data .editorial/profile.json
```

A source is `{"id":"guha","author":"Ramachandra Guha","title":"India After Gandhi","kind":"book",
"year":"2007","url":"https://where-the-text-is-read","via":"An extract at …","workUrl":"https://the-book"}`;
`kind` is book, report, article or reference. Upload a PDF only when the link is too large or slow to
fetch; the link stays the source. The profile (`.editorial/lives-sen/profile.json` is a full example)
has `name`, `born`/`died` (`{year, cites}`), `epithet`, `sections` (`{heading, paragraphs: [[line]]}`),
`words` (the person's own words, with the quote that records them), `dates`, `figures`, `reading`
`writer` (the name the label prints, "Claude") and `model` (the model id, for the record); every line is `{"id":"l1","text":"…","cites":[{"source":"guha","quote":"exact words"}]}`.
Write each sentence so its quotes hold every fact and every number in it; write transitions so they
need no fact. The draft is refused whole if any quote is not in its source, a figure is not in its
quotes, or a line fails the style check, with every problem listed. Lines the judge does not confirm
are set aside. The editor's note follows the dictation rules above; the profile is never theirs.

## Data stories

A data story (`docs/DATA-STORIES.md`) answers one item: its standfirst and margin notes are the
editor's words from that item's note, and its quotation comes from that item's source. Write the
story as JSON (`packages/shared/fixtures/stories/fertility.json` is a full example), then:

```sh
npm run editorial -- story-check --data .editorial/story.json --slug fertility --item it_ID
npm run editorial -- story-publish --data .editorial/story.json --slug fertility --item it_ID --confirm-publish
npm run editorial -- stories                                      # what is published
```

`story-check` writes nothing. It says whether the story would publish, with every problem, and what
it would write. The Desk checks that the standfirst and every margin note are found unchanged in the
item's stored note (`why_text`), that every plate's quotation is in the item's stored source word for
word, that the slug is lowercase words joined by hyphens, and every rule of the grammar
(`validateStory`: sources, scales, figures traced to the rows and facts, the style check). Any problem
stops the publish. A story whose item is in no published Haul still publishes, without the link to
the item, and says so; publish it again once the Haul is out.

`story-publish` runs the same checks, then writes `data/<slug>/v<N>/story.json` and `data/index.json`
in the public bucket. A story keeps its number ("Atlas No. 1") and its first publish date for good; a
second publish of the same slug is version 2, and version 1 is never overwritten. Publish only after
the editor asks for that story. The request body is capped at 2 MB.

## Machine notes written in a session

A note of context that the pipeline did not draft (a timeline, a definition the editor asked for)
goes in through the same gates as the pipeline's own notes:

```sh
npm run editorial -- request POST /api/items/it_ID/marginalia --data .editorial/note.json
```

`note.json` is `{"text":"One or two plain sentences.","cite":{"kind":"source","quote":"The exact
passage that supports it."},"writer":"claude-opus-5-5"}`, or cite a Wikipedia card already on the
item with `{"kind":"wiki","cardId":"wk_ID"}` (add one first with `POST /api/items/it_ID/wiki`
`{"query":"Lighthill report"}`). The passage must be in the stored source word for word, the text
must pass the style check, and the judge then checks the note against its evidence: anything not
fully supported is set aside and never shown. The note arrives as `proposed`, recorded as written
by `<writer> (session)`, and ships only if the editor keeps it. Machine notes are always set as
machine text; never use this route for the editor's words.

## Compose, review, publish

```sh
npm run editorial -- new-haul
npm run editorial -- edit-haul hl_ID --data .editorial/haul.json
npm run editorial -- order hl_ID --data .editorial/order.json
npm run editorial -- preview hl_ID --out .editorial/preview.json
```

`haul.json` can include `title_text`, `title_italic`, `deck`, `fn_title_text`, `fn_body`, `edition`,
`colophon` and `route`. The field note is the editor's opening, the essay readers meet first on the
Haul's page. `fn_body` is the editor's text with a few marks (`packages/shared/src/fieldnote.ts`): a
blank line between paragraphs, `## ` for a section heading, `> ` lines for a quotation (a `>` line
alone between quoted paragraphs), `[their words](https://…)` for a link and `*a title*` for italic. A
YouTube or Vimeo video, a Spotify episode or show, or an X post on a line of its own is set there as
an embed: the Desk resolves it by code when the note is saved (`hauls.fn_embeds`; the Haul shows each
one, or why it was refused, under `haul.fn_embeds`; `request POST /api/hauls/ID/field-note/embeds`
retries the refused ones), and the publish refuses an embed link it could not resolve. Marks are only
deleted, never reworded. A markdown essay goes in as it is, minus its own title line, which goes in
`fn_title_text`. `order.json` is
`{"itemIds":["it_FIRST","it_SECOND"]}`: it sets the **whole** ordered list. Read the current Haul
before replacing the list. `new-haul` always creates a new draft; inspect `hauls` before repeating.

Preview does not publish or send push. Resolve its `problems` and `bundleErrors`; warnings need
editorial judgement. Review the presentation in the Desk or a local reader using the assembled
bundle. JSON preview verifies data/checks, not that every layout looks good on a phone.

Only after the editor explicitly asks to publish that edition:

```sh
npm run editorial -- publish hl_ID --confirm-publish
```

For a correction, add `--data .editorial/correction.json` with `{"correction":"What changed."}`.
Publish uses the existing immutable versioning and validation; the first version queues reader
notifications. The client does not draw a browser share card; the optional existing `card` field may
be provided in the publish payload, or link previews fall back to the existing image. The site and
app pick up the same published bundle without rebuilding. Shelf publishing also needs
`--confirm-publish`, even through `request POST /api/shelf/publish`, with `{"confirm":true}`.

No background action, capture, retry or preview grants permission to publish. Permanent DELETE
requires a separate `--confirm-delete` and an owner credential; service clients cannot delete.
Archive an unwanted draft through the normal item PATCH (`{"archived":true}`) instead.

## Verification and rollout state

The client tests exercise the actual Worker routes with real SQLite migrations and private/public
R2 stand-ins: capture/queue, commentary edits, audio upload and raw-transcript retention, verbatim
refusal, quote insertion, Haul ordering, preview with no public writes, and explicit publication of
a valid bundle. Authentication tests use real RS256 signatures/JWKS and the Worker middleware,
including draft/publish scope, spoofed headers, wrong audience, expiry and malformed identities.
Provisioning tests cover read-only planning, pagination, secret handling and rollback. No test
publishes a production Haul or sends a real push.

Run `npm run verify`. Actual live service authentication additionally requires the one-time Access
setup and API deployment above, then `status` using that credential. Consult `docs/STATUS.md` for
what has actually been activated; passing local tests is not a claim that a cloud credential exists.

## Activated access (2026-10-24)

Preview and production now have distinct 90-day, draft-only service credentials. Private configs
are in `~/.config/fdf/editorial/{preview,production}.env`, with non-secret setup receipts next to
them. They expire on 22 January 2027. The same-machine CLI is ready; a fresh remote environment
needs its own service credential or the appropriate narrow pair supplied through its secret
settings. Never commit or paste the file contents.

Activation used the deployed-era source at `325134c` plus the authentication/identity changes,
not the unrelated launch branch. The older deployed API still lacks the pending launch block
and shelf endpoints. Use the current API's capture/commentary/Haul features now; the newer features
become available when their launch deployment is separately completed. CLI support already exists.
No Haul was published during activation. The preview-only draft used to verify write/readback
was removed. Live version IDs and verification details are recorded in STATUS.md.

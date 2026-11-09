# Google Play: listing, forms and first release

What to paste into Play Console for the reader app, and the order to do it in. Drafted 2026-11-09
for the editor to read and change before anything is submitted. Keep it true to the code; the
privacy page (`apps/web/src/pages/privacy.astro`) is the source for the data answers.

## Listing (Main store listing)

- **App name** (30 characters at most): From the Dumpster Fire
- **Short description** (80 at most): Irregular Hauls of things worth salvaging from the internet and the archive.
- **Full description:**

  > From the Dumpster Fire gathers things worth pulling out of the internet and the archive before
  > they burn: essays and talks, letters and speeches, poems, papers, podcasts, posts, pictures,
  > passages from books, tools worth knowing and strange corners of Wikipedia. It arrives in Hauls,
  > when there is enough worth sending.
  >
  > One editor chooses everything and writes the notes. Machines read closely, find connections
  > between pieces and check facts, and their words are always marked: the serif is the editor, the
  > blue sans is the machine.
  >
  > Every quotation is matched word for word against its source. Every work names the person who made
  > it, with a link back to the original. Pictures come from public-domain archives, never from an
  > image generator.
  >
  > In the app: every Haul to read offline, threads that run across Hauls, search, saved finds, light
  > and dark pages, and one notification when a new Haul arrives, if you want it. No accounts, no
  > advertising, no tracking.

- **App icon:** 512 × 512 PNG: `docs/brand/play/app-icon-512.png` (from `apps/mobile/assets/icon.png`, scaled, no transparency).
- **Feature graphic:** 1024 × 500 PNG: `docs/brand/play/feature-graphic-1024x500.png` (the ember mark and the struck masthead with the strap line, on ink; 2026-11-09).
- **Phone screenshots:** 2 to 8, portrait, from a real phone or the emulator with a published Haul:
  the cover, an item with an excerpt, the field note, Threads, Settings.
- **Category:** Books & Reference (suggested). News & Magazines also fits a magazine, but Play then
  asks the app to meet its news-app rules, which are written for current-events publishers.
- **Contact email:** bhuvan@bebhuvan.com (shown publicly on the listing). **Website:**
  https://fromthedumpsterfire.com. **Privacy policy:** https://fromthedumpsterfire.com/privacy (deploy
  the website first).

## App content (the forms under Policy › App content)

- **Privacy policy:** the URL above.
- **Ads:** No, the app has no ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating questionnaire:** category "Reference, News, or Educational". No violence, sexual
  content, profanity, drugs, gambling or user-generated content; no sharing of location; no purchases.
  The magazine reprints essays and pictures that can touch hard subjects, so answer from the content of
  the Hauls, not only the app's features.
- **Target audience:** 18 and over (suggested). Choosing ages under 13 brings in the Families policy.
- **News app:** No.
- **Data safety:**
  - Does the app collect or share user data? **Yes, collects.**
  - Data type: **Device or other IDs** (the push token). Collected, not shared. Optional (only if the
    reader turns notifications on). Purpose: **App functionality**. Not processed ephemerally.
  - Encrypted in transit: **Yes** (HTTPS).
  - Can users ask for deletion: **Yes** (turning notifications off deletes it; or by email).
  - Nothing else: no name, email, location, contacts, files, app activity, crash logs or analytics.
    Saved finds and reading history never leave the phone.
- **Government app / financial features / health:** No.

## The first release

New personal accounts must run a **closed test** before production: at least 12 testers opted in for
14 days in a row. Then apply for production access in Play Console.

1. Create the app in Play Console: name above, app (not game), free.
2. Fill the listing and the App content forms.
3. Testing › Closed testing: create a track, add testers (a Google Group or a list of Gmail
   addresses), upload `app-release.aab`, and accept Play App Signing (Google keeps the key phones check;
   our upload key only proves an upload is ours).
4. Send testers the opt-in link. Each must install from Play and stay opted in for the 14 days.
5. After 14 days with 12 or more testers: Dashboard › Apply for production. Google asks a few questions
   about the test.
6. After the first upload: copy the **app signing key SHA-256** from Test and release › App integrity
   into the website's `ANDROID_CERT_SHA256` and deploy, so links to fromthedumpsterfire.com open in the
   app.

Testers who installed the earlier APK by hand must uninstall it first: it was signed with a different
key, so Play cannot update it.

## Every later upload

Raise `android.versionCode` in `apps/mobile/app.json`, then
`cd apps/mobile && npm run prebuild:android && npm run build:android:play`, and upload the new
`.aab` to the track. JS-only changes can still go out over the air with `npm run app:update`, for phones
on the same runtime.

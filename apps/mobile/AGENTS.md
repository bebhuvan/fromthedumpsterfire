The reader app of From the Dumpster Fire: Expo 57 / React Native, Android and iOS. Read the root
CLAUDE.md ("The reader app") and docs/DESIGN.md first; they win over anything generic below.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo or React
Native API, read the major version of `expo` in `package.json` and fetch the matching docs
(`https://docs.expo.dev/versions/v<major>.0.0/`, index at https://docs.expo.dev/llms.txt).

## Rules of this app

- **Navigation is React Navigation** (native stack + bottom tabs), never Expo Router (it pulls in
  Reanimated and more native modules; docs/DECISIONS.md). Routes and deep links: `src/nav.ts`.
- Lean by rule: no Reanimated, SVG runtime, icon fonts, UI kits or web views. Icons and controls are
  drawn with views (`ui/parts.tsx`, `ui/controls.tsx`). Brand marks that need curves (the masthead's
  strike and caret) are pre-rendered white PNGs in `assets/marks/`, tinted with `tintColor`.
- Fonts are static cuts named in `src/theme.ts`; never set `fontWeight` or `fontStyle`. Code uses
  `fonts.mono` (the system monospace), so no font file is needed.
- Colours only from `@fdf/shared/tokens` via `usePalette()`, type colours via `typeColor`, a Haul's
  edition ink via `useEdition(haul)`. Blue sans is the machine's alone.
- Never edit `android/` or `ios/` (Continuous Native Generation). A new native module, an
  `app.json` plugin or a change to `.gitignore` changes the runtime fingerprint and needs a new APK;
  everything else ships over the air (`npm run app:update` at the root). Check before and after with
  `npx expo-updates runtimeversion:resolve --platform android`.

## Where things are

- `src/App.tsx` navigators; `src/ui/TabBar.tsx` the bar (Latest, Threads, Archive, Search, Menu).
- `src/screens/Menu.tsx` the contents page (Saved, About, Settings, the editor); `Settings.tsx`.
- `src/screens/ItemScreen.tsx` every printed form (choice in `lib/forms.ts`, the website's);
  `ui/Specimen.tsx` the cover's specimens; `ui/Blocks.tsx` pull quotes, code, video, audio, pictures.
- `src/screens/Shelf.tsx` the shelf (spines on shelf rules, then a text row per book) and `Book.tsx` a
  book's page; sizing, packing, status lines and groups are pure in `lib/shelf.ts` (tested). The
  jacket both the book form and the book page use is `ui/Jacket.tsx`. `useShelf()` in `lib/data.ts`
  reads `shelf/shelf.json` offline-first: the copy on disk at once, a check every 20 minutes at most
  with `If-None-Match`, and nothing kept that fails `validateShelf`. The Menu always lists the shelf;
  before the first publish it opens on "The shelf is being stocked".
- `ui/Fingerprint.tsx` (full and mini) from `@fdf/shared/fingerprint`, points in `lib/fpGeometry.ts`.
- `ui/screen.tsx` `Screen` (pass `edition` for the band on a Haul's pages), `Waiting`.
- `lib/data.ts` offline-first bundles; `lib/seed.ts` + `lib/seedData.ts` the development samples
  (Hauls 001 to 003, every type and block kind, and the dev shelf). `seedData` is only required behind
  `EXPO_PUBLIC_USE_SEED`, so launch bundles do not contain it: verify with
  `EXPO_PUBLIC_USE_SEED=0 npx expo export --clear --no-bytecode --platform android` and grep the
  bundle for `samplewriter` and `Sample note` (0 hits each). Always `--clear`: Metro's cache ignores EXPO_PUBLIC_ values.

## Commands

```bash
npx tsc --noEmit                          # typecheck (npm run verify at the root runs it with the tests)
npm run prebuild:android                  # regenerate android/ (after native config changes)
ARCH=x86_64 npm run build:android         # release APK for the emulator (AVD writing_desk_t9)
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -a android.intent.action.VIEW -d dumpsterfire://haul/2/datasette   # open a screen
adb shell am start -a android.intent.action.VIEW -d dumpsterfire://shelf/the-coal-question
adb shell cmd uimode night yes            # dark mode (the app follows the system by default)
adb exec-out screencap -p > shot.png
```

`adb shell pm clear com.fromthedumpsterfire.app` first if an older build left a live (empty) index on
disk: a stored index wins over the samples. Use `npx expo install <package>` for any dependency, and
only with a reason.

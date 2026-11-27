# rose at six

A personal hub of everyday tools, hosted on GitHub Pages, with Google
sign-in and end-to-end encrypted, item-level sync across devices.

**Setting up sign-in and sync:** see [SETUP.md](SETUP.md).

## Layout

- `index.html`: the hub (main page)
- `assets/css/style.css`: shared styles; colours are mixed from a few palette values
- `assets/js/theme-boot.js`: palettes, light/dark mode, custom colours
- `assets/js/hub.js`: the tool list; add a tool by adding an entry to `TOOLS`
- `assets/js/config.js`: Firebase connection settings
- `assets/js/core/`: encryption, sign-in/vault session, item-level sync store
- `assets/js/ui/`: shared header, account menu, dialogs, appearance panel
- `firestore.rules`: database rules (owner-only, append-only history)
- `tools/journal/`: tasks, interstitial log, week/month/year calendars with holidays and events, budget, activity, habits
- `tools/inventory/`: home inventory (items, rooms, replacements, declutter suggestions, wishlist)
- `tools/subscriptions/`: subscriptions (price changes, shared plans, renewals)
- `tools/split/`: bill splitter (many receipts, by-item splits, settle up, share picture)
- `tools/documents/`: document toolkit (merge, pages, compress, convert, text & OCR), all in the browser
- `assets/vendor/`: pdf-lib, pdf.js, JSZip and Tesseract (OCR) with English and Indonesian data
- `tools/generate/`: Generate from DOCX (templates with `{{placeholders}}`, form, formulas, history)
- `tools/inbox/`: Inbox (paste, photo, Android share target; sort into task, log or wishlist)
- `tools/learn/`: Learn (case studies of how this site works, through its real code)
- `tools/<name>/`: each further tool gets its own folder

## Offline

`sw.js` (service worker) keeps a copy of the site so it opens without a
connection: pages load from the network first and fall back to the saved
copy. When adding a new tool, add its files to `SHELL` in `sw.js` and bump
`VERSION`, and add its store name to `KNOWN_STORES` in
`assets/js/core/backup.js`.

## Styles

- `assets/css/style.css`: colours, fonts, buttons, fields, dialogs, header, hub (every page)
- `assets/css/components.css`: shared pieces for tool pages: panels, toolbar and tabs,
  unlock screen, stats, ticks, chips, search, settings rows, form helpers
- `tools/<name>/<name>.css`: only layouts unique to that tool

A tool page loads those three, in that order. Put anything two tools share in
`components.css` with a neutral name, never in another tool's stylesheet.

## Generate from DOCX

Templates are ordinary Word files with placeholders: `{{name}}`, optionally with
formats after colons, e.g. `{{jumlah:rp}}`, `{{jumlah:terbilang_rp}}`,
`{{nama:upper}}`, `{{tanggal:terbilang}}`, `{{selisih:abs:persen}}`,
`{{selisih:tanda(naik|turun|tetap)}}`. Word MERGEFIELDs also work. The full list is
in the tool's "How to write placeholders" guide and in `tools/generate/engine.js`.
The template file, field settings and every generated entry (all values, keyed by
timestamp) are stored encrypted in the `docgen` store.

## Learn

Case studies in `tools/learn/cases.js`: each follows one feature (Log it,
signing in, sync, search…) through the real code, step by step, with the
call chain, where the data is (page, device, Firebase) and what it looks like.
Code shown there is copied from the real files, sometimes shortened. If you
change those files a lot, update the matching steps. Live demos (`demos.js`)
import the real functions. Progress syncs (encrypted) when unlocked.

## Inbox and sharing

`tools/inbox/` collects links, notes and photos (photos are shrunk to a JPEG
under ~600 KB so they fit in one synced item). On Android, the installed app
appears in the Share menu: `share_target` in `assets/manifest.webmanifest`
posts to `/tools/inbox/share`, which `sw.js` catches and parks in the
`ras-share` cache; the inbox page encrypts and saves it, then clears it.
iPhone web apps can't be share targets, so there it's Paste and Photo.

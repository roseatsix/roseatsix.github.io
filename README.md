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

## Receipt scanning

`assets/js/receipt/`: `scan.js` crops the photo to the paper (bright,
colourless area), cleans it up (size, grey, contrast) and reads it with the
vendored Tesseract (Indonesian + English), on the device. Lines are rebuilt
from word positions (so far-right prices join their items); if the result
doesn't add up to a printed total (or subtotal) it re-reads in other ways
(column layout, one block, straightened, smaller for condensed print, every
word) and keeps the reading that adds up best, preferring believable items
(whole-hundred prices, real words). `parse.js` turns the text into shop, date,
items (qty × price, names that run onto a second line, numbered items with
product codes and a "1,00 PCS x 15.000,00" line), service %, tax %, discount
(including "(2.200)"), rounding (pembulatan) and total (an unlabelled amount
equal to the items, e.g. IDR116,000, counts). Tax and savings printed after the
total (minimarket "PPN included", "Anda hemat") are ignored. When no total is
printed, the review leaves it blank to fill in. `review.js` is the dialog for checking and
correcting it, then sending it to a bill split or journal spending.
Used from: Inbox (photo → Receipt), Bill splitter (Add receipt → Scan),
Journal → Budget (Scan receipt).

## Document toolkit: Protect, size limits, ID photos

`tools/documents/more.js`. Protect (cover private details and/or watermark)
renders every page to a 150 dpi picture and draws on it, so covered text or a
watermark can't be removed from the saved file (PDFs lose selectable text on
purpose). Text is found through the PDF's own text layer, or OCR word boxes
for photos and scans. Compress → "Under a size limit" searches JPEG quality,
then size; PDFs are re-rendered at falling dpi until they fit. Convert → ID
photo cuts 2×3, 3×4 or 4×6 cm at 300 dpi.

## Themes

Appearance has three themes: Rose (the original), Slate (Plus Jakarta Sans,
crisp, one bright accent) and Paper (id `beacon`; warm paper, Newsreader titles,
Atkinson Hyperlegible Next text, one quiet accent). `assets/js/theme-boot.js` holds `STYLES` (fonts, app icon,
manifest, favicon) and the palettes (each belongs to one style); it sets
`data-style` on `<html>`, loads the theme's fonts, swaps the icon links and the
small `#blossom` mark (the rose brand mark stays and takes the palette's
colours; app icons are the rose in each theme's colours). The theme rules are at the end of
`assets/css/style.css`. Display type uses `--display-weight` / `--display-var`
so every heading follows the theme. App icons are generated from SVG into
`assets/icons/{slate,beacon}-*.png`; phones take the icon at install time.

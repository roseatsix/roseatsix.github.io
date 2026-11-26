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
- `tools/<name>/`: each further tool gets its own folder

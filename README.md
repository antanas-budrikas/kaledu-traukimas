# Kalėdų traukimas

A family Secret Santa draw where everyone draws a person and a gift colour. Static, phone-first, Lithuanian UI, hosted on GitHub Pages.

## How it works

1. The organizer opens `#organizatorius`, lists households (one per line, `+` between people who must not draw each other) and the colours, and presses **Traukti burtus**.
2. The draw runs in the browser: nobody draws themselves or their own household, and each person gets a distinct colour while there are enough colours.
3. Each person gets a personal link (share sheet, email via `mailto:`, or copy). The result travels inside the link fragment (`#k=...`), so it never reaches a server and nothing personal is stored in this repository.
4. The person opens the link, unwraps the gift and sees who they are buying for and in which colour. They can email themselves a reminder.

The link encoding is obfuscation with a checksum, not encryption: it hides the result from a glance at the URL and catches a mistyped link. The organizer never sees the pairs, only the links.

## Develop

```sh
python3 -m http.server 8765   # preview at http://localhost:8765/
npm test                      # draw logic tests (node --test, no dependencies)
```

GitHub Pages serves files with a 10 minute cache. After changing an asset, update the `?v=` tag on the references in `index.html` and the imports in `assets/app.js` so browsers load the new version.

Fonts: Bricolage Grotesque and Figtree, self-hosted (OFL). Icons: Phosphor (MIT), inlined in `assets/icons.js`.

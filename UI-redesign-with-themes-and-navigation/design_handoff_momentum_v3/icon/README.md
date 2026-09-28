# Momentum app icon

Default theme: Fintech Lime (#C6F432 → #3DDC84 → #00A389) on #060807.

## Expo (this repo uses Expo prebuild)
Copy `assets/icon.png` and `assets/adaptive-icon.png` over the repo's `assets/` files, then in `app.json`:

```json
"name": "Momentum",
"icon": "./assets/icon.png",
"android": {
  "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#060807" }
}
```
Run `npx expo prebuild -p android` — it regenerates every mipmap from these two files.

## Plain Android (if you ever skip prebuild)
`android/mipmap-*` holds ic_launcher, ic_launcher_round and ic_launcher_foreground at every density, plus the adaptive XML.

`play-store-512.png` is the store listing size.

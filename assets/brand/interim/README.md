# Interim BATR logo files

Made on 2026-10-15 from the owner's JPEG brand files, with the owner's
approval, so development can use real logos before the designer's
original artwork is available. **Replace every file here with exports
from the original artwork before the App Store, Play Store or public
launch.** They are rebuilt from compressed JPEGs, so edges are slightly
soft and colors are approximate.

| File | Size | Use |
| --- | --- | --- |
| `app-icon-1024.png` | 1024, opaque square, no rounded corners | iOS app icon / Expo `icon` (iOS applies its own mask) |
| `android-adaptive-foreground.png` | 1024, transparent, mark at ~55% | Expo `android.adaptiveIcon.foregroundImage` |
| `android-adaptive-background.png` | 1024, flat ink `#01231D` | Adaptive background (or use `backgroundColor: "#01231D"`) |
| `android-monochrome.png` | 1024, white silhouette | Android 13+ themed icon (`monochromeImage`) |
| `splash-icon.png` | 1024, transparent, rounded tile centred | Expo splash `image` on `backgroundColor: "#01231D"` |
| `icon-rounded-1024.png` | 1024, transparent corners | Source for web use of the icon |
| `favicon.ico` | 16, 32, 48 | Browser tab |
| `favicon-16/32/48.png` | as named | Browser tab (PNG links) |
| `favicon-192.png`, `favicon-512.png` | as named | PWA manifest icons |
| `pwa-maskable-512.png` | 512, opaque square | PWA manifest `purpose: "maskable"` |
| `apple-touch-icon-180.png` | 180, opaque square | iOS home-screen bookmark |
| `logo-horizontal-ink.png` | 982×332, transparent | Horizontal logo on light backgrounds |
| `logo-horizontal-white.png` | 982×332, transparent, white wordmark | **PENDING APPROVAL, do not use.** This recolors the wordmark, which alters the artwork. Use only if the owner confirms it |

Known limits:
- The white-text wordmark is the original wordmark recolored to white,
  not a designer-made reversed version. It is on hold because it alters
  the logo artwork. Every other file only changes format (crop, corner
  fill, background removal), not the artwork.
- On a round launcher mask (some Android devices) the B's square
  corners come close to the edge; check on a device.
- The generator script is not part of the project; ask Claude to rerun
  it if the source JPEGs change.

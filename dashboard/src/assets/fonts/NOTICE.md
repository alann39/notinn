# Bundled PDF fonts

These TrueType files are static instances generated from the upstream variable
fonts, and are embedded (subset) into exported PDFs only — they are not part of
the app's on-screen typography, which loads the same families via
`@fontsource-variable/*`.

| File | Family | Weight | Source |
|---|---|---|---|
| `Manrope-400.ttf` | Manrope | Regular 400 | https://github.com/google/fonts/tree/main/ofl/manrope |
| `Manrope-600.ttf` | Manrope | SemiBold 600 | same |
| `Manrope-800.ttf` | Manrope | ExtraBold 800 | same |
| `Geist-400.ttf` | Geist | Regular 400 | https://github.com/google/fonts/tree/main/ofl/geist |
| `Geist-600.ttf` | Geist | SemiBold 600 | same |
| `Geist-800.ttf` | Geist | ExtraBold 800 | same |

Both families are licensed under the SIL Open Font License 1.1, which permits
bundling and embedding. Instances were produced with:

```
fonttools varLib.instancer <Family>-var.ttf wght=<weight> -o <Family>-<weight>.ttf
```

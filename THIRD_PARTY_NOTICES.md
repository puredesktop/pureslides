# Third-party notices

Create, present, and export HTML slide decks.

Dependencies and bundled assets retain their upstream licenses. The MIT license
for original pure.science inc code does not relicense third-party material.

## Direct external runtime dependencies

This list covers dependencies declared by the snapshot package manifests, including
nested packages where present. It is not a complete transitive dependency inventory.
Consult the installed version’s license and notices before redistributing dependencies.

| Package | Declared version | Upstream |
| --- | --- | --- |
| `mp4-muxer` | `^5.1.5` | [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) |
| `pptxgenjs` | `^3.12.0` | [pptxgenjs](https://github.com/gitbrent/PptxGenJS) |
| `react` | `^19.1.0` | [react](https://github.com/react/react) |
| `react-dom` | `^19.1.0` | [react-dom](https://github.com/react/react) |
| `styled-components` | `^6.1.18` | [styled-components](https://github.com/styled-components/styled-components) |

## Bundled fonts

The faces a deck's look uses ship with the app in `src/fonts/` (Latin subsets as
woff2, from the Fontsource packages named in `src/fonts/registry.ts`) and are
copied into each deck package's `assets/fonts/`. Each is licensed under the SIL
Open Font License 1.1; the licence and copyright lines are in
`src/fonts/licenses/`. Newsreader Display is Newsreader's variable font pinned
at its display optical size (opsz 72) with fontTools; it keeps the OFL.

A custom look made from an organisation's brand may also carry that brand's
own woff2 files. They are copied into the deck package's `assets/fonts/brand/`
from the brand folder beside its `.designsystem.json`, under whatever licence
the brand file names; the app ships none of them.

| Family | Upstream | Licence |
| --- | --- | --- |
| Inter | [rsms/inter](https://github.com/rsms/inter) | OFL-1.1 |
| Space Grotesk | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) | OFL-1.1 |
| IBM Plex Sans, IBM Plex Mono | [IBM/plex](https://github.com/IBM/plex) | OFL-1.1 |
| Newsreader | [productiontype/Newsreader](https://github.com/productiontype/Newsreader) | OFL-1.1 |
| Bricolage Grotesque | [ateliertriay/bricolage](https://github.com/ateliertriay/bricolage) | OFL-1.1 |
| Archivo | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) | OFL-1.1 |
| Instrument Serif, Instrument Sans | [Instrument](https://github.com/Instrument) | OFL-1.1 |
| Atkinson Hyperlegible Next | [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) | OFL-1.1 |
| Montserrat | [JulietaUla/Montserrat](https://github.com/JulietaUla/Montserrat) | OFL-1.1 |
| Manrope | [sharanda/manrope](https://github.com/sharanda/manrope) | OFL-1.1 |
| DM Sans, DM Mono | [googlefonts/dm-fonts](https://github.com/googlefonts/dm-fonts), [googlefonts/dm-mono](https://github.com/googlefonts/dm-mono) | OFL-1.1 |
| Plus Jakarta Sans | [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans) | OFL-1.1 |
| Poppins | [itfoundry/Poppins](https://github.com/itfoundry/Poppins) | OFL-1.1 |
| JetBrains Mono | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) | OFL-1.1 |

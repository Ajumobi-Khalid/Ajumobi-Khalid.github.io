# DESIGN.md: Khalid Ajumobi

The design system this site follows. Anyone editing the site, person or coding agent, should keep to it.

It is adapted from the **ABetterLou** style in the [GradientDeck UI library](https://ui.gradientdeck.com/styles/abetterlou/design.md): a warm dark canvas, cream type and one gold accent kept for actions. The colours are remapped to Georgia Tech gold, and the canvas stays a neutral black because the globe and the city maps are drawn on it.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ground` | `#0b0b0b` | Page canvas. The globe, the map feathering and the CHIP-8 screen are drawn on this exact value. |
| `--deep` | `#070605` | One step deeper: the footer band. |
| `--raised` | `#14110c` | Code blocks, the CHIP-8 player's panels. |
| `--text` | `#f6eee2` | Warm cream. Primary text and outlined buttons. |
| `--soft` | `#c3b9a9` | Secondary text and body copy under headings. |
| `--faint` | `#8c8274` | Labels, dates, metadata (5:1 on the canvas). |
| `--line` | `#3b3428` | Hairlines between items and around frames. |
| `--line-soft` | `#1f1a13` | Fainter hairlines between sections. |
| `--gold` | `#b3a369` | Georgia Tech gold. The only accent: filled buttons, link underlines, focus, the globe and maps. |
| `--gold-hi` | `#e3d6a2` | Hover on gold, lit pixels on the CHIP-8 screen. |

- One gold action per view. Gold is never body text.
- No second accent colour, no pure white.

## Type

- **Space Grotesk** for everything. **Space Mono** only for code, opcodes, registers and the keypad: never as decoration.
- Two weights: 400 for text and every display size, 500 for small headings, buttons and emphasis.
- Body 16px / 1.55. Leads 20 to 26px.
- Display (name, page titles, section titles) at weight 400, tracking -0.02em to -0.025em, line height near 1.
- Normal case everywhere. No uppercase labels.

## Shape and space

- Corners: 999px pills for buttons and other controls; 6px for frames, images and panels.
- No shadows, glows or blurs. Depth comes from the canvas steps and 1px hairlines.
- Section gaps 64 to 104px; tight groups inside them.
- Content width up to 1440px with the page margin `clamp(20px, 4vw, 56px)`.

## Components

- **Buttons:** gold filled pill for the main action, cream outlined pill (`.btn.line`) beside it.
- **Top bar:** name on the left; Experience and Projects as text links; About me (outlined) and Email me (gold) as pills.
- **Lists of facts:** label in `--faint`, value in `--text`, one hairline under each row. No boxes or fills.
- **Steps and flows:** columns under a single rule; the step that matters gets a gold rule.
- **Links in text:** cream, underlined in gold, 5px offset.

## Do not

- Put a small label above a heading. The heading carries itself.
- Number sections, or put arrows or other glyphs after links.
- Box content in filled cards, or add a coloured border thicker than 1px.
- Fade every section in. The globe journey is the site's one moment of motion.
- Use monospace, uppercase or gold as decoration.

# Design Brief

## Direction

Ledger Instrument — a dense, precise real-estate seller net worksheet that reads like a well-made accounting statement, now with a restrained elevation ladder and live native HTML/CSS/SVG charts.

## Tone

Restrained technical professionalism: charcoal ink on soft off-white, hairline rules, one muted teal accent, quiet layered depth — the numbers are the interface, never decoration.

## Differentiation

The Seller Net Waterfall: a ruled monospace ledger column descending step by step from gross price to net proceeds, mirrored by a live stepped waterfall chart and a proportional deduction breakdown — a financial statement you can read at a glance. Every section header is anchored by a machined keycap badge: a small physical control milled into the worksheet, not a flat outline icon.

## Color Palette

| Token      | OKLCH           | Role                                              |
| ---------- | --------------- | ------------------------------------------------- |
| background | 0.978 0.003 240 | App canvas, soft cool off-white (print-safe)      |
| foreground | 0.2 0.016 250   | Charcoal/navy ink, headings, numeric readouts     |
| card       | 1.0 0 0         | Input groups, KPI cards, chart cards              |
| primary    | 0.42 0.07 205   | Muted ledger teal — CTAs, active, focus ring      |
| accent     | 0.42 0.07 205   | Same teal, used sparingly for focus/selection     |
| muted      | 0.958 0.004 240 | Section headers, inset rows, secondary chips      |
| border     | 0.905 0.005 240 | Subtle gray hairlines on every surface            |
| success    | 0.47 0.1 158    | Positive net proceeds                             |
| destructive| 0.5 0.17 27     | Seller shortfall, validation errors               |
| warning    | 0.6 0.11 76     | Estimate provenance, caution states               |
| panel      | 0.235 0.028 252 | Dark navy/charcoal results panel surface          |
| panel-foreground | 0.955 0.006 240 | Large net-proceeds figure on panel (AA+ contrast) |
| panel-muted | 0.66 0.014 245 | Secondary labels on panel (AA on 0.235)          |
| panel-accent | 0.78 0.1 200  | Teal accent on panel, tuned for dark surface      |
| panel-positive | 0.82 0.14 158 | Positive figure on panel                        |
| panel-negative | 0.76 0.15 25 | Shortfall figure on panel                        |
| chip-border | 0.86 0.006 245 | Provenance chip outline (subtle gray)           |
| chip-bg    | 0.985 0.002 240 | Provenance chip fill (near-white, not tinted)   |
| chip-fg    | 0.42 0.012 250  | Provenance chip label ink                       |
| chart-1    | 0.44 0.085 215  | Commissions — ledger teal                        |
| chart-2    | 0.5 0.012 245   | Closing costs — slate                            |
| chart-3    | 0.33 0.05 258   | Encumbrances/payoffs — deep navy                 |
| chart-4    | 0.62 0.09 200   | Seller costs — light teal                        |
| chart-5    | 0.58 0.1 76     | Estimated tax — muted amber                      |
| chart-gross | 0.5 0.06 215  | Waterfall gross bar                              |
| chart-net  | 0.47 0.1 158    | Waterfall net bar                                |
| chart-track | 0.945 0.004 240 | Chart track / empty rail / donut remainder      |
| chart-grid | 0.92 0.005 240  | Chart gridline                                   |
| chart-baseline | 0.84 0.007 240 | Chart zero baseline                          |
| elev-1     | 0.99 0.002 240  | Section header strip / inset surface             |
| elev-2     | 1.0 0 0         | KPI + chart cards (top layer)                    |
| elev-3     | 0.995 0.001 240 | Scenario cards, raised rows                      |
| badge-bg   | 0.965 0.008 215 | Icon badge fill — faint teal (legacy)            |
| badge-border | 0.9 0.012 215 | Icon badge hairline (legacy)                     |
| badge-ink  | 0.42 0.07 205   | Icon badge glyph ink (legacy)                    |
| badge-face | 0.972 0.011 212 | Keycap lit upper-left face (light)               |
| badge-face-lo | 0.912 0.016 214 | Keycap shaded lower-right face (light)        |
| badge-edge-lo | 0.855 0.02 216 | Keycap darker machined lower/right edge (light)  |
| badge-ring | 0.885 0.014 215 | Keycap hairline outer ring (light)               |
| badge-cast | 0.2 0.016 250   | Keycap soft cast shadow ink (light)              |
| badge-glyph | 0.4 0.072 208  | Keycap glyph ink inside the recess (light)       |
| badge-glyph-hi | 1.0 0 0     | Keycap glyph micro top highlight (light)         |
| badge-bevel | 0.99 0.004 212 | Keycap top inner highlight strength (light)      |

## Typography

- Display: Space Grotesk — wordmark, panel titles, KPI labels, section eyebrows (`.type-metric`)
- Body: General Sans — sentence-case field labels, helper text, chips, prose (`.type-label` / `.type-meta`)
- Mono: JetBrains Mono — every monetary value, percentage, and ID, tabular numerals (`font-money` / `.type-result`)
- Scale: result `text-2xl md:text-3xl .type-result`, metric `text-base .type-metric`, h2 `text-sm font-display font-semibold`, eyebrow `.eyebrow` (11px uppercase 0.1em), label `.type-label` (13px), meta `.type-meta` (11px), money `font-money tabular-nums`
- Hierarchy rule: major results larger + heavier; secondary labels quieter via `muted-foreground`; financial values always tabular/monospaced
- Uppercase is reserved for small section eyebrows and metadata only; field labels use sentence case

## Elevation & Depth

Depth is a restrained three-step ladder — `surface-1` (header strips) → `surface-2` (KPI/chart cards) → `surface-3` (scenario cards) — each defined by a 1px border, a quiet top inset highlight, and a soft 1–2px drop shadow; never glossy, never a floating toy card; the results panel stays a flat dark surface. The icon badge is the one place depth becomes literal: a machined keycap with a lit face, a darker lower/right edge, and a cast shadow onto the strip.

## Icon Badge System — "Machined Keycap"

- **Form**: 36px square (`.icon-badge`) / 44px (`.icon-badge-lg`), 5–6px radius — a small control, never a pill or circle.
- **Lighting**: ONE light source, upper-left, across every section icon. Top + left edges catch `--badge-bevel`; bottom + right edges fall to `--badge-edge-lo`.
- **Face**: 145° gradient `--badge-face` → `--badge-face-lo` (teal-tinted, restrained; slate/navy only as the shaded edge, never a second hue).
- **Recess**: `::after` inner well (3–4px inset) casts a faint `--badge-edge-lo` inner shadow so the glyph sits *inside* the control.
- **Glyph**: layered lucide line-art at 1.85–1.9 stroke, `--badge-glyph` ink, `drop-shadow` of `--badge-glyph-hi` for a micro top-lit edge. No fills, no cartoon weight.
- **Cast shadow**: two soft layers of `--badge-cast` (1px contact + 3px ambient) — grounds the keycap on the header strip without floating.
- **Consistency rule**: identical size, radius, lighting, and stroke across all 17 section keys (`SECTION_ICONS`); `size="sm"` in the left input ledger, `size="lg"` on the dark results panel.
- **API frozen**: `SectionIcon` props (`section` key / `icon` name / `size` `sm|lg` / `label`) and its `aria-hidden`-when-unlabeled behavior are unchanged — all depth lives in `.icon-badge` CSS, so call sites do not change.
- **Print**: badges flatten to `#fff`, 1px `#000`, no shadow, no `::after` well, no glyph filter.

## Structural Zones

| Zone         | Background      | Border      | Notes                                                        |
| ------------ | --------------- | ----------- | ------------------------------------------------------------ |
| Header       | bg-card         | border-b    | Wordmark + version tag left; property ID, date, view toggle right |
| Left panel   | bg-background   | border-r    | Scrollable input groups on `surface-2` cards, sticky group nav |
| Right panel  | panel-surface   | panel-border| Dark navy results surface: KPI row, waterfall chart, breakdown, ledger, scenario chart |
| Footer       | bg-muted/40     | border-t    | Disclaimer + provenance legend; hidden in client view        |
| Print sheet  | #fff            | 1px #000    | One-page net sheet: surfaces/badges flatten to white, shadows removed |

## Spacing & Rhythm

Panel padding `p-4 md:p-5`; input group gap `gap-3` with `gap-1.5` inside rows; KPI grid `gap-3`; waterfall rows `py-1.5` separated by hairline rules; chart card body `p-3 md:p-4` with `space-y-2` between bars; section separation `space-y-5`; card radius 3px (`--radius: 0.1875rem`).

## Component Patterns

- Buttons: 3px radius, `bg-primary` solid for primary action, `variant=outline` hairline for secondary, `h-8` dense; hover darkens via `bg-primary/90`, no lift
- Cards: `rounded-md` (3px) with `surface-1` / `surface-2` / `surface-3` by elevation tier; KPI cards add a 2px left status bar (teal/green/red)
- Section headers: `.section-head` strip with a machined keycap `.icon-badge` (36px) beside the title; `.icon-badge-lg` (44px) on results-panel headers; identical lighting, radius, and stroke across every section
- Charts: native HTML/CSS/SVG only — `.chart-track` rails, `.chart-grid` / `.chart-baseline` rules, `.chart-bar` with 0.18s width/height transition; waterfall bars, donut/stacked deduction breakdown, and scenario net bars all read from computed output
- Chart visual direction: muted teal/slate/navy only — `chart-1` teal for commissions, `chart-2` slate for closing costs, `chart-3` deep navy for encumbrances/payoffs, `chart-4` light teal for seller costs, `chart-5` muted amber for estimated tax; `chart-gross` / `chart-net` for the waterfall ends; 2px bar radius, 1px gridlines, no 3D, no gradients, no chart junk; friction ticks are thin absolutely-positioned markers on the same scale
- Chips: provenance/status indicators — `.chip` utility, `rounded-[2px]`, 1px `chip-border` outline, near-white `chip-bg`, `chip-fg` ink, `text-[11px]` sentence-case with optional `.chip-dot`; never styled or sized as an action button
- Inputs: `h-8 rounded-sm border-input bg-card`, right-aligned `font-money` tabular, `$` prefix in muted; focus `ring-1 ring-ring`
- Results panel: `.panel-surface` dark navy surface; large net figure `.type-result` in `panel-foreground`; secondary text `panel-muted`; rules `panel-rule`

## Motion

- Entrance: `animate-fade-in` 0.2s ease-out on panel mount; no staggered theatrics, no chart entry animation
- Hover: `transition-smooth` (0.18s) on borders/backgrounds only
- Decorative: `animate-value-flash` 0.6s when a computed total changes; `.chart-bar` transitions width/height 0.18s so bars track live input changes; accordion open/close for advanced sections

## Constraints

- Deterministic math only — the UI renders values, never computes them
- Tabular numerals on all money and IDs; right-align every currency column
- Green = net proceeds positive, red = shortfall; never use those hues decoratively
- Chart palette is muted teal/slate/navy with accessible contrast — no rainbow, no neon, no chart junk
- Uppercase only for small section eyebrows/metadata; sentence case for field labels
- Provenance chips are subtle gray outlined status indicators, never action buttons
- No fintech gradients, neon, oversized rounded cards, cartoon icons, or excessive shadows
- Icon badges stay small and supporting — never overpower the heading; one light direction (upper-left) for all of them
- Print stylesheet must render a clean one-page net sheet (`.no-print` / `.print-sheet`); surfaces and badges flatten to white with no shadow or bevel
- Presentation-only: never touch calculator logic, formulas, validation, HECM, Section 121, friction, scenarios, snapshots, or provenance behavior

## Signature Detail

The paired waterfall: a ruled monospace ledger column and its live stepped SVG/CSS chart descend together from gross price to net proceeds, with a colored left accent bar on the final total — a financial statement you can read at a glance.

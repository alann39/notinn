# Landing-page design system

## 1. Visual thesis

**Editorial notebook meets precise digital workflow.**

Landing page harus terasa seperti halaman notebook yang telah dirapikan, bukan template AI SaaS. Brand hand-drawn memberi warmth. Product UI, spacing, dan typography memberi trust. Contrast tinggi dan satu highlighter colour membuat transformation terbaca tanpa memakai gradient ungu-biru atau AI orb.

### Design axes

| Axis                 | Decision                                                |
| -------------------- | ------------------------------------------------------- |
| Paper band           | Light warm paper                                        |
| Display style        | Editorial serif, not decorative script                  |
| Body style           | Existing Inter stack for continuity with dashboard      |
| Accent               | Yellow highlighter, non-interactive only                |
| Interactive emphasis | Ink fill and underline                                  |
| Shape                | Mostly rectangular, modest radius, no pill-everything   |
| Surface              | Flat paper, hairline rules, minimal shadow              |
| Image style          | Real product capture plus existing hand-drawn brand art |
| Motion               | Functional and rare                                     |

## 2. Colour tokens

Use primitives only to define semantic tokens. Components reference semantic roles.

### Primitives

```css
--paper-50: #ffffff;
--paper-100: #f7f3ea;
--paper-200: #eee8dc;
--ink-950: #11110f;
--ink-700: #3d3a35;
--ink-600: #5e5a53;
--rule-300: #d7d0c4;
--highlight-400: #f4c84a;
--danger-600: #b42318;
--success-700: #26734d;
```

### Semantic roles

```css
--color-bg-page: var(--paper-100);
--color-bg-surface: var(--paper-50);
--color-bg-subtle: var(--paper-200);
--color-bg-inverse: var(--ink-950);
--color-text-primary: var(--ink-950);
--color-text-secondary: var(--ink-600);
--color-text-inverse: var(--paper-100);
--color-border-subtle: var(--rule-300);
--color-accent-solid: var(--ink-950);
--color-accent-text: var(--ink-950);
--color-highlight: var(--highlight-400);
--color-focus: var(--ink-950);
--color-danger: var(--danger-600);
--color-success: var(--success-700);
```

### Measured contrast

Computed with `.agents/skills/software-ui-ux-design/scripts/contrast_check.py`:

| Foreground | Background |   Ratio | Result                           |
| ---------- | ---------- | ------: | -------------------------------- |
| `#11110F`  | `#F7F3EA`  | 17.07:1 | WCAG AA and AAA normal text pass |
| `#5E5A53`  | `#F7F3EA`  |  6.19:1 | WCAG AA normal text pass         |
| `#F7F3EA`  | `#11110F`  | 17.07:1 | WCAG AA and AAA normal text pass |
| `#11110F`  | `#F4C84A`  | 11.89:1 | WCAG AA and AAA normal text pass |
| `#FFFFFF`  | `#11110F`  | 18.90:1 | WCAG AA and AAA normal text pass |

These ratios apply only to opaque token pairs. Recompute any pair rendered over image, transparency, gradient, or altered opacity.

### Colour rules

- Filled ink is reserved for the primary CTA in each viewport.
- Yellow highlighter marks transformed content; it is never a button fill or status.
- Links use underline plus colour, not colour alone.
- Danger and success appear only where those states exist.
- No dark mode in the first landing release. The dashboard theme does not require the marketing page to ship two unverified themes.

## 3. Typography

### Families

```css
--font-display: "Newsreader", Georgia, serif;
--font-body: "Inter", "Helvetica Neue", Arial, sans-serif;
--font-mono: "Geist Mono", Consolas, monospace;
```

Rationale:

- Newsreader creates editorial contrast and echoes NŌTA/Granola without copying either.
- Inter is retained deliberately because the dashboard already uses it and it keeps product screenshots and marketing UI related.
- Geist Mono already exists in the dashboard for metadata and sequence labels.

Production must self-host `.woff2`, subset required Latin glyphs, preload only the display face used above the fold, and set `font-display: swap`. Required weights: Newsreader 500 and 600; Inter 400, 500, 600; Geist Mono 500.

### Scale

| Token        | Desktop                        | Mobile     | Line height | Use                      |
| ------------ | ------------------------------ | ---------- | ----------- | ------------------------ |
| `display-xl` | `clamp(3.75rem, 7vw, 7.5rem)`  | same clamp | 0.94        | Hero H1                  |
| `display-lg` | `clamp(2.75rem, 5vw, 5rem)`    | same clamp | 1.0         | Section statement        |
| `heading-md` | `clamp(1.75rem, 3vw, 2.75rem)` | same clamp | 1.08        | Section H2               |
| `heading-sm` | 1.375rem                       | 1.25rem    | 1.2         | Feature H3               |
| `body-lg`    | 1.25rem                        | 1.125rem   | 1.55        | Hero support             |
| `body-md`    | 1rem                           | 1rem       | 1.6         | General body             |
| `body-sm`    | 0.875rem                       | 0.875rem   | 1.5         | Notes and labels         |
| `meta`       | 0.75rem                        | 0.75rem    | 1.4         | Step numbers and eyebrow |

Rules:

- One H1 only.
- H2 then H3 without skipped heading levels.
- Heading max width: 16ch to 22ch; `text-wrap: balance`.
- Body max width: 60ch to 70ch; `text-wrap: pretty` for short descriptions.
- No text below 12 px.
- Avoid all-caps prose. Mono eyebrow may use uppercase with 0.08em tracking.
- Keep content selectable.

## 4. Layout

### Container

```css
--container-max: 80rem;
--gutter: clamp(1rem, 4vw, 4rem);
--section-space: clamp(5rem, 10vw, 9rem);
```

- Full-bleed backgrounds, contained copy and controls.
- Hero min height uses `100svh`, not `100vh` or `100dvh`.
- Section spacing follows one rhythm. Do not zero block padding via container shorthand.
- Group gap ratio: inter-group gap at least 2x intra-group gap.

### Grid

- Desktop: 12 columns.
- Hero copy: columns 1-6; workflow visual: columns 7-12 with intentional vertical offset.
- Tablet: 8 columns.
- Mobile: one column, content order follows DOM order.
- Breakpoints derive from content fit. Initial candidates: 48rem and 72rem, confirmed visually rather than treated as device names.

### Responsive rules

| Width       | Behaviour                                                                         |
| ----------- | --------------------------------------------------------------------------------- |
| 320-479 px  | 16 px gutter, one column, compact nav, CTA full-width but inset                   |
| 480-767 px  | 20-24 px gutter, demo cards may overlap only if no text is obscured               |
| 768-1151 px | 8-column grid, hero may remain split only if both columns exceed readable minimum |
| 1152 px+    | 12-column composition, max width 1280 px                                          |

## 5. Shape and surfaces

```css
--radius-control: 0.75rem;
--radius-surface: 1rem;
--radius-media: 1.25rem;
--radius-pill: 999px;
```

- Pill radius only for status chips, not every button or card.
- Nested radius follows: outer radius = inner radius + padding.
- Use hairline border for structure.
- Shadows only for product capture depth:
  `0 1px 2px rgb(17 17 15 / 0.06), 0 16px 48px rgb(17 17 15 / 0.08)`.
- Images receive 1 px low-opacity black outline on light surface.
- Do not nest cards unless grouping cannot be expressed by spacing.

## 6. Components

### Header

- Inline logo and links on desktop.
- Mobile uses native button and off-canvas dialog only if links no longer fit.
- Header remains non-sticky for initial release unless browser testing proves repeat CTA discovery is poor.
- CTA label stays visible; no icon-only primary action.

### Buttons and links

- Primary: ink fill, paper text, minimum 44 px touch height.
- Secondary: underlined text link with destination-specific label.
- Press state: `scale(0.96)` for 100-160 ms.
- Hover styles gated by `@media (hover: hover) and (pointer: fine)`.
- Exact transition properties only; no `transition: all`.

### Workflow demo

- Use semantic figure with `figcaption`.
- Left panel is raw synthetic message; right panel is structured output.
- Telegram chrome must be a genuine screenshot or an honest simplified transcript. Do not draw fake phone/browser chrome and present it as product UI.
- Content is present in DOM, not burned into an image.
- Yellow highlight can reveal the relationship between phrases, but static borders and labels must preserve meaning without motion.

### Input strip

- Text list or wrap layout, not an auto-scrolling marquee.
- Icons are optional; if used, one Lucide set and consistent 1.5 px stroke.

### How-it-works

- Three numbered editorial columns on wide screens; stacked list on narrow screens.
- Ordinals use tabular numerals.
- No arrows that define the only reading order.

### Format selector

- Six featured formats visible.
- Remaining formats use native disclosure.
- This is explanatory content, not an interactive product configurator.

### FAQ

- Native `<details>` and `<summary>`.
- Plus/minus is decorative and `aria-hidden`.
- Focus style remains visible.
- Multiple-open is acceptable; do not add JavaScript only to force single-open behaviour.

### Footer

- One concise link map and status.
- No newsletter form, social icons, or invented address.

## 7. Asset direction

### Approved

- `brand/Notinn Logo - Brand.png` or vector equivalent for the logo lockup.
- `brand/Notinn All -Mockup.png` crops for brand story, only if optimised and clearly decorative.
- Real Telegram bot and dashboard captures made with synthetic content.
- Existing `dashboard/public/notinn-logo.png` for small raster fallback.

### Not approved

- `brand/Notinn App -Mockup.png` as product availability proof.
- Stock portraits.
- AI-generated screenshots pretending to be shipped product.
- Decorative 3D AI orb.
- User content or production data.

### Production format

- Prefer SVG for logo/illustration where a source exists.
- AVIF primary plus WebP fallback for large raster captures.
- Width and height attributes required.
- Hero image target under 180 KB compressed; each below-fold image under 120 KB where visual quality permits.

## 8. Motion

Motion purpose is explanation and feedback, not spectacle.

| Moment                | Behaviour                                       |   Duration |
| --------------------- | ----------------------------------------------- | ---------: |
| Button press          | scale 1 to 0.96                                 |     120 ms |
| Link/colour hover     | colour/opacity only                             |     120 ms |
| Hero proof entrance   | optional opacity plus 8 px translate, once      |     300 ms |
| Before/after emphasis | optional clip reveal after content is visible   |     400 ms |
| FAQ                   | native instant disclosure or short opacity only | 150 ms max |

Rules:

- CSS transitions for interruptible UI.
- Animate transform and opacity only.
- No animation on keyboard-initiated anchor navigation.
- `prefers-reduced-motion: reduce` removes translate, clip reveal, parallax, and smooth scrolling; content remains visible.
- The public hero may autoplay the self-hosted muted ping-pong clip (seconds 1–5 forward and reverse, 483,081 bytes) after hydration. Before playback, with no JavaScript, and under reduced motion, its `#262925` solid frame remains visible; no poster or third-party media request is needed.
- No scroll-jacking.
- If GSAP is not needed for a functional sequence, do not use it on this page even though it is already installed.

## 9. Accessibility styling

- `:focus-visible` uses a minimum 2 px solid ink outline with 2 px offset.
- On inverse section, focus ring uses paper plus a contrasting outer shadow if needed.
- Skip link is first focusable element.
- Anchored headings use `scroll-margin-top`.
- Minimum target: 24 by 24 CSS px under WCAG 2.2; design target: 44 by 44 px.
- No meaning by colour alone.
- Do not disable browser zoom.
- Root keeps `-webkit-text-size-adjust: 100%`.

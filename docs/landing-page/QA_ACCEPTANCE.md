# QA and acceptance criteria

## 1. Product and content acceptance

- [ ] Hero identifies Telegram as the interaction channel above the fold.
- [ ] Primary CTA opens the correct Notinn bot private chat.
- [ ] Closed Alpha status is visible before any conversion claim.
- [ ] Supported input list matches the product contract.
- [ ] No unsupported claim for video, spreadsheet, group chat, native app, or permanent raw-file archive.
- [ ] Example content is labelled synthetic.
- [ ] No customer logo, testimonial, rating, user count, processing speed, price, or quota appears without a source.
- [ ] AI limitation copy is visible.
- [ ] Privacy copy matches `docs/PRIVACY_NOTICE.md`.
- [ ] Terms and privacy links resolve to public browser routes.
- [ ] Dashboard is presented as optional supporting interface, not the primary capture interface.

## 2. Functional acceptance

- [ ] `/` renders without authentication.
- [ ] `/notes` remains authenticated and renders the existing note library.
- [ ] `/login` and `/auth/callback` remain unchanged in behaviour.
- [ ] Header anchors land on the correct section.
- [ ] `Lihat cara kerja` moves focus to the target heading.
- [ ] CTA is a real anchor and works with JavaScript disabled.
- [ ] FAQ works with keyboard and JavaScript disabled.
- [ ] Browser back and forward preserve expected scroll/navigation behaviour.
- [ ] External Telegram handoff is verified on desktop web, Android Telegram, and iOS Telegram where devices are available.
- [ ] Failed images preserve content and layout meaning.

## 3. Accessibility acceptance

Target: WCAG 2.2 AA.

### Semantics

- [ ] One H1; headings descend without skipped levels.
- [ ] One visible primary main landmark.
- [ ] Header, nav, main, and footer landmarks are present.
- [ ] Link text remains meaningful out of context.
- [ ] Buttons perform actions; anchors navigate.
- [ ] Decorative images use `alt=""`.
- [ ] Informative images have purpose-based alt or adjacent text equivalent.
- [ ] No redundant or invalid ARIA.

### Keyboard

Complete this exact walk:

1. Load `/` and press Tab.
2. Skip link becomes visible.
3. Activate skip link; focus moves to main.
4. Reload and tab through logo, nav links, dashboard link, and Telegram CTA in visual order.
5. Activate `Lihat cara kerja`; target heading receives focus.
6. Open and close every FAQ summary using Enter and Space.
7. If mobile menu uses a dialog, open it, verify focus trap, close with Escape, and confirm focus returns to trigger.
8. Reach footer links without hidden or duplicated focus stops.

Acceptance:

- [ ] Every focus stop has a visible indicator.
- [ ] No pointer-only path.
- [ ] No positive `tabindex`.
- [ ] No off-screen focus target.

### Zoom and reflow

- [ ] At 200% browser zoom, all text and controls remain available.
- [ ] At 320 CSS px width, there is no page-level horizontal scroll.
- [ ] At 400% text-only zoom where supported, critical content remains readable.
- [ ] No fixed-height text container clips copy.
- [ ] Long Indonesian and pseudo-localised strings wrap without overlap.

### Colour and motion

- [ ] Every rendered text/background pair is measured, including image overlays.
- [ ] Focus indicator contrast meets WCAG 2.2 requirements on every surface.
- [ ] Status and meaning do not rely on colour alone.
- [ ] `prefers-reduced-motion: reduce` removes translate, clip, parallax, smooth scroll, and autoplay behaviour.
- [ ] Content remains present when animations do not run.

### Automated check

- [ ] Run axe or equivalent on desktop and mobile layouts with zero critical or serious violations.
- [ ] Inspect the browser accessibility tree for header, main, CTA, proof figure, FAQ, and footer.

## 4. Responsive acceptance

Verify at minimum:

- 320 x 568
- 375 x 667
- 390 x 844
- 768 x 1024
- 1024 x 768
- 1280 x 800
- 1440 x 900

For each:

- [ ] primary CTA is visible without clipping;
- [ ] hero headline forms deliberate lines;
- [ ] workflow proof order is raw input then structured result;
- [ ] nav never overlaps logo or CTA;
- [ ] section spacing stays distinct;
- [ ] no text is burned into a raster image when it is required for comprehension;
- [ ] full-width controls remain inset from viewport edges;
- [ ] orientation change does not hide content.

Real-device checks required for:

- sticky hover after tap;
- tap highlight and press feedback;
- mobile browser chrome and `svh` behaviour;
- safe areas;
- Telegram app handoff;
- text sizing and rotation.

## 5. Visual acceptance

- [ ] Page reads as Notinn when logo is temporarily hidden: warm paper, ink, editorial type, hand-drawn accent, structured proof.
- [ ] Hero is asymmetric, not a generic centered SaaS stack.
- [ ] No purple-blue gradient or AI orb.
- [ ] No three equal icon cards.
- [ ] No fake app or browser chrome.
- [ ] No excessive pill controls.
- [ ] One filled primary CTA per viewport.
- [ ] Yellow highlight is not used for interactive or status meaning.
- [ ] Radius is concentric on nested surfaces.
- [ ] Icons use one set and consistent stroke.
- [ ] Real copy is used; no lorem ipsum.

## 6. SEO acceptance

- [ ] Unique title, description, canonical, Open Graph, and Twitter metadata.
- [ ] Social image resolves at 1200 x 630 and contains no unsupported claim.
- [ ] Production is indexable; preview/development is not.
- [ ] `sitemap.xml` excludes authenticated and admin routes.
- [ ] `robots.txt` does not expose secrets and does not claim access control.
- [ ] JSON-LD passes schema validation and contains no rating, review, price, or availability fabrication.
- [ ] Page content remains useful without client-side hydration.

## 7. Performance acceptance

Run Lighthouse or equivalent on the production build with mobile throttling, then inspect real-user metrics after release.

- [ ] LCP <= 2.5 s target.
- [ ] INP <= 200 ms target.
- [ ] CLS <= 0.1 target.
- [ ] No unbounded image dimensions.
- [ ] No landing-route import of admin pages in the initial chunk where route splitting can avoid it.
- [ ] No animation library in the initial landing chunk.
- [ ] Fonts are WOFF2, subset, and limited to required weights.
- [ ] Below-fold images lazy-load.
- [ ] No third-party script blocks first render.

## 8. Analytics acceptance

- [ ] Every event matches the allowlist in `IMPLEMENTATION_SPEC.md`.
- [ ] CTA `placement` is a fixed enum such as `header`, `hero`, or `footer`.
- [ ] FAQ uses stable keys, not answer content.
- [ ] No Telegram ID, user identity, note content, filename, query string, or arbitrary DOM text is emitted.
- [ ] Events do not fire twice under React development behaviour or repeated hydration.
- [ ] Analytics absence never blocks page or CTA.
- [ ] Consent behaviour is reviewed for actual deployment markets and vendor.

## 9. Security and privacy acceptance

- [ ] Production bundle contains no service-role key, bot token, provider key, or signed URL.
- [ ] Landing has no upload, text-processing, or arbitrary URL fetch surface.
- [ ] Legal Markdown output is sanitised.
- [ ] External links use fixed `https:` destinations.
- [ ] CSP is checked against self-hosted fonts, image sources, analytics, and Telegram links.
- [ ] No production user content appears in assets, examples, source maps, logs, or analytics.

## 10. Browser matrix

Latest stable and one previous major where practical:

- Chrome desktop and Android;
- Safari macOS and iOS;
- Firefox desktop;
- Edge desktop.

Progressive enhancement rule: unsupported decorative features may disappear. Content, navigation, CTA, FAQ, and legal links must not.

## 11. Smoke scenario

A release is not verified until this scenario is observed on a production build:

1. Open `/` in a clean, signed-out browser.
2. Confirm hero, input list, proof, privacy, FAQ, and footer render.
3. Keyboard-walk the page.
4. Activate `Lihat cara kerja` and observe focus at the demo heading.
5. Open one FAQ and read its accessible name and expanded state.
6. Activate the hero Telegram CTA and observe the bot destination.
7. Return and open `/notes`; observe redirect to `/login` when signed out.
8. Complete the existing bot magic-link flow in an authorised test environment and confirm `/notes` still renders.
9. Repeat the public flow at 320 px and with reduced motion.

Record exact commands, browser/device, and observed result in `docs/IMPLEMENTATION_STATUS.md` when implementation ships.

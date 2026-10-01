# Implementation specification

## 1. Recommended architecture

Implement the landing page inside the existing `dashboard/` Vite + React 19 + TypeScript + Tailwind CSS 4 application.

Rationale:

- existing deployment, router, brand assets, fonts, and primitives can be reused;
- no second frontend toolchain;
- legal, dashboard, and Telegram links share one origin;
- landing remains static and does not require a new backend.

### Route cutover

```text
/                 -> public LandingPage
/notes            -> authenticated NotesPage
/notes/:id        -> authenticated NoteDetailPage
/usage            -> authenticated UsagePage
/settings         -> authenticated SettingsPage
/login            -> public LoginPage
/auth/callback    -> public AuthCallbackPage
```

Remove the authenticated NotesPage alias at `/`. Existing dashboard navigation already has `/notes`; update any hard-coded root links that intend to reach notes.

Do not put LandingPage inside `DashboardLayout`; that layout redirects unauthenticated visitors to `/login`.

## 2. Suggested file structure

```text
dashboard/src/
  app/
    landing-page.tsx
  components/
    landing/
      landing-header.tsx
      hero.tsx
      supported-inputs.tsx
      transformation-proof.tsx
      how-it-works.tsx
      output-formats.tsx
      use-cases.tsx
      privacy-boundary.tsx
      landing-faq.tsx
      final-cta.tsx
      landing-footer.tsx
  content/
    landing.id.ts
  styles/
    landing.css
```

Use data arrays for repeated content, but do not abstract one-off sections into a generic section-builder DSL.

## 3. Component contract

### `LandingPage`

- owns document landmarks and section order;
- updates page title and meta tags through the app's chosen metadata mechanism;
- contains one `<main id="main-content">`;
- does not read authentication to render core content.

### `LandingHeader`

- receives anchor links and Telegram URL;
- optional session-aware utility text may change from `Buka dashboard` to the same destination, but must not delay render;
- mobile navigation uses native button semantics, Escape close, focus trap, and focus return if implemented as a dialog.

### `TransformationProof`

- accepts serialised synthetic before/after content;
- never accepts production user content;
- rendered text stays selectable;
- static state is complete before optional enhancement runs.

### `PrivacyBoundary`

- copy comes from reviewed local content constants;
- links to `docs/PRIVACY_NOTICE.md` through the deployed legal route or generated static page;
- does not fetch policy text at runtime.

### `LandingFaq`

- uses native `<details>` and `<summary>`;
- emits `landing_faq_open` only on closed-to-open transition;
- event property is a stable question key, not the visible answer text.

## 4. Public legal routes

A deployed landing page needs reachable legal pages. Repository Markdown alone is not a browser route.

Implement one of these boring options:

1. render reviewed Markdown as static public routes `/privacy` and `/terms`; or
2. create dedicated React pages whose content is generated from the Markdown at build time.

Preferred: build-time Markdown rendering with strict sanitisation and no runtime fetch. Source of truth remains:

- `docs/PRIVACY_NOTICE.md`
- `docs/TERMS_OF_SERVICE.md`

Do not duplicate legal copy manually in multiple React files.

## 5. Telegram links

Primary URL:

```text
https://t.me/NotinnBot
```

Use an ordinary `<a href>` so open-in-new-tab and no-JS behaviour work. If a campaign deep link is added, use an opaque fixed campaign token such as `start=landing`, never user data or page content.

Recommended attributes:

```html
<a href="https://t.me/NotinnBot" rel="noopener noreferrer">
```

`target="_blank"` is optional. On mobile, same-context navigation usually gives a cleaner app handoff. Decide after device testing.

## 6. Styling integration

- Reuse existing Tailwind 4 setup.
- Landing-specific semantic tokens live under a `.landing-theme` scope to avoid changing dashboard colours.
- Reuse existing `NotinnLogo` only if it renders correctly against warm paper; otherwise add a landing lockup component backed by approved brand asset.
- Do not change shared dashboard typography or token meanings to make the landing page work.
- Prefer CSS layout and native elements over a component dependency.
- Existing GSAP dependency is not justification to use it.

## 7. Content localisation

Initial release can ship Bahasa Indonesia only, but content must live outside JSX in `content/landing.id.ts`.

Requirements:

- natural full strings, not concatenated fragments;
- no fixed widths on labels;
- button and nav labels may wrap where necessary;
- `<html lang="id">` for the public landing route;
- product names and template labels stay consistent with Telegram until product-wide localisation exists;
- preserve mixed-language values with `<bdi>` only where direction may vary.

The current app root declares `lang="en"`. Route-aware language handling is required so dashboard English and landing Indonesian do not lie to assistive technology.

## 8. SEO

### Required

- unique title and description from `CONTENT_SPEC.md`;
- canonical URL from deployment config;
- Open Graph and Twitter card metadata;
- 1200 x 630 social image generated from approved Notinn brand assets;
- `robots` index/follow only on production;
- semantic heading outline and descriptive links;
- `sitemap.xml` containing public marketing and legal routes only;
- `robots.txt` excludes authenticated and admin paths from crawl hints;
- JSON-LD `SoftwareApplication` only with factual values.

### JSON-LD constraints

Allowed:

- name: Notinn;
- application category: ProductivityApplication;
- operating system: Web and Telegram interface;
- description from approved copy;
- URL from deployment config.

Not allowed without source:

- aggregate rating;
- review;
- offer price;
- user count;
- award;
- availability claim beyond Closed Alpha.

SEO meta text must not include private Telegram content or dynamic note data.

## 9. Analytics and privacy

Analytics is optional. If added, choose a privacy-preserving configuration and document the vendor before release.

### Event schema

| Event                         | Allowed properties                     |
| ----------------------------- | -------------------------------------- |
| `landing_view`                | `locale`, `referrer_class`, `campaign` |
| `landing_primary_cta_click`   | `placement`, `locale`                  |
| `landing_secondary_cta_click` | `target_section`, `locale`             |
| `landing_nav_click`           | `target_section`, `locale`             |
| `landing_faq_open`            | `question_key`, `locale`               |
| `landing_privacy_link_click`  | `placement`, `locale`                  |
| `landing_dashboard_click`     | `placement`, `locale`                  |

### Prohibited data

- full URL or query string when it may contain arbitrary values;
- Telegram ID, username, chat ID, or account state;
- note content, transcript, input filenames, MIME type, or file IDs;
- free-text DOM content;
- IP retention beyond vendor necessity;
- fingerprinting;
- session replay on authenticated or content surfaces.

If consent is legally required for the selected deployment markets and analytics, Accept and Reject must have equal visual weight. Prefer no non-essential cookie over building a consent surface prematurely.

## 10. Performance budget

Target mobile navigation on a mid-range device and constrained network:

| Metric                       |                                                            Target |
| ---------------------------- | ----------------------------------------------------------------: |
| LCP                          |                                                   <= 2.5 s at p75 |
| INP                          |                                                  <= 200 ms at p75 |
| CLS                          |                                                     <= 0.1 at p75 |
| Initial JS for landing route | <= 100 KB gzip, excluding shared framework if measured separately |
| Initial CSS                  |                                                     <= 30 KB gzip |
| Above-fold image             |                                                         <= 180 KB |
| Total initial image transfer |                                                         <= 300 KB |

Implementation tactics:

- route-level lazy-load authenticated dashboard bundles from the landing entry path where feasible;
- preload one display font only;
- subset fonts and use WOFF2;
- reserve image dimensions;
- lazy-load below-fold images;
- use `fetchpriority="high"` only for the actual LCP image;
- The public hero plays a self-hosted, muted ping-pong clip from seconds 1–5 of the approved source (4 seconds forward, then reverse; 190 frames, 7.92 seconds, 483,081 bytes at 1280×716). A solid `#262925` frame is visible before playback and remains for no-JS, reduced motion, or media failure. Autoplay is an explicit exception to the original no-autoplay budget; mobile transfer and Core Web Vitals still need measurement before deployment, not counting the video against the image-only budget.
- avoid third-party scripts before user interaction.

## 11. Responsive and mobile platform

Update viewport metadata:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

Do not disable zoom.

Baseline:

```css
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}

button,
a,
[role="button"] {
  touch-action: manipulation;
}

input,
textarea,
select {
  font-size: 16px;
}
```

- Hero uses `min-height: 100svh` only when its complete content fits; otherwise normal content height wins.
- Safe-area padding applies to fixed or edge-to-edge controls.
- Do not disable pull-to-refresh on this document-style page.
- Gate hover with capability queries.
- Keep control labels non-selectable but body copy selectable.

## 12. Accessibility implementation

- Skip link first in DOM.
- One visible `<main>` and one H1.
- Header nav labelled `Navigasi utama`.
- Icon-only mobile menu has accessible name and state.
- Native links for navigation and buttons for actions.
- Focus order follows visual and DOM order:
  1. skip link;
  2. logo/home;
  3. nav anchors;
  4. dashboard utility;
  5. primary CTA;
  6. page links in document order;
  7. FAQ summaries;
  8. footer links.
- Anchor navigation moves focus to the target heading when triggered by the secondary CTA.
- Decorative brand images use empty alt.
- Product proof has purpose-based alt or a text equivalent in DOM.
- No content only on hover.
- Reduced motion styles load before optional animation code.

## 13. Security

- Landing page is static and must not receive uploads.
- No Supabase service-role key or secrets in client bundle.
- Public environment values limited to deployment URL and existing publishable client config needed by authenticated routes.
- External links use safe protocols and fixed destinations.
- If Markdown legal pages render HTML, sanitise at build time with an allowlist.
- Apply a Content Security Policy compatible with self-hosted fonts and images.
- Do not embed production Telegram message screenshots.

## 14. Delivery sequence

1. Add public route and update root alias callers.
2. Add route-aware metadata and document language.
3. Build static semantic sections with approved copy.
4. Add optimised brand and synthetic product assets.
5. Add responsive styling and mobile baseline.
6. Add progressive enhancements and reduced-motion path.
7. Add legal routes.
8. Add optional analytics after privacy review.
9. Run browser, keyboard, accessibility, and performance verification from `QA_ACCEPTANCE.md`.

## 15. Documentation updates on implementation

When code ships:

- update `docs/IMPLEMENTATION_STATUS.md` with scope and exact verification output;
- update root `README.md` with landing and dashboard development routes;
- add an ADR only if deployment topology, authentication routing, analytics vendor, or legal content ownership changes;
- do not edit `docs/Master_Blueprint.md` merely to describe the marketing page.

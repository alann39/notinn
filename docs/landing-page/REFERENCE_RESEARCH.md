# UI and UX reference research

## 1. Method

Research memakai dua sumber MCP dan aset internal:

- Inspo `recommend`, `search_screens`, `get_screen`, `get_design_system`, dan reference component source;
- Awwwards `search_sites`, `get_site_details`, dan `get_site_elements`;
- brand assets di `brand/`;
- dashboard tokens dan component conventions yang sudah ada.

Awwwards page-structure extraction tidak dijadikan bukti karena runtime tidak memiliki optional Playwright dependency. Screenshot dan element records tetap tersedia.

## 2. Evidence summary

Inspo recommendation untuk brief Notinn menemukan:

- 24 relevant sites;
- 67% memakai light paper band;
- 79% memakai grotesk sans display;
- cool dan chromatic accent sama-sama 38%;
- macrostructure paling umum: feature stack;
- runner-up: split studio.

Kesimpulan: Notinn perlu mengikuti light paper band dan clarity, tetapi berbeda dari mayoritas AI SaaS dengan brand illustration, warm paper, serta editorial serif display. Struktur final menggunakan narrative workflow dengan feature stack, bukan tiga feature card generik.

## 3. Selected references

### 3.1 Granola

- Source: <https://granola.ai>
- Inspo slug: `granola-ai`
- Relevance: AI note product, primary flow terlihat langsung, before/after proof kuat.
- Adopt:
  - headline menjelaskan category dan audience dengan jelas;
  - raw notes dan AI-enhanced output ditampilkan berpasangan;
  - product proof terlihat pada fold pertama;
  - serif display memberi rasa editorial dan human.
- Avoid:
  - claim yang terlalu meeting-only;
  - centered hero yang terasa identik dengan produk referensi;
  - desktop app CTA karena Notinn adalah Telegram-first.

### 3.2 Amie AI Note Taker

- Source: <https://amie.so>
- Inspo slug: `amie-so`
- Relevance: restrained AI note landing, UI proof besar, singular CTA.
- Adopt:
  - screenshot atau genuine product capture menjadi bukti, bukan decoration;
  - satu highlighted phrase untuk menegaskan outcome;
  - spacious fold dengan satu conversion ask.
- Avoid:
  - Inter sebagai display utama;
  - yellow highlighter dipakai sebagai CTA dan highlight sekaligus;
  - meniru exact layout atau token.

### 3.3 Mem

- Source: <https://mem.ai>
- Inspo slug: `mem-ai`
- Relevance: knowledge capture positioning, mobile composition, friendly but serious.
- Adopt:
  - asymmetrical hero;
  - clear input examples;
  - layered shapes sebagai support, bukan fake app chrome.
- Avoid:
  - dua CTA dengan visual weight sama;
  - generic claim `one place for everything`;
  - portrait stock photography yang tidak membuktikan produk.

### 3.4 Kagi

- Source: <https://kagi.com>
- Inspo slug: `kagi-com`
- Relevance: privacy-led product communication dan calm hierarchy.
- Adopt:
  - privacy dijelaskan sebagai product value, bukan legal footnote;
  - whitespace dan direct language;
  - ecosystem section yang menjelaskan boundary.
- Avoid:
  - centered manifesto tanpa immediate Telegram workflow;
  - privacy claim absolut yang tidak dapat dibuktikan.

### 3.5 NŌTA Smart Writing System

- Live site: <https://nota.uprock.pro/>
- Awwwards: <https://www.awwwards.com/sites/nota-smart-writing-system>
- Relevance: physical-note editorial language, monochrome materiality, large serif type, section-to-section tonal contrast.
- Adopt:
  - warm paper and ink materiality;
  - serif display paired with functional sans;
  - alternating light and ink bands;
  - product detail shown with clear labels.
- Avoid:
  - product-render spectacle yang membuat Notinn terlihat memiliki hardware;
  - long scroll animation, parallax, atau premium-product pacing yang menunda CTA;
  - orange gradient yang tidak ada dalam brand Notinn.

## 4. Internal brand evidence

`brand/Notinn Logo - Brand.png` dan `brand/Notinn All -Mockup.png` menunjukkan:

- monochrome black and cream palette;
- hand-drawn N mark yang berakhir pada microphone;
- human illustration dan notebook texture;
- language seperti `Notes, Better.` dan `Ideas everywhere. Notinn keeps them with you.`;
- character yang lebih tactile dan playful dibanding dashboard yang sangat minimal.

Keputusan: landing menjadi jembatan antara hand-drawn brand dan dashboard digital. Brand art dipakai pada hero atau transition band. Product proof tetap memakai real Telegram/dashboard capture, bukan mockup aplikasi native karena Notinn tidak memiliki native app.

`brand/Notinn App -Mockup.png` hanya boleh digunakan sebagai brand exploration. Jangan menampilkan iOS app icon mockup sebagai available product; hal itu akan menyiratkan app native yang tidak ada.

## 5. Reusable component patterns

Reference JSX dipelajari sebagai structure, bukan copied implementation.

| Pattern                | Source archetype           | Adaptasi Notinn                                                  |
| ---------------------- | -------------------------- | ---------------------------------------------------------------- |
| Before/with comparison | Inspo `features/compare`   | Raw message vs structured note, tanpa menyebut competitor        |
| Workbench              | Inspo `features/workbench` | Live-looking but static Telegram transcript dengan data sintetis |
| Split-screen hero      | Inspo `hero/split-screen`  | Copy di kiri, genuine input-to-output visual di kanan            |
| Native FAQ             | Inspo `faq/accordion`      | `<details>` dan `<summary>`, keyboard and no-JS friendly         |
| Inverted CTA           | Inspo `cta/inverted`       | Ink section dengan paper button menuju Telegram                  |

## 6. Final composition decision

### Chosen

- light warm-paper hero;
- asymmetric two-column fold;
- actual workflow demo, not abstract AI orb;
- alternating editorial rows instead of equal feature cards;
- one full-width ink privacy/CTA band;
- subtle yellow highlighter reserved for transformed output;
- hand-drawn brand illustration used once as a recognisable signature.

### Rejected

- purple-to-blue AI gradient;
- animated AI orb;
- fake Telegram window drawn from generic browser chrome;
- bento grid as the entire page;
- three equal feature cards;
- invented testimonial wall;
- autoplay product video;
- stat-led hero without sourced metrics;
- native-app mockup that implies an iOS application.

## 7. Reference use rules

- Do not copy source wording, assets, or exact component arrangement.
- Use real Notinn copy and synthetic examples.
- Keep source links in this document for attribution and future review.
- Re-check live references before visual implementation because sites may change after capture.

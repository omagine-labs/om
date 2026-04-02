# Om — Brand Style Guide & Design Language

Use this as creative direction when designing new pages, building UI, generating marketing materials, or briefing any tool (human or AI) that needs to produce something on-brand.

---

## Brand Philosophy

Om is about **communication, introspection, and growth**. The brand feels like a guide, not a judge — inviting you inward (self-awareness) and then forward (development). Serious about its mission, warm in its approach. Think: a trusted mentor who also happens to have great taste.

**Design personality:** Confident, clear, editorial. Large readable type. Solid color blocks. Generous whitespace. No visual clutter. Components should feel like well-designed magazine layouts — every element has breathing room and a clear hierarchy. Closer to a well-art-directed longform article than a SaaS dashboard.

**Tone to avoid:** Corporate, sterile, "startup template." No gratuitous gradients, no glassmorphism for its own sake, no "tech startup blue," no stock-photo energy.

---

## Visual Motif: Topographical Lines

Topographical contour lines are Om's signature brand element. They represent the landscape of communication — terrain to be explored, elevation to be gained, paths to be discovered. The pattern appears on a lime background with contour lines in a slightly darker/lighter lime, and communication behavior labels (CLARITY, POISE, CONFIDENCE, etc.) scattered across the terrain like waypoints on a map.

**Current status:** Exists in the logo and Figma mockups. Not yet implemented in the app or marketing site. Key part of visual direction for future work.

**Where it belongs:** Marketing hero sections, landing page backgrounds, LinkedIn covers, brand collateral. On dark teal backgrounds, topo lines work in a lighter teal or very low-opacity lime. In the app, if added, keep very subtle (5-15% opacity). On marketing materials, can go up to 30-40%.

**The rule:** Topo lines are ambient, never the focus. If someone stops to trace them, they're too prominent. Never behind dense text or tables.

---

## Page Background Treatment (App)

Separate from the topo motif, the app uses a layered atmospheric background that gives teal surfaces depth. Four decorative layers in `PageBackground`:

- **Noise texture**: SVG fractal noise, tiled at `opacity: 0.15` — makes the background feel tactile, not flat
- **Blurred gradient circle**: Large emerald blob, `blur(150px)`, positioned above viewport — diffuse glow at page top
- **Blurred ellipse**: Wide lime wash, `blur(200px)` — subtle color shift at top edge
- **Blinds lighting**: Horizontal white stripes with additive blending at `opacity: 0.06` — faint directional pattern like light through blinds

All layers are `pointer-events: none` and purely decorative. Together they make the teal feel atmospheric and alive.

---

## Color System

Built on Tailwind's palette. Bold and distinctive.

### Core Palette

| Role | Tailwind | Hex | Usage |
|------|----------|-----|-------|
| **Teal spectrum** | `teal-700` / `teal-800` / `teal-900` | `#0F766E` / `#115E59` / `#134E4A` | Page backgrounds, hero sections, dark cards. 700 for app, 800 for mid-tone, 900 for deep/premium. Pick by vibe. |
| **Deep teal (text)** | `teal-950` | `#042F2E` | Headings on light surfaces |
| **Accent / spark** | `lime-300` | `#BEF264` | Primary CTAs, key highlights on dark backgrounds |
| **Warm accent** | `orange-400` | `#FB923C` | Editorial numbering, secondary emphasis |
| **Card surface** | `white` | `#FFFFFF` | Cards, content containers |
| **Subtle surface** | `slate-50` | `#F8FAFC` | Nested containers, hover backgrounds |

### Text Colors

- **Headings on white:** `teal-950`. **Body:** `slate-600`. **Secondary:** `slate-500`.
- **Headings on teal:** `white`. **Metadata on teal:** `teal-100`.
- Never use `gray-*` — always `slate-*` for warmth.

### Score Colors

| Range | Badge | Meaning |
|-------|-------|---------|
| 8-10 | `lime-500/20` on `lime-950` text | Excellent |
| 6-7 | `teal-500/20` on `teal-950` text | Good |
| 4-5 | `amber-500/20` on `amber-950` text | Fair |
| 0-3 | `orange-100` on `orange-950` text | Needs Work |

### Color Rules

- **Lime is the exclamation point.** One, max two lime elements per view. Overuse dilutes its power.
- **Teal spectrum dominates backgrounds.** Cards sit on white above it.
- **Orange is editorial warmth** — decorative numbering, secondary callouts. Never competes with lime.
- **Slate for all body text.** `slate-600` primary, `slate-500` secondary.

---

## Typography

### Font Choices

| Font | Role | Character |
|------|------|-----------|
| **Fraunces** (`font-display`) | Display headings, card titles, stats | Old-style variable serif. Organic, humanist. The brand's typographic voice. |
| **DM Mono** (`font-mono`) | Numbers, scores, timers, data | Intentional monospace choice for anything numeric or data-driven. |
| **Body sans** (system-ui / DM Sans / Inter) | Body text, UI copy, labels | Flexible — any clean sans that gets out of the way. DM Sans in the app codebase; Inter when system fonts aren't available. |

### Type Scale

| Element | Treatment |
|---------|-----------|
| Page title | Fraunces, `text-3xl` → `text-5xl` responsive, `font-medium`, `tracking-tighter`, `leading-[1]` |
| Card title | Fraunces, `text-4xl`, `font-semibold`, `tracking-tighter` |
| Section heading | Fraunces, `text-3xl`, `font-semibold`, `tracking-tight` |
| Body | Sans, `text-base` or `text-xl`, `slate-600` |
| Metadata | Sans, `text-sm`, `uppercase`, `tracking-wide`, `font-bold` |
| Giant editorial number | DM Mono, `text-6xl`, `font-bold` — decorative numbering in focus area lists |
| Score display | `text-5xl`, `font-semibold` inside a score square |

### Typography Rules

- **Fraunces for impact, sans for information.** Headlines, stats, taglines → Fraunces. Body, labels, descriptions → sans.
- **`tracking-tighter` on all Fraunces headings.** Signature detail — tight tracking makes it feel intentional.
- **DM Mono for data, not decoration.** Only when monospace serves a purpose.
- **The body sans is interchangeable.** Don't overthink it.

---

## Key Component Patterns

### Cards

Two tiers: **Standard cards** (primary content) and **list items** (repeated entries).

Standard cards: white, `rounded-2xl`, `shadow-lg`, generous padding (`p-6`, increasing at `xl`), `backdrop-blur-sm` for a frosted quality over teal. On hover: shadow deepens and card lifts ~2px.

List item cards: white, `rounded-xl` (subtly smaller radius), minimal shadow, hairline outline. On hover: barely-perceptible 0.5px lift. Entrance animations staggered at ~50ms intervals.

### Score Square

Om's signature data visualization. A rounded square where fill level represents a 0–10 score, color-coded by quality (lime for high, yellow for mid, rose for low). Fill animates upward from the bottom on mount. The "/ 10" label sits small in the bottom-right corner. Mini variant exists for inline use in lists.

### Editorial Focus Area List

Numbered tips with oversized DM Mono numbers in orange — like a magazine's numbered feature. Numbers use `bg-clip-text` to be colored by an orange gradient. On hover, a warm orange gradient fades in from the left and body text darkens. Items separated by very subtle dividers.

### Coupon / Torn-Ticket Card

Two related content blocks joined vertically but separated by a dashed border — like a perforated ticket stub. Says "these belong together but are different kinds of information." Used for Talk Time + Status, Interaction Patterns + Quick Responses.

### Section Dividers

Always dashed: `border-t-2 border-dashed border-slate-200`. Never solid lines inside cards. The dashes feel handmade and editorial — a small detail that carries a lot of brand personality.

### Buttons

- **Primary CTA:** `lime-300` background, `teal-950` text, `rounded-xl`, optional pulse-glow animation (lime box-shadow breathing)
- **Secondary:** `white/10` on dark backgrounds, increasing opacity on hover
- **Tertiary:** `slate-200` background, `slate-600` text, `rounded-lg`

### Badges

Pill-shaped: `rounded-full`, small padding, semibold text. Colors follow the score color system above.

---

## Animation Philosophy

Motion is **subtle, functional, and never performative.** It exists to orient (fade in from below = "arriving"), provide feedback (lift on hover = "interactive"), and add polish (score fill = "being measured"). If a user notices an animation, it's too much.

- **Entrance:** Cards fade in and slide up 8px (`fadeInUp`, 0.5s ease-out), always staggered with incrementing delays (50-100ms between items). No content appears all at once.
- **Hover:** Two tiers — cards lift ~2px with shadow deepening; list items lift ~0.5px. Always `transition-all`.
- **Score fill:** Squares fill from bottom (`scaleY 0→1`, 0.6s ease-out).
- **Decorative only:** Infinite animations (floating blobs, button glows) are reserved for non-content elements.
- **Never:** Bounce, scale, or rotate content. Never animate text independently of its container.

---

## Do's and Don'ts

**Do:** Use Fraunces for all headings. Keep generous corner radius on primary cards. Use dashed dividers. Stagger entrance animations. Let content breathe. Reserve lime-300 for the single most important element.

**Don't:** Use solid rules inside cards. Overuse lime. Use small corner radius on primary cards. Add bouncy/rotational animations. Use `gray-*` instead of `slate-*`. Put gradients on card backgrounds. Make things look "techy" or "dashboardy." Use `font-bold` on Fraunces (use `medium` for page titles, `semibold` for card titles).

---

## Quick Reference: New Page Skeleton (Next.js / Tailwind)

```tsx
<PageBackground variant="teal">
  <div class="mb-6 animate-fadeInUp">
    <h1 class="text-3xl sm:text-4xl md:text-5xl font-medium text-white
               tracking-tighter font-display leading-[1]">
      Page Title
    </h1>
    <p class="mt-2 text-sm uppercase tracking-wide font-bold text-teal-100">
      Subtitle or metadata
    </p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {items.map((item, i) => (
      <div class="bg-white backdrop-blur-sm rounded-2xl shadow-lg
                  p-6 xl:p-8 xl:pt-7 animate-fadeInUp"
           style={{ animationDelay: `${i * 100}ms` }}>
        <h3 class="font-display text-4xl font-semibold tracking-tighter text-teal-950">
          {item.title}
        </h3>
        <p class="text-base text-slate-600 mt-3">
          {item.description}
        </p>
      </div>
    ))}
  </div>
</PageBackground>
```

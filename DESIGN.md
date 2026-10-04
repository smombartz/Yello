---
name: Yello
description: A personal CRM for people with big networks. One book, every source, fast at any size.
colors:
  signal-violet: "#5F27E3"
  signal-violet-deep: "#530bce"
  signal-violet-tint: "rgba(95, 39, 227, 0.1)"
  gradient-iris: "#7c3aed"
  gradient-cobalt: "#273de3"
  ink: "#1a202c"
  graphite: "#6b7280"
  pewter: "#9ca3af"
  rule-strong: "#d1d5db"
  rule: "#e5e7eb"
  wash: "#f3f4f6"
  paper-shade: "#f9fafb"
  paper: "#ffffff"
  error: "#dc2626"
  error-deep: "#b91c1c"
  error-tint: "#fee2e2"
  success: "#16a34a"
  success-tint: "#dcfce7"
  warning: "#d97706"
  warning-tint: "#fef3c7"
  info: "#2563eb"
  info-tint: "#dbeafe"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "20px"
  subtitle:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1
  label:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  overline:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.signal-violet}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.signal-violet-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-shade}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "rgba(0, 0, 0, 0.04)"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-danger-hover:
    backgroundColor: "{colors.error-deep}"
  button-icon:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    size: "32px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  search-bar:
    backgroundColor: "{colors.paper-shade}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "0 8px"
    height: "32px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px"
  modal:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge-neutral:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-brand:
    backgroundColor: "{colors.signal-violet-tint}"
    textColor: "{colors.signal-violet}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-count:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.2xl}"
    padding: "0 12px"
    height: "32px"
  chip-filter-active:
    backgroundColor: "{colors.signal-violet-tint}"
    textColor: "{colors.signal-violet}"
  tab-underline:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.control}"
    padding: "12px 16px"
  tab-underline-active:
    textColor: "{colors.signal-violet}"
  nav-rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.pewter}"
    rounded: "{rounded.lg}"
    size: "40px"
  nav-rail-item-active:
    backgroundColor: "{colors.signal-violet-tint}"
    textColor: "{colors.signal-violet}"
  tab-bar-add:
    backgroundColor: "{colors.signal-violet}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    size: "56px"
  toast:
    backgroundColor: "#333333"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

# Design System: Yello

## Overview

**Creative North Star: "The Connector's Desk"**

Yello is the desk a super connector works at. It's a clean, well-lit surface where thousands of people are laid out in order and the right one is in reach within seconds. The furniture is neutral: white paper, gray hairlines and one family of type. Warmth comes from the people on it, through their photos, their initials on per-name colors, their names set bold. The desk itself stays calm.

The mood is **calm, crisp, utilitarian**. Density is moderate, tuned for long sessions over 10K-contact books as well as quick lookups on a phone. Controls are compact (32px) and quiet. Bordered neutral buttons do most of the work, with one filled violet action per view. Components feel **refined and restrained**: precise alignment, consistent heights and a shared content column count for more than density or decoration.

Violet is a signal, not a theme. It marks what is active, selected or actionable, and almost nothing else. The violet-to-cobalt brand gradient is kept for the app's front doors (sign-in, the public card, onboarding), the moments when someone arrives rather than works.

**Key Characteristics:**
- Light-only, white canvas, gray hairline structure
- One accent (Signal Violet), used sparingly for state and action
- Geist throughout. Hierarchy from size and weight, never a second family
- Uniform 32px control height; 4px spacing grid
- Flat surfaces with a soft touch: hairline borders, ambient lift on hover, real shadows only on things that float
- One centered 960px column shared by the header and the content
- People supply the color: photos and hash-hued initial avatars

## Colors

A neutral gray desk with a single violet signal. Color appears where meaning does.

### Primary
- **Signal Violet** (`signal-violet`): The brand's violet, already used by the logo, favicon and desktop icon. It fills the one primary button per view and marks the active nav item, the active tab underline, focus rings, links and the phone's add button.
- **Deep Signal Violet** (`signal-violet-deep`): The hover and pressed step of Signal Violet, one OKLCH lightness step (−5) below it. A further −11 step (`--ds-color-primary-dark`, #4304ab) exists for rare deep accents.
- **Signal Tint** (`signal-violet-tint`): Signal Violet at 10% alpha. Selected backgrounds: the active nav item, active filter chip, active subtab, brand badge, and the 3px focus halo.

### Secondary
- **Iris** (`gradient-iris`) and **Cobalt** (`gradient-cobalt`): The two stops of the brand gradient (135°). Iris was the UI's primary until 2026-10 and now survives only as the gradient's first stop. Neither appears as a flat fill inside the app.

### Neutral
- **Blue-Black Ink** (`ink`): Names, headings and body text. Faintly cool, 16.3:1 on white.
- **Graphite** (`graphite`): Secondary text: roles, companies, detail values, inactive tabs, ghost buttons, breadcrumb parents, placeholders, and the quietest readable text (dates, footnotes, overlines). 4.8:1 on white.
- **Pewter** (`pewter`): Muted icons, inactive nav-rail icons, dismiss and clear glyphs, zero-value stats. At 2.5:1 on white it is never used for text a person must read.
- **Strong Rule** (`rule-strong`): Search-field border, hover border on secondary buttons, disabled text.
- **Hairline Rule** (`rule`): The default 1px border on cards, inputs, buttons, dividers and the tab bar's top edge.
- **Gray Wash** (`wash`): Neutral badge fill, count pills, initials backdrop for the user's own avatar.
- **Shaded Paper** (`paper-shade`): Inset fields (search), hover fill for secondary buttons, the page body behind the shell.
- **Desk White** (`paper`): The app canvas, the header, cards, modals and inputs.

### Semantic
- **Error** (`error`, `error-deep`, `error-tint`): Danger buttons, destructive confirmations, error badges, the Danger Zone.
- **Success** (`success`, `success-tint`), **Warning** (`warning`, `warning-tint`), **Info** (`info`, `info-tint`): Status badges, toasts, stat icons and inline status text. Badge text always uses the family's darker step on its tint. None of them fills a button.
- Merge confidence uses its own five-step ramp from green through yellow and orange to red (`--ds-confidence-*`). It appears only in the Merge view.
- WhatsApp green (`--ds-color-whatsapp`) appears only on WhatsApp reach-out actions.

### Named Rules
**The Mark Leads Rule.** The UI's primary is the mark's own violet: Signal Violet (#5F27E3) is the logo, favicon, app icon and `--ds-color-primary` alike. There is one violet in the product. Iris appears only inside the front-door gradient.

**The Signal Only Rule.** Violet marks what is active, selected or actionable. It never fills a panel, tints a section header or decorates. If a screen reads as "violet," too much is lit.

**The Front Door Rule.** The Iris → Cobalt gradient appears only on surfaces outside the app shell: sign-in, the public card page, onboarding, launch and the demo prompt. Inside the shell there are no gradients, and gradients never sit on text.

## Typography

**Display Font:** Geist (with system-ui, -apple-system, Segoe UI, Roboto fallback)
**Body Font:** Geist
**Label Font:** Geist

**Character:** A single neo-grotesque doing every job. Geist is clean and slightly technical, so it stays legible at 12px and composed at 30px. It suits a desk where names are the content and the type around them is plumbing.

### Hierarchy
- **Display** (700, 30px, 1.25): Front-door headlines only (onboarding hero, launch).
- **Headline** (600, 24px, 1.25): A contact's name on the detail page, large section and modal titles.
- **Title** (700, 20px, 20px line): The page title in the header, and settings section headings. One line, ellipsized.
- **Subtitle** (700, 16px, 1.5): A contact's name in list rows and cards. The bold name is the row's anchor.
- **Body** (400, 16px, 1.5): Base reading text and company lines on the detail page.
- **Body Small** (400, 14px, 1.5): The workhorse: roles, detail values, inputs, search, descriptions, header counts.
- **Control** (500, 14px, line-height 1): Buttons, tabs and filter controls.
- **Label** (500, 12px, 1.4): Badges, counts and metadata.
- **Overline** (600, 12px, 0.05em tracking, uppercase): Section labels on the contact detail and in settings groups. A denser 11px variant labels filter groups.

### Named Rules
**The One Family Rule.** Geist only, at weights 400, 500, 600 and 700. Hierarchy comes from size and weight. Never add a second family for display or labels.

**The Scale Floor Rule.** Sizes come from the `--ds-font-*` scale (11–30px). The only sanctioned literals are 13px and 15px for compact densities. Nothing a person reads goes below 11px, including tab-bar labels and photo captions.

## Layout

The shell is a fixed **64px white header**, a **floating icon rail** on the left, and **one centered 960px content column** (`--ds-content-width`). The header has three columns. The left column holds the logo (min 120px), the center column is aligned exactly over the content column, and a mirroring 120px spacer on the right keeps the center truly centered. Inside the center column, the page title sits in a fixed 120px slot so the search field (max 300px) starts at the same x on every page. Counts and actions pin to the column's right edge. The content column shrinks below 960px on narrow windows rather than overflowing, always leaving the rail's 72px footprint clear on both sides. The map is the one view that goes full-bleed.

**Spacing** follows a 4px grid. 8px and 16px dominate, 12px separates list rows, 24px separates sections and pads modals, and 48px pads empty states and front-door cards. **Every button and form field is 32px tall** (`--ds-control-height`), and square icon buttons are 32×32.

**Responsive.** These four breakpoints are the only ones allowed: 640, 768, 1024 and 1280px, mirrored in `src/constants/breakpoints.ts`. **768px is the app-shell switch.** Below it the rail and logo column disappear, the search field takes the header's full width, and a **bottom tab bar** (56px plus the safe-area inset) takes over navigation. Its center is a raised 56px Signal Violet add button. List rows grow to a 56px minimum touch height.

### Named Rules
**The Shared Column Rule.** The header's center column and the page content share one 960px column, so the title, search, counts and list edges line up vertically on every page. Never offset one without the other.

**The 32px Rule.** Every control is 32px tall, whether button, input, select, chip or tab pill. Mixing heights on one row is a bug.

## Elevation & Depth

**Flat, but softer.** Surfaces are separated first by 1px Hairline Rule borders and by tone: Desk White cards on a white canvas, and Shaded Paper for inset fields. Resting cards also carry the hairline ambient shadow alongside their border, and nothing at rest goes heavier than that. On hover a card lifts into a soft, wide ambient shadow. Real shadows belong only to things that float above the desk: modals, the toast, the phone's add button and the tab bar's upward edge.

### Shadow Vocabulary
- **Hairline ambient** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`): Every resting card and list row, with the border (`--ds-shadow-xs` on `.card`).
- **Hover lift** (`box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.05)`): Cards and list rows on hover, 150ms.
- **Floating** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2)`): The toast.
- **Modal** (`box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)`): Modals and dialogs over the 50% black overlay.
- **Front-door card** (`box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)`): The sign-in card on the brand gradient.
- **Violet glow** (`box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-color-primary) 30%, transparent)`): The phone add button only. It tightens to 2px/8px when pressed.
- **Tab bar edge** (`box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05)`): The bottom tab bar's top edge.
- **Focus halo** (`box-shadow: 0 0 0 3px var(--ds-color-primary-light)`): Paired with a 2px Signal Violet outline on buttons, or with a violet border shift on inputs.

### Named Rules
**The Float Earns Shadow Rule.** A surface gets a real shadow only when it floats above the desk: overlay, toast or fixed control. Anything in the flow stays at hairline-ambient or below.

## Shapes

Gently curved, never pillowy. Radius grows with the size of the surface. Badges use 4px corners. Buttons, inputs and icon buttons use 6px. Cards, list rows, the search field, nav-rail items and the toast use 8px. Modals use 12px, and front-door cards use 16px (sign-in) to 24px (public card). Full circles are kept for avatars and the phone's add button. Full pills are kept for count badges, and filter chips round to a 16px pill.

Borders are 1px hairlines everywhere. A 2px line appears only as the active-tab underline, the focus outline, and the Signal Violet selection ring. Icons are Font Awesome Solid, loaded via the project kit: 16px inline, 18px inside buttons, 24px on the nav rail and tab bar.

### Named Rules
**The Radius Ladder Rule.** The bigger the surface, the softer the corner: 4 → 6 → 8 → 12 → 16/24. A small control never gets a big radius, and a modal never gets a sharp one.

## Components

### Buttons
Refined and restrained: compact, bordered by default, with exactly one filled action per view.
- **Shape:** Gently curved (6px), 32px tall, 16px horizontal padding, 8px gap between icon and label. This holds for every in-app button, including the header actions. Only front-door buttons (sign-in, the public card) are larger.
- **Primary:** Signal Violet fill, white Control-weight label. Use one per view, for the action the screen exists for.
- **Secondary (default):** Desk White with a Hairline Rule border and Ink label. Most actions are secondary.
- **Ghost:** No fill or border, with a Graphite label. For low-stakes, in-context actions.
- **Danger:** Error fill with a white label, used only for destructive confirmation. Signal Violet and Error are the only button fills: Restore, Search and Merge are primary actions, not Success or Info.
- **Icon:** A 32×32 square in the secondary style, with an 18px Graphite icon.
- **Hover / Focus:** Fills deepen to the next step (never an opacity fade) and secondary borders strengthen to Strong Rule, over 100ms with the standard ease. Keyboard focus draws a 2px Signal Violet outline offset 2px, plus the 3px tint halo. Disabled buttons drop to 50% opacity.

### Badges & Counts
- **Status badge:** 4px corners, 2px × 8px padding, Label type. Each badge is a tint fill with that family's darker text: neutral, brand, success, warning, error or info.
- **Count badge:** A full pill at least 20px wide, Graphite fill with white text. Brand counts on active subtabs switch to Signal Violet.

### Chips & Tabs
- **Underline tabs** (mode switchers such as Merge strategies): Graphite Control labels with 12px × 16px padding, sitting on the container's hairline. The active tab turns Signal Violet with a 2px Signal Violet underline, and its inline count pill turns to Signal Tint.
- **Subtab pills:** 32px bordered 8px-radius pills. Hover strengthens the border to violet, and the active pill is Signal Tint with a violet border and label.
- **Filter chips:** 32px, a 16px-pill radius, a Hairline border and Graphite 13px medium text. Hover turns the border and text violet, and the active chip takes Signal Tint with a violet border.

### Cards / Containers
- **Corner Style:** Gently curved (8px). The `--ds-card-radius` token (12px) is the larger card variant.
- **Background:** Desk White on the white canvas.
- **Border:** 1px Hairline Rule, always.
- **Shadow Strategy:** At most the hairline ambient at rest, the hover lift on hover (see Elevation & Depth).
- **Internal Padding:** 16px standard, 24px for settings sections and modals.

### Contact Row (signature)
The core repeated unit of the desk, built for 10K-row virtualized scrolling.
- A full-width card with a **48px avatar**, then the name (Subtitle, Ink, ellipsized) over the role or company (Body Small, Graphite).
- To the right sit two fixed-width detail columns (email, and phone with a country flag) in Graphite with 16px icons. They are capped at 220px each and truncate.
- A right action strip is set off by a full-height vertical hairline. Its 16px Graphite reach-out icons turn Ink on hover.
- Rows stack with a 12px gap. Clicking expands the row in place, and it becomes a 56px-minimum touch target on phones. A row selected for a bulk action gets a 2px inset Signal Violet ring.

### Avatars (signature)
People supply the color. A photo is cropped to a full circle. Without a photo, the person's initials (600 weight, 40% of the avatar size) sit in white on a hue hashed from their name (`hsl(h, 65%, 45%)`), so the same person is always the same color. This is the one place the desk is allowed to be multicolored.

### Inputs / Fields
- **Style:** 32px tall, Desk White, 1px Hairline Rule border, 6px corners, 12px horizontal padding, Body Small text, Graphite placeholder.
- **Search field:** An inset variant: Shaded Paper fill, Strong Rule border, 8px corners, a leading Pewter magnifier, a Graphite placeholder and a trailing clear button. In the header it caps at 300px.
- **Focus:** The border shifts to Signal Violet and the 3px tint halo appears inside the frame. There is no outline.
- **Error / Disabled:** The error halo uses Error Tint (`--ds-shadow-focus-error`). Disabled text drops to Strong Rule.

### Navigation
- **Header:** Fixed, 64px, Desk White, with no bottom border. The logo sits at 24px height. The page title is Title type, and parent breadcrumbs are Graphite Title-size links that turn Ink on hover, separated by a small Pewter chevron.
- **Nav rail (desktop):** A floating column of 40×40 icon squares (24px icons, 8px corners) vertically centered on the left edge, with no panel behind it. Inactive icons are Pewter. Hover turns the icon violet and slides out its label (14px medium, violet). The active item is Signal Tint with a violet icon. The user's avatar sits in the rail.
- **Bottom tab bar (≤768px):** Desk White, a hairline top border with the upward shadow, and 24px icons over 11px medium labels. Inactive items are Graphite and the active one is Signal Violet. The center add button is a 56px Signal Violet circle with the violet glow, raised 12px above the bar, that scales to 0.95 when pressed.

### Toast & Modals
- **Toast:** A dark floating pill-card (#333, 8px corners) at the bottom center, sliding up 1rem over 300ms. It carries a success- or error-colored leading icon, a 15px message, and an optional white semibold undo action.
- **Modal:** Desk White, 12px corners, 24px padding and the Modal shadow, over a 50% black overlay. Confirm dialogs cap at 400px wide, left-aligned, with a Graphite explanation and a Danger primary when the action is destructive.

### Public Card (front door)
The card at `/p/:slug`, which strangers see. It is a centered 380px Desk White card with 24px corners and the Modal shadow, sitting on the full-bleed brand gradient. Its content is centered. It is the most expressive surface in the system and still holds the same type, color and control rules.

### Motion
Motion is quick and functional, with no choreography. Every transition uses the tokens. Fast (100ms) is for button fills, normal (150ms) is the default for state changes (color, border, background, shadow), and slow (300ms) is for progress fills and entrances. All of them use the standard ease, `cubic-bezier(0.4, 0, 0.2, 1)`. Entrances use the ease-out curve and are limited to the toast slide-up and the background-job pill. Every spinner shares one keyframe: a 1s linear rotation, violet top arc on a Hairline ring.

## Do's and Don'ts

### Do:
- **Do** reach for `--ds-color-primary` (Signal Violet, #5F27E3) and `--ds-color-primary-hover` (#530bce) rather than any literal violet.
- **Do** keep exactly one filled primary button per view. Everything else is secondary, ghost or icon.
- **Do** build every control at 32px (`--ds-control-height`), with 6px corners and 14px medium labels.
- **Do** separate surfaces with 1px Hairline Rule borders and tone. Let a card lift on hover with the 16px ambient shadow.
- **Do** align new pages to the shared 960px column so the header title, search and content edges line up.
- **Do** let people carry the color. Use real photos where present, and otherwise the name-hashed initial avatar.
- **Do** use the existing `--ds-*` tokens and the four breakpoints (640/768/1024/1280) only.
- **Do** use Graphite (#6b7280) or darker for any text a person must read, placeholders included.
- **Do** show selection the same way everywhere: a 2px Signal Violet ring on the card and a violet check badge on the avatar.
- **Do** write transitions with the duration and easing tokens (`var(--ds-duration-normal) var(--ds-easing-default)`), never literal seconds.

### Don't:
- **Don't** introduce another violet, indigo or purple. Iris (#7c3aed) exists only as the gradient's first stop, and the old purple accent token is gone.
- **Don't** put the brand gradient inside the app shell, or on text. It is for front doors only.
- **Don't** fill panels, section headers or large areas with violet or Signal Tint. Tint is for selected states.
- **Don't** set readable text in Pewter (#9ca3af, 2.5:1 on white). It is for icons, placeholders and disabled states.
- **Don't** give in-flow cards anything heavier than the hairline ambient shadow at rest.
- **Don't** add a second typeface or set text off the `--ds-font-*` scale.
- **Don't** fill a button with Success green or Info blue, or fade a button with opacity on hover.
- **Don't** redefine a canonical class (`.primary-button`, `.btn`, `.card`) in a page stylesheet. Page CSS loads globally, so the override leaks app-wide.
- **Don't** add a dark theme ad hoc. The system is light-only today, and a dark mode needs its own token pass.

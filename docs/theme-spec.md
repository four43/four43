# Custom Jekyll Theme Spec: four43.com

**Author:** Seth Miller
**Date:** 2026-04-11
**Status:** Draft

---

## 1. Design Philosophy

Inspired by [Daring Fireball](https://daringfireball.net/) and the best personal tech blogs (macwright.com, jvns.ca, tonsky.me): **restraint is the design.** No hero images, no complex grids, no animations, no cookie banners, no newsletter popups. Just well-set text on a considered background with clear navigation that stays out of the way.

### Guiding Principles

1. **Content-first** -- typography and spacing do the heavy lifting, not decoration
2. **Fast** -- minimal CSS (<10KB)
3. **Readable** -- optimal line length (60-75 chars), generous line-height, high contrast
4. **Timeless** -- no trendy design patterns that will look dated in 2 years
5. **Simple to maintain** -- pure Jekyll/Liquid, no build tools beyond what GitHub Pages provides

---

## 2. Color Palette

Dark theme inspired by Daring Fireball's blue-slate palette. Not pitch black -- a warm slate that reduces eye strain.

| Token            | Hex       | Usage                              |
|------------------|-----------|------------------------------------|
| `--bg`           | `#3d444d` | Page background                    |
| `--bg-elevated`  | `#4a525a` | Code blocks, cards, header         |
| `--bg-hover`     | `#606870` | Interactive hover states           |
| `--text`         | `#e8e8e8` | Primary body text                  |
| `--text-muted`   | `#9ca3af` | Dates, metadata, secondary text    |
| `--text-heading` | `#ffffff` | Headings, site title               |
| `--link`         | `#93c5fd` | Link text (light blue, accessible) |
| `--link-hover`   | `#bfdbfe` | Link hover state                   |
| `--link-visited` | `#c4b5fd` | Visited links (light purple)       |
| `--border`       | `#6b7280` | Blockquote borders, hr, dividers   |
| `--accent`       | `#60a5fa` | Sparse accent (used rarely)        |

### Logo Treatment

The existing `four43-logo.svg` is black on transparent. For the dark theme, the logo fill needs to be changed to white (`#ffffff`) or the accent color. Provide a `four43-logo-light.svg` variant, or use CSS `filter: invert(1)` on the existing SVG.

---

## 3. Typography

A modern matching type set which makes content look modern but easy to read.

### Font Pairing: Space Grotesk + Source Sans 3

**Headings:** [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) -- a monospaced-inspired proportional sans-serif with a techy character. Strong bold weights make titles punch on a dark background.

**Body:** [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) -- Adobe's workhorse sans-serif, extremely readable at small sizes on screen. Designed for long-form reading.

**Code:** [Source Code Pro](https://fonts.google.com/specimen/Source+Code+Pro) -- matches Source Sans 3 (same family), purpose-built for code.

### Google Fonts Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
```

**Weights loaded:**
- Space Grotesk: 500 (subheadings), 700 (bold titles)
- Source Sans 3: 400 (body), 400 italic (emphasis), 600 (bold/strong)
- Source Code Pro: 400 (code blocks), 600 (code emphasis)

### Font Stacks (with fallbacks)

```css
--font-body:    "Source Sans 3", "Source Sans Pro", -apple-system, sans-serif;
--font-heading: "Space Grotesk", -apple-system, sans-serif;
--font-code:    "Source Code Pro", ui-monospace, Menlo, Consolas, monospace;
```

### Scale

| Element         | Size      | Weight | Line-height | Notes                         |
|-----------------|-----------|--------|-------------|-------------------------------|
| Body text       | `1rem`    | 400    | 1.7         | 16px base, do not override    |
| Site title      | `1rem`    | 400    | 1.2         | Subtitle text, understated    |
| Post title (h1) | `2rem`    | 600    | 1.3         | Heading font stack            |
| h2              | `1.5rem`  | 600    | 1.3         |                               |
| h3              | `1.25rem` | 600    | 1.4         |                               |
| Post meta       | `0.875rem`| 400    | 1.5         | Date, read time, muted color  |
| Code inline     | `0.9em`   | 400    | inherit     | Background: `--bg-elevated`   |
| Code block      | `0.875rem`| 400    | 1.6         | Background: `--bg-elevated`   |
| Nav links       | `0.9rem`  | 400    | 1.2         |                               |

### Paragraph Spacing

- Paragraph margin-bottom: `1.5em`
- Between articles on index: `3em` (generous but not Daring Fireball's extreme 10em)
- Block quote: left border `3px solid var(--border)`, padding-left `1em`, italic

---

## 4. Layout

Two distinct layout modes: **single-column** for the homepage and individual posts, and **two-column** for the blog index. Both share a common full-width top bar and footer.

### Common Chrome (all pages)

```
|<---------------- viewport ----------------->|
| [logo]                  [GH] [LI] [search]  |  <- top bar
|----------------------------------------------|  <- thin full-width line
|                                              |
|              [page content]                  |  <- varies by page type
|                                              |
|----------------------------------------------|  <- thin full-width line
|              [footer]                        |
|----------------------------------------------|
```

- Top bar and footer lines span the **full viewport width** (not constrained to content max-width)
- Lines are `1px solid var(--border)`

### Dimensions

| Property               | Value      | Notes                                      |
|-----------------------|------------|--------------------------------------------|
| Content max-width      | `900px`    | Outer container for all page content        |
| Blog main column       | `~65%`     | Right column on blog index, readable width  |
| Blog sidebar           | `~200px`   | Left column on blog index, fixed width      |
| Container padding      | `1.5rem`   | Horizontal padding on all screen sizes      |
| Top bar height         | `auto`     | Content-sized, ~60px with padding           |
| Top bar padding        | `1rem 1.5rem` | Consistent with container padding        |
| Section spacing        | `3rem`     | Between major page sections                 |

---

## 5. Components

### 5.1 Top Bar (Header)

Consistent across all pages. Single row, full-width background.

```
[four43 logo]                              [GitHub icon] [LinkedIn icon] [search icon]
```

**Structure:**
- **Left side:** four43 logo SVG (32px height), links to homepage
- **Right side:** Icon buttons in a row, evenly spaced
  - GitHub icon -- links to github.com/four43, opens in new tab
  - LinkedIn icon -- links to LinkedIn profile, opens in new tab
  - Search icon (magnifying glass) -- on click, expands into a search input field

**Search behavior:**
- Default state: magnifying glass icon button
- Clicked state: icon slides left, a text input expands to fill available space (~300px max), with a subtle transition
- Typing filters/searches posts (client-side search using Jekyll's generated JSON index, or Simple-Jekyll-Search plugin)
- Pressing Escape or clicking away collapses the search box back to an icon
- Requires minimal JS (~2KB for search index + toggle behavior)

**Icons:** Use inline SVGs for GitHub, LinkedIn, and search icons (no icon font library). Keep them simple, monochrome (`--text` color), ~20px size.

External links include `rel="noopener noreferrer"` and `target="_blank"`.

**Below the top bar:** A thin horizontal rule (`1px solid var(--border)`) spanning the full viewport width.

### 5.2 Homepage (index)

Single-column layout, centered, max-width `700px`.

#### A. Hero / Bio Section

```
         [photo]
       Seth Miller
  the web home of Seth Miller

  A paragraph or two about who you are --
  what you do, what you're interested in,
  what readers will find here.
```

- **Photo:** Large and prominent, centered. Circular crop (`border-radius: 50%`), `180px` diameter. This is the hero element.
- **Name:** `h1`, heading font (Space Grotesk), `2rem`, `--text-heading`, centered
- **Subtitle:** "the web home of Seth Miller", `--text-muted`, `1rem`, centered, below name
- **Bio:** 1-2 paragraphs, body font, `--text`, centered or left-aligned. Conversational tone -- who you are, what you work on, what this site is about.
- **Spacing:** `3rem` below bio before post list

#### B. Latest Posts Section

Heading: "Latest" or "Recent Writing" (h2, heading font)

Shows the **10 most recent** posts:

```
Post Title                                          April 4, 2026
One-line excerpt or description...
```

- **Title:** Link styled with `--link` color, `1.1rem`, heading font
- **Date:** Right-aligned on same line (desktop) or below title (mobile), `--text-muted`, `0.875rem`
- **Excerpt:** Optional, 1 line, `--text-muted`, body font
- **Spacing:** `1.5em` between entries
- **No thumbnails, no cards, no categories**

#### C. "More" Link

Below the 10 posts, a prominent link:

```
View all posts ->
```

- Links to `/blog/` (the full blog index page)
- Styled as `--link` color, `1rem`, with an arrow or chevron

### 5.3 Blog Index Page (`/blog/`)

Two-column layout with a **left sidebar** and **right main content area**.

```
|<------------- 900px max-width ------------->|
|                                             |
|   four43          |  Post Title       Date  |
|   by Seth Miller  |  Excerpt...             |
|                   |                         |
|   Archive         |  Post Title       Date  |
|   Projects        |  Excerpt...             |
|                   |                         |
|    [sidebar]      |     [main column]       |
```

#### Left Sidebar (~200px, text right-aligned)

```
        four43
  by Seth Miller

       Archive
      Projects
```

- **"four43":** Site name, heading font (Space Grotesk), `1.5rem`, weight 700, `--text-heading`. Links to homepage.
- **"by Seth Miller":** `--text-muted`, body font, `0.875rem`, below the site name
- **Spacing:** `2rem` gap between identity block and nav links
- **"Archive":** Links to an archive page (or anchor) showing all posts grouped by year
- **"Projects":** Links to a projects page (future)
- **Text alignment:** Right-aligned (flush against the column divider / gutter)
- **Position:** Sticky (`position: sticky; top: 2rem`) so it stays visible while scrolling the post list

#### Right Main Column

Full chronological list of all blog posts, same format as the homepage post list but showing **all posts** (not just 10). Optionally grouped by year with year headings.

#### Mobile (< 768px)

The sidebar collapses into a **hamburger menu**:
- Hamburger icon (three lines) appears in the top bar, to the left of the search/social icons
- Tapping opens a slide-in panel (from left) or a dropdown overlay showing the sidebar content: "four43 / by Seth Miller / Archive / Projects"
- The main column becomes full-width
- Requires JS for toggle behavior (~1KB)

### 5.4 Blog Post Page

Single-column layout (no sidebar), centered, max-width `700px`.

```
[top bar]
---------------------------------------------

Post Title (h1)
April 4, 2026

[post content -- markdown rendered]

---------------------------------------------
[footer]
```

- **Title:** `h1`, `2rem`, heading font, `--text-heading`
- **Date:** Below title, `--text-muted`, `0.875rem`
- **Content:** Standard markdown rendering with the typography scale above
- **Images:** `max-width: 100%`, `border-radius: 4px`, optional subtle shadow
- **Code blocks:** `--bg-elevated` background, `1rem` padding, `border-radius: 4px`, horizontal scroll on overflow
- **No sidebar, no table of contents, no share buttons, no comments**

### 5.5 Footer

Consistent across all pages. Preceded by a thin horizontal rule spanning full viewport width.

```
---------------------------------------------
(c) 2026 Seth Miller                     RSS
---------------------------------------------
```

- Copyright on the left, RSS link on the right (or centered, single line)
- `--text-muted` color, `0.875rem`
- Padding: `1.5rem` top and bottom

### 5.6 About Page

Simple markdown page using the single-column post layout. Photo (larger, ~200px), longer bio, career highlights, contact info. No special layout beyond the standard page template.

---

## 6. File Structure

Override minima's defaults by creating custom layout and include files:

```
blog/
  _layouts/
    default.html        # Base layout: html head, top bar, content, footer
    home.html           # Homepage: hero bio + latest 10 posts + "more" link
    blog.html           # Blog index: two-column sidebar + full post list
    post.html           # Blog post: single-column, title, date, content
    page.html           # Generic page (About, etc.)
  _includes/
    topbar.html         # Top bar: logo, social icons, search
    footer.html         # Site footer
    head.html           # <head> tag: meta, fonts, CSS
    hero.html           # Hero section for homepage (photo + bio)
    post-list.html      # Reusable post list component (used by home + blog)
    sidebar.html        # Blog index sidebar (four43, by Seth Miller, nav)
    search.html         # Search icon + expandable input + JS
  _sass/
    _variables.scss     # CSS custom properties (colors, fonts, spacing)
    _base.scss          # Reset, body, typography defaults
    _layout.scss        # Container, top bar, footer, two-column grid
    _components.scss    # Hero, post list, sidebar, search, code blocks
    _responsive.scss    # Mobile breakpoints, hamburger menu
  assets/
    css/
      main.scss         # Jekyll entry point, imports all _sass partials
    js/
      search.js         # Search toggle + client-side search (~2KB)
      menu.js           # Hamburger menu toggle for mobile (~1KB)
    images/
      seth-photo.jpg    # Headshot for hero section (provide ~360px square)
    logo/
      four43-logo.svg         # Existing logo (black)
      four43-logo-light.svg   # Logo for dark theme (white)
  index.md              # Homepage (layout: home)
  blog.md               # Blog index page (layout: blog, permalink: /blog/)
  about.md              # About page (layout: page)
  _posts/
    2026-04-04-hello-world.md
```

### Search Data

Jekyll generates a JSON index of all posts at build time for client-side search:

```
blog/
  assets/
    search.json         # Liquid template that outputs post titles/urls/excerpts
```

### Notes on Jekyll/Minima Override Mechanism

When files exist in the project at paths matching minima's internal structure, Jekyll uses the project files instead of the gem defaults. This means:

- Creating `blog/_layouts/default.html` overrides minima's default layout
- Creating `blog/_includes/header.html` overrides minima's header
- Creating `blog/assets/css/main.scss` overrides minima's stylesheet

No gem fork or theme change needed. We keep `theme: minima` in `_config.yml` as the base, overriding only what we customize.

---

## 7. Responsive Design

Two breakpoints: one for the blog's two-column layout, one for small screens.

### Breakpoint 1: `max-width: 768px` (tablet / blog sidebar collapse)

This is the critical breakpoint -- the blog index sidebar disappears and a hamburger menu appears.

| Component                | Desktop                      | Mobile (< 768px)                    |
|--------------------------|------------------------------|-------------------------------------|
| Blog sidebar             | Visible, sticky, 200px left  | Hidden; content moves to hamburger  |
| Blog main column         | Right of sidebar              | Full width                          |
| Hamburger icon           | Hidden                        | Visible in top bar (left of icons)  |
| Hamburger panel          | N/A                           | Slide-in or dropdown overlay        |

### Breakpoint 2: `max-width: 480px` (small phone)

| Component                | Tablet                       | Small phone                         |
|--------------------------|------------------------------|-------------------------------------|
| Container padding        | `1.5rem`                     | `1rem`                              |
| Post title (h1)          | `2rem`                       | `1.6rem`                            |
| Hero photo               | 180px                        | 140px                               |
| Post list date           | Right-aligned on same line   | Below title, own line               |
| Search expanded width    | 300px                        | Full top bar width                  |

### Hamburger Menu Behavior

- Icon: Three horizontal lines, `--text` color, 24px
- Opens: Overlay or slide-in panel from the left edge
- Contents: "four43 / by Seth Miller" identity block + Archive + Projects links (mirrors the blog sidebar)
- Close: Tap outside, tap X icon, or press Escape
- Transition: Slide or fade, `200ms ease`

### Touch Targets

All interactive elements (links, icon buttons) have a minimum tappable area of 44x44px on mobile, achieved through padding rather than scaling icons/text.

---

## 8. Performance Budget

| Metric           | Target     | How                                           |
|------------------|------------|-----------------------------------------------|
| Web fonts        | 3 families | Google Fonts with `display=swap`, preconnect   |
| JavaScript       | < 3 KB     | Search toggle + hamburger menu only            |
| CSS              | < 10 KB    | Single stylesheet, no framework                |
| HTML (homepage)  | < 20 KB    | No excessive markup                            |
| First paint      | < 800ms    | Fonts load async (`display=swap`), no blocking JS |
| Largest paint    | < 1.5s     | Hero photo is the LCP candidate                |

### Image Optimization

- Hero photo: serve as JPEG at 360px width (~20-30KB), with `width` and `height` attributes to prevent layout shift
- Logo: inline SVG in top bar (tiny, ~1KB) instead of `<img>` tag -- eliminates a request
- Blog post images: `loading="lazy"`, `max-width: 100%`, prefer WebP with JPEG fallback

---

## 9. Accessibility

- **Contrast ratios:** All text/background combinations meet WCAG AA (4.5:1 for body text, 3:1 for large text)
  - `#e8e8e8` on `#3d444d` = ~7.5:1 (passes AAA)
  - `#9ca3af` on `#3d444d` = ~4.6:1 (passes AA)
  - `#93c5fd` on `#3d444d` = ~7.2:1 (passes AAA)
- **Semantic HTML:** `<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`
- **Skip-to-content link:** Hidden link at top of page, visible on focus
- **Alt text:** Required on all images (bio photo, post images)
- **Focus indicators:** Visible focus outline on all interactive elements (don't remove browser defaults -- enhance them)
- **External link indicators:** `rel="noopener"` and visually distinct (subtle icon or different underline style)

---

## 10. Implementation Order

Build in layers, each deployable on its own:

### Phase 1: Foundation (top bar + footer + base styles)

1. Create `blog/_sass/` partials and `blog/assets/css/main.scss`
2. Define CSS custom properties (color tokens, font stacks, spacing)
3. Create `blog/_layouts/default.html` with semantic structure (top bar, main, footer)
4. Create `blog/_includes/head.html` (meta, Google Fonts link, CSS)
5. Create `blog/_includes/topbar.html` (logo + social icons, no search yet)
6. Create `blog/_includes/footer.html`
7. Create white variant of logo SVG (`four43-logo-light.svg`)
8. **Checkpoint:** Site renders with dark theme, top bar with logo/icons, footer with lines

### Phase 2: Homepage

9. Create `blog/_includes/hero.html` (photo + name + subtitle + bio)
10. Create `blog/_includes/post-list.html` (reusable, accepts a post limit parameter)
11. Create `blog/_layouts/home.html` (hero + latest 10 posts + "more" link)
12. Update `blog/index.md` with bio content
13. Add placeholder hero photo to `blog/assets/images/`
14. **Checkpoint:** Homepage shows hero bio, 10 recent posts, "view all" link

### Phase 3: Blog index (two-column layout)

15. Create `blog/_includes/sidebar.html` (four43 identity + Archive/Projects nav)
16. Create `blog/_layouts/blog.html` (sidebar + full post list, CSS grid/flexbox)
17. Create `blog/blog.md` (layout: blog, permalink: /blog/)
18. Style the two-column grid in `_layout.scss`
19. **Checkpoint:** /blog/ shows sidebar left, post list right

### Phase 4: Post + page layouts

20. Create `blog/_layouts/post.html` (single-column, title, date, content)
21. Style markdown content (headings, code blocks, blockquotes, lists, tables)
22. Create `blog/_layouts/page.html` for generic pages
23. Create `blog/about.md` with placeholder content
24. Syntax highlighting theme for code blocks (dark, matching palette)
25. **Checkpoint:** Posts and pages render with full styling

### Phase 5: Search + mobile

26. Create `blog/assets/search.json` (Liquid template for post index)
27. Create `blog/assets/js/search.js` (toggle + client-side filtering)
28. Add search icon + expandable input to `topbar.html`
29. Create `blog/assets/js/menu.js` (hamburger toggle)
30. Add hamburger icon to `topbar.html` (hidden on desktop)
31. Style hamburger panel in `_responsive.scss`
32. Test across breakpoints (desktop, tablet, phone)
33. **Checkpoint:** Search works, hamburger collapses sidebar on mobile

### Phase 6: Final polish

34. RSS feed verification
35. SEO meta tags (jekyll-seo-tag should handle most of this)
36. Favicon from logo
37. Cross-browser testing
38. **Checkpoint:** Production-ready

---

## 11. Open Questions

- [x] **Photo:** Do you have a headshot ready, or should we use a placeholder for now? - Placeholder
- [x] **GitHub URL:** Confirm github.com/four43 - Yes, that's correct
- [x] **LinkedIn URL:** What's your LinkedIn profile URL? - https://www.linkedin.com/in/four43/
- [ ] **About page content:** Do you want to draft this, or should I write placeholder copy? - Very obvious placeholder, like illorium ipsum text
- [x] **Syntax highlighting:** GitHub-style dark theme, or match the slate palette more closely? - Github-style dark is fine
- [x] **Archive page:** Should "Archive" link to a dedicated page (posts grouped by year), or just anchor to the bottom of the blog index? - A blog listing of posts per month year like https://daringfireball.net/archive/
- [x] **Projects page:** Placeholder for now, or skip until there's content? - Placeholder with "Project A", a date range, and some placeholder content, "Project B", etc. This should be powered by markdown files in a `_projects/` collection, similar to blog posts but with different metadata (e.g. project name, description, date range, link)

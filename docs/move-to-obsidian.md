# Move four43.com to Obsidian + Jekyll

Replace the current React/Webpack/TypeScript site with a simple Jekyll blog. Content lives in an Obsidian vault, gets pushed to GitHub via the Obsidian Git plugin, and GitHub Pages builds it with Jekyll automatically.

## Current State

- **Repo:** `four43/four43`, default branch `gh-pages`
- **Stack:** React 15, TypeScript, Webpack, node-sass, server-side rendered
- **Domains:** `four43.com` (CNAME file)
- **Hosting:** GitHub Pages, use actions to render on push
- **No existing GitHub Actions workflows**

## Target State

- **Content:** Obsidian vault synced to the repo via Obsidian Git plugin (supports mobile)
- **Renderer:** Jekyll (built-in GitHub Pages support, zero config)
- **Deploy:** GitHub Pages builds Jekyll automatically on push
- **Domain:** `four43.com` (custom domain preserved)

---

## Phase 1: Set Up Jekyll in the Repo

### 1.1 Create a fresh working branch

```bash
git checkout -b feat/obsidian-cms
```

### 1.2 Remove the old site files

Remove everything except `.git/`, `CNAME`, `LICENSE`, and `docs/`:

```bash
rm -rf src/ dist/ render.tsx webpack.config.js tsconfig.json \
       package.json browserconfig.xml manifest.json favicon.ico \
       index.html keybase.txt README.md
```

### 1.3 Create minimal Jekyll structure

```
.
├── _config.yml
├── _posts/           # Blog posts (YYYY-MM-DD-title.md)
├── _layouts/         # Optional custom layouts
├── index.md          # Landing page
├── CNAME             # Custom domain
├── .gitignore
└── Gemfile           # Jekyll dependencies (optional, GitHub Pages has defaults)
```

### 1.4 Create `_config.yml`

```yaml
title: Seth Miller
description: Personal site of Seth Miller
url: "https://four43.com"
baseurl: ""

theme: minima

markdown: kramdown
permalink: /:title/

exclude:
  - docs/
  - LICENSE
  - README.md
  - .obsidian/
```

### 1.5 Create `Gemfile`

```ruby
source "https://rubygems.org"

gem "github-pages", group: :jekyll_plugins
```

### 1.6 Create `index.md`

```markdown
---
layout: home
title: Home
---
```

### 1.7 Create `.gitignore`

```
_site/
.sass-cache/
.jekyll-cache/
.jekyll-metadata
.bundle/
vendor/
.obsidian/workspace.json
.obsidian/workspace-mobile.json
```

---

## Phase 2: Sync Obsidian Vault via Obsidian Git Plugin

The repo itself is the Obsidian vault. Blog posts go in `_posts/`, standalone pages at the root.

### 2.1 Install Obsidian Git plugin

1. In Obsidian, open **Settings > Community Plugins**
2. Install **Obsidian Git** by Denis Olehov
3. Configure auto-commit + push interval (e.g. every 10 minutes)
4. This works on mobile via the plugin's mobile support

### 2.2 Open the repo as an Obsidian vault

Point Obsidian at the repo root directory. All Markdown files are both Obsidian notes and Jekyll content.

### 2.3 Writing posts

Create files in `_posts/` with Jekyll front matter:

```markdown
---
layout: post
title: "My First Post"
date: 2026-04-04
---

Post content here. Standard Markdown.
```

### 2.4 Obsidian compatibility notes

- Jekyll uses standard Markdown, not Obsidian wikilinks — use `[text](url)` links
- Front matter (`---` block) is required for Jekyll to process a file
- Files without front matter are copied as-is (static assets)
- Images can go in an `assets/` folder, referenced as `![alt](/assets/image.png)`

---

## Phase 3: GitHub Pages Deployment

### 3.1 Configure repo settings

1. Go to **Settings > Pages**
2. Under **Source**, select **GitHub Actions** (GitHub's default Jekyll action will be used)
3. Confirm `four43.com` as the custom domain
4. Ensure DNS records point to GitHub Pages IPs

No custom workflow file needed — GitHub Pages detects Jekyll and builds automatically.

### 3.2 If you prefer an explicit workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Jekyll site to GitHub Pages

on:
  push:
    branches:
      - gh-pages

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/jekyll-build-pages@v1
        with:
          source: ./
          destination: ./_site
      - uses: actions/upload-pages-artifact@v3

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## Phase 4: Clean Up and Go Live

### 4.1 Test locally (optional)

```bash
bundle install
bundle exec jekyll serve
# Opens at http://localhost:4000
```

### 4.2 Verify

- [ ] Landing page renders from `index.md`
- [ ] Blog posts appear on the home page
- [ ] `four43.com` loads with HTTPS
- [ ] Obsidian Git plugin pushes trigger a rebuild

### 4.3 Clean up old branches

Once confirmed working, delete stale branches:
- `master`, `development`, `feature-nov-2015-updates`, `feature-refactor-react`, `feature-typescript`

---

## Ongoing Workflow

1. **Write** in Obsidian (vault = repo root, posts in `_posts/`)
2. **Sync** via Obsidian Git plugin (auto-commit + push, works on mobile)
3. **GitHub Pages** builds Jekyll and deploys automatically
4. No build tools, no Node.js, no npm — just Markdown and git

---

## Decision Log

| Decision | Options Considered | Choice | Rationale |
| --- | --- | --- | --- |
| Static site generator | Quartz, Jekyll, Hugo | Jekyll | Zero config with GitHub Pages, no build tooling needed, simplest option |
| Theme | Custom, minima, others | minima (default) | Start simple, customize later |
| Content sync | Copy / Obsidian Git / Manual | Obsidian Git plugin | Mobile support, lowest friction |
| Default branch | Keep `gh-pages` vs rename | Keep `gh-pages` | Avoid breaking existing Pages config |

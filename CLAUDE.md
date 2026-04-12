# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal website and blog for Seth Miller at four43.com. Recently migrated from a React/TypeScript/Webpack stack to a **Jekyll-powered Obsidian CMS**. The repository doubles as an Obsidian vault — content is authored in Obsidian, synced via the Obsidian Git plugin, and built/deployed automatically by GitHub Actions.

## Build & Development

This is a Ruby/Jekyll project, **not** a Node.js project. There is no package.json, npm, or webpack.

**Local development (Docker):**

```bash
docker compose up                # Build and serve at http://localhost:4000 with live reload
docker compose up --build        # Rebuild image after Gemfile changes
docker compose down              # Stop the dev server
```

A VS Code build task (`Ctrl+Shift+B`) is configured in `.vscode/tasks.json` — it runs `docker compose up`.

Deployment is automatic: push to `gh-pages` branch → GitHub Actions builds Jekyll → published to four43.com.

## Architecture

- **Static site generator:** Jekyll with the `minima` theme
- **Markdown processor:** Kramdown
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml`
- **Custom domain:** four43.com (configured via `CNAME` file)

### Directory Structure

```text
/
├── content/                 # Obsidian vault (open THIS in Obsidian)
│   ├── .obsidian/           # Obsidian plugin/workspace config
│   ├── _posts/              # Published blog posts
│   ├── _projects/           # Project entries (Jekyll collection)
│   └── tmp/                 # Draft posts (excluded from build)
│
├── site/                    # Jekyll source (--source site)
│   ├── _config.yml          # Jekyll config (collections_dir: content)
│   ├── _includes/           # Partials (topbar, sidebar, etc.)
│   ├── _layouts/            # Layouts (post, page, home, etc.)
│   ├── _plugins/            # Plugins (link_preview)
│   ├── _sass/               # Stylesheets
│   ├── assets/              # Static assets (CSS, JS, images, logo)
│   ├── content -> ../content  # Symlink so Jekyll finds collections
│   ├── index.md, about.md, etc.
│   └── CNAME
│
├── Gemfile                  # Ruby dependencies
├── Dockerfile
└── docker-compose.yml
```

`content/` is the Obsidian vault — only authored content. `site/` is the Jekyll source — templates, layouts, styles, and pages. A symlink `site/content -> ../content` lets Jekyll find `_posts` and `_projects` via `collections_dir: content`.

## Content Structure

- **Blog posts:** `content/_posts/YYYY-MM-DD-title.md` — requires front matter: `layout: post`, `title`, `date`
- **Projects:** `content/_projects/*.md` — requires front matter: `layout: page`, `title`
- **Drafts:** `content/tmp/*.md` — not built by Jekyll
- **Pages:** `site/*.md` (e.g., `site/index.md` with `layout: home`)
- **Permalinks:** `/:title/` (no date in URL)

## Key Configuration

- `site/_config.yml` — Jekyll config (theme, permalinks, `collections_dir: content`, exclusions)
- `Gemfile` — Ruby dependencies
- `.github/workflows/deploy.yml` — CI/CD pipeline
- `docs/move-to-obsidian.md` — Migration rationale and decision log

## Obsidian Compatibility

The Obsidian vault is `content/` — open that directory in Obsidian, not the repo root. Use standard Markdown links (`[text](url)`), not Obsidian wikilinks. Image paths must be absolute (`/assets/image.png`). The `.obsidian/` directory is in git for plugin config but excluded from the published site via `site/_config.yml`.

## Branch Layout

- `gh-pages` — production/default branch (deployment trigger)
- `feat/obsidian-cms` — migration branch with the new Jekyll setup

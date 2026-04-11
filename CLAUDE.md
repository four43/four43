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
- **Content source:** `blog/` directory (Obsidian vault synced via Git plugin)
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml`
- **Custom domain:** four43.com (configured via `CNAME` file)

## Content Structure

- **Blog posts:** `blog/_posts/YYYY-MM-DD-title.md` — requires front matter: `layout: post`, `title`, `date`
- **Pages:** `blog/*.md` (e.g., `blog/index.md` with `layout: home`)
- **Permalinks:** `/:title/` (no date in URL)

## Key Configuration

- `_config.yml` — Jekyll config (theme, permalinks, exclusions)
- `Gemfile` — Ruby dependencies (only `github-pages` gem)
- `.github/workflows/deploy.yml` — CI/CD pipeline
- `docs/move-to-obsidian.md` — Migration rationale and decision log

## Obsidian Compatibility

Use standard Markdown links (`[text](url)`), not Obsidian wikilinks. Image paths must be absolute (`/assets/image.png`). The `.obsidian/` directory is in git for plugin config but excluded from the published site via `_config.yml`.

## Branch Layout

- `gh-pages` — production/default branch (deployment trigger)
- `feat/obsidian-cms` — migration branch with the new Jekyll setup

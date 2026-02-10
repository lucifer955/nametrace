# nametrace

Static, client-only name availability checker for Rust crates, GitHub repos, and other OSS registries.

## Features

- crates.io exact name check
- GitHub repository name search
- Homebrew best-effort heuristic
- npm exact + similar name search
- NuGet exact + similar name search
- PowerShell Gallery exact + similar name search (best-effort)
- PyPI exact + similar name search (best-effort)
- RubyGems exact + similar name search
- Maven Central exact + similar name search
- Deterministic risk scoring (crates.io + GitHub)
- Deterministic suggestions (filtered via crates.io)
- Progressive results (render as checks complete)

## Local usage (Node)

```bash
npm install
npm start
```

## GitHub Pages

1. Push this repo to GitHub.
2. In repository settings → Pages → Source, choose the main branch and root folder.
3. Save. Your site will be available at the GitHub Pages URL.

## Notes

- GitHub Search API is rate-limited to 60 requests/hour/IP for unauthenticated requests.
- PowerShell Gallery, PyPI search, and Maven Central may use a CORS proxy fallback.
- App sources live in src/; root index.html redirects to src/index.html for Pages.
- All checks are best-effort and may change over time.

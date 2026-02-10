# CLI / OSS Name Availability Checker (Web)

## 1. Purpose & Scope

### Purpose

Help developers decide on a name for:

- CLI tools
- Rust crates
- Open-source projects

**Before** they publish or commit to it.

### Explicitly NOT a guarantee service

- No reservations
- No locking
- No ownership claims

This is decision support, not authority.

---

## 2. Supported Checks (v1)

### Supported (v1)

| Ecosystem          | Type            | Method                            |
| ------------------ | --------------- | --------------------------------- |
| crates.io          | Rust crate      | HTTP API                          |
| GitHub             | Repository name | GitHub Search API                 |
| Homebrew           | Formula name    | Best-effort (GitHub search)       |
| npm                | Package name    | Exact + search (npm registry API) |
| NuGet              | Package name    | Exact + search (NuGet APIs)       |
| PowerShell Gallery | Module name     | Exact + search (best-effort)      |
| PyPI               | Package name    | Exact + search (best-effort)      |
| RubyGems           | Gem name        | Exact + search (RubyGems API)     |
| Maven Central      | Artifact name   | Exact + search (Solr API)         |

### Explicitly out of scope (v1)

- Go modules
- local CLI binary name (needs CLI tool)

Design should allow future extension.

---

## 3. Functional Requirements

### FR-1: Name Input

- User provides a single name (string)
- Case-insensitive
- Trim whitespace
- Reject empty input

### FR-2: crates.io Availability Check

- Query exact crate name
- Determine:
  - Taken → exact match exists
  - Not found → no crate exists
- No fuzzy matching at this layer

### FR-3: GitHub Repository Search

- Search repositories by name
- Capture:
  - Exact name matches
  - Similar names
  - Total result count
- Do not clone or inspect repos

### FR-4: Homebrew (Best-Effort)

- Search Homebrew core repo names
- If ambiguous → mark as “unknown / best-effort”
- Honesty > completeness

### FR-5: Result Aggregation

Combine all checks into a single result object:

```ts
{
  name: "worklog",
  checks: {
    crates: { status, details },
    github: { status, count, examples },
    homebrew: { status, note },
    npm: { status, details },
    nuget: { status, details },
    powershell: { status, details },
    pypi: { status, details },
    rubygems: { status, details },
    maven: { status, details }
  },
  risk_level: "low | medium | high",
  suggestions: string[]
}
```

### FR-6: Suggestions

Generate alternative names automatically when risk is medium/high.

Rules:

- Deterministic
- No AI
- No randomness

---

## 4. Non-Functional Requirements

### NFR-1: Static Hosting Only

- Must work on GitHub Pages
- No backend
- No secrets
- No server-side code

### NFR-2: Transparent & Explainable

- Every result must be explainable
- No “magic” scores
- No hidden logic

### NFR-3: Fail Gracefully

If an API fails:

- Show partial results
- Clearly mark failures
- Never block entire output

### NFR-4: Fast

- Target < 1s for typical checks
- Parallel API requests
- Render results as each check completes

---

## 5. UX / UI Contract

### Page Layout (Single Page)

```
[ Title ]
[ Short description ]

[ Input box ] [ Check ]

[ Results table ]

[ Risk summary ]
[ Suggested alternatives ]

[ Disclaimer ]
```

### Results Table (Required)

| Ecosystem | Status       | Details        |
| --------- | ------------ | -------------- |
| crates.io | ❌ Taken     | worklog v0.3.1 |
| GitHub    | ⚠️ Similar   | 12 repos       |
| Homebrew  | ✅ Not found | best-effort    |

Statuses:

- ✅ Not found
- ❌ Taken
- ⚠️ Similar / Risk
- ❓ Unknown / Failed

### Risk Summary (Required)

```
Collision risk: HIGH

Reason:
- Exact crate name exists
- Multiple GitHub repos with same name
```

### Disclaimer (Required)

“Results are best-effort. Availability may change at any time.  
This tool does not guarantee name ownership.”

---

## 6. API Contracts (Exact)

### crates.io

```http
GET https://crates.io/api/v1/crates/{name}
```

Interpretation:

- 200 OK → taken
- 404 → not found
- other → error

### GitHub Search

```http
GET https://api.github.com/search/repositories?q={name}+in:name
```

Capture:

- total_count
- top 3 repo names

Rate-limit note:

- 60 requests/hour/IP (unauthenticated)

### Homebrew (Best-Effort)

Use GitHub search:

```http
GET https://api.github.com/search/repositories?q=brew+{name}+in:name
```

Mark clearly as heuristic.

### npm

```http
GET https://registry.npmjs.org/{name}
```

Interpretation:

- 200 OK → taken
- 404 → not found
- other → error

Search:

```http
GET https://registry.npmjs.org/-/v1/search?text={name}&size=3
```

Interpretation:

- total > 0 → similar
- total = 0 → not found

### NuGet

```http
GET https://api.nuget.org/v3/registration5-semver1/{name}/index.json
```

Interpretation:

- 200 OK + count > 0 → taken
- 404 → not found
- other → error

Search:

```http
GET https://azuresearch-usnc.nuget.org/query?q={name}&prerelease=false&take=3
```

Interpretation:

- totalHits > 0 → similar
- totalHits = 0 → not found

### PowerShell Gallery (Best-Effort)

```http
GET https://www.powershellgallery.com/api/v2/FindPackagesById()?id='{name}'
```

Interpretation:

- OData entry exists → taken
- no entry → not found
- CORS/network errors → unknown

Search:

```http
GET https://www.powershellgallery.com/api/v2/Search()?searchTerm='{name}'&includePrerelease=false
```

Interpretation:

- entries > 0 → similar
- entries = 0 → not found
- CORS/network errors → unknown

### PyPI

```http
GET https://pypi.org/pypi/{name}/json
```

Interpretation:

- 200 OK → taken
- 404 → not found
- other → error

Search (best-effort HTML):

```http
GET https://pypi.org/search/?q={name}
```

Interpretation:

- results > 0 → similar
- results = 0 → not found
- CORS/network errors → unknown

### RubyGems

```http
GET https://rubygems.org/api/v1/gems/{name}.json
```

Interpretation:

- 200 OK → taken
- 404 → not found
- other → error

Search:

```http
GET https://rubygems.org/api/v1/search.json?query={name}
```

Interpretation:

- results > 0 → similar
- results = 0 → not found

### Maven Central

```http
GET https://search.maven.org/solrsearch/select?q=a:{name}&rows=1&wt=json
```

Interpretation:

- numFound > 0 → taken
- numFound = 0 → not found
- other → error

Search:

```http
GET https://search.maven.org/solrsearch/select?q={name}&rows=3&wt=json
```

Interpretation:

- numFound > 0 → similar
- numFound = 0 → not found

---

## 7. Risk Scoring Logic (Deterministic)

### Risk Levels

#### HIGH

- crates.io exact match exists  
  OR
- GitHub exact repo name exists

#### MEDIUM

- No exact matches
- GitHub total_count > 5

#### LOW

- No exact matches
- GitHub total_count ≤ 5

This logic must be documented in code and UI.

---

## 8. Suggestion Generation Rules

### Base patterns

Given `worklog`, generate:

- `{name}-rs`
- `git-{name}`
- `{name}-cli`
- `{name}-dev`
- `{name}x` (last-resort)

### Filtering

- Remove suggestions that fail crates.io check
- Limit to 5 suggestions max

---

## 9. Recommended Tech Stack

### ✅ Strong Recommendation (Simple & Durable)

**Frontend**

- HTML
- CSS (or Tailwind)
- Vanilla JavaScript (ES6)

Why:

- Zero build step
- Easy to debug
- Perfect for GitHub Pages
- Long-term maintainability

### Optional Enhancements

- Tailwind CSS (for speed)
- Vite (only if you want structure)

❌ Not recommended for v1:

- React
- Vue
- Next.js

### Repo Structure

```text
nametrace/
├── index.html           # redirects to src/index.html
├── src/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── README.md
└── LICENSE
```

---

## 10. Implementation Phases

### Phase 1 (1–2 days)

- Input
- crates.io check
- GitHub check
- Raw results

### Phase 2

- Risk scoring
- Suggestions
- UI polish

### Phase 3

- Error handling
- Rate-limit messaging
- Documentation

---

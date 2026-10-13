# ⚡ figma-dev-tools Quick Start Guide v1.4.20

> [中文](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md) / English
> From install to your first Figma → React/Vue component in ~5 minutes.

---

## What it is, in one minute

A **MCP Server** + **CLI** + **GUI wizard** that runs underneath your AI editor (Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code, 8 editors). Feed it a Figma link and it generates frontend code (React / Vue / HTML), downloads images / SVG, and extracts design tokens.

---

## 1. Install (pick one, #1 recommended)

| Method | Command | Who it's for |
|--------|---------|-------------|
| **① GUI wizard** ⭐ | `npx figma-dev-tools gui` | Beginners, click-through in browser |
| **② Zero-config npx** | `npx -y figma-dev-tools --figma-api-key=figd_xxx` | Quick trial |
| **③ One-click install** | `npx figma-dev-tools install` | Long-term use, auto-configures editor MCP |
| **④ Project dependency** | `npm i -D figma-dev-tools` | Use in a single project |

> Global access (`figma-dev` from anywhere): `npm i -g figma-dev-tools`

---

## 2. Get and configure a Figma Token

### Get the token
Sign in to [Figma](https://www.figma.com/) → avatar (top-right) → **Settings** → **Account** → **Personal access tokens** → **Generate new token** → Check **File content (Read only)** → **Generate** → **copy immediately** (shown only once!)

### Configure (pick one)

**A. GUI (recommended)**
```bash
figma-dev gui
```

**B. CLI secure store**
```bash
figma-dev token set default -t figd_xxx
figma-dev validate
```

**C. Environment variable**
```env
FIGMA_ACCESS_TOKEN=figd_xxx
```

**D. Advanced: MCP config injection**
```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path>/figma-dev-tools/dist/index.js"],
      "env": { "FIGMA_ACCESS_TOKEN": "figd_xxx" }
    }
  }
}
```

> ❗ **Restart your AI editor** after configuring. ⚠️ Never commit your token to Git; add `.env` to `.gitignore`.

---

## 3. Quick experience

### Way A: Inside the AI editor (MCP automation)

Paste a Figma link to the AI, e.g.:

```
Use figma-dev-tools to convert this design. Component: HeroSection, scene: landing-page
https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
```

The AI runs: `figma_parse_url` → `figma_get_metadata` → `figma_get_screenshot` → `figma_generate_jsx` → `figma_download_assets`

### Way B: CLI

```bash
# ① Inspect file structure
figma-dev info "<figma-url>"

# ② Generate component (--framework vue for Vue3; --style tailwind|unocss|css-modules)
figma-dev jsx "<figma-url>" --name HeroSection --scene landing-page --style tailwind

# ③ Download assets (auto-placed into public/ or src/assets/ by bundler)
figma-dev assets "<figma-url>" --scene landing-page --scale 2

# ④ Sync design tokens (supports --output-format dtcg for W3C DTCG)
figma-dev sync "<figma-url>" --format oklch --output ./src/styles/figma

# ⑤ Output framework-agnostic JSON (for Vue/Svelte/HTML, etc.)
figma-dev structured "<figma-url>"
```

---

## 4. Command reference

| Command | Description |
|---------|-------------|
| `figma-dev gui` | Visual config wizard |
| `figma-dev install` / `uninstall` | One-click install / uninstall editor MCP config |
| `figma-dev validate` | Validate the token |
| `figma-dev token set/get/list/delete` | Token management |
| `figma-dev info <url>` / `metadata <url>` | File info / high-level overview |
| `figma-dev lint <url>` | Design-fidelity pre-check |
| `figma-dev jsx <url>` | Generate React/Vue component |
| `figma-dev assets <url>` | Download images / SVG |
| `figma-dev sync <url>` | Sync tokens → theme CSS / DTCG JSON |
| `figma-dev structured <url>` | Output framework-agnostic JSON |

> Full commands: `README.md` or `figma-dev --help`.

---

## 5. Docs navigation

| Looking for | See |
|-------------|-----|
| All features / MCP tools / CLI commands | `README.md` |
| AI usage & high-fidelity checklist | `SKILL.md` |
| Per-editor / per-framework config | `README.md` → config |
| Design token mapping rules | `FIGMA-DESIGN-GUIDELINES.md` |

---
*Stuck? File an issue at the Gitee repo.*

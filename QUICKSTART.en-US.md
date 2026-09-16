# ⚡ figma-dev-tools Quick Start Guide v1.4.17

> [中文](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md) / English
> From install to your first Figma → React/Vue component in ~5 minutes. This is the merged & simplified version of the former `INTEGRATION_GUIDE` / `QUICKSTART` / landing overview, aligned with the actual v1.4.17 implementation.

---

## What it is, in one minute

A **MCP Server** + **CLI** + **GUI wizard** that runs underneath your AI editor (Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code, 8+). Feed it a Figma link and it generates frontend code (React / Vue / HTML), auto-downloads images / SVG, and extracts design tokens.

---

## 1. Install (pick one, #1 recommended)

| Method | Command | Who it's for |
|--------|---------|-------------|
| **① GUI wizard** ⭐ | `npx figma-dev-tools gui` | Beginners, click-through in browser |
| **② Zero-config npx** | `npx -y figma-dev-tools --figma-api-key=figd_xxx` | Quick trial, no install |
| **③ One-click install** | `npx figma-dev-tools install` | Long-term use, auto-configures editor MCP |
| **④ Project dependency** | `npm i -D figma-dev-tools` | Use in a single project |

To make `figma-dev` available globally (run from anywhere):

```bash
npm i -g figma-dev-tools
```

> 💡 The `install` script auto-detects installed editors (Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code, 8+) and writes the matching MCP config; the `GUI` way does it for you visually.

---

## 2. Get and configure a Figma Token

### 1. Get the token
1. Sign in to [Figma](https://www.figma.com/), avatar (top-right) → **Settings** → **Account**
2. Find **Personal access tokens** → **Generate new token**
3. Check **File content (Read only)** permission → **Generate** → **copy immediately** (shown only once!)

### 2. Configure (pick one)

**A. GUI (recommended)**
```bash
figma-dev gui
```
Enter the token in the browser — it's validated on the fly and safely stored in the OS keychain.

**B. CLI secure store**
```bash
# Save to OS keychain / encrypted file
figma-dev token set default -t figd_xxx
# Validate
figma-dev validate
```

**C. `.env` environment variable**
```env
FIGMA_ACCESS_TOKEN=figd_xxx
```

**D. MCP config env (inside AI editor)**
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

3. ❗ **Restart your AI editor** after configuring so the MCP server loads the new config.
   ⚠️ Never commit your token to Git; make sure `.env` is in `.gitignore`.

---

## 3. Quick experience

### Way A: Inside the AI editor (MCP automation)

Just paste a Figma link to the AI, e.g.:

```
Use figma-dev-tools to convert this design. Component name: HeroSection, scene: landing-page
https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
```

The AI runs the standard pipeline automatically:

```
figma_parse_url parse the link
  → figma_get_metadata     page structure overview (avoids context explosion)
  → figma_get_screenshot   visual reference
  → figma_generate_jsx     generate the component (React/Vue + Tailwind)
  → figma_download_assets  download images/SVG to public/<scene>/
```

### Way B: CLI (no AI needed)

```bash
# ① Inspect the file structure
figma-dev info "<figma-url>"

# ② High-level overview
figma-dev metadata "<figma-url>"

# ③ Design lint (optional)
figma-dev lint "<figma-url>"

# ④ Generate a component (React default; use --framework vue for Vue)
figma-dev jsx "<figma-url>" --name HeroSection --scene landing-page --framework react --style tailwind

# ⑤ Download assets to public/landing-page/
figma-dev assets "<figma-url>" --scene landing-page --scale 2

# ⑥ Sync design tokens → Tailwind @theme CSS
figma-dev sync "<figma-url>" --format oklch --output ./src/styles/figma

# ⑦ Framework-agnostic structured JSON (for Vue/Svelte/HTML, etc.)
figma-dev structured "<figma-url>"
```

---

## 4. Common commands

| Command | Description |
|---------|-------------|
| `figma-dev gui` | Launch the visual config wizard (browser) |
| `figma-dev wizard` / `figma-dev init --gui` | Interactive CLI / GUI wizard |
| `figma-dev install` / `uninstall` | One-click install / uninstall editor MCP config |
| `figma-dev validate` | Validate the token |
| `figma-dev token set/get/list/delete/default` | Token management |
| `figma-dev info <url>` / `metadata <url>` | File info / high-level overview |
| `figma-dev lint <url>` | Code-fidelity pre-check |
| `figma-dev jsx <url>` | Generate React/Vue + Tailwind component |
| `figma-dev structured <url>` | Output framework-agnostic JSON |
| `figma-dev assets <url>` | Download images/SVG to the project |
| `figma-dev sync <url>` | Sync tokens → theme CSS |
| `figma-dev cache status/clear` | View / clear local cache |
| `figma-dev lang set zh-CN|en-US` / `lang switch` | Switch UI language |
| `figma-dev tutorial` | Open the tutorial |
| `figma-dev privacy` | View the privacy statement |

> Full commands & options in `README.md` → "CLI Commands"; or run `figma-dev --help` locally.

---

## 5. Layout & Docs navigation

```txt
figma-dev-tools/
├── README.md / README.en-US.md         # Highlights + 19 tools + CLI commands
├── SKILL.md                             # AI-agent usage + high-fidelity checklist
├── QUICKSTART.md / QUICKSTART.en-US.md # This guide (quick start)
├── install.mjs / install.sh             # one-click install scripts
├── bin/ + dist/                         # executable entry + compiled output
└── gui/                                 # wizard frontend
```

| Looking for | See |
|-------------|-----|
| All features / 20 MCP tools / CLI commands | `README.md` |
| AI usage & high-fidelity checklist | `SKILL.md` |
| Per-editor / per-framework config | `README.md` → editors / config |
| Design tokens → token mapping rules | `FIGMA-DESIGN-GUIDELINES.md` |
| Competitor comparison & roadmap | `OPTIMIZATION-ANALYSIS.md` |

---

*Stuck? Run `figma-dev tutorial` for the online docs, or file an issue at the Gitee repo.*
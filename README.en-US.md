# 🎨 Figma Dev Tools v1.4.20

> Figma → Any Frontend Framework — Design-to-Code MCP Server

**English** | **[中文](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/README.md)**

A **complete toolchain bridging Figma design and frontend development** — GUI visual configuration wizard, intelligent design token extraction, high-fidelity component generation (React/Vue/Svelte/HTML), automatic asset downloading, and cross-editor MCP integration. Optimized for AI Agents.

---

## ✨ Key Features by Version

### v1.4.4 — Paywall Fallback + Fidelity Restoration + Performance

| Feature | Description |
| --- | --- |
| 🧱 **Paywall Browser Fallback** | `BrowserFallbackService`: Playwright auto-captures screenshot when REST API hits paywall |
| 🤖 **Visual Approximation** | VLM generates ~75% code skeleton from screenshot when node JSON unavailable |
| 🎯 **Fidelity Scoring** | `figma_verify_fidelity`: pixel diff + heatmap + quantified score (0-100%) |
| 📏 **DPR Awareness** | 1x/2x/3x screenshots matching user's `devicePixelRatio` |
| 📐 **Position/Style Restoration** | Absolute positioning, gradients, multi-shadow, clip-path, dashed borders, rich text |
| 🌍 **i18n Errors** | Error messages output in GUI-selected language (zh-CN/en-US) |
| 🚀 **Performance** | Browser instance pool, screenshot LRU cache, tiered timeouts, exponential backoff retry, warmup |

### v1.4.18 — Component Props + DTCG Tokens + Enterprise Network

| Feature | Description |
| --- | --- |
| 🧩 **TS Props Inference** | Figma component properties → JSDoc/`defineProps` interfaces |
| 🪙 **W3C DTCG Tokens** | Standard `$type`/`$value` JSON for color/dimension/shadow/typography |
| 🏢 **Enterprise Network** | `FIGMA_CA_CERT_PATH` for custom CA; auto bundler detection for asset placement |
| 📐 **Import Organizing** | Auto add missing / remove unused imports before Prettier |

### v1.4.19 — Multi-style + Vue + Batch + Smart Inference

| Feature | Description |
| --- | --- |
| 🎻 **11 Style Renderers** | Tailwind, UnoCSS, CSS Modules, Styled Components, Emotion, Less, Sass, vanilla-extract, Panda CSS (9 enhanced, React & Vue) |
| 💚 **First-class Vue** | `figma_generate_vue`: Vue3 `<script setup>` / Vue2 Options API, 5 styles, TS Props |
| 🧩 **Component Mapping** | Built-in shadcn/ui, Ant Design, Element Plus; `.figma/components.json` overrides |
| 📦 **Batch Generation** | `figma_batch_generate`: semantic block splitting (Header/Hero/Footer…) + barrel index |
| 🧠 **Smart Inference** | Grid/icons/dark-mode/motion hints, interaction scaffolds, TS interfaces + mock data (advisory comments only) |

### v1.4.20 — WeApp, Watch, Compare, Direct Component-Library Generation

| Feature | Description |
| --- | --- |
| 📱 **WeChat Mini Program** | `figma_generate_weapp`: WXML/WXSS/JS/JSON, rpx, bind/catch events, rich-text nodes, fidelity gate |
| 🧩 **Direct component-library output** | New `componentLibrary` option (`--component-library` on CLI) replaces semantic nodes with real library tags + imports: `shadcn-ui` / `ant-design` for React, `element-plus` / `ant-design-vue` for Vue. `auto` detects from package.json dependencies and the shadcn `components/ui` directory; conservative gate (role+name evidence, zero false replacements); cross-framework values fail before any network call (`FDT-UI-LIB-*`). Not applicable to Svelte. |
| 🔄 **Watch mode** | `figma_watch_*`: 5-session cap, 429 backoff, write-safe JSON merge, preserve markers |
| 📝 **Code compare** | `figma_compare_code`: unified diff, Prettier-normalized, 512KB cap, path traversal blocked |

---

## 🚀 Quick Start

> 📚 Full walkthrough: **[QUICKSTART.en-US.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md)**

### 1. Install & Configure

```bash
# GUI wizard (beginner-friendly)
npx figma-dev-tools gui

# Or one-click install MCP config to 8 editors
npx figma-dev-tools install

# Or zero-config npx run
npx -y figma-dev-tools --figma-api-key=your-token
```

### 2. Set Figma Token

```bash
figma-dev token set                          # interactive keychain save
# or pass via CLI: npx figma-dev-tools -t figd_xxx
# or via .env: FIGMA_ACCESS_TOKEN=figd_xxx
```

### 3. Generate Code

In your AI editor, paste a Figma URL and ask the agent to use `figma-dev-tools`. The agent will automatically run the pipeline: `figma_parse_url` → `figma_get_metadata` → `figma_get_design_context` → `figma_get_screenshot` → `figma_generate_jsx` → `figma_download_assets`.

```bash
# CLI: generate React component
figma-dev jsx "https://www.figma.com/design/xxx/MyProject?node-id=23-11032" \
  --name HeroSection --scene landing-page

# CLI: generate Vue SFC
figma-dev vue "https://www.figma.com/design/xxx/MyProject?node-id=23-11032" \
  --name HeroSection --style sass

# CLI: full-page batch generation
figma-dev batch "https://www.figma.com/design/xxx/MyProject?node-id=1-2" \
  --prefix Landing --out src/components/landing

# CLI: sync design tokens
figma-dev sync "https://www.figma.com/design/xxx/MyProject" \
  --format oklch --output ./src/styles
```

---

## 🔧 MCP Tool Reference

23 tools organized by usage flow:

| # | Tool | Function | Version |
| --- | --- | --- | --- |
| 1 | `figma_parse_url` | Parse Figma URL → fileKey/nodeId | v1 |
| 2 | `figma_validate_token` | Validate Access Token | v1 |
| 3 | `figma_get_file` | Basic file info (pages, components) | v1 |
| 4 | `figma_list_components` | List Components/ComponentSets | v1.2 |
| 5 | `figma_get_metadata` | High-level structure overview (~4KB) | v1.2 |
| 6 | `figma_get_design_context` | Simplified design context (flatten + annotation) | v1.2 |
| 7 | `figma_get_screenshot` | High-res node screenshot | v1 |
| 8 | `figma_get_structured_data` | Framework-agnostic structured JSON | v1.1.0 |
| 9 | `figma_lint_design` | Design spec pre-check | **v1.3.2** |
| 10 | `figma_generate_jsx` | One-click React TSX (9 styles, TS Props, smart inference) | **v1.4.19** |
| 11 | `figma_generate_component` | Basic component (legacy; prefer `generate_jsx`) | v1 |
| 12 | `figma_download_assets` | Download + SVGO optimize assets | **v1.4.18** |
| 13 | `figma_create_icon_sprite` | Generate SVG Sprite | **v1.3.2** |
| 14 | `figma_extract_tokens` | Extract design tokens (Variables+Styles) | v1 |
| 15 | `figma_generate_styles` | CSS/Tailwind/JSON/DTCG token output | **v1.4.18** |
| 16 | `figma_sync_to_project` | Write tokens to project files (auto-backup) | **v1.4.18** |
| 17 | `figma_dev_fallback_status` | Query paywall fallback status | **v1.4.4** |
| 18 | `figma_dev_fallback_capture` | Trigger browser fallback screenshot | **v1.4.4** |
| 19 | `figma_verify_fidelity` | Fidelity verification (pixel diff + heatmap) | **v1.4.4** |
| 20 | `figma_ocr_extract` | OCR text extraction (native + tesseract.js) | **v1.4.14** |
| 21 | `figma_generate_vue` | One-click Vue SFC (Vue3/Vue2, 5 styles) | **v1.4.19** |
| 22 | `figma_generate_svelte` | One-click Svelte 4 SFC (tailwind/unocss/css-modules only) | **v1.4.20** |
| 23 | `figma_batch_generate` | Batch generation (semantic blocks + barrel index; react/vue/svelte) | **v1.4.19** |
| 24 | `figma_generate_weapp` | WeChat Mini Program (WXML/WXSS/JS/JSON, dev preview) | **v1.4.20-dev** |

> 📖 Run `figma-dev --help <tool>` or see [QUICKSTART.en-US.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md) for detailed parameters.

---

## 💻 CLI Command Reference

| Command | Description | Version |
| --- | --- | --- |
| `figma-dev gui` | Launch GUI configuration panel | **v1.3.0** |
| `figma-dev install` | One-click install MCP config to editors | v1 |
| `figma-dev wizard` | Interactive config wizard (`--gui` for GUI) | v1.3.0 |
| `figma-dev lang` | Language settings (set/list/switch) | **v1.3.2** |
| `figma-dev token` | Token secure management (set/get/list/delete) | **v1.3.2** |
| `figma-dev lint <url>` | Design spec pre-check | **v1.3.2** |
| `figma-dev jsx <url>` | Generate React TSX (9 styles, TS Props, smart inference) | **v1.4.19** |
| `figma-dev vue <url>` | Generate Vue SFC (Vue3/Vue2, 5 styles) | **v1.4.19** |
| `figma-dev svelte <url>` | Generate Svelte 4 SFC (tailwind/unocss/css-modules only) | **v1.4.20** |
| `figma-dev batch <url>` | Full-page batch generation (semantic split) | **v1.4.19** |
| `figma-dev structured <url>` | Framework-agnostic structured data | v1.1.0 |
| `figma-dev sync <url>` | Sync Design Tokens (css/tailwind/json/dtcg) | **v1.4.18** |
| `figma-dev assets <url>` | Download assets (SVGO optimized) | **v1.4.18** |
| `figma-dev info <url>` | View Figma file info | v1 |
| `figma-dev screenshot <url>` | Get screenshot | v1 |
| `figma-dev mcp` | Start MCP server (stdio) | v1 |
| `figma-dev cache` | Cache management (status/clear) | v1.4.0 |
| `figma-dev -v` / `--update` | Version info / check for updates | **v1.4.8** |

---

## 🖥️ Supported Editors (8+)

| Editor | Auto-detect | One-click Install |
| --- | --- | --- |
| Trae | ✅ | ✅ |
| VS Code | ✅ | ✅ |
| Cursor | ✅ | ✅ |
| Windsurf | ✅ | ✅ |
| Claude Desktop | ✅ | ✅ |
| Zed | ✅ | ✅ |
| Cline | ✅ | ✅ |
| Roo Code | ✅ | ✅ |

MCP configuration template:

```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "npx",
      "args": ["-y", "figma-dev-tools", "--figma-api-key=figd_your_token_here"]
    }
  }
}
```

---

## ⚙️ Configuration

Key environment variables (`.env`):

```env
FIGMA_ACCESS_TOKEN=figd_your_token_here    # Required
FIGMA_DEV_LANG=zh-CN                        # Language (zh-CN/en-US)
# FIGMA_DEFAULT_SCALE=2                     # Export scale 1-4
# FIGMA_COLOR_FORMAT=oklch                  # hex/rgb/oklch/hsl
# FIGMA_DEV_GUI_PORT=54321                  # GUI port
# FIGMA_CA_CERT_PATH=/path/to/ca.pem        # Custom CA cert (v1.4.18)
```

Priority: CLI parameters > environment variables > .env file > defaults

---

## 🎻 Framework × Style Matrix

| Style | React (`jsx`) | Vue (`vue`) | HTML (`structured`) |
| --- | --- | --- | --- |
| Tailwind | ✅ | ✅ | ✅ |
| UnoCSS (attributify) | ✅ | ✅ | ✅ |
| CSS Modules | ✅ | ✅ | ✅ |
| Styled Components | ✅ | — | — |
| Emotion | ✅ | — | — |
| Less | ✅ | ✅ | ✅ |
| Sass/SCSS | ✅ | ✅ | ✅ |
| vanilla-extract | ✅ | — | — |
| Panda CSS | ✅ | — | — |

> Unsupported combinations fail fast via dual zod/registry validation. `inline-styles` is legacy-only; `css-variables` planned for v1.5.0.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                  MCP Server (stdio)                   │
├──────────┬──────────┬───────────────┬────────────────┤
│ CLI Layer│ GUI Layer│ Service Layer │   Tool Layer   │
│          │          │ figma-client  │   22 MCP       │
│          │          │ node-processor│   tools        │
│          │          │ tailwind-mapper│               │
│          │          │ asset-downloader│              │
│          │          │ fallback/pool/cache│           │
│          │          │ a11y/vlm/verify│               │
├──────────┴──────────┴───────────────┴────────────────┤
│                   Figma REST API                      │
└──────────────────────────────────────────────────────┘
```

---

## ❓ FAQ

| Question | Answer |
| --- | --- |
| **First-time setup?** | Run `npx figma-dev-tools gui` and follow the wizard |
| **MCP won't start?** | Check Node.js ≥ 18, Token configured, port not occupied |
| **API 401?** | Token expired or missing *File content (Read only)* permission |
| **Icons deformed?** | v1.3.2+ auto-fixes Flex issues; manually add `flex-shrink: 0` if needed |
| **Want Vue/Svelte/other?** | Use `figma-dev vue` for Vue, `figma-dev svelte` for Svelte 4 (tailwind/unocss/css-modules), or `figma_get_structured_data` for framework-agnostic JSON |
| **Colors/spacing off?** | Run `figma_lint_design` → `figma_extract_tokens` → `figma_sync_to_project` → regenerate |
| **Too many nested divs?** | `hierarchyFix` enabled by default in v1.4.0+; `figma_lint_design` reports nesting depth |
| **Corporate proxy/CA?** | Set `FIGMA_CA_CERT_PATH` (v1.4.18+) |

---

## 📋 Project Structure

```
figma-dev-tools/
├── bin/              # CLI entry point
├── dist/             # Compiled output
├── src/
│   ├── cli/          # CLI commands
│   ├── gui/          # GUI server
│   ├── i18n/         # Internationalization
│   ├── services/     # Core: figma-client, node-processor, tailwind-mapper,
│   │                 #   asset-downloader, fallback, pool, cache, a11y, vlm, verify
│   ├── tools/        # MCP tool implementations
│   ├── types/        # TypeScript types
│   └── index.ts      # MCP server entry
├── test/             # Tests (95 tests)
└── docs/             # Documentation
```

---

## 📊 Version History

| Version | Date | Highlights |
| --- | --- | --- |
| **v1.4.19** | 2025-07 | 11 style renderers, first-class Vue, batch generation, smart inference, component mapping |
| **v1.4.18** | 2025-06 | TS Props inference, W3C DTCG tokens, enterprise CA, import organizing |
| **v1.4.14** | 2025-05 | OCR text extraction (native node + tesseract.js fallback) |
| **v1.4.8** | 2025-04 | `figma-dev -v` / `--update`, EBUSY auto-retry |
| **v1.4.4** | 2025-03 | Paywall fallback, visual approximation, fidelity verification, performance optimization |
| **v1.4.0** | 2025-02 | Hierarchy fix, SVG inline rendering, encrypted cache, XSS protection |
| **v1.3.2** | 2025-01 | a11y enhancement, Flex auto-fix, i18n, SVG sprite, token secure storage |
| **v1.3.0** | 2024-12 | GUI visual configuration wizard |
| **v1.2** | 2024-11 | `figma_get_metadata` + `figma_get_design_context` |
| **v1.1.0** | 2024-10 | `figma_get_structured_data` (framework-agnostic) |
| **v1.0.0** | 2024-09 | Initial release: 14 MCP tools, CLI, multi-editor |

---

## 🆚 Comparison

### vs Commercial SaaS

| Dimension | figma-dev-tools | Locofy | Anima | Builder.io | Overlay |
| --- | --- | --- | --- | --- | --- |
| **Price** | **Free (MIT)** | $29/mo+ | $29/mo+ | $49/mo+ | $15/mo+ |
| **MCP Protocol** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Code Generation** | ✅ TSX/Vue | ✅ | ✅ | ✅ | ✅ |
| **Design Tokens** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Paywall Fallback** | ✅ v1.4.4 | ❌ | ❌ | ❌ | ❌ |
| **Fidelity Verification** | ✅ v1.4.4 | ❌ | ❌ | ❌ | ❌ |
| **Multi-editor** | ✅ 8+ | ✅ | ✅ | ✅ | ✅ |
| **CLI** | ✅ 20+ cmds | ✅ | ✅ | TBC | ❌ |
| **i18n** | ✅ v1.3.2 | ✅ | TBC | ✅ | TBC |

### vs Open Source / Official Tools

| Dimension | figma-dev-tools | @figma/code-connect | Framelink MCP | figma-mcp (Community) | Design Lint AI |
| --- | --- | --- | --- | --- | --- |
| **Positioning** | Full MCP toolchain | Official component mapping | MCP (8k+ stars) | MCP (community) | Figma plugin |
| **Price** | **Free (MIT)** | Free (Dev seat) | Free (MIT) | Free | Freemium |
| **Code Generation** | ✅ TSX/Vue | ❌ mapping only | ❌ data only | ❌ data only | N/A |
| **Design Tokens** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Flex Auto-fix** | ✅ v1.3.2 | ❌ | ❌ | Partial | ❌ |
| **a11y** | ✅ v1.3.2 | ❌ | ❌ | ❌ | ✅ |
| **Paywall Fallback** | ✅ v1.4.4 | N/A | ❌ | ❌ | ❌ |
| **Fidelity Verify** | ✅ v1.4.4 | ❌ | ❌ | ❌ | ❌ |
| **SVG Sprite** | ✅ v1.3.2 | ❌ | ❌ | ❌ | ❌ |

**Unique advantages:** Paywall Fallback (`BrowserFallbackService`), Fidelity Verification (pixel diff + heatmap + score), framework-agnostic structured data, and MIT-licensed full-featured 22-tool suite.

---

## 📜 License

MIT © figma-dev-tools contributors
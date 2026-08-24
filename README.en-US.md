# 🎨 Figma Dev Tools v1.4.12

> Figma → Any Frontend Framework — Design-to-Code MCP Server

**English** | **[中文](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/README.md)**

A **complete toolchain bridging Figma design and frontend development**, supporting 🖥️ GUI visual configuration wizard, intelligent design token extraction, high-fidelity component generation (React/Vue/Svelte/HTML, etc.), automatic asset downloading, and cross-editor MCP integration. Optimized for AI Agents, solving core pain points like div soup, context explosion, hardcoded hex colors, asset path handling, Flex layout deformation, accessibility gaps, responsive adaptation, and **paywall fallback**.

---

## ✨ v1.4.4 Paywall Fallback + High-Fidelity Restoration + Performance Optimization

### Core Fallback & Restoration

| Feature                          | Description                                                                                                                          | Version   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 🧱 **Paywall Browser Fallback**  | New `BrowserFallbackService`: When Figma REST API fails due to paywall/permissions, automatically launches Playwright headless browser to load the design page and capture a screenshot as fallback | **v1.4.4** |
| 🤖 **Visual Approximation Mode** | New `VisualApproximationService`: When node JSON cannot be obtained, feeds the screenshot to VLM to generate approximate code skeleton, clearly marked "Approximate mode ~75%" + TODO list | **v1.4.4** |
| 📏 **DPR/Screen Size Awareness** | Screenshots output at 1x/2x/3x based on user's actual `devicePixelRatio`, matching different OS rendering differences                                                | **v1.4.4** |
| 🎯 **Fidelity Scoring Tool**     | New `figma_verify_fidelity` MCP tool: Pixel diff between Figma screenshot and generated code screenshot, outputs a quantified similarity score                    | **v1.4.4** |
| 📐 **Absolute Position Restore** | Fix `layoutMode=NONE` nodes losing `relativeTransform`, floating element rotation/offset correctly mapped                                                          | **v1.4.4** |
| 🎨 **Gradient/Multi-shadow/Inner Shadow** | Fix loss of linear/radial gradient fills, multiple shadows, inner shadows all degrading to solid colors                                                       | **v1.4.4** |
| ✂️ **mask/clip-path Restore**   | Fix circular avatar, irregular clipping distortion, mapped to `overflow:hidden` + `border-radius` or `clip-path`                                                    | **v1.4.4** |
| ➖ **strokeDash Dashed/Dotted**   | Fix dashed and dotted borders all becoming solid lines                                                                                                              | **v1.4.4** |
| 🔤 **Rich Text Multi-segment Styles** | Fix `styleOverrideTable` not being parsed, causing entire text to use the same style                                                                          | **v1.4.4** |
| 🌍 **i18n Error Internationalization** | All hardcoded Chinese error messages in `figma-client.ts` changed to i18n key references, output based on GUI-selected language (zh-CN/en-US), default Chinese | **v1.4.4** |

### Performance Optimization (New in v1.4.4)

| Feature                          | Description                                                                                                                          | Version   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 🚀 **Browser Instance Pool**     | New `BrowserPool`: Maintains reusable Playwright browser instances, subsequent screenshots skip the 1-3 second startup phase, auto-recycle after 60s idle | **v1.4.4** |
| 💾 **Screenshot Cache**          | New `ScreenshotCache`: Caches screenshot results based on `url+nodeId+dpr`, LRU eviction + TTL expiry, repeated requests return in milliseconds                  | **v1.4.4** |
| ⏱️ **Tiered Timeouts**           | Navigation/render/screenshot timeouts configured separately (default 20s/10s/5s), precisely locate timeout phase                                                  | **v1.4.4** |
| 🧠 **Hybrid Smart Wait Strategy** | `domcontentloaded` + canvas element visible + network idle detection, solves Figma SPA `networkidle` never being reached                                          | **v1.4.4** |
| 🔁 **Exponential Backoff Retry** | Network errors and timeout errors automatically retry (default 2 times, initial delay 500ms, exponential backoff), parameter errors not retried                  | **v1.4.4** |
| 🔥 **Warmup Mechanism**          | `warmup()` pre-launches browser instance at service startup, eliminating first-call latency                                                                       | **v1.4.4** |
| 📊 **Performance Metrics**       | `getPerformanceStats()` exposes browser pool and screenshot cache statistics (hit rate/instance count/usage count)                                              | **v1.4.4** |
| 🐛 **Logic Bug Fixes**           | Fixed 9 logic bugs: screenshot selector mismatch, hardcoded dimensions, devModeCss injection risk, fidelityScore not clamped, dependency check order, etc.       | **v1.4.4** |
| 🧪 **Test Coverage**             | Added 35 test cases (BrowserPool + ScreenshotCache + performance optimization config), total 95 tests all passing                                                | **v1.4.4** |

### Performance Comparison (Before vs After v1.4.4)

| Scenario                    | Before    | After          | Improvement   |
| --------------------------- | --------- | -------------- | ------------- |
| Subsequent (same session)   | 5-8s      | 1-2s           | **3-4x**      |
| Repeated (cache hit)        | 5-8s      | <100ms         | **50x+**      |
| Network jitter recovery     | Fail      | Auto retry     | **Availability** |

### Performance Optimization Configuration (Optional, Backward Compatible)

```typescript
// Configure via BrowserFallbackService
const service = new BrowserFallbackService({
  navigationTimeout: 20000,    // Navigation timeout (ms)
  renderTimeout: 10000,        // Render wait timeout (ms)
  screenshotTimeout: 5000,     // Screenshot operation timeout (ms)
  waitStrategy: 'hybrid',      // Wait strategy: hybrid/conservative/aggressive
  maxRetries: 2,               // Max retry attempts
  retryBaseDelay: 500,         // Initial retry delay (ms)
  enableScreenshotCache: true, // Enable screenshot cache
  screenshotCacheTtl: 3600000, // Cache TTL (ms, default 1 hour)
  browserIdleTimeout: 60000,   // Browser idle timeout (ms, default 60s)
});
```

## 📜 Version History Summary

| Version | Theme                          | Highlights                                                                                                 |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| v1.4.12 | --update EBUSY Fallback Hardening + Windows robocopy Fix | Treat robocopy rc<8 as success; Windows `cp`→`copy /Y` for package.json; upgrade extracts latest tgz from npm pack then overwrites global dir, bypasses EBUSY rename locks caused by running editor processes |
| v1.4.11 | i18n Path Fix + Token Input Enhancement | Fix Token validation i18n path error (cli.errors.labels), getErrorInfo codes null-pointer, README QUICKSTART 404 links; add FIGMA_ACCESS_TOKEN env fallback + password→input graceful degradation |
| v1.4.10 | Version Unification + figd_ Token Auth Fix | Fix figd_ token auth (X-Figma-Token header), CLI/GUI version read from package.json, sync all docs version numbers |
| v1.4.9  | figd_ Token Auth Fix       | Fix figd_ token compatibility: must use X-Figma-Token header instead of Authorization header, token validation fully working |
| v1.4.8  | --update EBUSY + Docs           | --update auto-detects EBUSY, robocopy fallback, CLI docs (-v/--ver/--update), fix double icon, error detail display |
| v1.4.7  | Token Validation + i18n        | Token validation shows specific error reasons (HTTP 401/403/429), GUI error detail display, CLI error capture improvements, full i18n for error messages |
| v1.4.4  | Paywall Fallback + Performance | Browser fallback screenshot, visual approximation mode, fidelity scoring, performance optimization (pool/cache/tiered timeout) |
| v1.4.3  | Stability & Security Hardening  | GUI request body guard, circular reference detection, recursion depth protection, cache consistency         |
| v1.4.1  | Code Quality Optimization      | Zero any types, oxlint zero warnings, code style unification                                               |
| v1.4.0  | Major Update                   | XSS security, smart hierarchy fix, SVG inline rendering, animation detection, encrypted cache, scoring algorithm, H5 adaptation, token secure storage |
| v1.3.x  | Foundation                     | GUI wizard, i18n, accessibility, Flex fix, design system alignment, responsive inference, design lint      |

---

## ✨ Feature Highlights

| Feature                         | Description                                                                                                          | Version        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| 🖥️ **GUI Visual Config Wizard** | Browser graphical interface configuration, welcome page → language selection → Token config + real-time validation → editor detection → one-click install → framework preference → completion page, zero barriers for beginners | **v1.3.0**     |
| 🔗 **19 MCP tools**             | Full coverage: URL parsing → Token extraction → component generation → asset download → paywall fallback → fidelity verification | v1.4.4         |
| 🧠 **Framework-agnostic Structured Data** | Outputs id/name/role/type/size/layout/styles/text/asset/children JSON, supports Vue/Svelte/HTML/Angular/Solid and any framework | v1.1.0         |
| ⚛️ **React + Tailwind First-class Support** | Semantic tag selection + Tailwind mapping + cn() merging + TODO markers, one-click high-fidelity TSX generation | v1.3.2         |
| 🔧 **Flex Layout Auto-fix**     | Smart fix for icon deformation, text truncation, overflow and other Flex issues                                       | v1.3.2         |
| ♿ **Accessibility Enhancement** | Auto-adds semantic tags, alt, ARIA attributes                                                                          | v1.3.2         |
| 🎨 **Design System Alignment**   | Auto-matches color/spacing/font/border-radius/shadow variables                                                        | v1.3.2         |
| 📱 **Responsive Inference**      | Intelligently infers breakpoints, provides responsive prefix suggestions                                              | v1.3.2         |
| ✅ **Design Spec Pre-check**     | Checks design quality and provides fix suggestions before code generation                                            | v1.3.2         |
| 🧠 **Smart Hierarchy Simplification** | Auto-flattens redundant GROUP/FRAME, eliminates ~60% meaningless nested divs                                       | v1             |
| 📊 **Progressive Context**       | metadata overview (~4KB) → designContext details, avoids context explosion                                            | v1.2            |
| 🎯 **Multi-level Token Matching** | codeSyntax.WEB → exact hex → CIE76 color difference fuzzy → @theme extension suggestions                              | v1             |
| 🖼️ **Asset Auto Pipeline**       | Detects images/SVG → downloads to public/ → SVGO optimization → generates publicCdnUrl() references                   | v1.2            |
| 🧩 **SVG Sprite Generation**     | Batch icon merging into Sprite, supports CSS color control                                                            | v1.3.2         |
| 🌍 **i18n Internationalization** | Chinese/English bilingual support, `figma-dev lang switch` to toggle                                                   | v1.3.2         |
| 🔐 **Secure Token Storage**      | System keychain secure Token storage                                                                                  | v1.3.2         |
| 💻 **CLI Command Line**          | Supports script and CI/CD integration, usable without MCP, new gui/structured/lint/lang/token commands                | v1 (gui v1.3.0) |
| 🔄 **8+ Editor Support**          | Trae, VS Code, Cursor, Windsurf, Claude Desktop, Zed, Cline, Roo Code one-click install (GUI auto-detect)            | v1 (gui v1.3.0) |
| 🚀 **Zero-config Startup**        | Supports `npx -y figma-dev-tools --figma-api-key=xxx` direct run, no pre-install config needed                         | v1.2           |

---

## 🚀 Quick Start

> 📚 Want a condensed, version-synced walkthrough? See **[QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md)** (中文) / **[QUICKSTART.en-US.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md)** (English). The sections below cover the details.

### Option 0: GUI Visual Configuration (Beginner Recommended ⭐)

**No need to memorize any commands**, complete all configuration through the browser graphical interface:

```bash
# Launch GUI configuration panel directly
npx figma-dev-tools gui

# Or after global install
figma-dev gui
```

After launching, it will automatically open the browser (default port **54321**, auto-tries 54322/54323 if occupied), follow the guided steps:

1. **Welcome Page** - Learn about figma-dev-tools features
2. **Language Selection** - Chinese/English bilingual toggle
3. **Token Configuration** - Enter Figma Token, real-time validation
4. **Editor Detection** - Auto-detects 8+ installed editors, check and one-click install MCP config
5. **Framework Preference** - Choose commonly used framework (React/Vue/HTML)
6. **Completion Page** - Configuration success, provides usage tutorial links

> 💡 You can also launch GUI mode via the wizard command:
>
> ```bash
> figma-dev wizard --gui
> figma-dev init --gui
> ```

---

### Option 1: Zero-config npx Direct Run (Fastest)

No installation needed, start MCP server with one command:

```bash
# Run directly via npx, passing API Key
npx -y figma-dev-tools --figma-api-key=your-figma-token-here
```

Use in editor MCP configuration:

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

### Option 2: One-click Install (Recommended for Long-term Use)

```bash
# npm
npx figma-dev-tools install

# pnpm
pnpm dlx figma-dev-tools install

# yarn
yarn dlx figma-dev-tools install

# bun
bunx figma-dev-tools install
```

The install script will automatically:

- Detect installed AI editors (Trae/VS Code/Cursor/Windsurf/Claude Desktop/Zed/Cline/Roo Code, 8+)
- Auto-detect package manager (npm/pnpm/yarn/bun)
- Download/compile the tool
- Configure the corresponding editor's MCP settings (Zed uses mcp_servers field)
- Generate `.env.example` template

> 💡 **Easier way**: Run `figma-dev gui`
> Use the graphical interface to one-click detect and install editor configurations.

### Option 3: Project Dependency Install

```bash
# npm
npm install figma-dev-tools --save-dev

# pnpm
pnpm add figma-dev-tools -D

# yarn
yarn add figma-dev-tools --dev

# bun
bun add figma-dev-tools -d
```

### Option 4: Install from Local Source

```bash
# Clone or copy figma-dev-tools directory to project
cp -r figma-dev-tools/ your-project/tools/
cd your-project/tools/figma-dev-tools
npm install   # or pnpm install / yarn install / bun install
npm run build # or pnpm build / yarn build / bun run build
```

---

### 1. Get Figma Access Token

1. Log in to [Figma](https://www.figma.com/)
2. Click avatar in top right → **Settings** → **Account**
3. Find **Personal access tokens** → **Generate new token**
4. Enter a name, check **File content (Read only)** permission
5. Copy the generated Token (⚠️ only shown once)

> 💡 When using GUI configuration, simply paste the Token in the browser interface for automatic validation and secure storage.

### 2. Configure Token

**Method A: GUI Visual Configuration (Recommended v1.3.0+)**

```bash
figma-dev gui
```

Enter the Token in the browser interface, after real-time validation it will be auto-securely stored.

**Method B: Secure Storage (Recommended v1.3.2+)**

```bash
# Interactively save Token to system keychain
figma-dev token set

# Or directly via parameter
figma-dev token set -t figd_your_token_here
```

**Method C: Via Command Line Parameters**

```bash
npx figma-dev-tools --figma-api-key=your-figma-token-here
# or short parameter
npx figma-dev-tools -t your-figma-token-here
```

**Method D: Via .env File**

Create a `.env` file in the `figma-dev-tools/` directory:

```env
FIGMA_ACCESS_TOKEN=your-figma-token-here
```

**Method E: MCP Config env**

Add to editor MCP configuration:

```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path>/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

### 3. First Figma → Code Example

**React + Tailwind (Recommended, v1.4.0 enhanced):**

In AI editor (like Trae), just chat:

```
Help me use figma-dev-tools to restore this Figma design:
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032

Scene name: landing-page
```

The AI will automatically call the MCP tool to complete the full pipeline:

1. `figma_parse_url` parse URL
2. `figma_get_metadata` get high-level structure overview (~4KB)
3. `figma_get_design_context` get detailed context (hierarchy flattening + semantic annotation)
4. `figma_get_screenshot` get visual baseline screenshot
5. `figma_generate_jsx` one-click generate TSX code (with Flex fix, a11y enhancement, design system alignment, responsive inference)
6. `figma_download_assets` download image assets (SVGO auto-optimization)

**Other frameworks (Vue/Svelte/HTML, etc.):**

Use the `figma_get_structured_data` tool to get framework-agnostic JSON structure:

```
Help me use figma_get_structured_data to get the structured data for this Figma node, then generate a Vue component:
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032
```

### CLI Quick Start

```bash
# 🖥️ Launch GUI visual configuration panel (v1.3.0 new, beginner recommended)
npx figma-dev-tools gui

# View file info
npx figma-dev info "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# Design spec pre-check (v1.3.2 new)
npx figma-dev lint "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# Generate React component (enhanced)
npx figma-dev jsx "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --name HeroSection --scene landing-page

# Get framework-agnostic structured data (v1.1.0 new)
npx figma-dev structured "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --format json --output ./hero-structured.json

# Sync Design Tokens
npx figma-dev sync "https://www.figma.com/design/xxxxx/MyProject" \
  --format oklch --output ./src/styles

# Language settings (v1.3.2 new)
npx figma-dev lang switch  # Interactive Chinese/English toggle
npx figma-dev lang set zh-CN

# Token secure management (v1.3.2 new)
npx figma-dev token set     # Save Token to keychain
npx figma-dev token list    # List saved Tokens
```

---

## 🔧 MCP Tool Reference

**19 MCP tools** in total, arranged by usage flow:

| #   | Tool Name                   | Function                                                                            | Key Parameters                           | Version     |
| --- | --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- | ----------- |
| 1   | `figma_parse_url`           | Parse Figma URL, extract fileKey/nodeId                                             | `url`                                    | v1          |
| 2   | `figma_validate_token`      | Validate Figma Access Token                                                         | `accessToken`                            | v1          |
| 3   | `figma_get_file`            | Get basic file info (page list, component count)                                    | `fileKey` / `figmaUrl`                   | v1          |
| 4   | `figma_list_components`     | List Components/ComponentSets in file                                               | `fileKey`                                | v1.2         |
| 5   | `figma_get_metadata`        | **High-level structure overview** (~4KB, avoids context explosion)                  | `fileKey/nodeId/depth`                   | v1.2         |
| 6   | `figma_get_design_context`  | **Simplified design context** (hierarchy flatten + semantic annotation + asset list) | `fileKey/nodeId/maxDepth`               | v1.2         |
| 7   | `figma_get_screenshot`      | Get high-res node screenshot                                                       | `fileKey/nodeId/scale`                   | v1          |
| 8   | `figma_get_structured_data` | **⭐ Framework-agnostic structured data** (id/name/role/type/size/layout/styles/text/asset/children) | `fileKey/nodeId/maxDepth` | v1.1.0      |
| 9   | `figma_lint_design`         | **⭐ v1.3.2 new: Code restoration quality pre-check**                              | `fileKey/nodeId/maxDepth`                | **v1.3.2**  |
| 10  | `figma_generate_jsx`        | **⭐ One-click React/Vue+Tailwind TSX** (Flex fix/a11y/design system/responsive, v1.4.0 adds Vue 3/UnoCSS) | `fileKey/nodeId/componentName/sceneName` | v1.4.0 enhanced |
| 11  | `figma_generate_component`  | Basic component generation (legacy, recommend generate_jsx)                          | `fileKey/nodeId/styleFormat`             | v1          |
| 12  | `figma_download_assets`     | **Download assets to public/<scene>/ + SVGO optimization + publicCdnUrl**            | `fileKey/sceneName/assetNodeIds`         | v1.2         |
| 13  | `figma_create_icon_sprite`  | **⭐ v1.3.2 new: Generate SVG Sprite**                                               | `svgDir/outputPath/typesPath`            | **v1.3.2**  |
| 14  | `figma_extract_tokens`      | Extract design tokens (Variables+Styles)                                             | `fileKey/colorFormat`                    | v1          |
| 15  | `figma_generate_styles`     | Generate CSS Variables / Tailwind v4 @theme                                          | `tokens/outputFormat`                    | v1          |
| 16  | `figma_sync_to_project`     | Write tokens to project files (auto-backup)                                          | `tokens/outputDir/format`                | v1          |
| 17  | `figma_dev_fallback_status` | **⭐ v1.4.4 new: Query paywall fallback system status** (Playwright availability, config, fallback priority) | none | **v1.4.4**  |
| 18  | `figma_dev_fallback_capture`| **⭐ v1.4.4 new: Trigger browser fallback screenshot** (paywall screenshot + Dev Mode CSS + visual approximation mode) | `figmaUrl/devicePixelRatio/framework` | **v1.4.4**  |
| 19  | `figma_verify_fidelity`     | **⭐ v1.4.4 new: Fidelity verification** (pixel diff + diff heatmap + quantified score 0-100%) | `figmaUrl/codeContent/threshold` | **v1.4.4**  |

---

## 💻 CLI Command Reference

```bash
# After global install
figma-dev <command> [options]

# Or run via npx
npx figma-dev-tools <command> [options]
```

### Core Commands

| Command  | Description                                                | Common Options                                                              | Version     |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | ----------- |
| `figma-dev gui`              | 🖥️ Launch GUI visual configuration panel           | `--port <n>` specify port (default 54321)                                   | **v1.3.0** |
| `figma-dev install`          | One-click install MCP config to editors            | -                                                                           | v1          |
| `figma-dev uninstall`        | Uninstall installed MCP config                     | -                                                                           | v1          |
| `figma-dev validate <token>` | Validate Token                                     | -                                                                           | v1          |
| `figma-dev wizard`           | Interactive configuration wizard                   | `--gui` launch GUI mode                                                     | v1.3.0      |
| `figma-dev init`             | Initialize project configuration (interactive)     | `--gui` launch GUI mode                                                     | v1.3.0      |
| `figma-dev lang`             | **🌍 Language settings** (set/list/switch)         | `set <lang>` / `switch`                                                     | **v1.3.2** |
| `figma-dev token`            | **🔐 Token secure management** (set/get/list/delete/default) | `set -t <token>`                                                  | **v1.3.2** |
| `figma-dev info <url>`       | View Figma file info                               | -                                                                           | v1          |
| `figma-dev lint <url>`       | **✅ Design spec pre-check**                       | `--node <id>` `--depth <n>` `--format md/json` `--output <file>`           | **v1.3.2** |
| `figma-dev metadata <url>`   | Get metadata overview                              | `--node <id>` `--depth <n>`                                                 | v1.1.0      |
| `figma-dev structured <url>` | **Get framework-agnostic structured data**         | `--node <id>` `--depth <n>` `--format pretty/json` `--output <file>`        | v1.1.0      |
| `figma-dev jsx <url>`        | **Generate enhanced JSX/Vue components** (Flex/a11y/design system/responsive, v1.4.0 adds Vue 3/UnoCSS) | `--name <ComponentName>` `--scene <name>` `--depth <n>` `--framework react|vue` `--style tailwind|unocss` `--skip-lint` `--inline-svg` | v1.4.0      |
| `figma-dev component <url>`  | Generate basic component                           | `--name <name>` `--node <id>` `--js` `--style tailwind` `--no-children` `--output <dir>` | v1          |
| `figma-dev assets <url>`     | Download assets (SVGO optimized)                  | `--node <id>` `--nodes <id1,id2>` `--scene <name>` `--scale <n>` `--svg-format svg|png` `--project-root <dir>` | v1.1.0      |
| `figma-dev sync <url>`       | Sync Design Tokens to project                     | `--node <id>` `--format oklch` `--spacing-unit px|rem` `--prefix <name>` `--output-format all` `--file-name <name>` | v1          |
| `figma-dev screenshot <url>` | Get screenshot                                     | `--node <id>` `--format png` `--scale 2` `--download <dir>`                 | v1          |
| `figma-dev mcp`              | Start MCP server (stdio)                          | -                                                                           | v1          |
| `figma-dev tutorial`         | View tutorial docs (alias `help`, auto-opens browser) | `--no-browser`                                                           | v1.3.0      |
| `figma-dev cache`            | **📦 Cache management** (status/clear)             | `status` / `clear -f`                                                       | v1.4.0      |
| `figma-dev privacy`          | **🔒 Privacy statement** (data safety + .gitignore check) | -                                                              | v1.4.0      |
| `figma-dev -v` / `--ver`    | **📌 View current version**                        | -                                                                     | **v1.4.8** |
| `figma-dev --update`        | **🔄 Check and update to latest version** (auto-handles EBUSY file lock) | -                                                           | **v1.4.8** |

### Common Examples

```bash
# 🖥️ Launch GUI visual configuration panel (v1.3.0 new, beginner recommended)
figma-dev gui

# Specify port for GUI
figma-dev gui --port 8080

# Launch GUI mode via wizard command
figma-dev wizard --gui

# 📌 View current version (new in v1.4.8)
figma-dev -v

# 🔄 Check and update to latest version (new in v1.4.8, auto-handles EBUSY file lock)
figma-dev --update

# Design spec pre-check (v1.3.2 new)
figma-dev lint "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# One-click generate Hero section React component (enhanced)
figma-dev jsx "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --name HeroSection --scene landing-page --depth 8

# Get framework-agnostic structured data (JSON output to file)
figma-dev structured "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --depth 8 --format json --output ./hero-structured.json

# Batch download assets (auto SVGO optimization)
figma-dev assets "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --scene landing-page \
  --nodes "23-11032,23-11050,23-11080" \
  --scale 2

# Generate SVG Sprite (v1.3.2 new, requires icons downloaded first)
# Via MCP tool figma_create_icon_sprite

# Save Token to system keychain (v1.3.2 new)
figma-dev token set -t figd_your_token_here

# Switch to English interface (v1.3.2 new)
figma-dev lang set en-US
```

---

## 🖥️ Supported Editors (8+)

| Editor         | Auto-detect | One-click Install | Config Path                                                |
| -------------- | ----------- | ----------------- | ---------------------------------------------------------- |
| Trae           | ✅          | ✅                | `~/.trae/mcp_settings.json`                               |
| VS Code        | ✅          | ✅                | `~/Library/Application Support/Code/User/settings.json` (macOS) / `%APPDATA%\Code\User\settings.json` (Windows) |
| Cursor         | ✅          | ✅                | `~/.cursor/mcp.json`                                      |
| Windsurf       | ✅          | ✅                | `~/.codeium/windsurf/mcp_config.json`                      |
| Claude Desktop | ✅          | ✅                | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Zed            | ✅          | ✅                | `~/.config/zed/settings.json` (uses `mcp_servers` field)   |
| Cline          | ✅          | ✅                | VS Code settings                                          |
| Roo Code       | ✅          | ✅                | VS Code settings                                          |

### MCP Configuration Template

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

### Environment Variables (.env)

```env
# Required: Figma Personal Access Token
# Get from: https://www.figma.com/developers/api#access-tokens
FIGMA_ACCESS_TOKEN=figd_your_token_here

# Optional: Figma OAuth Token (for enterprise)
# FIGMA_OAUTH_TOKEN=

# Optional: Custom Figma API endpoint (enterprise proxy)
# FIGMA_API_BASE_URL=https://api.figma.com

# Optional: Default export scale (1-4, default 2)
# FIGMA_DEFAULT_SCALE=2

# Optional: Default color format (hex/rgb/oklch/hsl, default oklch)
# FIGMA_COLOR_FORMAT=oklch

# Optional: Asset output base directory (default public)
# ASSETS_OUTPUT_DIR=public

# Optional: Asset CDN prefix (default /)
# ASSETS_CDN_PREFIX=/

# v1.3.2 new: Default language (zh-CN/en-US)
FIGMA_DEV_LANG=zh-CN

# v1.3.0 new: GUI default port (default 54321)
# FIGMA_DEV_GUI_PORT=54321
```

### MCP Configuration Priority

```
CLI parameters > environment variables > .env file > default values
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (stdio)                        │
├─────────────────────────────────────────────────────────────┤
│  CLI Layer    │  GUI Layer    │  Service Layer  │  Tool Layer │
│                │               │                 │              │
│  figma-dev     │  Browser      │  figma-client   │  19 MCP     │
│  <command>     │  UI           │  node-processor │  tools      │
│                │               │  tailwind-      │              │
│                │               │  mapper         │              │
│                │               │  asset-         │              │
│                │               │  downloader     │              │
│                │               │  hierarchy-     │              │
│                │               │  fixer          │              │
│                │               │  🔒 cache        │              │
│                │               │  🔒 sanitizer    │              │
│                │               │  ♿ a11y         │              │
│                │               │  🧱 fallback    │              │
│                │               │  🤖 vlm         │              │
│                │               │  📏 verify      │              │
│                │               │  🚀 pool        │              │
│                │               │  💾 cache       │              │
├─────────────────────────────────────────────────────────────┤
│                    Figma REST API                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Project Structure

```
figma-dev-tools/
├── bin/                    # CLI entry point
├── dist/                   # Compiled output
├── docs/                   # Documentation
├── scripts/                # Build scripts
├── src/
│   ├── cli/                # CLI command implementations
│   ├── gui/                # GUI server
│   ├── i18n/               # Internationalization
│   ├── services/           # Core services
│   │   ├── figma-client.ts        # Figma REST API client (with local encrypted cache)
│   │   ├── node-processor.ts      # Node tree processing + semantic annotation
│   │   ├── tailwind-mapper.ts     # Tailwind class mapping
│   │   ├── asset-downloader.ts    # Asset download pipeline
│   │   ├── hierarchy-fixer.ts     # 🗂️ v1.4.0: Smart hierarchy fix
│   │   ├── svg-inline-renderer.ts # 🎨 v1.4.0: SVG inline rendering (SVGO + LRU cache)
│   │   ├── cache.ts               # ⚡ v1.4.0: AES-256-GCM local encrypted cache (LRU+TTL)
│   │   ├── sanitizer.ts           # 🔒 v1.4.0: XSS protection
│   │   ├── a11y-enhancer.ts       # ♿ v1.3.2: Accessibility enhancement
│   │   ├── browser-fallback.ts    # 🧱 v1.4.4: Browser fallback service
│   │   ├── browser-pool.ts        # 🚀 v1.4.4: Browser instance pool (performance)
│   │   ├── screenshot-cache.ts    # 💾 v1.4.4: Screenshot cache (LRU+TTL)
│   │   ├── visual-approximation.ts# 🤖 v1.4.4: Visual approximation mode
│   │   └── fidelity-verify.ts     # 📏 v1.4.4: Pixel diff fidelity verification
│   ├── tools/             # MCP tool implementations
│   ├── types/              # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── index.ts           # MCP server entry
├── test/                  # Test files (95 tests)
├── package.json
├── tsconfig.json
├── README.md              # You are here (Chinese)
└── README.en-US.md        # English version
```

---

## ❓ FAQ / Troubleshooting

### Q: I'm a beginner, how do I configure for the first time?

Run `npx figma-dev-tools gui` to launch the GUI configuration panel, then follow these steps:

1. Select Chinese language
2. Paste your Figma Token (auto-validated)
3. Check the editors you want to configure (auto-detects installed ones)
4. Click one-click install, done!

### Q: How to launch GUI configuration interface?

```bash
# Method 1: Direct gui command (recommended)
figma-dev gui
# or npx figma-dev-tools gui

# Method 2: Wizard command with --gui flag
figma-dev wizard --gui

# Method 3: Init command with --gui flag
figma-dev init --gui
```

### Q: Can the GUI use a custom port?

```bash
# Specify port
figma-dev gui --port 8080

# Or via environment variable
FIGMA_DEV_GUI_PORT=8080 figma-dev gui
```

### Q: MCP server won't start?

1. Check if Node.js version ≥ 18
2. Check if Token is configured correctly
3. Check if the port is occupied
4. View detailed logs: `figma-dev info --verbose`

### Q: API returns 401 Unauthorized?

1. Check if Token has expired
2. Check if Token has **File content (Read only)** permission
3. Re-generate Token: https://www.figma.com/developers/api#access-tokens

### Q: Generated icons become oval/deformed?

This is a classic Flex issue. v1.3.2+ automatically fixes:
- Adds `flex-shrink: 0` to prevent compression
- Adds `align-items: center` to center
- Adds explicit width/height

If still problematic, manually add `flex-shrink: 0` to the icon.

### Q: I'm using Vue/Svelte/other frameworks, not React?

Use the `figma_get_structured_data` tool to get framework-agnostic JSON data, then manually convert to Vue/Svelte/HTML code.

### Q: Generated component colors/spacing don't match the design?

1. Run `figma_lint_design` to check design quality
2. Run `figma_extract_tokens` to extract design tokens
3. Run `figma_sync_to_project` to sync to project
4. Use `figma_generate_jsx` to regenerate the component

### Q: Generated code has many redundant nested divs?

Enable smart hierarchy simplification, which automatically:
- Flattens redundant GROUP/FRAME
- Removes meaningless wrapper layers
- Reduces ~60% of div nesting

### Q: Image assets not automatically downloaded?

Use the `figma_download_assets` tool, which automatically:
- Detects image/SVG nodes
- Downloads to `public/portal/<scene>/` directory
- SVGO optimizes SVGs
- Generates `publicCdnUrl()` references

### Q: How to make generated code support responsive?

v1.3.2+ automatically infers breakpoints based on design dimensions and provides sm/md/lg/xl responsive prefix suggestions.

### Q: Generated code lacks accessibility attributes?

v1.3.2+ automatically adds:
- Semantic HTML tags (h1-h6, button, nav, etc.)
- alt text for images
- ARIA attributes
- Keyboard navigation support

### Q: API request rate limit?

- Figma API has rate limits (per second/per hour)
- v1.4.0+ has AES-256-GCM encrypted cache, reducing repeated requests
- v1.4.3+ optimized Watch mode to reduce duplicate API calls
- v1.4.4+ has screenshot cache, reducing repeat screenshot requests

### Q: Which frontend frameworks are supported?

- **React**: First-class support, one-click TSX generation
- **Vue**: Use `figma_get_structured_data` to get JSON, then convert
- **Svelte**: Same as Vue
- **HTML**: Same as Vue
- **Angular/Solid**: Same as Vue

### Q: Zed editor configuration not taking effect?

Zed uses the `mcp_servers` field instead of `mcpServers`, the install script handles this automatically. For manual config:

```json
{
  "mcp_servers": {
    "figma-dev-tools": {
      "command": "npx",
      "args": ["-y", "figma-dev-tools", "--figma-api-key=figd_your_token_here"]
    }
  }
}
```

### Q: How to switch interface language?

```bash
# CLI interactive switch
figma-dev lang switch

# Direct setting
figma-dev lang set zh-CN  # Chinese
figma-dev lang set en-US  # English
```

Or in the GUI configuration panel, select language.

### Q: How to save Token securely?

```bash
# Direct save
figma-dev token set -t figd_your_token_here

# List saved Tokens
figma-dev token list

# View Token (masked display)
figma-dev token get

# Set default Token
figma-dev token default work
```

Token is saved in system secure storage:

- macOS: Keychain
- Windows: Credential Manager
- Linux: libsecret (falls back to encrypted file if unavailable)

---

## 📖 Design Guidelines

See **[FIGMA-DESIGN-GUIDELINES.md](./FIGMA-DESIGN-GUIDELINES.md)**, a complete Figma design spec guide for designers and AI, including:

- Auto Layout usage guidelines
- Layer naming conventions
- 4px/8px grid system
- Component reuse suggestions
- Accessibility design requirements
- Design-to-code best practices

It's recommended to run `figma_lint_design` to check design quality before generating code.

---

## 🎯 Comparison with Other Solutions

> The comparison below is based on publicly available information from 2025-2026 and reflects the capability differences between figma-dev-tools v1.4.4 and each solution. It does not represent the full capabilities of the others. "TBC" indicates that public information does not clearly state the feature.

### vs Commercial SaaS Solutions

| Dimension                  | figma-dev-tools v1.4.4              | Builder.io              | Anima                | Locofy                 | Seal (NetEase D2C)      |
| -------------------------- | ----------------------------------- | ----------------------- | -------------------- | ---------------------- | ---------------------- |
| **Positioning**            | Open-source MCP toolchain           | Commercial SaaS + AI    | Commercial SaaS      | Commercial SaaS        | Enterprise tool / Figma plugin |
| **Price**                  | **Free & Open Source** (MIT)        | Freemium (Pro $24/mo+)  | Freemium ($20/mo+)   | Freemium ($29/mo+)     | Free (registration required) |
| **MCP Protocol**           | ✅                                  | ✅                      | ✅                   | ✅                     | ❌                     |
| **GUI Visual Configuration** | ✅ v1.3.0 (browser GUI)           | ✅ (Fusion canvas)      | ✅ (AI Playground)   | ✅ (Figma plugin)      | ✅ (Figma plugin)      |
| **React Code Generation**  | ✅ TSX + Tailwind                   | ✅                      | ✅                   | ✅                     | ✅                     |
| **Vue Code Generation**    | ✅ v1.4.0 (Vue 3 SFC + UnoCSS)      | ✅                      | ✅                   | ✅                     | ✅                     |
| **Framework-agnostic Data** | ✅ v1.1.0 (JSON output)            | ❌                      | ❌                   | ❌                     | ❌                     |
| **Design Tokens Extraction** | ✅ Variables + Styles              | ✅                      | TBC                  | ✅                     | TBC                    |
| **Flex Layout Auto-fix**   | ✅ v1.3.2 (icon deformation/text truncation) | Partial (auto-responsive) | ✅            | ✅                     | ✅ (auto-layout restore) |
| **Accessibility (a11y)**   | ✅ v1.3.2 (semantic tags/alt/ARIA)  | ✅ (Review agents)      | TBC                  | ✅ (Agent Mode)        | TBC                    |
| **Asset Auto-download**    | ✅ publicCdnUrl + SVGO              | ✅                      | ✅                   | ✅                     | TBC                    |
| **Fidelity Verification (pixel diff)** | ✅ v1.4.4 (pixelmatch + heatmap) | ❌                | ❌                   | TBC ("pixel-perfect" claim) | Partial (design check) |
| **Paywall Fallback (screenshot)** | ✅ v1.4.4 (Playwright + visual approximation) | ❌          | ❌                   | ❌                     | ❌                     |
| **Multi-editor Integration** | ✅ 8+ (GUI auto-detect one-click install) | ✅ (VS Code/Cursor) | ✅ (Frontier extension) | ✅ (Cursor/Windsurf etc.) | ❌            |
| **CLI**                    | ✅ 20+ commands                     | ✅ (Visual Copilot CLI) | TBC                  | TBC                    | ❌                     |
| **i18n**                   | ✅ v1.3.2 (Chinese/English bilingual) | ✅                    | TBC                  | ✅ (Agent Mode commands) | TBC                  |
| **Token Secure Storage**   | ✅ v1.3.2 (system keychain)         | ✅                      | TBC                  | TBC                    | TBC                    |

### vs Open Source / Official Tools

| Dimension                  | figma-dev-tools v1.4.4              | @figma/code-connect           | Framelink Figma MCP            | figma-mcp (Community) | Design Lint AI            |
| -------------------------- | ----------------------------------- | ----------------------------- | ------------------------------ | --------------------- | ------------------------- |
| **Positioning**            | Open-source MCP toolchain           | Official Figma component mapping | Open-source MCP (8k+ stars)  | Open-source MCP (multiple projects) | Figma plugin    |
| **Price**                  | **Free & Open Source** (MIT)        | Free (requires Dev/Full seat) | Free & Open Source (MIT)       | Free & Open Source    | Freemium (Pro $19/mo+)   |
| **MCP Protocol**           | ✅                                  | ✅ (integrates with official MCP) | ✅                          | ✅                    | ❌                        |
| **GUI Visual Configuration** | ✅ v1.3.0                         | ✅ (Code Connect UI beta)     | ❌ (config-file driven)        | ❌                    | ✅ (Figma plugin)         |
| **Code Generation**        | ✅ one-click TSX/Vue                | ❌ (component mapping only, not D2C) | ❌ (data only, AI generates) | ❌ (data only)        | N/A (not a code-gen tool) |
| **Design Tokens Extraction** | ✅                                | ✅ (variables + code syntax)  | ❌                             | ❌                    | ✅ (Token validation)     |
| **Flex Layout Auto-fix**   | ✅ v1.3.2                           | ❌                             | ❌                             | Partial (Auto-Layout config) | ❌                |
| **Accessibility (a11y)**   | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ✅ (WCAG checks)          |
| **Asset Auto-download**    | ✅                                  | ❌                             | ✅ (download_figma_images)     | ✅                    | ❌                        |
| **Fidelity Verification (pixel diff)** | ✅ v1.4.4                  | ❌                             | ❌                             | ❌                    | ❌                        |
| **Paywall Fallback (screenshot)** | ✅ v1.4.4                      | N/A (official feature, no paywall) | ❌                        | ❌                    | ❌                        |
| **Multi-editor Integration** | ✅ 8+ (GUI auto-detect)             | ✅ (VS Code/Cursor/Android Studio etc.) | ✅ (all MCP clients)    | ✅ (all MCP clients)  | ❌                        |
| **CLI**                    | ✅ 20+ commands                     | ✅ (`figma connect` CLI)      | ✅ (npx startup)               | ✅                    | ❌ (Team API)            |
| **i18n**                   | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ❌                        |
| **SVG Sprite Generation**  | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ❌                        |

### Differentiated Advantages

- **Paywall Fallback**: figma-dev-tools v1.4.4's exclusive `BrowserFallbackService` — when the Figma REST API fails due to paywall, it automatically launches Playwright to capture a screenshot as a fallback. No competitor offers a similar mechanism.
- **Fidelity Verification Loop**: `figma_verify_fidelity` provides pixel diff + diff heatmap + quantified score (0-100%). Other tools mostly stop at "pixel-perfect" marketing claims without automated verification.
- **Framework-agnostic Structured Data**: `figma_get_structured_data` outputs standard JSON supporting any framework, while commercial SaaS solutions mostly lock into specific frameworks.
- **Open Source + Free + Full-featured**: MIT license, no paid seat required to use all 19 MCP tools.

---

## 📜 License

MIT © figma-dev-tools contributors

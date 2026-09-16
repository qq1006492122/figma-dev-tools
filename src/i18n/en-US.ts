export const enUS = {
  common: {
    yes: 'Yes',
    no: 'No',
    confirm: 'Confirm',
    cancel: 'Cancel',
    success: 'Success',
    failed: 'Failed',
    cancelled: 'Cancelled',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    loading: 'Loading',
    processing: 'Processing',
    done: 'Done',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    create: 'Create',
    search: 'Search',
    select: 'Select',
    refresh: 'Refresh',
    retry: 'Retry',
    exit: 'Exit',
    continue: 'Continue',
    version: 'Version',
    help: 'Help',
    docs: 'Docs',
    tutorial: 'Tutorial',
    reportIssue: 'Report Issue',
  },

  config: {
    language: 'Language',
    selectLanguage: 'Please select language',
    languageSelect: 'Please select language',
    languageZhCN: '简体中文',
    languageEnUS: 'English',
    languageSaved: 'Language setting saved',
    configDir: 'Config directory',
    configFile: 'Config file',
    configCreated: 'Config file created',
    configUpdated: 'Config updated',
    defaultToken: 'Default Token',
    outputDir: 'Output directory',
    framework: 'Framework',
    styleFormat: 'Style format',
    typescript: 'TypeScript',
    colorFormat: 'Color format',
    spacingUnit: 'Spacing unit',
    importAlias: 'Import alias',
  },

  cli: {
    name: 'figma-dev',
    description: 'Figma Dev Tools - Bridge between Figma designs and code',
    version: (v: string) => `v${v}`,
    globalOptions: 'Global Options',
    options: {
      token: 'Figma Access Token',
      output: 'Output directory',
      noBackup: 'Do not create backup files',
      lang: 'Display language (zh-CN/en-US)',
      ver: 'Show version number',
      update: 'Check and update to the latest version',
    },

    completion: {
      title: 'Shell Autocompletion',
      install: 'Install completion script (run once)',
      afterInstall: 'Restart terminal after installation to use Tab autocompletion.',
      description: 'Generate shell autocompletion script',
    },

    // v1.4.18 T6: --help example sections for every command (zh/en parity)
    helpExamples: {
      root: `Examples:
  $ figma-dev wizard                        # Interactive first-time setup
  $ figma-dev sync "https://figma.com/design/xxx" -o ./src/styles
  $ figma-dev jsx <design-url> --node 1:2 --style tailwind
  $ figma-dev -l zh-CN --help               # Show help in Chinese for this run`,
      lang: `Examples:
  $ figma-dev lang set en-US                # Persist English as the language
  $ figma-dev lang list                     # List all available languages
  $ figma-dev lang switch                   # Pick a language interactively`,
      langSet: `Examples:
  $ figma-dev lang set en-US
  $ figma-dev lang set zh-CN`,
      langList: `Examples:
  $ figma-dev lang list
  $ figma-dev lang ls                       # Alias of list`,
      langSwitch: `Examples:
  $ figma-dev lang switch                   # Arrow keys to pick, Enter to confirm`,
      validate: `Examples:
  $ figma-dev validate                      # Validate the saved default token
  $ figma-dev validate -t figd_xxxxx        # Validate a specific token`,
      token: `Examples:
  $ figma-dev token set personal -t figd_xxxxx
  $ figma-dev token list
  $ figma-dev token default personal`,
      tokenSet: `Examples:
  $ figma-dev token set                     # Interactive entry (default name)
  $ figma-dev token set work -t figd_xxxxx -n "Work account"
  $ figma-dev token set ci --token $FIGMA_ACCESS_TOKEN`,
      tokenGet: `Examples:
  $ figma-dev token get
  $ figma-dev token get work                # Show a named token (masked)`,
      tokenList: `Examples:
  $ figma-dev token list                    # List all saved tokens`,
      tokenDelete: `Examples:
  $ figma-dev token delete work
  $ figma-dev token delete ci --force       # Skip confirmation`,
      tokenDefault: `Examples:
  $ figma-dev token default personal
  $ figma-dev token default work`,
      info: `Examples:
  $ figma-dev info "https://www.figma.com/design/abc/MyApp"
  $ figma-dev info abc:def --node 1:2`,
      sync: `Examples:
  $ figma-dev sync <design-url> -o ./src/styles/figma
  $ figma-dev sync <fileKey> --output-format dtcg
  $ figma-dev sync <fileKey> --format hex --spacing-unit rem --prefix portal`,
      component: `Examples:
  $ figma-dev component <design-url> --node 1:2 -o ./src/components
  $ figma-dev component <url> --typescript --style css-modules`,
      screenshot: `Examples:
  $ figma-dev screenshot <design-url> --node 1:2 -o shot.png
  $ figma-dev screenshot <url> --scale 2 --format jpg`,
      metadata: `Examples:
  $ figma-dev metadata <design-url>
  $ figma-dev metadata <fileKey> --node 1:2`,
      lint: `Examples:
  $ figma-dev lint <design-url>
  $ figma-dev lint <fileKey> --node 1:2 --json`,
      structured: `Examples:
  $ figma-dev structured <design-url>
  $ figma-dev structured <fileKey> --node 1:2 --depth 3`,
      jsx: `Examples:
  $ figma-dev jsx <design-url> --node 1:2 -o Button.tsx
  $ figma-dev jsx <url> --style unocss --unocss-attributify
  $ figma-dev jsx <url> --style css-modules --framework vue --typescript`,
      assets: `Examples:
  $ figma-dev assets <design-url> -o ./public/assets
  $ figma-dev assets <fileKey> --node 1:2 --format svg --bundler vite`,
      tutorial: `Examples:
  $ figma-dev tutorial                      # Open the getting-started guide`,
      mcp: `Examples:
  $ figma-dev mcp                           # Start MCP server over stdio (IDE/Agent)
  $ figma-dev mcp --help`,
      wizard: `Examples:
  $ figma-dev wizard                        # Recommended for first-time use`,
      gui: `Examples:
  $ figma-dev gui                           # Launch the visual setup UI
  $ figma-dev gui --port 5180`,
      cache: `Examples:
  $ figma-dev cache status
  $ figma-dev cache clear --force`,
      cacheStatus: `Examples:
  $ figma-dev cache status
  $ figma-dev cache stats                   # Alias of status`,
      cacheClear: `Examples:
  $ figma-dev cache clear                   # Ask before clearing
  $ figma-dev cache clear --force           # Clear without confirmation`,
      privacy: `Examples:
  $ figma-dev privacy                       # Privacy pledge and .gitignore advice`,
    },

    commands: {
      cache: {
        description: 'Manage local cache',
        status: 'Show cache statistics',
        clear: 'Clear all cached data',
        force: 'Force clear without confirmation',
        privacy: 'Show the privacy pledge',
      },
      wizard: {
        description: 'Interactive setup wizard (recommended for first-time use)',
        title: '🎨 Figma Dev Tools Setup Wizard',
        subtitle: 'This will guide you through Token configuration and project initialization',
        existingToken: 'Detected saved Token, would you like to use it',
        selectToken: 'Select Token to use',
        howToGetToken: 'Get your Figma Access Token',
        tokenStep1: 'Open https://www.figma.com/developers/api#access-tokens',
        tokenStep2: 'After logging in, click "Generate new token"',
        tokenStep3: 'Check "File content" (Read only) permission',
        openTokenPage: 'Would you like to open the Token page in your browser now',
        tokenName: 'Give this Token a name (for multi-account switching)',
        savingToken: 'Saving and validating Token...',
        tokenValidateError: 'Token validation failed, please check network connection and Token',
        selectFramework: 'Select your primary framework',
        recommended: 'recommended',
        comingSoon: 'coming soon',
        stayTuned: 'stay tuned',
        noFramework: 'no framework',
        outputDir: 'Design Tokens output directory',
        creatingConfig: 'Creating config file...',
        configComplete: '✅ Config file created!',
        setupComplete: 'Setup complete! Start using it now',
        commonCommands: 'Common commands',
        cmdValidate: 'Validate Token status',
        cmdSync: 'Sync design Tokens to CSS/Tailwind',
        cmdJsx: 'Generate React+Tailwind TSX code in one click',
        cmdAssets: 'Download design assets',
        cmdMetadata: 'View design overview',
        cmdLint: 'Code Restore Quality Pre-check',
        cmdLang: 'Switch display language',
        cmdTutorial: 'View tutorial documentation',
        mcpHint: '💡 In AI editors (Trae/Cursor/Claude) you can use MCP tools directly',
      },

      lang: {
        description: 'Switch display language',
        set: 'Set display language',
        invalid: 'Unsupported language, supported languages are',
        success: 'Language switched to',
        list: 'List all supported languages',
        current: 'Current language',
        currentMarker: 'current',
        switchHint: 'Use figma-dev lang set <language> or figma-dev lang switch to change language',
        switch: 'Interactively switch language',
        selectPrompt: 'Please select language',
      },

      validate: {
        description: 'Validate if Figma Access Token is valid',
        validating: 'Validating Figma Token...',
        success: '✅ Token validated successfully!',
        failed: '❌ Token validation failed',
      },

      token: {
        description: 'Securely manage Figma Access Token',
        set: 'Save Token to system keychain/encrypted storage (default name: default)',
        tokenOption: 'Provide Token directly (no interactive input)',
        note: 'Token note/description',
        secureStorage: '🔐 Figma Access Token Secure Storage',
        storageLocation: 'Token will be encrypted and stored in',
        linuxFallback: 'if unavailable, use AES-256-GCM encrypted file',
        privacyNotice: '⚠️  Token is stored locally only, never uploaded to any server',
        pastePrompt: 'Please paste your Figma Access Token (hidden while typing, Ctrl+Shift+V or Right-click to paste)',
        pastePromptFallback: 'Please input/paste your Figma Access Token (shown as plaintext - Windows terminal compatibility fallback)',
        pasteHint: '💡 If pasting fails, use: figma-dev token set -t <your_token> or set env var FIGMA_ACCESS_TOKEN',
        envFallbackUsed: '💡 Read Token from environment variable FIGMA_ACCESS_TOKEN',
        invalidLength: 'Token length is incorrect (at least 20 characters)',
        invalidPrefix: 'Token should start with figd_',
        saving: 'Securely saving Token...',
        saved: '✅ Token saved securely',
        keychain: 'system keychain',
        encryptedFile: 'AES encrypted file',
        validating: 'Validating Token...',
        validateSuccess: '✅ Token validated successfully! You can start using figma-dev now',
        validateFailed: '⚠️  Token saved but validation failed, please check if Token is correct',
        get: 'View saved Token (views default by default)',
        showFull: 'Show full Token (masked by default)',
        notFound: 'Token named',
        savedTokens: 'Saved Tokens',
        noTokens: 'No Tokens saved yet, run figma-dev token set',
        list: 'List all saved Tokens',
        runSet: 'Run figma-dev token set to start configuration',
        savedTokensList: '🔐 Saved Tokens',
        default: 'default',
        delete: 'Delete specified Token',
        forceDelete: 'Skip confirmation and delete directly',
        confirmDelete: 'Are you sure you want to delete Token',
        deleted: '✅ Token deleted',
        notExist: 'Token does not exist',
        setDefault: 'Set default Token to use',
        defaultSet: '✅ Default Token set to',
      },

      info: {
        description: 'View Figma file information',
        fetching: 'Fetching file info',
        lastModified: 'Last modified',
        version: 'Version',
        type: 'Type',
        pages: 'Pages',
        children: 'children',
        stats: 'Stats',
        components: 'Components',
        componentSets: 'Component sets',
        styles: 'Styles',
        failed: 'Failed to get file info',
      },

      lint: {
        description: 'Check Figma design code restore quality (pre-check before code generation)',
        checking: 'Running code restore quality pre-check...',
        node: 'Specify node ID',
        depth: 'Check depth',
        getContext: 'Getting design context...',
        running: 'Running quality pre-check...',
        completed: '✅ Code restore quality pre-check complete',
        score: 'Code Restore Quality Score',
        issues: 'Issues',
        errors: 'Errors',
        warnings: 'Warnings',
        infos: 'Info',
        scoreExcellent: 'Excellent',
        scoreGood: 'Good',
        scorePass: 'Fair',
        scorePoor: 'Poor',
        scoreBad: 'Critical',
        noNodeId: 'Error: Please provide node ID, or check entire file',
        failed: 'Code restore quality pre-check failed',
        reportTitle: 'Code Restore Quality Pre-check Report',
        category: {
          layout: 'Layout',
          naming: 'Naming',
          spacing: 'Spacing/Sizing',
          component: 'Components',
          color: 'Colors',
          typography: 'Typography',
          accessibility: 'Accessibility',
          structure: 'Structure',
        },
        summary: (score: number, total: number, errors: number, warnings: number, infos: number) =>
          `Code restore quality pre-check complete: Score ${score}/100, checked ${total} nodes, found ${errors} critical issues, ${warnings} warnings, ${infos} suggestions`,
        hint: '💡 Score below 80. Recommend fixing code restore quality issues before generating code for best results',
      },

      sync: {
        description: 'Sync design Tokens to local project',
        node: 'Specify node ID',
        format: 'Color format (hex/rgb/oklch/hsl)',
        spacingUnit: 'Spacing unit (px/rem)',
        prefix: 'Token name prefix',
        outputFormat: 'Output format (css/tailwind/json/dtcg/all)',
        fileName: 'Output file name',
        syncing: 'Syncing design Tokens from Figma...',
        file: 'File',
        completed: '✅ Tokens sync complete',
        stats: 'Extraction stats',
        colors: 'Colors',
        spacing: 'Spacing',
        radius: 'Radius',
        shadows: 'Shadows',
        typography: 'Typography',
        outputFiles: 'Output files',
        importHint: '💡 Tip: Import the generated CSS file in globals.css',
        failed: 'Sync failed',
      },

      component: {
        description: 'Generate React component code from Figma node',
        name: 'Component name',
        js: 'Generate JavaScript code (default TypeScript)',
        style: 'Style format (tailwind/css-modules/inline-styles, default tailwind)',
        noChildren: 'Do not include children',
        output: 'Output directory',
        noNodeId: 'Error: Please provide node ID (?node-id= parameter in Figma URL)',
        generating: 'Generating component...',
        completed: '✅ Component generated',
        code: 'Component code',
        failed: 'Component generation failed',
      },

      screenshot: {
        description: 'Get node screenshot',
        format: 'Image format (png/jpg/svg)',
        scale: 'Scale (1-4)',
        download: 'Download to specified directory',
        noNodeId: 'Error: Please provide node ID',
        fetching: 'Getting screenshot...',
        failed: 'Failed to get screenshot',
        url: '✅ Screenshot URL',
        downloading: 'Downloading screenshot...',
        saved: '✅ Saved to',
      },

      metadata: {
        description: 'Get high-level structural overview of design node (avoids context explosion)',
        depth: 'Overview depth',
        fetching: 'Getting design overview...',
        size: 'Size',
        directChildren: 'Direct children',
        colorsUsed: 'Colors used',
        textNodes: 'Text nodes',
        images: 'Images',
        sections: 'Child sections',
        nameHeader: 'Name',
        typeHeader: 'Type',
        semanticHeader: 'Semantic',
        sizeHeader: 'Size',
        childrenHeader: 'Children',
        componentHeader: 'Component',
        top15: 'first 15',
        totalPrefix: '...',
        totalSuffix: 'total',
        failed: 'Failed to get metadata',
      },

      structured: {
        description: 'Get framework-agnostic structured design data (for Vue/Svelte/HTML etc.)',
        depth: 'Max node tree depth',
        format: 'Output format (pretty/json)',
        output: 'Output to file (default to console)',
        noNodeId: 'Error: Please provide node ID (?node-id= parameter or --node option)',
        fetching: 'Getting framework-agnostic structured data...',
        getContext: 'Getting design context...',
        saved: '✅ Structured data saved',
        completed: '✅ Complete',
        nodeCount: 'Nodes',
        assets: 'Assets',
        text: 'Texts',
        failed: 'Failed to get structured data',
      },

      jsx: {
        description: 'Generate React/Vue + Tailwind/UnoCSS component code in one click (v1.4.0 enhanced)',
        scene: 'Scene name (for public/portal/<scene>/ asset path)',
        framework: 'Target framework: react (default) | vue',
        bundler:
          'Target project bundler (v1.4.18): auto (default, auto-detect) | vite | webpack | nextjs | remix | none (legacy publicCdnUrl)',
        skipLint: 'Skip design lint warnings',
        noNodeId: 'Error: Please provide node ID (?node-id= parameter or --node option)',
        generating: 'Generating component code (v1.4.0 enhanced pipeline)...',
        getContext: 'Getting simplified design context...',
        generateCode: 'Generating component code...',
        completed: '✅ Complete',
        themeExtensions: '⚠️  Tokens needing @theme extension',
        assetsNeeded: '🖼️  Assets to download',
        downloadHint: 'Run the following command to download assets',
        reusableComponents: '🧩 Check reusable components',
        componentLibraryDetected: '📦 Component library detected',
        componentSuggestions: '💡 Component mapping suggestions',
        usedTimes: 'used',
        times: 'times',
        codeSaved: '✅ Code written to',
        // v1.4.18 T8: UnoCSS attributify mode toggle and config hints
        attributify:
          'UnoCSS attributify mode (v1.4.18, use with --style unocss only; emits utilities as element attributes; off by default = wind mode)',
        attributifyIgnored:
          '--attributify only takes effect with --style unocss; ignored for this run (wind utilities are used).',
        styleHintsSuffix:
          'setup hints (apply manually as needed; the tool never modifies your project files)',
        moduleCssSaved: 'Co-located CSS Modules file saved',
        moduleCssPreview: 'Co-located CSS Modules file (save it next to the component)',
        failed: 'Component generation failed',
        lintWarning: '⚠️  Code restore quality notice',
      },

      assets: {
        description:
          'Download design assets into the project asset directory (since v1.4.18 placed by bundler: public/ or src/assets/)',
        node: 'Node ID (can specify multiple, comma-separated)',
        nodes: 'Node ID list (comma-separated)',
        scene: 'Scene name (e.g. health, edu, ai-innovation-class)',
        projectRoot: 'Project root (auto-detected)',
        svgFormat: 'Vector export format (svg/png)',
        bundler:
          'Target project bundler (v1.4.18): auto (default, auto-detect) | vite | webpack | nextjs | remix | none (legacy publicCdnUrl)',
        noNodeId: 'Error: Please provide node ID (--node or --nodes)',
        downloading: 'Downloading design assets...',
        sceneName: 'Scene',
        nodeCount: 'Nodes',
        projectRootDetected: 'Project root auto-detected',
        foundAssets: 'Found',
        assets: 'assets, starting download...',
        noAssets: 'No downloadable assets found (please confirm nodeId corresponds to image/icon nodes)',
        completed: '✅ Asset download complete',
        success: 'Success',
        failed: 'Asset download failed',
      },

      mcp: {
        description: 'Start MCP server (stdio mode)',
      },

      tutorial: {
        description: 'Open Figma Dev Tools tutorial and documentation',
        noBrowser: 'Only show links, do not open browser',
        title: '📚 Figma Dev Tools Learning Resources',
        docs: '📖 Official Docs/Gitee Repository',
        getToken: '🔑 Get Figma Access Token',
        quickStart: '💡 Quick Start',
        step1: 'Interactive setup wizard',
        step2: 'Validate Token',
        step3: 'Generate component code',
        openingBrowser: 'Opening browser...',
      },
    },

    errors: {
      noToken: {
        title: '❌ Figma Access Token not configured',
        howTo: 'Please configure via one of the following methods:',
        recommended: 'Recommended: ',
        wizard: 'figma-dev wizard    Interactive setup wizard',
        quick: 'Quick: ',
        tokenSet: 'figma-dev token set Securely save Token',
        temp: 'Temporary: ',
        tempDesc: '--token <token>      Command line arg (not recommended)',
        env: 'Env: ',
        envDesc: 'FIGMA_ACCESS_TOKEN   Environment variable',
        getToken: '🔑 Get Token: https://www.figma.com/developers/api#access-tokens',
      },
      invalidUrl: 'Error: Unable to parse Figma URL',
      codes: {
        TOKEN_INVALID: {
          code: 'TOKEN_INVALID',
          title: 'Invalid Figma token',
          reason: 'The current access token did not pass Figma authentication.',
          solutions: [
            'Regenerate a Figma Personal Access Token',
            'Confirm File content (Read only) scope is selected',
            'Update FIGMA_ACCESS_TOKEN or the accessToken argument',
          ],
          docs: 'https://www.figma.com/developers/api#access-tokens',
        },
        TOKEN_EXPIRED: {
          code: 'TOKEN_EXPIRED',
          title: 'Figma token expired',
          reason: 'The current token has expired or been revoked.',
          solutions: [
            'Regenerate the token in Figma Settings',
            'If multiple tokens are configured, the tool will try the next one',
            'Pull design data again after updating the token',
          ],
          docs: 'https://www.figma.com/developers/api#access-tokens',
        },
        FILE_PERMISSION_DENIED: {
          code: 'FILE_PERMISSION_DENIED',
          title: 'File access denied',
          reason: 'The token is valid, but the current account cannot access this Figma file.',
          solutions: [
            'Verify the file URL',
            'Ask the file owner to invite the current Figma account',
            'Check team-level access restrictions',
          ],
        },
        PAYMENT_REQUIRED: {
          code: 'PAYMENT_REQUIRED',
          title: 'Payment or seat restriction',
          reason: 'Figma returned a payment, seat, or Dev Mode access restriction.',
          solutions: [
            'Verify the organization or team seat is active',
            'Confirm the token account has the required access level',
            'If local cache exists, the tool can return stale data with a warning',
          ],
        },
        FORBIDDEN: {
          code: 'FORBIDDEN',
          title: 'Figma request forbidden',
          reason: 'Figma returned 403, but the exact cause could not be determined from the response.',
          solutions: [
            'Check token scopes and file permissions',
            'Retry later or provide screenshots/exported assets as fallback',
            'Use stale local cache when available',
          ],
        },
        SERVER_ERROR: {
          code: 'SERVER_ERROR',
          title: 'Figma server error',
          reason: 'Figma API returned a 5xx server error.',
          solutions: [
            'The tool has retried automatically',
            'Check https://status.figma.com',
            'Retry code generation later',
          ],
        },
        STALE_CACHE_USED: {
          code: 'STALE_CACHE_USED',
          title: 'Stale cache is being used',
          reason: 'The live request failed and the result came from local historical cache. It may be outdated.',
          solutions: [
            'Refresh token or file permission, then pull again',
            'Compare generated output with the latest Figma screenshot',
            'Do not treat stale cache output as final',
          ],
        },
        FILE_NOT_FOUND: {
          code: 'FILE_NOT_FOUND',
          title: 'File or node not found',
          reason: 'Figma returned 404. The file or node does not exist, or the current account lacks permission.',
          solutions: [
            'Verify the fileKey/nodeId',
            'Confirm the current account has access to the file',
            'Ask the file owner to invite the current Figma account',
          ],
        },
        RATE_LIMITED: {
          code: 'RATE_LIMITED',
          title: 'Figma API rate limit exceeded',
          reason: 'Too many requests in a short period triggered Figma rate limiting.',
          solutions: [
            'The tool will auto-backoff based on Retry-After',
            'If it still fails, retry later',
            'Consider configuring multiple tokens to spread load',
          ],
        },
        NETWORK_ERROR: {
          code: 'NETWORK_ERROR',
          title: 'Network error',
          reason: 'A network connection error or timeout occurred while requesting the Figma API.',
          solutions: [
            'Check the network connection',
            'Check HTTP_PROXY/HTTPS_PROXY env vars or proxy config',
            'If using a self-signed enterprise certificate, configure ssl.caCertPath',
          ],
        },
        OCR_ERROR: {
          code: 'OCR_ERROR',
          title: 'OCR text extraction failed',
          reason: 'Optical character recognition failed to extract text from the image.',
          solutions: [
            'Check that the image is clear and contains readable text',
            'Verify the OCR language matches the text (try language: "chi_sim+eng")',
            'Install the optional dependency: npm install tesseract.js',
            'When a Figma URL is available, prefer native node JSON extraction',
          ],
        },
      },
      // Error message template labels (used by FigmaApiError assembly)
      labels: {
        cause: 'Cause',
        suggestion: 'Suggestion',
        originalResponse: 'Original response',
        requestFailed: 'Figma API request failed',
        staleCacheWarning: (hours: number) =>
          `Live request failed, fell back to local stale cache (about ${hours} hours ago). Output may not reflect the latest design.`,
        httpsRequired: 'Figma API Base URL must use HTTPS (except for local debugging)',
        // v1.4.18 custom CA (FIGMA_CA_CERT_PATH) errors
        caCertPathMissing: (certPath: string) =>
          `Custom CA certificate file not found: ${certPath} (FIGMA_CA_CERT_PATH). Check that the certificate path is correct.`,
        caCertReadFailed: (certPath: string, reason: string) =>
          `Failed to read custom CA certificate: ${certPath} (${reason}). Check the path and file permissions.`,
        caCertInvalid: (certPath: string) =>
          `Invalid custom CA certificate content: ${certPath}. The file must be PEM-formatted (contain a BEGIN CERTIFICATE marker).`,
        invalidBundlerChoice: (choice: string) =>
          `Invalid bundler option: "${choice}". Allowed: auto, vite, webpack, nextjs, remix, none.`,
        unknownStyleFormat: (format: string, choices: string) =>
          `Unknown style format: "${format}". Allowed: ${choices}.`,
        styleFormatPlanned: (format: string, version: string, supported: string) =>
          `Style format "${format}" is not supported yet (planned for v${version}). Available: ${supported}.`,
        styleFormatNotInPipeline: (format: string, supported: string) =>
          `Style format "${format}" is not available in this generation pipeline. Available: ${supported}.`,
        networkError:
          'Figma API request failed: network connection error or request timeout. Please check network settings, HTTP_PROXY/HTTPS_PROXY env vars or proxy config.',
        networkErrorWithMessage: (msg: string) => `Figma API request failed: ${msg}`,
        // v1.4.4 browser fallback / visual approximation mode prompts
        playwrightNotInstalled: 'Playwright is not installed',
        playwrightInstallHint:
          'Run npm install playwright && npx playwright install chromium to install the browser engine',
        fallbackDisabled: 'Browser fallback is disabled (enabled=false)',
        fallbackUnavailable: (reason: string, hint: string) =>
          `Browser fallback unavailable: ${reason}. ${hint}`,
        fallbackTokenRequired: 'Browser fallback requires Figma Access Token to inject as Cookie',
        fallbackParseFileKeyFailed: (url: string) => `Failed to parse fileKey from URL: ${url}`,
        devModeCssNotFound:
          'Dev Mode CSS panel not found (may require Figma paid subscription or page structure changed)',
        approximateModeBanner:
          '⚠️ Approximate mode (~70-80% fidelity): Unable to fetch node JSON due to Figma paywall. Approximate code generated via browser screenshot + visual algorithm. Some details require manual review.',
        approximateTodoTitle: 'Approximate mode manual review checklist',
        // v1.4.4 fidelity verification prompts
        fidelityDepsInstallHint:
          'Run npm install pixelmatch pngjs to install dependencies, and ensure Playwright is installed (npm install playwright && npx playwright install chromium)',
        // v1.4.15 OCR text extraction prompts
        ocrDepsInstallHint:
          'Run npm install tesseract.js to install the OCR fallback dependency (for extracting text from images)',
        // Token validation error messages
        tokenValidateFailed401: (msg: string) =>
          `Token validation failed (HTTP 401): ${msg}. Please check if the Token is correct or has expired`,
        tokenValidateFailed403: (msg: string) =>
          `Token validation failed (HTTP 403): ${msg}. Token lacks required permissions, please ensure "File content" scope is selected`,
        tokenValidateFailed429: 'Token validation failed (HTTP 429): Too many requests, please retry later',
        tokenValidateFailedHttp: (status: number, msg: string) => `Token validation failed (HTTP ${status}): ${msg}`,
        tokenValidateFailedNetwork: (msg: string) => `Network connection failed: ${msg}. Please check your network connection or proxy settings`,
        tokenValidateFailed: (msg: string) => `Token validation failed: ${msg}`,
        tokenInvalid: (error: string) => `Invalid token: ${error}`,
        tokenInvalidDefault: 'Please check if the Token is correct and ensure "File content (Read only)" scope is selected',
        tokenValidateFailedGeneric: 'Token validation failed, please check if the Token is correct',
      },
      // HTTP status code subclassification failures (used by _classifyHttpFailure)
      httpFailures: {
        status401: {
          expired: {
            reason: 'Figma Access Token has expired or been revoked.',
            solution: 'Regenerate the token; if multiple tokens are configured, the tool will try the next one.',
          },
          invalid: {
            reason: 'Figma Access Token is invalid.',
            solution: 'Regenerate the token; if multiple tokens are configured, the tool will try the next one.',
          },
        },
        status403: {
          payment: {
            reason: 'Figma returned a payment, seat, or Dev Mode permission restriction.',
            solution:
              'Confirm the Figma organization seat or corresponding permission; if local cache exists, stale cache will be returned with a warning.',
          },
          token: {
            reason: 'Token authentication failed or insufficient permission.',
            solution: 'Regenerate the token, or confirm it has File content (Read only) scope.',
          },
          permission: {
            reason: 'The current account does not have access to this file or node.',
            solution: 'Verify the file URL and ask the file owner to invite the current Figma account.',
          },
          forbidden: {
            reason: 'Figma refused the request, but no specific reason was given in the response.',
            solution:
              'Check token scopes, file permissions, or Figma payment/seat status; if local cache exists, it can be used as fallback.',
          },
        },
        status404: {
          reason: 'File or node does not exist, or the current account lacks permission (Figma returned 404).',
          solution: 'Verify the fileKey/nodeId and confirm the current account has access.',
        },
        status429: {
          reason: 'Figma API request rate limit exceeded.',
          solution: 'The tool will auto-backoff based on Retry-After; if it still fails, retry later.',
        },
        status5xx: {
          reason: (status: number) => `Figma server error (HTTP ${status}).`,
          solution: 'The tool has retried automatically; if it persists, check https://status.figma.com.',
        },
        network: {
          reason: (status: number) => `Figma API request failed (HTTP ${status}).`,
          solution: 'Check parameters, network, or proxy config and retry.',
        },
      },
    },
  },

  reports: {
    flex: {
      title: 'Flex Layout Fixes',
      fixesApplied: 'fixes applied',
    },
    a11y: {
      title: 'Accessibility Enhancements',
      enhancementsApplied: 'enhancements applied',
    },
    design: {
      title: 'Design System Suggestions',
      suggestions: 'suggestions',
    },
    responsive: {
      title: 'Responsive Suggestions',
      suggestions: 'suggestions',
    },
    lint: {
      title: 'Code Restore Quality Pre-check',
      issuesFound: 'Issues found',
      scoreLabel: 'Restore quality score',
    },
  },

  a11y: {
    reportTitle: 'Accessibility (a11y) Check Report',
    semanticTags: 'Semantic tags',
    imagesChecked: 'Images checked',
    buttonsIdentified: 'Buttons identified',
    formsLabeled: 'Form labels',
    ariaAdded: 'ARIA attributes',
    suggestions: 'Suggestions',
    fixed: 'Auto-fixed',
    warning: 'Needs manual check',
    decorativeImage: 'Decorative image (alt="")',
    missingAlt: 'Missing alt text',
    buttonTypeAdded: 'Added type="button"',
    semanticReplacement: (from: string, to: string) => `Replaced ${from} with ${to}`,
  },

  flexFixer: {
    reportTitle: 'Flex Layout Auto-Fix Report',
    fixed: 'Issues fixed',
    shrinkFixed: 'Icon/avatar distortion fix',
    truncateFixed: 'Text truncation fix',
    overflowFixed: 'Overflow scrolling fix',
    minWidthFixed: 'Flex item shrink fix',
    objectFitFixed: 'Image stretch fix',
    addedClasses: 'Added classes',
    nodesFixed: 'Nodes fixed',
  },

  designSystem: {
    reportTitle: 'Design System Token Suggestion Report',
    colors: 'Color Token Suggestions',
    spacing: 'Spacing System Alignment',
    typography: 'Typography System Mapping',
    radius: 'Radius System Mapping',
    shadows: 'Shadow System Mapping',
    existingTokens: 'Existing Tokens',
    suggestedTokens: 'Suggested Tokens to Add',
    colorAlias: (name: string, value: string) => `--color-${name}: ${value}`,
    addToTheme: 'Suggest adding to @theme config',
    colorSuggestions: (count: number) => `Detected ${count} main colors, recommend unifying as CSS variables`,
    spacingSuggestions: (count: number) =>
      `Detected ${count} common spacing values, recommend including in spacing scale`,
    radiusSuggestions: (count: number) =>
      `Detected ${count} border radius values, recommend unifying to rounded series`,
    typographySuggestions: (count: number) => `Detected ${count} typography levels, recommend unifying font size scale`,
  },

  responsive: {
    reportTitle: 'Responsive Implementation Suggestions Report',
    inferredDevice: 'Inferred device type',
    mobile: 'Mobile (<768px)',
    tablet: 'Tablet (768-1024px)',
    desktop: 'Desktop (>1024px)',
    responsiveClasses: 'Responsive class suggestions',
    layoutSuggestion: 'Layout suggestions',
    mobileFlexCol: 'Mobile suggests using flex-col',
    desktopFlexRow: 'Desktop suggests using flex-row',
    fontSizeSuggestions: 'Responsive font size suggestions',
    visibilitySuggestions: 'Visibility suggestions',
    breakpoints: {
      sm: 'sm: (640px+)',
      md: 'md: (768px+)',
      lg: 'lg: (1024px+)',
      xl: 'xl: (1280px+)',
    },
  },
  gui: {
    title: 'GUI Setup Wizard',
    serverStarted: 'GUI configuration server started',
    serverStopped: 'GUI server stopped',
    openingBrowser: 'Opening browser...',
    portInUse: (port: number) => `Port ${port} is in use, trying next port`,
    serverUrl: (url: string) => `Access URL: ${url}`,
    pressCtrlC: 'Press Ctrl+C to stop the server',
    cmdDescription: 'Launch GUI visual configuration panel',
    guiOption: 'Launch GUI setup wizard (browser interface)',
  },

  update: {
    checking: 'Checking for latest version...',
    currentVersion: (v: string) => `Current version: v${v}`,
    latestVersion: (v: string) => `Latest version: v${v}`,
    alreadyLatest: '✅ Already up to date',
    updateAvailable: (current: string, latest: string) =>
      `📦 New version v${latest} available (current: v${current}), updating...`,
    updating: 'Updating to the latest version...',
    success: '✅ Update successful! Please restart your terminal or editor to apply changes',
    failed: 'Update failed',
    ebusyDetected: 'File lock detected (EBUSY), trying fallback copy...',
    ebusyFallbackSuccess: 'Fallback copy update succeeded! Please restart your terminal or editor to apply changes',
    ebusyFallbackFailed: 'Fallback copy also failed. Please close the editor and retry, or manually run: npm install -g figma-dev-tools',
    restartHint: '🔄 Overwrite succeeded! Some locked files could not be deleted but new ones are written. Please fully quit Trae/editor and reopen for the new version to take effect',
    notFound: 'Unable to fetch latest version info. Please check your network connection.',
    hint: '💡 You can also manually run: npm install -g figma-dev-tools',
    // v1.4.17: update-flow version validation errors (no hardcoded user-facing strings)
    invalidCurrentVersion: (v: string) => `Invalid current version: ${v}`,
    fallbackPackageFetch: (version: string, reason: string) =>
      `Failed to fetch the v${version} package: ${reason}`,
    fallbackPackageInvalid: (v: string) => `Invalid fallback package version: ${v}`,
    fallbackVersionMismatch: (expected: string, actual: string) =>
      `Fallback package version mismatch: expected v${expected}, got v${actual}`,
    fallbackVerifyFailed: (expected: string, actual: string) =>
      `Post-update version verification failed: expected v${expected}, got v${actual}`,
  },
} as const;

export type EnUS = typeof enUS;

export const zhCN = {
  common: {
    yes: '是',
    no: '否',
    confirm: '确认',
    cancel: '取消',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
    error: '错误',
    warning: '警告',
    info: '信息',
    loading: '加载中',
    processing: '处理中',
    done: '完成',
    skip: '跳过',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    view: '查看',
    create: '创建',
    search: '搜索',
    select: '选择',
    refresh: '刷新',
    retry: '重试',
    exit: '退出',
    continue: '继续',
    version: '版本',
    help: '帮助',
    docs: '文档',
    tutorial: '教程',
    reportIssue: '反馈问题',
  },

  config: {
    language: '语言',
    selectLanguage: '请选择语言',
    languageSelect: '请选择语言',
    languageZhCN: '简体中文',
    languageEnUS: 'English',
    languageSaved: '语言设置已保存',
    configDir: '配置目录',
    configFile: '配置文件',
    configCreated: '配置文件已创建',
    configUpdated: '配置已更新',
    defaultToken: '默认 Token',
    outputDir: '输出目录',
    framework: '框架',
    styleFormat: '样式格式',
    typescript: 'TypeScript',
    colorFormat: '颜色格式',
    spacingUnit: '间距单位',
    importAlias: '导入别名',
  },

  cli: {
    name: 'figma-dev',
    description: 'Figma 开发工具 - 设计稿与代码的桥接工具',
    version: (v: string) => `v${v}`,
    globalOptions: '全局选项',
    options: {
      token: 'Figma Access Token',
      output: '输出目录',
      noBackup: '不创建备份文件',
      lang: '显示语言 (zh-CN/en-US)',
      ver: '显示版本号',
      update: '检查并更新到最新版本',
    },

    completion: {
      title: 'Shell 自动补全',
      install: '安装补全脚本（执行一次即可）',
      afterInstall: '安装后重启终端即可使用 Tab 键自动补全命令和选项。',
      description: '生成 Shell 自动补全脚本',
    },

    // v1.4.18 T6：全部命令的 --help 示例段（中英双键）
    helpExamples: {
      root: `示例:
  $ figma-dev wizard                        # 交互式初始化配置
  $ figma-dev sync "https://figma.com/design/xxx" -o ./src/styles
  $ figma-dev jsx <文件链接> --node 1:2 --style tailwind
  $ figma-dev -l en-US --help               # 临时切换为英文帮助`,
      lang: `示例:
  $ figma-dev lang set zh-CN                # 持久切换为中文
  $ figma-dev lang list                     # 查看全部可用语言
  $ figma-dev lang switch                   # 交互式选择语言`,
      langSet: `示例:
  $ figma-dev lang set zh-CN
  $ figma-dev lang set en-US`,
      langList: `示例:
  $ figma-dev lang list
  $ figma-dev lang ls                       # list 的简写`,
      langSwitch: `示例:
  $ figma-dev lang switch                   # 方向键选择，回车确认`,
      validate: `示例:
  $ figma-dev validate                      # 校验已保存的默认 Token
  $ figma-dev validate -t figd_xxxxx        # 校验指定 Token`,
      token: `示例:
  $ figma-dev token set personal -t figd_xxxxx
  $ figma-dev token list
  $ figma-dev token default personal`,
      tokenSet: `示例:
  $ figma-dev token set                     # 交互式录入（默认名）
  $ figma-dev token set work -t figd_xxxxx -n "工作账号"
  $ figma-dev token set ci --token $FIGMA_ACCESS_TOKEN`,
      tokenGet: `示例:
  $ figma-dev token get
  $ figma-dev token get work                # 查看指定名称的 Token（脱敏）`,
      tokenList: `示例:
  $ figma-dev token list                    # 列出全部已保存 Token`,
      tokenDelete: `示例:
  $ figma-dev token delete work
  $ figma-dev token delete ci --force       # 跳过确认`,
      tokenDefault: `示例:
  $ figma-dev token default personal
  $ figma-dev token default work`,
      info: `示例:
  $ figma-dev info "https://www.figma.com/design/abc/MyApp"
  $ figma-dev info abc:def --node 1:2`,
      sync: `示例:
  $ figma-dev sync <设计稿链接> -o ./src/styles/figma
  $ figma-dev sync <fileKey> --output-format dtcg
  $ figma-dev sync <fileKey> --format hex --spacing-unit rem --prefix portal`,
      component: `示例:
  $ figma-dev component <设计稿链接> --node 1:2 -o ./src/components
  $ figma-dev component <链接> --typescript --style css-modules`,
      screenshot: `示例:
  $ figma-dev screenshot <设计稿链接> --node 1:2 -o shot.png
  $ figma-dev screenshot <链接> --scale 2 --format jpg`,
      metadata: `示例:
  $ figma-dev metadata <设计稿链接>
  $ figma-dev metadata <fileKey> --node 1:2`,
      lint: `示例:
  $ figma-dev lint <设计稿链接>
  $ figma-dev lint <fileKey> --node 1:2 --json`,
      structured: `示例:
  $ figma-dev structured <设计稿链接>
  $ figma-dev structured <fileKey> --node 1:2 --depth 3`,
      jsx: `示例:
  $ figma-dev jsx <设计稿链接> --node 1:2 -o Button.tsx
  $ figma-dev jsx <链接> --style unocss --unocss-attributify
  $ figma-dev jsx <链接> --style css-modules --framework vue --typescript`,
      vue: `示例:
  $ figma-dev vue <设计稿链接> --node 1:2 -o Button.vue        # 默认 Vue 3 <script setup>
  $ figma-dev vue <链接> --vue-version 2 --style less          # Vue 2 Options API + Less
  $ figma-dev vue <链接> --style css-modules                   # Vue3 + CSS Modules`,
      batch: `示例:
  $ figma-dev batch <整页链接> --out ./src/components/landing  # 自动拆分 header/hero/... 多文件
  $ figma-dev batch <链接> --nodes 1:10,1:11 --framework vue   # 仅生成指定区块（Vue SFC）
  $ figma-dev batch <链接> --prefix Landing --style css-modules`,
      assets: `示例:
  $ figma-dev assets <设计稿链接> -o ./public/assets
  $ figma-dev assets <fileKey> --node 1:2 --format svg --bundler vite`,
      tutorial: `示例:
  $ figma-dev tutorial                      # 查看入门教程文档`,
      mcp: `示例:
  $ figma-dev mcp                           # stdio 启动 MCP 服务器（供 IDE/Agent 接入）
  $ figma-dev mcp --help`,
      wizard: `示例:
  $ figma-dev wizard                        # 首次使用推荐运行`,
      gui: `示例:
  $ figma-dev gui                           # 启动可视化配置界面
  $ figma-dev gui --port 5180`,
      cache: `示例:
  $ figma-dev cache status
  $ figma-dev cache clear --force`,
      cacheStatus: `示例:
  $ figma-dev cache status
  $ figma-dev cache stats                   # status 的简写`,
      cacheClear: `示例:
  $ figma-dev cache clear                   # 清空前确认
  $ figma-dev cache clear --force           # 直接清空不确认`,
      privacy: `示例:
  $ figma-dev privacy                       # 查看隐私承诺与 .gitignore 建议`,
    },

    commands: {
      cache: {
        description: '管理本地缓存',
        status: '查看缓存统计信息',
        clear: '清空所有缓存',
        force: '强制清空，不确认',
        privacy: '查看隐私承诺声明',
      },
      wizard: {
        description: '交互式配置向导（推荐首次使用时运行）',
        title: '🎨 Figma Dev Tools 配置向导',
        subtitle: '将引导你完成 Token 配置和项目初始化',
        existingToken: '检测到已保存的 Token，是否直接使用',
        selectToken: '选择要使用的 Token',
        howToGetToken: '获取 Figma Access Token',
        tokenStep1: '打开 https://www.figma.com/developers/api#access-tokens',
        tokenStep2: '登录后点击 "Generate new token"',
        tokenStep3: '勾选 "File content" (Read only) 权限即可',
        openTokenPage: '是否现在在浏览器中打开 Token 获取页面',
        tokenName: '为这个 Token 起个名字（用于多账号切换）',
        savingToken: '正在保存并验证 Token...',
        tokenValidateError: 'Token 验证失败，请检查网络连接和 Token 是否正确',
        selectFramework: '选择主要使用的框架',
        recommended: '推荐',
        comingSoon: '即将支持',
        stayTuned: '敬请期待',
        noFramework: '无框架',
        outputDir: '设计 Tokens 输出目录',
        creatingConfig: '正在创建配置文件...',
        configComplete: '✅ 配置文件创建完成！',
        setupComplete: '配置完成！开始使用吧',
        commonCommands: '常用命令',
        cmdValidate: '验证 Token 状态',
        cmdSync: '同步设计 Tokens 到 CSS/Tailwind',
        cmdJsx: '一键生成 React+Tailwind TSX 代码',
        cmdAssets: '下载设计资源图片',
        cmdMetadata: '查看设计稿概览',
        cmdLint: '代码还原质量预检',
        cmdLang: '切换显示语言',
        cmdTutorial: '查看教程文档',
        mcpHint: '💡 在 AI 编辑器（Trae/Cursor/Claude）中可直接通过 MCP 工具调用',
      },

      lang: {
        description: '切换显示语言',
        set: '设置显示语言',
        invalid: '不支持的语言，支持的语言',
        success: '语言已切换',
        list: '列出所有支持的语言',
        current: '当前语言',
        currentMarker: '当前',
        switchHint: '使用 figma-dev lang set <language> 或 figma-dev lang switch 切换语言',
        switch: '交互式切换语言',
        selectPrompt: '请选择语言',
      },

      validate: {
        description: '验证 Figma Access Token 是否有效',
        validating: '正在验证 Figma Token...',
        success: '✅ Token 验证成功！',
        failed: '❌ Token 验证失败',
      },

      token: {
        description: '安全管理 Figma Access Token',
        set: '保存 Token 到系统密钥链/加密存储（默认名称: default）',
        tokenOption: '直接提供 Token（不使用交互式输入）',
        note: 'Token 备注/描述',
        secureStorage: '🔐 Figma Access Token 安全存储',
        storageLocation: 'Token 将加密存储在',
        linuxFallback: '如不可用则使用 AES-256-GCM 加密文件',
        privacyNotice: '⚠️  Token 仅存储在本地，不会上传到任何服务器',
        pastePrompt: '请粘贴你的 Figma Access Token（输入时不显示，支持 Ctrl+Shift+V / 右键粘贴）',
        pastePromptFallback: '请输入/粘贴你的 Figma Access Token（明文显示，Windows 终端兼容性提示）',
        pasteHint: '💡 若无法粘贴，请使用: figma-dev token set -t <your_token> 或设置环境变量 FIGMA_ACCESS_TOKEN',
        envFallbackUsed: '💡 已从环境变量 FIGMA_ACCESS_TOKEN 读取 Token',
        invalidLength: 'Token 长度不正确（至少 20 个字符）',
        invalidPrefix: 'Token 应以 figd_ 开头',
        saving: '正在安全保存 Token...',
        saved: '✅ Token 已安全保存',
        keychain: '系统密钥链',
        encryptedFile: 'AES 加密文件',
        validating: '正在验证 Token 有效性...',
        validateSuccess: '✅ Token 验证成功！可以开始使用 figma-dev 了',
        validateFailed: '⚠️  Token 已保存但验证失败，请检查 Token 是否正确',
        get: '查看已保存的 Token（默认查看 default）',
        showFull: '显示完整 Token（默认仅显示掩码）',
        notFound: '未找到名为',
        savedTokens: '已保存的 Token',
        noTokens: '尚未保存任何 Token，请运行 figma-dev token set',
        list: '列出所有已保存的 Token',
        runSet: '运行 figma-dev token set 开始配置',
        savedTokensList: '🔐 已保存的 Token',
        default: '默认',
        delete: '删除指定 Token',
        forceDelete: '跳过确认直接删除',
        confirmDelete: '确定要删除 Token',
        deleted: '✅ Token 已删除',
        notExist: 'Token 不存在',
        setDefault: '设置默认使用的 Token',
        defaultSet: '✅ 默认 Token 已设置为',
      },

      info: {
        description: '查看 Figma 文件信息',
        fetching: '正在获取文件信息',
        lastModified: '最后修改',
        version: '版本',
        type: '类型',
        pages: '页面列表',
        children: '个子元素',
        stats: '统计',
        components: '组件',
        componentSets: '组件集',
        styles: '样式',
        failed: '获取文件信息失败',
      },

      lint: {
        description: '检查 Figma 设计稿的代码还原质量（代码生成前预检）',
        checking: '正在进行代码还原质量预检...',
        node: '指定节点 ID',
        depth: '检查深度',
        getContext: '获取设计上下文...',
        running: '运行质量预检...',
        completed: '✅ 代码还原质量预检完成',
        score: '代码还原质量评分',
        issues: '问题数',
        errors: '错误',
        warnings: '警告',
        infos: '提示',
        scoreExcellent: '优秀',
        scoreGood: '良好',
        scorePass: '一般',
        scorePoor: '较差',
        scoreBad: '很差',
        noNodeId: '错误: 请提供节点 ID，或检查整个文件',
        failed: '代码还原质量预检失败',
        reportTitle: '代码还原质量预检报告',
        category: {
          layout: '布局',
          naming: '命名',
          spacing: '间距/尺寸',
          component: '组件',
          color: '颜色',
          typography: '字体',
          accessibility: '无障碍',
          structure: '结构',
        },
        summary: (score: number, total: number, errors: number, warnings: number, infos: number) =>
          `代码还原质量预检完成：评分 ${score}/100，共检查 ${total} 个节点，发现 ${errors} 个严重问题、${warnings} 个警告、${infos} 个优化建议`,
        hint: '💡 评分低于 80 分，建议先修复代码还原质量问题再生成代码，可以获得最佳还原效果',
      },

      sync: {
        description: '同步设计 Tokens 到本地项目',
        node: '指定节点 ID',
        format: '颜色格式 (hex/rgb/oklch/hsl)',
        spacingUnit: '间距单位 (px/rem)',
        prefix: 'Token 名称前缀',
        outputFormat: '输出格式 (css/tailwind/json/dtcg/all)',
        fileName: '输出文件名',
        syncing: '正在从 Figma 同步设计 Tokens...',
        file: '文件',
        completed: '✅ Tokens 同步完成',
        stats: '提取统计',
        colors: '颜色',
        spacing: '间距',
        radius: '圆角',
        shadows: '阴影',
        typography: '字体',
        outputFiles: '输出文件',
        importHint: '💡 提示: 在 globals.css 中导入生成的 CSS 文件',
        failed: '同步失败',
      },

      component: {
        description: '从 Figma 节点生成 React 组件代码',
        name: '组件名称',
        js: '生成 JavaScript 代码 (默认 TypeScript)',
        style: '样式格式（tailwind/css-modules/inline-styles，默认 tailwind）',
        noChildren: '不包含子元素',
        output: '输出目录',
        noNodeId: '错误: 请提供节点 ID (在 Figma URL 中 ?node-id= 参数)',
        generating: '正在生成组件...',
        completed: '✅ 组件生成完成',
        code: '组件代码',
        failed: '生成组件失败',
      },

      screenshot: {
        description: '获取节点截图',
        format: '图片格式 (png/jpg/svg)',
        scale: '缩放比例 (1-4)',
        download: '下载到指定目录',
        noNodeId: '错误: 请提供节点 ID',
        fetching: '正在获取截图...',
        failed: '获取截图失败',
        url: '✅ 截图 URL',
        downloading: '正在下载截图...',
        saved: '✅ 已保存到',
      },

      metadata: {
        description: '获取设计节点高层结构概览（避免上下文爆炸）',
        depth: '概览深度',
        fetching: '正在获取设计概览...',
        size: '尺寸',
        directChildren: '直接子节点',
        colorsUsed: '使用颜色',
        textNodes: '文本节点',
        images: '图片',
        sections: '子区块',
        nameHeader: '名称',
        typeHeader: '类型',
        semanticHeader: '语义',
        sizeHeader: '尺寸',
        childrenHeader: '子元素',
        componentHeader: '组件',
        top15: '前15个',
        totalPrefix: '... 共',
        totalSuffix: '个',
        failed: '获取元数据失败',
      },

      structured: {
        description: '获取框架无关的结构化设计数据（适用于 Vue/Svelte/HTML 等任意框架）',
        depth: '最大节点树深度',
        format: '输出格式 (pretty/json)',
        output: '输出到文件（默认输出到控制台）',
        noNodeId: '错误: 请提供节点 ID (URL 中 ?node-id= 参数或 --node 选项)',
        fetching: '正在获取框架无关结构化数据...',
        getContext: '获取设计上下文...',
        saved: '✅ 结构化数据已保存',
        completed: '✅ 获取完成',
        nodeCount: '节点数',
        assets: '资源',
        text: '文本',
        failed: '获取结构化数据失败',
      },

      jsx: {
        description: '一键生成 React/Vue + Tailwind/UnoCSS 组件代码（v1.4.0 增强版）',
        scene: '场景名（用于 public/portal/<scene>/ 资源路径）',
        framework: '目标框架: react (默认) | vue',
        bundler:
          '目标项目构建器（v1.4.18）: auto (默认，自动检测) | vite | webpack | nextjs | remix | none（旧版 publicCdnUrl）',
        skipLint: '跳过设计规范检查提示',
        noNodeId: '错误: 请提供节点 ID (URL 中 ?node-id= 参数或 --node 选项)',
        generating: '正在生成组件代码 (v1.4.0 增强管线)...',
        getContext: '获取精简设计上下文...',
        generateCode: '生成组件代码...',
        completed: '✅ 生成完成',
        themeExtensions: '⚠️  需要 @theme 扩展的 token',
        assetsNeeded: '🖼️  需要下载的资源',
        downloadHint: '运行以下命令下载资源',
        reusableComponents: '🧩 检查复用组件',
        componentLibraryDetected: '📦 检测到组件库',
        componentSuggestions: '💡 组件映射建议',
        usedTimes: '使用',
        times: '次',
        codeSaved: '✅ 代码已写入',
        // v1.4.18 T8：UnoCSS attributify 模式开关与配置指引
        attributify:
          'UnoCSS attributify 模式（v1.4.18新增，仅配合 --style unocss；原子类以元素属性输出，默认关闭=wind 模式）',
        attributifyIgnored:
          '--attributify 仅在 --style unocss 时生效，本次已忽略该参数（继续使用 wind 原子类）。',
        // WBS-P2-12/13：组件库映射开关（保守门控，默认关闭保持原生标签）
        componentLibrary:
          '组件库映射: auto (按 package.json/components.json 自动检测) | none (默认，原生标签) | shadcn-ui | ant-design（React）；element-plus | ant-design-vue（Vue）',
        componentLibraryIgnored:
          '--component-library 仅支持 react/vue 产物，本次 svelte 生成已忽略该参数。',
        styleHintsSuffix: '配置指引（请按需手动落地，工具不会修改你的项目文件）',
        moduleCssSaved: '同名 CSS Modules 文件已保存',
        moduleCssPreview: '同名 CSS Modules 文件（请保存为与组件同目录）',
        // v1.4.19 T16：泛化到 less/sass 的同名旁路样式文件文案
        sidecarSaved: '✅ 同名旁路样式文件已保存',
        sidecarPreview: '同名旁路样式文件（请保存为与组件同目录）',
        failed: '生成组件代码失败',
        lintWarning: '⚠️  代码还原质量提示',
      },

      // v1.4.19 T18：figma-dev vue 一级命令（Vue 2 Options API / Vue 3 script setup）
      vue: {
        description: '一键生成 Vue 2/3 SFC 组件（.vue 单文件，v1.4.19 新增）',
        vueVersion: 'Vue 大版本: 2 (Options API) | 3 (默认，<script setup>)',
        invalidVersion: '错误: --vue-version 仅支持 2 或 3',
      },

      // v1.4.20 WBS-P1-1：figma-dev svelte 一级命令（Svelte 4 默认）
      svelte: {
        description: '一键生成 Svelte 4 组件（.svelte 单文件；样式仅 tailwind/unocss/css-modules，v1.4.20 新增）',
      },

      // v1.4.19 T20：整页批量生成
      batch: {
        description: '整页区块拆分并批量生成多文件组件（含 index.ts barrel 与依赖图，v1.4.19 新增）',
        nodes: '逗号分隔的区块节点 ID（省略则自动拆分整页）',
        out: '多文件输出目录（默认 ./figma-generated）',
        prefix: '所有区块组件名统一前缀（ASCII，如 Landing）',
        noRootNode: '错误: 批量生成需要页面/Frame 根节点（URL node-id 或 -n/--node）',
        emptySelection: '错误: 未在节点树中找到任何指定区块节点，批量生成终止（未写入文件）',
        completed: (blocks: number, files: number) =>
          `批量生成完成：${blocks} 个区块，${files} 个文件（含 index.ts barrel）`,
      },

      assets: {
        description: '下载设计资源到项目资源目录（v1.4.18 起按构建器落位 public/ 或 src/assets/）',
        node: '节点 ID（可指定多个，逗号分隔）',
        nodes: '节点 ID 列表（逗号分隔）',
        scene: '场景名称（如 health、edu、ai-innovation-class）',
        projectRoot: '项目根目录（自动检测）',
        svgFormat: '矢量导出格式 (svg/png)',
        bundler:
          '目标项目构建器（v1.4.18）: auto (默认，自动检测) | vite | webpack | nextjs | remix | none（旧版 publicCdnUrl）',
        noNodeId: '错误: 请提供节点 ID (--node 或 --nodes)',
        downloading: '正在下载设计资源...',
        sceneName: '场景',
        nodeCount: '节点数',
        projectRootDetected: '项目根目录已自动检测',
        foundAssets: '发现',
        assets: '个资源，开始下载...',
        noAssets: '未找到可下载的资源（请确认 nodeId 对应图片/图标节点）',
        completed: '✅ 资源下载完成',
        success: '成功',
        failed: '下载资源失败',
      },

      mcp: {
        description: '启动 MCP 服务器 (stdio 模式)',
      },

      tutorial: {
        description: '打开 Figma Dev Tools 教程和文档',
        noBrowser: '仅显示链接，不打开浏览器',
        title: '📚 Figma Dev Tools 学习资源',
        docs: '📖 官方文档/Gitee 仓库',
        getToken: '🔑 获取 Figma Access Token',
        quickStart: '💡 快速开始',
        step1: '交互式配置向导',
        step2: '验证 Token',
        step3: '生成组件代码',
        openingBrowser: '正在打开浏览器...',
      },
    },

    errors: {
      noToken: {
        title: '❌ 未配置 Figma Access Token',
        howTo: '请通过以下任一方式配置：',
        recommended: '推荐: ',
        wizard: 'figma-dev wizard    交互式配置向导',
        quick: '快速: ',
        tokenSet: 'figma-dev token set 安全保存 Token',
        temp: '临时: ',
        tempDesc: '--token <token>      命令行参数（不推荐）',
        env: '环境: ',
        envDesc: 'FIGMA_ACCESS_TOKEN   环境变量',
        getToken: '🔑 获取 Token: https://www.figma.com/developers/api#access-tokens',
      },
      invalidUrl: '错误: 无法解析 Figma URL',
      codes: {
        TOKEN_INVALID: {
          code: 'TOKEN_INVALID',
          title: 'Figma Token 无效',
          reason: '当前 Access Token 无法通过 Figma 认证。',
          solutions: [
            '重新生成 Figma Personal Access Token',
            '确认勾选 File content (Read only) 权限',
            '更新环境变量 FIGMA_ACCESS_TOKEN 或调用参数 accessToken',
          ],
          docs: 'https://www.figma.com/developers/api#access-tokens',
        },
        TOKEN_EXPIRED: {
          code: 'TOKEN_EXPIRED',
          title: 'Figma Token 已过期',
          reason: '当前 Token 已过期或被撤销，无法读取设计稿结构。',
          solutions: [
            '在 Figma Settings 中重新生成 Token',
            '如果配置了多个 Token，工具会自动尝试切换到下一个',
            '更新 Token 后重新拉取设计数据',
          ],
          docs: 'https://www.figma.com/developers/api#access-tokens',
        },
        FILE_PERMISSION_DENIED: {
          code: 'FILE_PERMISSION_DENIED',
          title: '没有文件访问权限',
          reason: 'Token 本身有效，但当前账号没有该 Figma 文件的访问权限。',
          solutions: ['确认文件链接正确', '让文件所有者把当前 Figma 账号加入文件协作', '确认该文件不是团队内受限文件'],
        },
        PAYMENT_REQUIRED: {
          code: 'PAYMENT_REQUIRED',
          title: 'Figma 付费或席位权限受限',
          reason: 'Figma 返回付费、席位或 Dev Mode 相关限制，当前 Token 无法读取完整设计数据。',
          solutions: [
            '确认 Figma 组织/团队席位是否有效',
            '确认应用或 Token 对应账号是否具备所需访问权限',
            '如果本机已有缓存，工具会尝试返回最近一次缓存并标记为陈旧数据',
          ],
        },
        FORBIDDEN: {
          code: 'FORBIDDEN',
          title: 'Figma 请求被拒绝',
          reason: 'Figma 返回 403，但未能从响应中判断具体原因。',
          solutions: [
            '检查 Token 权限和文件协作权限',
            '稍后重试，或使用截图/导出资源补充输入',
            '若本地有旧缓存，可选择基于陈旧缓存继续分析',
          ],
        },
        SERVER_ERROR: {
          code: 'SERVER_ERROR',
          title: 'Figma 服务异常',
          reason: 'Figma API 返回 5xx 服务端错误。',
          solutions: ['工具已自动重试', '查看 https://status.figma.com', '稍后重新生成代码'],
        },
        STALE_CACHE_USED: {
          code: 'STALE_CACHE_USED',
          title: '正在使用陈旧缓存',
          reason: '实时请求失败，当前结果来自本地历史缓存，可能不是最新设计稿。',
          solutions: [
            '恢复 Token 或文件权限后重新拉取',
            '将生成结果与 Figma 最新截图比对',
            '不要把陈旧缓存结果视为最终还原结果',
          ],
        },
        FILE_NOT_FOUND: {
          code: 'FILE_NOT_FOUND',
          title: '文件或节点不存在',
          reason: 'Figma 返回 404，文件或节点不存在，也可能是当前账号无权限导致。',
          solutions: [
            '检查 fileKey/nodeId 是否正确',
            '确认当前账号是否有该文件访问权限',
            '让文件所有者把当前 Figma 账号加入协作',
          ],
        },
        RATE_LIMITED: {
          code: 'RATE_LIMITED',
          title: 'Figma API 请求频率超限',
          reason: '短时间内请求过多，触发 Figma 速率限制。',
          solutions: [
            '工具会根据 Retry-After 自动退避重试',
            '若仍失败，请稍后再试',
            '考虑配置多 Token 轮换分散请求',
          ],
        },
        NETWORK_ERROR: {
          code: 'NETWORK_ERROR',
          title: '网络错误',
          reason: '请求 Figma API 时发生网络连接错误或超时。',
          solutions: [
            '检查网络连接是否正常',
            '检查 HTTP_PROXY/HTTPS_PROXY 环境变量或代理配置',
            '若使用企业自签名证书，请配置 ssl.caCertPath',
          ],
        },
        OCR_ERROR: {
          code: 'OCR_ERROR',
          title: 'OCR 文本提取失败',
          reason: '从图片中进行光学字符识别时未能成功提取到文字。',
          solutions: [
            '检查图片是否清晰、是否包含可识别文字',
            '确认 OCR 语言与文字匹配（可尝试 language: "chi_sim+eng"）',
            '安装可选依赖：npm install tesseract.js',
            '若有 Figma 链接，优先使用节点 JSON 原生提取',
          ],
        },
      },
      // 错误消息模板词（用于 FigmaApiError 拼装）
      labels: {
        cause: '原因',
        suggestion: '建议',
        originalResponse: '原始响应',
        requestFailed: 'Figma API 请求失败',
        staleCacheWarning: (hours: number) =>
          `实时请求失败，已回退到本地陈旧缓存（约 ${hours} 小时前），生成结果可能不是最新设计稿。`,
        httpsRequired: 'Figma API Base URL 必须使用 HTTPS（本地调试除外）',
        // v1.4.18 自定义 CA（FIGMA_CA_CERT_PATH）相关错误
        caCertPathMissing: (certPath: string) =>
          `自定义 CA 证书文件不存在：${certPath}（环境变量 FIGMA_CA_CERT_PATH）。请检查证书路径是否正确。`,
        caCertReadFailed: (certPath: string, reason: string) =>
          `读取自定义 CA 证书失败：${certPath}（${reason}）。请检查文件权限与路径。`,
        caCertInvalid: (certPath: string) =>
          `自定义 CA 证书内容无效：${certPath}。文件必须为 PEM 格式（包含 BEGIN CERTIFICATE 标记）。`,
        invalidBundlerChoice: (choice: string) =>
          `无效的构建器参数："${choice}"。可选值：auto、vite、webpack、nextjs、remix、none。`,
        unknownStyleFormat: (format: string, choices: string) =>
          `未知的样式方案："${format}"。可选值：${choices}。`,
        styleFormatPlanned: (format: string, version: string, supported: string) =>
          `样式方案 "${format}" 当前版本暂不支持，计划于 v${version} 启用；当前可用：${supported}。`,
        styleFormatNotInPipeline: (format: string, supported: string) =>
          `样式方案 "${format}" 暂不支持当前生成管线；该管线可用：${supported}。`,
        styleFormatFrameworkUnsupported: (format: string, framework: string, supportedFrameworks: string) =>
          `样式方案 "${format}" 不支持 ${framework} 框架（不会静默降级）；该方案支持的框架：${supportedFrameworks}。`,
        networkError:
          'Figma API 请求失败：网络连接错误或请求超时。请检查网络设置、HTTP_PROXY/HTTPS_PROXY 环境变量或代理配置。',
        networkErrorWithMessage: (msg: string) => `Figma API 请求失败：${msg}`,
        // v1.4.4 浏览器兜底 / 视觉近似模式相关提示
        playwrightNotInstalled: 'Playwright 未安装',
        playwrightInstallHint:
          '运行 npm install playwright && npx playwright install chromium 安装浏览器引擎',
        fallbackDisabled: '浏览器兜底已禁用（enabled=false）',
        fallbackUnavailable: (reason: string, hint: string) =>
          `浏览器兜底不可用：${reason}。${hint}`,
        fallbackTokenRequired: '浏览器兜底需要 Figma Access Token 注入 Cookie',
        fallbackParseFileKeyFailed: (url: string) => `无法从 URL 解析 fileKey: ${url}`,
        devModeCssNotFound: '未找到 Dev Mode CSS 侧栏（可能需要 Figma 付费订阅或页面结构变化）',
        approximateModeBanner:
          '⚠️ 近似模式（~70-80% 还原度）：因 Figma 付费墙限制无法获取节点 JSON，已通过浏览器截图 + 视觉算法生成近似代码，部分细节需人工校对。',
        approximateTodoTitle: '近似模式待人工校对项',
        // v1.4.4 还原度校验相关提示
        fidelityDepsInstallHint:
          '运行 npm install pixelmatch pngjs 安装备用依赖，并确保已安装 Playwright（npm install playwright && npx playwright install chromium）',
        // v1.4.15 OCR 文本提取相关提示
        ocrDepsInstallHint:
          '运行 npm install tesseract.js 安装 OCR 备用依赖（用于从图片中识别文字）',
        // Token 验证错误消息
        tokenValidateFailed401: (msg: string) =>
          `Token 验证失败 (HTTP 401): ${msg}。请检查 Token 是否正确、是否已过期`,
        tokenValidateFailed403: (msg: string) =>
          `Token 验证失败 (HTTP 403): ${msg}。Token 缺少必要权限，请确保已勾选 "File content" 权限`,
        tokenValidateFailed429: 'Token 验证失败 (HTTP 429): 请求过于频繁，请稍后重试',
        tokenValidateFailedHttp: (status: number, msg: string) => `Token 验证失败 (HTTP ${status}): ${msg}`,
        tokenValidateFailedNetwork: (msg: string) => `网络连接失败: ${msg}。请检查网络连接或代理设置`,
        tokenValidateFailed: (msg: string) => `Token 验证失败: ${msg}`,
        tokenInvalid: (error: string) => `Token 无效：${error}`,
        tokenInvalidDefault: '请检查 Token 是否正确，确保勾选了 File content (Read only) 权限',
        tokenValidateFailedGeneric: 'Token 验证失败，请检查 Token 是否正确',
      },
      // HTTP 状态码细分失败原因（供 _classifyHttpFailure 使用）
      httpFailures: {
        status401: {
          expired: {
            reason: 'Figma Access Token 已过期或被撤销。',
            solution: '请重新生成 Token；如配置了多个 Token，工具会自动尝试下一个。',
          },
          invalid: {
            reason: 'Figma Access Token 无效。',
            solution: '请重新生成 Token；如配置了多个 Token，工具会自动尝试下一个。',
          },
        },
        status403: {
          payment: {
            reason: 'Figma 返回付费、席位或 Dev Mode 权限限制。',
            solution: '请确认 Figma 组织席位或对应权限；本地若有历史缓存，将自动返回陈旧缓存并提示。',
          },
          token: {
            reason: 'Token 认证失败或权限不足。',
            solution: '请重新生成 Token，或确认该 Token 拥有 File content (Read only) 权限。',
          },
          permission: {
            reason: '当前账号没有该文件或节点的访问权限。',
            solution: '请确认文件链接正确，并让文件所有者把当前 Figma 账号加入协作。',
          },
          forbidden: {
            reason: 'Figma 拒绝了本次请求，但响应中没有给出更明确的原因。',
            solution: '请检查 Token 权限、文件权限或 Figma 付费/席位状态；本地若有缓存可降级读取。',
          },
        },
        status404: {
          reason: '文件或节点不存在，也可能是当前账号无权限导致 Figma 返回 404。',
          solution: '请检查 fileKey/nodeId 是否正确，并确认当前账号是否有该文件访问权限。',
        },
        status429: {
          reason: 'Figma API 请求频率超限。',
          solution: '工具会根据 Retry-After 自动退避重试；仍失败时请稍后再试。',
        },
        status5xx: {
          reason: (status: number) => `Figma 服务端异常 (HTTP ${status})。`,
          solution: '工具已自动重试；若持续失败，请查看 https://status.figma.com。',
        },
        network: {
          reason: (status: number) => `Figma API 请求失败 (HTTP ${status})。`,
          solution: '请检查参数、网络或代理配置后重试。',
        },
      },
    },
  },

  reports: {
    flex: {
      title: 'Flex 布局修复',
      fixesApplied: '处修复',
    },
    a11y: {
      title: '无障碍增强',
      enhancementsApplied: '处增强',
    },
    design: {
      title: '设计系统建议',
      suggestions: '条建议',
    },
    responsive: {
      title: '响应式建议',
      suggestions: '条建议',
    },
    lint: {
      title: '代码还原质量预检',
      issuesFound: '发现问题',
      scoreLabel: '还原质量评分',
    },
  },

  a11y: {
    reportTitle: '无障碍 (a11y) 检查报告',
    semanticTags: '语义化标签',
    imagesChecked: '图片检查',
    buttonsIdentified: '按钮识别',
    formsLabeled: '表单标签',
    ariaAdded: 'ARIA 属性',
    suggestions: '改进建议',
    fixed: '已自动修复',
    warning: '需要手动检查',
    decorativeImage: '装饰性图片（alt=""）',
    missingAlt: '缺少 alt 文本',
    buttonTypeAdded: '已添加 type="button"',
    semanticReplacement: (from: string, to: string) => `将 ${from} 替换为 ${to}`,
  },

  flexFixer: {
    reportTitle: 'Flex 布局自动修复报告',
    fixed: '已修复问题',
    shrinkFixed: '图标/头像变形修复',
    truncateFixed: '文本截断修复',
    overflowFixed: '溢出滚动修复',
    minWidthFixed: 'Flex 项目收缩修复',
    objectFitFixed: '图片拉伸修复',
    addedClasses: '添加的类',
    nodesFixed: '修复节点数',
  },

  designSystem: {
    reportTitle: '设计系统 Token 建议报告',
    colors: '颜色 Token 建议',
    spacing: '间距系统对齐',
    typography: '字体系统映射',
    radius: '圆角系统映射',
    shadows: '阴影系统映射',
    existingTokens: '已存在的 Token',
    suggestedTokens: '建议添加的 Token',
    colorAlias: (name: string, value: string) => `--color-${name}: ${value}`,
    addToTheme: '建议添加到 @theme 配置',
    colorSuggestions: (count: number) => `检测到 ${count} 种主要颜色，建议统一为 CSS 变量`,
    spacingSuggestions: (count: number) => `检测到 ${count} 种常用间距，建议纳入 spacing scale`,
    radiusSuggestions: (count: number) => `检测到 ${count} 种圆角值，建议统一为 rounded 系列`,
    typographySuggestions: (count: number) => `检测到 ${count} 种字体层级，建议统一字号比例`,
  },

  responsive: {
    reportTitle: '响应式实现建议报告',
    inferredDevice: '推断设备类型',
    mobile: '移动端 (<768px)',
    tablet: '平板 (768-1024px)',
    desktop: '桌面端 (>1024px)',
    responsiveClasses: '响应式类建议',
    layoutSuggestion: '布局建议',
    mobileFlexCol: '移动端建议使用 flex-col',
    desktopFlexRow: '桌面端建议使用 flex-row',
    fontSizeSuggestions: '响应式字体建议',
    visibilitySuggestions: '显示/隐藏建议',
    breakpoints: {
      sm: 'sm: (640px+)',
      md: 'md: (768px+)',
      lg: 'lg: (1024px+)',
      xl: 'xl: (1280px+)',
    },
  },
  // v1.4.19 T19：组件库映射器（自定义 .figma-dev/components.json）
  componentMapper: {
    customConfigInvalid: (detail: string) =>
      `错误: .figma-dev/components.json 格式无效（${detail}），已忽略全部自定义组件映射并降级为内建映射，代码生成继续进行。`,
  },

  // ========== v1.4.19 T20 批量生成（figma_batch_generate / batch 命令） ==========
  batchGenerate: {
    emptySelection:
      '批量生成需要至少一个区块：请提供页面/Frame 节点（自动拆分）或通过 nodeIds 指定区块节点（当前选择为空或全部未在节点树中命中）。',
    // 以下为报告文案键（CLI 日志与 MCP Markdown 共用）
    title: '批量生成',
    blocksHeading: '区块拆分结果',
    filesHeading: '产物文件树',
    graphHeading: '依赖图',
    savedPrefix: '批量产物已写入目录',
  },

  // v1.4.20 WBS-P1-2/P1-3：Watch 与 Compare 冻结错误码文案
  watch: {
    title: 'Watch 会话',
    started: 'Watch 会话已启动（10s 内粗筛检测，会话仅存在于本 MCP 进程，重启需重新 start）',
    stopped: 'Watch 会话已停止（幂等）',
    none: '当前没有运行中的 watch 会话',
    errors: {
      'missing-output': 'FDT-WATCH-MISSING-OUTPUT：write=true 时必须提供 outputDir',
      'output-without-write': 'FDT-WATCH-OUTPUT-WITHOUT-WRITE：write=false 时不允许传 outputDir（MCP 默认不落盘）',
      'too-many-sessions': 'FDT-WATCH-TOO-MANY-SESSIONS：单个客户端最多 5 个并发 watch 会话，请先 stop 无用会话',
      'framework-unavailable': 'FDT-WATCH-FRAMEWORK-UNAVAILABLE：该框架的 watch 适配未就绪',
      'session-not-found': 'FDT-WATCH-SESSION-NOT-FOUND：会话不存在、已停止或不属于当前客户端',
    },
  },
  compare: {
    title: '代码差异对比',
    errors: {
      'path-traversal': 'FDT-COMPARE-PATH-TRAVERSAL：文件路径越权，拒绝读取',
      'input-too-large': 'FDT-COMPARE-INPUT-TOO-LARGE：输入总大小超过 512KB 上限',
      'binary-unsupported': 'FDT-COMPARE-BINARY-UNSUPPORTED：不支持二进制文件对比',
      'missing-current': '必须提供 currentCode / currentFilePath / currentFiles 之一作为现状侧',
    },
  },
  gui: {
    title: 'GUI 配置向导',
    serverStarted: 'GUI 配置服务器已启动',
    serverStopped: 'GUI 服务器已停止',
    openingBrowser: '正在打开浏览器...',
    portInUse: (port: number) => `端口 ${port} 已被占用，尝试下一个端口`,
    serverUrl: (url: string) => `访问地址: ${url}`,
    pressCtrlC: '按 Ctrl+C 停止服务器',
    cmdDescription: '启动 GUI 可视化配置面板',
    guiOption: '启动 GUI 配置向导（浏览器界面）',
  },

  update: {
    checking: '正在检查最新版本...',
    currentVersion: (v: string) => `当前版本: v${v}`,
    latestVersion: (v: string) => `最新版本: v${v}`,
    alreadyLatest: '✅ 已是最新版本',
    updateAvailable: (current: string, latest: string) =>
      `📦 发现新版本 v${latest}（当前: v${current}），正在更新...`,
    updating: '正在更新到最新版本...',
    success: '✅ 更新成功！请重新启动终端或编辑器使更新生效',
    failed: '更新失败',
    ebusyDetected: '检测到文件被占用（EBUSY），尝试使用备用复制方式...',
    ebusyFallbackSuccess: '备用复制更新成功！请重新启动终端或编辑器使更新生效',
    ebusyFallbackFailed: '备用复制也失败，请关闭编辑器后重试，或手动执行: npm install -g figma-dev-tools',
    restartHint: '🔄 覆盖成功！因文件被占用无法删除旧版本，但新文件已写入。请完全退出 Trae/编辑器后重新打开，新版本即生效',
    notFound: '无法获取最新版本信息，请检查网络连接',
    hint: '💡 也可以手动执行: npm install -g figma-dev-tools',
    // v1.4.17：更新链路版本校验相关错误，禁止硬编码中文
    invalidCurrentVersion: (v: string) => `当前版本号无效: ${v}`,
    fallbackPackageFetch: (version: string, reason: string) =>
      `无法获取目标版本 v${version} 的安装包: ${reason}`,
    fallbackPackageInvalid: (v: string) => `备用安装包版本号无效: ${v}`,
    fallbackVersionMismatch: (expected: string, actual: string) =>
      `备用安装包版本不匹配，期望 v${expected}，实际 v${actual}`,
    fallbackVerifyFailed: (expected: string, actual: string) =>
      `备用更新后版本校验失败，期望 v${expected}，实际 v${actual}`,
  },
} as const;

export type ZhCN = typeof zhCN;

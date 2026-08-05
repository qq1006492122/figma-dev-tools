const I18N = {
  'zh-CN': {
    app: {
      title: 'Figma Dev Tools',
      subtitle: '配置向导 v1.4.0',
      footer: 'Figma Dev Tools v1.4.0 — 在 AI 编辑器中直接调用 MCP 工具',
    },
    steps: {
      welcome: '欢迎',
      language: '语言',
      token: 'Token 配置',
      editors: '编辑器',
      framework: '框架',
      complete: '完成',
    },
    welcome: {
      greeting: '欢迎使用 Figma Dev Tools',
      description: '一键配置 Figma Access Token，为你的 AI 编辑器启用 MCP 集成，让设计稿转代码变得前所未有的简单。',
      features: [
        '安全存储 Figma Access Token',
        '自动检测并配置 AI 编辑器',
        '支持 React/Vue/HTML 多种框架',
        '一键生成组件代码',
      ],
      startBtn: '开始配置',
    },
    language: {
      title: '选择语言',
      subtitle: '选择你偏好的显示语言',
      zh: '简体中文',
      en: 'English',
      zhDesc: '中文界面',
      enDesc: 'English interface',
    },
    token: {
      title: '配置 Figma Access Token',
      subtitle: '输入你的 Figma 个人访问令牌',
      placeholder: '粘贴你的 Token（以 figd_ 开头）',
      getToken: '如何获取 Token？',
      getTokenDesc: '1. 打开 Figma 开发者设置',
      getTokenDesc2: '2. 点击 "Generate new token"',
      getTokenDesc3: '3. ⚠️ 只勾选 "File content" (Read only) 权限（不需要其他权限）',
      getTokenDesc4: '4. 选择合适的过期时间（建议30天）',
      permissionWarning: '⚠️ 安全提示：建议只授予 Read only 权限，本工具仅需读取文件内容，不需要写入权限',
      openTokenPage: '打开 Token 获取页面',
      validateBtn: '验证 Token',
      validating: '正在验证...',
      validateSuccess: '✅ Token 验证成功！',
      validateFailed: '❌ Token 验证失败，请检查',
      tokenSaved: 'Token 已安全保存',
      hint: '🔒 Token 仅存储在本地（系统密钥链或加密文件），不会上传到任何服务器，所有 Figma API 请求直接从你的电脑发送',
      privacy: '隐私承诺',
      privacyText: '我们重视你的数据安全：Token 永不离开你的设备、不收集任何个人数据、不发送遥测信息、所有代码生成本地完成',
      tokenExists: '检测到已保存的 Token',
      useExisting: '使用现有 Token',
      replaceToken: '替换 Token',
    },
    editors: {
      title: '配置 AI 编辑器',
      subtitle: '选择要安装 MCP 配置的编辑器',
      detecting: '正在检测已安装的编辑器...',
      detected: '检测到以下编辑器',
      install: '安装',
      installing: '安装中...',
      installed: '已安装',
      notDetected: '未检测到',
      installSuccess: '✅ 配置已安装',
      installFailed: '❌ 安装失败',
      noEditors: '未检测到支持的编辑器',
      manualHint: '你可以稍后手动配置其他编辑器',
      allDone: '所有检测到的编辑器已配置完成',
    },
    framework: {
      title: '框架偏好设置',
      subtitle: '选择你主要使用的前端框架',
      react: 'React',
      reactDesc: 'React + TypeScript + Tailwind CSS（推荐，一级支持）',
      vue: 'Vue 3',
      vueDesc: 'Vue 3 + <script setup lang="ts">（v1.4.0 新增）',
      html: 'HTML/CSS',
      htmlDesc: '纯 HTML 和 CSS',
      outputDir: '设计 Tokens 输出目录',
      outputDirPlaceholder: './src/styles/figma',
      skipHint: '此步骤可跳过，后续可随时修改',
    },
    complete: {
      title: '配置完成！',
      subtitle: '🎉 Figma Dev Tools 已成功配置',
      whatNext: '接下来你可以：',
      cmdValidate: '验证 Token 状态',
      cmdSync: '同步设计 Tokens',
      cmdJsx: '一键生成 React 组件',
      cmdAssets: '下载设计资源',
      cmdMetadata: '查看设计稿概览',
      cmdTutorial: '查看完整教程',
      tutorialLink: '打开教程文档',
      mcpHint: '💡 重启你的 AI 编辑器即可使用 MCP 工具',
      closeWindow: '关闭此窗口',
      quickStart: '快速开始',
    },
    common: {
      back: '上一步',
      next: '下一步',
      skip: '跳过',
      done: '完成',
      saving: '保存中...',
    },
  },
  'en-US': {
    app: {
      title: 'Figma Dev Tools',
      subtitle: 'Setup Wizard v1.4.0',
      footer: 'Figma Dev Tools v1.4.0 — Use MCP tools directly in AI editors',
    },
    steps: {
      welcome: 'Welcome',
      language: 'Language',
      token: 'Token',
      editors: 'Editors',
      framework: 'Framework',
      complete: 'Complete',
    },
    welcome: {
      greeting: 'Welcome to Figma Dev Tools',
      description:
        'Configure your Figma Access Token and enable MCP integration for AI editors to transform design to code effortlessly.',
      features: [
        'Securely store Figma Access Token',
        'Auto-detect and configure AI editors',
        'Support React/Vue/HTML frameworks',
        'One-click component generation',
      ],
      startBtn: 'Start Setup',
    },
    language: {
      title: 'Select Language',
      subtitle: 'Choose your preferred display language',
      zh: '简体中文',
      en: 'English',
      zhDesc: 'Chinese interface',
      enDesc: 'English interface',
    },
    token: {
      title: 'Configure Figma Access Token',
      subtitle: 'Enter your Figma Personal Access Token',
      placeholder: 'Paste your Token (starts with figd_)',
      getToken: 'How to get a Token?',
      getTokenDesc: '1. Open Figma Developer Settings',
      getTokenDesc2: '2. Click "Generate new token"',
      getTokenDesc3: '3. ⚠️ ONLY check "File content" (Read only) permission (no other permissions needed)',
      getTokenDesc4: '4. Choose expiration (30 days recommended)',
      permissionWarning: '⚠️ Security Tip: It is recommended to grant ONLY Read only permission. This tool only needs to read file content, no write access required.',
      openTokenPage: 'Open Token Page',
      validateBtn: 'Validate Token',
      validating: 'Validating...',
      validateSuccess: '✅ Token validated successfully!',
      validateFailed: '❌ Token validation failed, please check',
      tokenSaved: 'Token saved securely',
      hint: '🔒 Token is stored locally only (system keychain or encrypted file), never uploaded to any server. All Figma API requests are sent directly from your computer.',
      privacy: 'Privacy Promise',
      privacyText: 'We take your data security seriously: Token never leaves your device, no personal data collected, no telemetry sent, all code generation done locally.',
      tokenExists: 'Saved Token detected',
      useExisting: 'Use existing Token',
      replaceToken: 'Replace Token',
    },
    editors: {
      title: 'Configure AI Editors',
      subtitle: 'Select editors to install MCP configuration',
      detecting: 'Detecting installed editors...',
      detected: 'Detected the following editors',
      install: 'Install',
      installing: 'Installing...',
      installed: 'Installed',
      notDetected: 'Not detected',
      installSuccess: '✅ Configuration installed',
      installFailed: '❌ Installation failed',
      noEditors: 'No supported editors detected',
      manualHint: 'You can manually configure other editors later',
      allDone: 'All detected editors configured',
    },
    framework: {
      title: 'Framework Preferences',
      subtitle: 'Select your primary frontend framework',
      react: 'React',
      reactDesc: 'React + TypeScript + Tailwind CSS (Recommended, first-class support)',
      vue: 'Vue 3',
      vueDesc: 'Vue 3 + <script setup lang="ts"> (v1.4.0 new!)',
      html: 'HTML/CSS',
      htmlDesc: 'Plain HTML and CSS',
      outputDir: 'Design Tokens output directory',
      outputDirPlaceholder: './src/styles/figma',
      skipHint: 'This step can be skipped, you can change it later',
    },
    complete: {
      title: 'Setup Complete!',
      subtitle: '🎉 Figma Dev Tools configured successfully',
      whatNext: 'What you can do next:',
      cmdValidate: 'Validate Token status',
      cmdSync: 'Sync design Tokens',
      cmdJsx: 'Generate React components',
      cmdAssets: 'Download design assets',
      cmdMetadata: 'View design overview',
      cmdTutorial: 'View full tutorial',
      tutorialLink: 'Open Tutorial',
      mcpHint: '💡 Restart your AI editor to use MCP tools',
      closeWindow: 'Close this window',
      quickStart: 'Quick Start',
    },
    common: {
      back: 'Back',
      next: 'Next',
      skip: 'Skip',
      done: 'Done',
      saving: 'Saving...',
    },
  },
};

const EDITOR_COLORS = {
  Trae: '#6366f1',
  'VS Code': '#007acc',
  Cursor: '#000000',
  Windsurf: '#eab308',
  'Claude Desktop': '#d97757',
  Zed: '#22c55e',
  Cline: '#8b5cf6',
  'Roo Code': '#f97316',
};

class App {
  constructor() {
    this.currentStep = 0;
    this.lang = 'zh-CN';
    this.steps = ['welcome', 'language', 'token', 'editors', 'framework', 'complete'];
    this.state = {
      token: '',
      tokenValidated: false,
      hasExistingToken: false,
      editors: [],
      installedEditors: new Set(),
      framework: 'react',
      outputDir: './src/styles/figma',
      configComplete: false,
    };
    this.init();
  }

  t(key) {
    const keys = key.split('.');
    let value = I18N[this.lang];
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return key;
    }
    return value;
  }

  async init() {
    await this.fetchStatus();
    this.render();
  }

  async api(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      return await res.json();
    } catch (error) {
      console.error('API error:', error);
      this.showToast(this.lang === 'zh-CN' ? '网络请求失败' : 'Network request failed', 'error');
      return { success: false, error: String(error) };
    }
  }

  async fetchStatus() {
    const data = await this.api('/api/status');
    if (data.success) {
      this.lang = data.language || 'zh-CN';
      this.state.hasExistingToken = data.hasToken;
      if (data.config) {
        this.state.framework = data.config.framework || 'react';
        this.state.outputDir = data.config.outputDir || './src/styles/figma';
      }
    }
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const content = document.getElementById('toast-content');
    content.className = 'px-6 py-3 rounded-lg shadow-lg text-white font-medium toast-' + type;
    content.textContent = message;
    toast.classList.remove('hidden');
    content.style.transform = 'translateX(0)';
    setTimeout(() => {
      content.style.transform = 'translateX(calc(100% + 24px))';
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
  }

  renderStepIndicator() {
    const indicator = document.getElementById('step-indicator');
    const startIdx = this.currentStep === 0 ? 0 : 1;
    const endIdx = this.steps.length - 1;
    let html = '';

    for (let i = startIdx; i <= endIdx; i++) {
      const stepNum = i - startIdx + 1;
      const isActive = i === this.currentStep;
      const isCompleted = i < this.currentStep;
      const stepKey = this.steps[i];

      let dotClass = 'step-dot ';
      if (isActive) dotClass += 'active';
      else if (isCompleted) dotClass += 'completed';
      else dotClass += 'pending';

      html += '<div class="flex flex-col items-center">';
      html += '<div class="' + dotClass + '">' + (isCompleted ? '✓' : stepNum) + '</div>';
      html +=
        '<span class="text-xs mt-2 ' +
        (isActive ? 'text-primary-600 font-medium' : 'text-gray-400') +
        '">' +
        this.t('steps.' + stepKey) +
        '</span>';
      html += '</div>';

      if (i < endIdx) {
        html +=
          '<div class="step-line ' + (i < this.currentStep ? 'active' : '') + '" style="margin-top: -20px;"></div>';
      }
    }

    indicator.innerHTML = html;
  }

  renderContent() {
    const content = document.getElementById('content');
    const step = this.steps[this.currentStep];

    switch (step) {
      case 'welcome':
        content.innerHTML = this.renderWelcome();
        break;
      case 'language':
        content.innerHTML = this.renderLanguage();
        break;
      case 'token':
        content.innerHTML = this.renderToken();
        break;
      case 'editors':
        content.innerHTML = this.renderEditors();
        this.loadEditors();
        break;
      case 'framework':
        content.innerHTML = this.renderFramework();
        break;
      case 'complete':
        content.innerHTML = this.renderComplete();
        break;
    }

    if (content.firstElementChild) {
      content.firstElementChild.classList.add('step-content');
    }
    this.bindEvents();
  }

  renderFooter() {
    const footer = document.getElementById('footer-nav');
    const step = this.steps[this.currentStep];
    const isFirst = this.currentStep === 0;

    const leftHtml = isFirst
      ? '<div></div>'
      : '<button class="btn-secondary" id="btn-back">' + this.t('common.back') + '</button>';
    let rightHtml = '';

    if (step === 'welcome') {
      rightHtml = '<button class="btn-primary" id="btn-next">' + this.t('welcome.startBtn') + '</button>';
    } else if (step === 'token') {
      rightHtml =
        '<button class="btn-primary" id="btn-next" ' +
        (this.state.tokenValidated ? '' : 'disabled') +
        '>' +
        this.t('common.next') +
        '</button>';
    } else if (step === 'framework') {
      rightHtml =
        '<div class="flex gap-3"><button class="btn-secondary" id="btn-skip">' +
        this.t('common.skip') +
        '</button><button class="btn-primary" id="btn-next">' +
        this.t('common.next') +
        '</button></div>';
    } else if (step === 'complete') {
      rightHtml = '<button class="btn-primary" id="btn-done">' + this.t('common.done') + '</button>';
    } else {
      rightHtml = '<button class="btn-primary" id="btn-next">' + this.t('common.next') + '</button>';
    }

    footer.innerHTML = leftHtml + rightHtml;
    this.bindFooterEvents();
  }

  renderWelcome() {
    const features = this.t('welcome.features')
      .map(
        (f) =>
          '<div class="flex items-center gap-3 text-gray-600">' +
          '<div class="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-sm">✓</div>' +
          '<span>' +
          f +
          '</span>' +
          '</div>',
      )
      .join('');

    return (
      '<div class="text-center py-4">' +
      '<div class="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-primary-500 to-figma-purple rounded-2xl flex items-center justify-center shadow-lg">' +
      '<svg class="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.098-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z"/>' +
      '</svg></div>' +
      '<h2 class="text-2xl font-bold text-gray-900 mb-3">' +
      this.t('welcome.greeting') +
      '</h2>' +
      '<p class="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">' +
      this.t('welcome.description') +
      '</p>' +
      '<div class="max-w-sm mx-auto space-y-3 mb-2 text-left">' +
      features +
      '</div></div>'
    );
  }

  renderLanguage() {
    return (
      '<div class="py-4">' +
      '<h2 class="text-xl font-bold text-gray-900 mb-2">' +
      this.t('language.title') +
      '</h2>' +
      '<p class="text-gray-500 mb-6">' +
      this.t('language.subtitle') +
      '</p>' +
      '<div class="space-y-4">' +
      '<div class="language-option ' +
      (this.lang === 'zh-CN' ? 'selected' : '') +
      '" data-lang="zh-CN">' +
      '<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-xl font-bold">中</div>' +
      '<div><div class="font-semibold text-gray-900">' +
      this.t('language.zh') +
      '</div>' +
      '<div class="text-sm text-gray-500">' +
      this.t('language.zhDesc') +
      '</div></div>' +
      (this.lang === 'zh-CN' ? '<div class="check-icon ml-auto">✓</div>' : '') +
      '</div>' +
      '<div class="language-option ' +
      (this.lang === 'en-US' ? 'selected' : '') +
      '" data-lang="en-US">' +
      '<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">EN</div>' +
      '<div><div class="font-semibold text-gray-900">' +
      this.t('language.en') +
      '</div>' +
      '<div class="text-sm text-gray-500">' +
      this.t('language.enDesc') +
      '</div></div>' +
      (this.lang === 'en-US' ? '<div class="check-icon ml-auto">✓</div>' : '') +
      '</div>' +
      '</div></div>'
    );
  }

  renderToken() {
    const hasExisting = this.state.hasExistingToken;
    const existingHtml =
      '<div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center justify-between">' +
      '<div class="flex items-center gap-3"><div class="check-icon">✓</div>' +
      '<span class="text-green-800 font-medium">' +
      this.t('token.tokenExists') +
      '</span></div>' +
      '<button class="text-sm text-primary-600 font-medium hover:underline" id="btn-replace-token">' +
      this.t('token.replaceToken') +
      '</button></div>' +
      '<div class="text-center py-4"><button class="btn-success" id="btn-use-existing">' +
      this.t('token.useExisting') +
      '</button></div>';

    const newTokenHtml =
      '<div class="mb-4"><div class="relative">' +
      '<input type="password" id="token-input" class="input-field pr-24" placeholder="' +
      this.t('token.placeholder') +
      '" value="' +
      this.state.token +
      '">' +
      '<button class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm px-3 py-1" id="toggle-token">👁</button></div></div>' +
      '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">' +
      '<div class="font-medium text-blue-900 mb-2">' +
      this.t('token.getToken') +
      '</div>' +
      '<ol class="text-sm text-blue-700 space-y-1 list-decimal list-inside mb-3">' +
      '<li>' +
      this.t('token.getTokenDesc') +
      '</li>' +
      '<li>' +
      this.t('token.getTokenDesc2') +
      '</li>' +
      '<li>' +
      this.t('token.getTokenDesc3') +
      '</li></ol>' +
      '<a href="https://www.figma.com/developers/api#access-tokens" target="_blank" class="link text-sm inline-flex items-center gap-1">' +
      this.t('token.openTokenPage') +
      ' →</a></div>' +
      '<div class="flex items-center gap-3 mb-4">' +
      '<button class="btn-primary" id="btn-validate-token" ' +
      (this.state.tokenValidated ? 'disabled' : '') +
      '>' +
      (this.state.tokenValidated ? this.t('token.validateSuccess') : this.t('token.validateBtn')) +
      '</button>' +
      '<div id="token-status"></div></div>' +
      '<p class="text-xs text-gray-400">🔒 ' +
      this.t('token.hint') +
      '</p>';

    return (
      '<div class="py-4">' +
      '<h2 class="text-xl font-bold text-gray-900 mb-2">' +
      this.t('token.title') +
      '</h2>' +
      '<p class="text-gray-500 mb-6">' +
      this.t('token.subtitle') +
      '</p>' +
      (hasExisting && !this.state.token ? existingHtml : newTokenHtml) +
      '</div>'
    );
  }

  renderEditors() {
    return (
      '<div class="py-4">' +
      '<h2 class="text-xl font-bold text-gray-900 mb-2">' +
      this.t('editors.title') +
      '</h2>' +
      '<p class="text-gray-500 mb-6">' +
      this.t('editors.subtitle') +
      '</p>' +
      '<div id="editors-list"><div class="text-center py-8 text-gray-400">' +
      '<div class="spinner mx-auto mb-3" style="width: 24px; height: 24px; border-width: 3px; border-top-color: #6366f1;"></div>' +
      this.t('editors.detecting') +
      '</div></div>' +
      '<p class="text-xs text-gray-400 mt-4">' +
      this.t('editors.manualHint') +
      '</p></div>'
    );
  }

  renderFramework() {
    return (
      '<div class="py-4">' +
      '<h2 class="text-xl font-bold text-gray-900 mb-2">' +
      this.t('framework.title') +
      '</h2>' +
      '<p class="text-gray-500 mb-6">' +
      this.t('framework.subtitle') +
      '</p>' +
      '<div class="flex gap-4 mb-6">' +
      '<div class="framework-option ' +
      (this.state.framework === 'react' ? 'selected' : '') +
      '" data-framework="react">' +
      '<div class="text-3xl mb-2">⚛️</div>' +
      '<div class="font-semibold text-gray-900">' +
      this.t('framework.react') +
      '</div>' +
      '<div class="text-xs text-gray-500 mt-1">' +
      this.t('framework.reactDesc') +
      '</div></div>' +
      '<div class="framework-option disabled" data-framework="vue">' +
      '<div class="text-3xl mb-2 opacity-50">💚</div>' +
      '<div class="font-semibold text-gray-400">' +
      this.t('framework.vue') +
      '</div>' +
      '<div class="text-xs text-gray-400 mt-1">' +
      this.t('framework.vueDesc') +
      '</div></div>' +
      '<div class="framework-option ' +
      (this.state.framework === 'html' ? 'selected' : '') +
      '" data-framework="html">' +
      '<div class="text-3xl mb-2">🌐</div>' +
      '<div class="font-semibold text-gray-900">' +
      this.t('framework.html') +
      '</div>' +
      '<div class="text-xs text-gray-500 mt-1">' +
      this.t('framework.htmlDesc') +
      '</div></div></div>' +
      '<div><label class="block text-sm font-medium text-gray-700 mb-2">' +
      this.t('framework.outputDir') +
      '</label>' +
      '<input type="text" id="output-dir" class="input-field" placeholder="' +
      this.t('framework.outputDirPlaceholder') +
      '" value="' +
      this.state.outputDir +
      '"></div>' +
      '<p class="text-xs text-gray-400 mt-4">' +
      this.t('framework.skipHint') +
      '</p></div>'
    );
  }

  renderComplete() {
    return (
      '<div class="py-6 text-center">' +
      '<div class="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">' +
      '<svg class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg></div>' +
      '<h2 class="text-2xl font-bold text-gray-900 mb-2">' +
      this.t('complete.title') +
      '</h2>' +
      '<p class="text-gray-500 mb-8">' +
      this.t('complete.subtitle') +
      '</p>' +
      '<div class="bg-gray-50 rounded-xl p-5 text-left max-w-md mx-auto mb-6">' +
      '<div class="font-medium text-gray-900 mb-3">' +
      this.t('complete.whatNext') +
      '</div>' +
      '<div class="space-y-2 text-sm">' +
      '<div class="flex items-center gap-2 text-gray-600"><code class="bg-white px-2 py-1 rounded border text-primary-600 font-mono text-xs">figma-dev validate</code><span class="text-gray-500">— ' +
      this.t('complete.cmdValidate') +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-gray-600"><code class="bg-white px-2 py-1 rounded border text-primary-600 font-mono text-xs">figma-dev sync</code><span class="text-gray-500">— ' +
      this.t('complete.cmdSync') +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-gray-600"><code class="bg-white px-2 py-1 rounded border text-primary-600 font-mono text-xs">figma-dev jsx</code><span class="text-gray-500">— ' +
      this.t('complete.cmdJsx') +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-gray-600"><code class="bg-white px-2 py-1 rounded border text-primary-600 font-mono text-xs">figma-dev assets</code><span class="text-gray-500">— ' +
      this.t('complete.cmdAssets') +
      '</span></div>' +
      '<div class="flex items-center gap-2 text-gray-600"><code class="bg-white px-2 py-1 rounded border text-primary-600 font-mono text-xs">figma-dev metadata</code><span class="text-gray-500">— ' +
      this.t('complete.cmdMetadata') +
      '</span></div>' +
      '</div></div>' +
      '<a href="https://gitee.com/shanxi-youcha/figma-dev-tools" target="_blank" class="link inline-flex items-center gap-1 mb-6">📚 ' +
      this.t('complete.tutorialLink') +
      ' →</a>' +
      '<div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 max-w-md mx-auto">' +
      '<p class="text-yellow-800 text-sm">' +
      this.t('complete.mcpHint') +
      '</p></div></div>'
    );
  }

  renderEditorCard(editor) {
    const color = EDITOR_COLORS[editor.name] || '#6b7280';
    const isInstalled = this.state.installedEditors.has(editor.name);
    const isInstalling = editor.installing;
    const initials = editor.name.substring(0, 2).toUpperCase();

    let statusBadge = '';
    let buttonHtml = '';

    if (editor.installed) {
      statusBadge = '<span class="status-badge success">✓ ' + this.t('editors.installed') + '</span>';
      buttonHtml = '<button class="btn-install installed" disabled>' + this.t('editors.installed') + '</button>';
    } else if (editor.detected) {
      if (isInstalling) {
        statusBadge =
          '<span class="status-badge checking"><span class="spinner"></span> ' +
          this.t('editors.installing') +
          '</span>';
        buttonHtml = '<button class="btn-install" disabled><span class="spinner"></span></button>';
      } else if (isInstalled) {
        statusBadge = '<span class="status-badge success">✓ ' + this.t('editors.installSuccess') + '</span>';
        buttonHtml = '<button class="btn-install installed" disabled>' + this.t('editors.installed') + '</button>';
      } else {
        statusBadge = '<span class="status-badge pending">' + this.t('editors.install') + '</span>';
        buttonHtml =
          '<button class="btn-install" data-editor="' +
          editor.name +
          '" data-install="true">' +
          this.t('editors.install') +
          '</button>';
      }
    } else {
      statusBadge =
        '<span class="status-badge" style="background:#f3f4f6;color:#9ca3af;">' +
        this.t('editors.notDetected') +
        '</span>';
      buttonHtml =
        '<button class="btn-install" data-editor="' +
        editor.name +
        '" data-install="true" style="background:#9ca3af;">' +
        this.t('editors.install') +
        '</button>';
    }

    return (
      '<div class="card editor-card">' +
      '<div class="flex items-center gap-4"><div class="editor-icon" style="background:' +
      color +
      ';">' +
      initials +
      '</div>' +
      '<div><div class="font-semibold text-gray-900">' +
      editor.name +
      '</div>' +
      statusBadge +
      '</div></div>' +
      buttonHtml +
      '</div>'
    );
  }

  async loadEditors() {
    const data = await this.api('/api/editors');
    if (data.success) {
      this.state.editors = data.editors || [];
      this.renderEditorsList();
    }
  }

  async installEditor(editorName) {
    const editor = this.state.editors.find((e) => e.name === editorName);
    if (!editor) return;

    editor.installing = true;
    this.renderEditorsList();

    const data = await this.api('/api/editors/install', {
      method: 'POST',
      body: JSON.stringify({ editor: editorName }),
    });

    editor.installing = false;

    if (data.success) {
      this.state.installedEditors.add(editorName);
      editor.installed = true;
      this.showToast(editorName + ' ' + this.t('editors.installSuccess'), 'success');
    } else {
      this.showToast(editorName + ' ' + this.t('editors.installFailed'), 'error');
    }

    this.renderEditorsList();
  }

  renderEditorsList() {
    const listEl = document.getElementById('editors-list');
    if (!listEl) return;

    if (this.state.editors.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8 text-gray-400">' + this.t('editors.noEditors') + '</div>';
    } else {
      const detectedCount = this.state.editors.filter((e) => e.detected || e.installed).length;
      listEl.innerHTML =
        '<p class="text-sm text-gray-500 mb-4">' +
        this.t('editors.detected') +
        ': ' +
        detectedCount +
        '</p>' +
        this.state.editors.map((e) => this.renderEditorCard(e)).join('');
    }
    this.bindEditorEvents();
  }

  async validateToken() {
    const input = document.getElementById('token-input');
    const token = input?.value?.trim();

    if (!token || token.length < 20 || !token.startsWith('figd_')) {
      input?.classList.add('error');
      this.showToast(
        this.lang === 'zh-CN' ? 'Token 格式不正确（以 figd_ 开头，至少20字符）' : 'Invalid Token format',
        'error',
      );
      return;
    }

    const btn = document.getElementById('btn-validate-token');
    const statusEl = document.getElementById('token-status');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ' + this.t('token.validating');
    }

    if (statusEl) {
      statusEl.innerHTML =
        '<span class="status-badge checking"><span class="spinner"></span> ' + this.t('token.validating') + '</span>';
    }

    const data = await this.api('/api/token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (data.success && data.valid) {
      this.state.token = token;
      this.state.tokenValidated = true;
      if (input) {
        input.classList.remove('error');
        input.classList.add('success');
      }
      if (statusEl)
        statusEl.innerHTML = '<span class="status-badge success">✓ ' + this.t('token.validateSuccess') + '</span>';
      this.showToast(this.t('token.validateSuccess'), 'success');
      this.renderFooter();
    } else {
      input?.classList.add('error');
      if (statusEl)
        statusEl.innerHTML = '<span class="status-badge error">✗ ' + this.t('token.validateFailed') + '</span>';
      this.showToast(this.t('token.validateFailed'), 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = this.t('token.validateBtn');
      }
    }
  }

  async setLanguage(lang) {
    this.lang = lang;
    await this.api('/api/language', {
      method: 'POST',
      body: JSON.stringify({ language: lang }),
    });
    this.render();
  }

  async completeConfig() {
    const outputDir = document.getElementById('output-dir')?.value || this.state.outputDir;
    await this.api('/api/config/complete', {
      method: 'POST',
      body: JSON.stringify({
        framework: this.state.framework,
        outputDir,
      }),
    });
    this.state.configComplete = true;
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      if (this.steps[this.currentStep] === 'framework') {
        this.completeConfig();
      }
      this.currentStep++;
      this.render();
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.render();
    }
  }

  render() {
    document.documentElement.lang = this.lang;
    this.renderStepIndicator();
    this.renderContent();
    this.renderFooter();
  }

  bindEvents() {
    const step = this.steps[this.currentStep];

    if (step === 'language') {
      document.querySelectorAll('.language-option').forEach((el) => {
        el.addEventListener('click', () => {
          const lang = el.dataset.lang;
          if (lang) this.setLanguage(lang);
        });
      });
    }

    if (step === 'token') {
      const toggleBtn = document.getElementById('toggle-token');
      const input = document.getElementById('token-input');

      toggleBtn?.addEventListener('click', () => {
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });

      const validateBtn = document.getElementById('btn-validate-token');
      validateBtn?.addEventListener('click', () => this.validateToken());

      const useExistingBtn = document.getElementById('btn-use-existing');
      useExistingBtn?.addEventListener('click', () => {
        this.state.tokenValidated = true;
        this.state.token = '__existing__';
        this.renderFooter();
        setTimeout(() => this.nextStep(), 300);
      });

      const replaceBtn = document.getElementById('btn-replace-token');
      replaceBtn?.addEventListener('click', () => {
        this.state.hasExistingToken = false;
        this.render();
      });

      input?.addEventListener('input', () => {
        input.classList.remove('error', 'success');
      });
    }

    if (step === 'framework') {
      document.querySelectorAll('.framework-option:not(.disabled)').forEach((el) => {
        el.addEventListener('click', () => {
          document.querySelectorAll('.framework-option').forEach((e) => e.classList.remove('selected'));
          el.classList.add('selected');
          this.state.framework = el.dataset.framework || 'react';
        });
      });
    }
  }

  bindEditorEvents() {
    document.querySelectorAll('[data-install="true"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const editorName = btn.dataset.editor;
        if (editorName) this.installEditor(editorName);
      });
    });
  }

  bindFooterEvents() {
    const backBtn = document.getElementById('btn-back');
    const nextBtn = document.getElementById('btn-next');
    const skipBtn = document.getElementById('btn-skip');
    const doneBtn = document.getElementById('btn-done');

    backBtn?.addEventListener('click', () => this.prevStep());
    nextBtn?.addEventListener('click', () => this.nextStep());
    skipBtn?.addEventListener('click', () => this.nextStep());
    doneBtn?.addEventListener('click', () => {
      window.close();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.figmaDevGui = new App();
});

/**
 * 多维度编辑器检测服务
 *
 * 参考 CC Switch 的检测思路，从多个维度判断编辑器是否真实安装：
 *   1. 进程检测（运行时是否启动）               - 最高可信度
 *   2. 可执行文件检测（cmd / which / 系统包）   - 高可信度
 *   3. 系统注册表 / .app 包 / .desktop 入口     - 中可信度
 *   4. MCP 配置文件目录 / 残留数据             - 低可信度（兜底）
 *
 * 任意一个高优先级维度命中即认为已安装。
 * 同时返回"检测方式"用于前端展示，让用户清楚知道是基于哪种证据判断的。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/** 检测方式 */
export type DetectionMethod =
  | 'process' // 进程正在运行
  | 'executable' // 可执行文件存在
  | 'desktop-entry' // 系统应用入口（.app / .desktop）
  | 'registry' // Windows 注册表
  | 'config-dir' // 配置目录存在（含 MCP 配置文件）
  | 'none'; // 未检测到

/** 优先级（用于多维命中时选择最可信的展示） */
const METHOD_PRIORITY: Record<DetectionMethod, number> = {
  process: 100,
  executable: 80,
  'desktop-entry': 60,
  registry: 60,
  'config-dir': 20,
  none: 0,
};

/** 编辑器检测支持的三平台 */
type EditorPlatform = 'win32' | 'darwin' | 'linux';

/** 将 NodeJS.Platform 收敛为编辑器支持的三平台，避免宽类型索引导致隐式 any */
function getEditorPlatform(): EditorPlatform {
  const p = os.platform();
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p;
  return 'linux';
}

export interface EditorDefinition {
  /** 编辑器唯一标识（与 MCP 配置中键名一致） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 官网下载地址（用于未安装时引导） */
  website: string;
  /** MCP 配置文件候选路径（多个，按优先级） */
  configPaths: string[];
  /** 是否使用 Zed 的 mcp_servers 字段 */
  zedFormat?: boolean;
  /** 各平台可执行文件名（如 'code', 'cursor'） */
  executables: {
    win32?: string[];
    darwin?: string[];
    linux?: string[];
  };
  /** 各平台进程名（用于运行时检测） */
  processNames: {
    win32?: string[];
    darwin?: string[];
    linux?: string[];
  };
  /** 各平台注册表键（Windows 专用） */
  registryKeys?: Array<{
    hive: 'HKLM' | 'HKCU' | 'HKCR';
    key: string;
    value?: string;
  }>;
  /** 各平台 .desktop / .app 包检测 */
  desktopEntries?: {
    darwin?: string[];
    linux?: string[];
  };
}

export interface DetectionResult {
  /** 是否检测到（任意维度命中） */
  detected: boolean;
  /** 当前是否已配置 figma-dev-tools MCP */
  installed: boolean;
  /** 最可信的检测方式 */
  method: DetectionMethod;
  /** 所有命中的检测方式（便于调试和详细展示） */
  matchedMethods: DetectionMethod[];
  /** 命中的可执行文件绝对路径（若有） */
  executablePath?: string;
  /** 命中的配置文件路径（若有） */
  configPath?: string;
  /** 可信度评分 0-100 */
  confidence: number;
}

/* ============================================================
 * 编辑器定义表
 * ============================================================ */

function HOME(): string {
  return os.homedir();
}

function APPDATA(): string {
  const p = os.platform();
  if (p === 'win32') return process.env.APPDATA || path.join(HOME(), 'AppData', 'Roaming');
  if (p === 'darwin') return path.join(HOME(), 'Library', 'Application Support');
  return path.join(HOME(), '.config');
}

const EDITOR_DEFINITIONS: EditorDefinition[] = [
  {
    id: 'trae',
    name: 'Trae',
    website: 'https://www.trae.ai/download',
    executables: {
      win32: ['Trae.exe', 'TRAE.exe', 'Trae CN.exe', 'TraeCN.exe'],
      darwin: ['Trae', 'TRAE', 'Trae CN'],
      linux: ['trae', 'trae-cn'],
    },
    processNames: {
      win32: ['Trae.exe', 'TRAE.exe', 'Trae CN.exe', 'TraeCN.exe'],
      darwin: ['Trae', 'TRAE', 'Trae CN'],
      linux: ['trae', 'trae-cn'],
    },
    desktopEntries: {
      darwin: ['Trae.app', 'TRAE.app', 'Trae CN.app'],
      linux: ['trae.desktop', 'trae-cn.desktop'],
    },
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') {
        return [
          path.join(appData, 'TRAE', 'User', 'mcp.json'),
          path.join(appData, 'TRAE SOLO CN', 'User', 'mcp.json'),
          path.join(appData, 'TRAE SOLO', 'User', 'mcp.json'),
          path.join(appData, 'Trae CN', 'User', 'mcp.json'),
        ];
      }
      if (p === 'darwin') {
        return [
          path.join(home, 'Library', 'Application Support', 'TRAE', 'User', 'mcp.json'),
          path.join(home, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json'),
          path.join(home, 'Library', 'Application Support', 'TRAE SOLO', 'User', 'mcp.json'),
          path.join(home, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json'),
        ];
      }
      return [
        path.join(home, '.config', 'TRAE', 'User', 'mcp.json'),
        path.join(home, '.config', 'TRAE SOLO CN', 'User', 'mcp.json'),
        path.join(home, '.config', 'TRAE SOLO', 'User', 'mcp.json'),
        path.join(home, '.config', 'Trae CN', 'User', 'mcp.json'),
      ];
    })(),
  },
  {
    id: 'vscode',
    name: 'VS Code',
    website: 'https://code.visualstudio.com/download',
    executables: {
      win32: ['Code.exe', 'code.exe'],
      darwin: ['Visual Studio Code', 'code'],
      linux: ['code'],
    },
    processNames: {
      win32: ['Code.exe', 'code.exe'],
      darwin: ['Visual Studio Code', 'Code'],
      linux: ['code'],
    },
    desktopEntries: {
      darwin: ['Visual Studio Code.app'],
      linux: ['code.desktop', 'visual-studio-code.desktop'],
    },
    registryKeys: [
      { hive: 'HKLM', key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1' },
      { hive: 'HKCU', key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1' },
    ],
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') {
        return [
          path.join(appData, 'Code', 'User', 'mcp.json'),
          path.join(appData, 'Code - Insiders', 'User', 'mcp.json'),
        ];
      }
      if (p === 'darwin') {
        return [
          path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
          path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'mcp.json'),
        ];
      }
      return [
        path.join(home, '.config', 'Code', 'User', 'mcp.json'),
        path.join(home, '.config', 'Code - Insiders', 'User', 'mcp.json'),
      ];
    })(),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    website: 'https://www.cursor.com/downloads',
    executables: {
      win32: ['Cursor.exe', 'cursor.exe'],
      darwin: ['Cursor', 'cursor'],
      linux: ['cursor'],
    },
    processNames: {
      win32: ['Cursor.exe', 'cursor.exe'],
      darwin: ['Cursor', 'cursor'],
      linux: ['cursor'],
    },
    desktopEntries: {
      darwin: ['Cursor.app'],
      linux: ['cursor.desktop'],
    },
    registryKeys: [
      { hive: 'HKCU', key: 'SOFTWARE\\Cursor' },
      { hive: 'HKLM', key: 'SOFTWARE\\Cursor' },
    ],
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') return [path.join(appData, 'Cursor', 'User', 'mcp.json')];
      if (p === 'darwin')
        return [path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json')];
      return [path.join(home, '.config', 'Cursor', 'User', 'mcp.json')];
    })(),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    website: 'https://windsurf.com/editor/download',
    executables: {
      win32: ['Windsurf.exe', 'windsurf.exe'],
      darwin: ['Windsurf', 'windsurf'],
      linux: ['windsurf'],
    },
    processNames: {
      win32: ['Windsurf.exe', 'windsurf.exe'],
      darwin: ['Windsurf', 'windsurf'],
      linux: ['windsurf'],
    },
    desktopEntries: {
      darwin: ['Windsurf.app'],
      linux: ['windsurf.desktop'],
    },
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') return [path.join(appData, 'Windsurf', 'User', 'mcp.json')];
      if (p === 'darwin')
        return [path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'mcp.json')];
      return [path.join(home, '.config', 'Windsurf', 'User', 'mcp.json')];
    })(),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    website: 'https://www.anthropic.com/claude-desktop',
    executables: {
      win32: ['Claude.exe', 'claude.exe'],
      darwin: ['Claude', 'claude'],
      linux: ['claude-desktop', 'claude'],
    },
    processNames: {
      win32: ['Claude.exe', 'claude.exe'],
      darwin: ['Claude', 'claude'],
      linux: ['claude-desktop', 'claude'],
    },
    desktopEntries: {
      darwin: ['Claude.app'],
      linux: ['claude-desktop.desktop', 'claude.desktop'],
    },
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') return [path.join(appData, 'Claude', 'claude_desktop_config.json')];
      if (p === 'darwin')
        return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
      return [path.join(home, '.config', 'Claude', 'claude_desktop_config.json')];
    })(),
  },
  {
    id: 'zed',
    name: 'Zed',
    website: 'https://zed.dev/download',
    zedFormat: true,
    executables: {
      win32: ['Zed.exe', 'zed.exe'],
      darwin: ['Zed', 'zed'],
      linux: ['zed', 'zeditor'],
    },
    processNames: {
      win32: ['Zed.exe', 'zed.exe'],
      darwin: ['Zed', 'zed'],
      linux: ['zed', 'zeditor'],
    },
    desktopEntries: {
      darwin: ['Zed.app'],
      linux: ['zed.desktop', 'zeditor.desktop'],
    },
    configPaths: [path.join(HOME(), '.zed', 'settings.json')],
  },
  {
    id: 'cline',
    name: 'Cline',
    website: 'https://github.com/cline/cline',
    // Cline/Roo Code 是 VSCode/Cursor 扩展，依赖宿主编辑器
    executables: {
      win32: ['Code.exe', 'cursor.exe'],
      darwin: ['Visual Studio Code', 'Code', 'Cursor', 'cursor'],
      linux: ['code', 'cursor'],
    },
    processNames: {
      win32: ['Code.exe', 'Cursor.exe'],
      darwin: ['Visual Studio Code', 'Code', 'Cursor'],
      linux: ['code', 'cursor'],
    },
    desktopEntries: {
      darwin: ['Visual Studio Code.app', 'Cursor.app'],
      linux: ['code.desktop', 'cursor.desktop'],
    },
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') {
        return [
          path.join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
          path.join(appData, 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        ];
      }
      if (p === 'darwin') {
        return [
          path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
          path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        ];
      }
      return [
        path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      ];
    })(),
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    website: 'https://github.com/RooVetGit/Roo-Code',
    executables: {
      win32: ['Code.exe', 'cursor.exe'],
      darwin: ['Visual Studio Code', 'Code', 'Cursor', 'cursor'],
      linux: ['code', 'cursor'],
    },
    processNames: {
      win32: ['Code.exe', 'Cursor.exe'],
      darwin: ['Visual Studio Code', 'Code', 'Cursor'],
      linux: ['code', 'cursor'],
    },
    desktopEntries: {
      darwin: ['Visual Studio Code.app', 'Cursor.app'],
      linux: ['code.desktop', 'cursor.desktop'],
    },
    configPaths: (() => {
      const p = os.platform();
      const home = HOME();
      const appData = APPDATA();
      if (p === 'win32') {
        return [
          path.join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
          path.join(appData, 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
        ];
      }
      if (p === 'darwin') {
        return [
          path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
          path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
        ];
      }
      return [
        path.join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
        path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
      ];
    })(),
  },
];

/* ============================================================
 * 平台检测函数
 * ============================================================ */

/**
 * 跨平台获取正在运行的进程列表（精简版：仅名称）
 * - Windows: tasklist
 * - macOS:   ps -axco command
 * - Linux:   ps -A -o comm
 */
function getRunningProcessNames(): Set<string> {
  const platform = os.platform();
  const names = new Set<string>();
  try {
    if (platform === 'win32') {
      const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
      });
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)"/);
        if (m && m[1]) names.add(m[1].toLowerCase());
      }
    } else {
      const args = platform === 'darwin' ? ['-axco', 'command'] : ['-A', '-o', 'comm='];
      const out = execFileSync('ps', args, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      });
      for (const line of out.split('\n')) {
        const name = line.trim();
        if (name && !name.startsWith('ps')) names.add(name.toLowerCase());
      }
    }
  } catch {
    // 进程检测失败不影响主流程
  }
  return names;
}

/**
 * Windows 注册表检测（仅 Windows）
 */
function checkRegistry(entries: NonNullable<EditorDefinition['registryKeys']>): boolean {
  if (os.platform() !== 'win32') return false;
  for (const entry of entries) {
    try {
      const result = execFileSync(
        'reg',
        ['query', `${entry.hive}\\${entry.key}`, '/ve'],
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000, windowsHide: true },
      );
      if (result) return true;
    } catch {
      // 该键不存在，继续
    }
  }
  return false;
}

/**
 * 在 PATH 及常见安装目录中查找可执行文件
 * @returns 找到则返回绝对路径
 */
function findExecutable(candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  const platform = os.platform();

  // 1) 使用 `where` / `which` 查 PATH
  try {
    const cmd = platform === 'win32' ? 'where' : 'which';
    for (const c of candidates) {
      try {
        const out = execFileSync(cmd, [c], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 3000,
          shell: platform === 'win32', // Windows 下需要 shell 找 .exe
        });
        const first = out
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find(Boolean);
        if (first && fs.existsSync(first)) return first;
      } catch {
        // 未找到，继续
      }
    }
  } catch {
    // ignore
  }

  // 2) 常见安装目录兜底
  const fallbackDirs: string[] = [];
  if (platform === 'win32') {
    fallbackDirs.push(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      path.join(process.env.LOCALAPPDATA || path.join(HOME(), 'AppData', 'Local'), 'Programs'),
    );
  } else if (platform === 'darwin') {
    fallbackDirs.push('/Applications', path.join(HOME(), 'Applications'));
  } else {
    fallbackDirs.push('/usr/bin', '/usr/local/bin', '/opt', path.join(HOME(), '.local', 'bin'));
  }

  for (const dir of fallbackDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const c of candidates) {
      // Windows 强制加 .exe
      const ext = platform === 'win32' ? '.exe' : '';
      const fileName = c.endsWith('.exe') || c.endsWith('.app') ? c : c + ext;
      const full = path.join(dir, fileName);
      if (fs.existsSync(full)) return full;
    }
  }
  return undefined;
}

/**
 * 检测 .app 包（macOS）/ .desktop 文件（Linux）
 */
function checkDesktopEntries(entries: string[] | undefined, platform: NodeJS.Platform): boolean {
  if (!entries || entries.length === 0) return false;

  if (platform === 'darwin') {
    const dirs = ['/Applications', path.join(HOME(), 'Applications')];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of entries) {
        if (fs.existsSync(path.join(dir, name))) return true;
      }
    }
  } else if (platform === 'linux') {
    const dirs = [
      '/usr/share/applications',
      '/var/lib/snapd/desktop/applications',
      path.join(HOME(), '.local', 'share', 'applications'),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of entries) {
        if (fs.existsSync(path.join(dir, name))) return true;
      }
    }
  }
  return false;
}

/**
 * 查找第一个存在的 MCP 配置文件路径
 */
function findExistingConfigPath(paths: string[]): string | undefined {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
    const dir = path.dirname(p);
    const parent = path.dirname(dir);
    if (fs.existsSync(dir) || fs.existsSync(parent)) {
      return p;
    }
  }
  return undefined;
}

/**
 * 判断配置文件是否已包含 figma-dev-tools MCP 配置
 */
function hasInstalledMcpConfig(configPath: string, zedFormat: boolean | undefined): boolean {
  try {
    if (!fs.existsSync(configPath)) return false;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const servers = zedFormat
      ? (json['mcp_servers'] as Record<string, unknown> | undefined)
      : (json['mcpServers'] as Record<string, unknown> | undefined);
    return !!(servers && servers['figma-dev-tools']);
  } catch {
    return false;
  }
}

/* ============================================================
 * 公开 API
 * ============================================================ */

/**
 * 检测单个编辑器
 */
export function detectEditor(def: EditorDefinition): DetectionResult {
  const platform = getEditorPlatform();
  const matched: DetectionMethod[] = [];
  const evidence: { executablePath?: string; configPath?: string } = {};

  // 1. 进程检测（最高优先级）
  const processes = getRunningProcessNames();
  const procNames = def.processNames[platform] || [];
  if (procNames.some((p) => processes.has(p.toLowerCase()))) {
    matched.push('process');
  }

  // 2. 可执行文件检测
  const exes = def.executables[platform] || [];
  const exePath = findExecutable(exes);
  if (exePath) {
    matched.push('executable');
    evidence.executablePath = exePath;
  }

  // 3. 系统应用入口（.app / .desktop）
  if (checkDesktopEntries(def.desktopEntries?.[platform === 'darwin' ? 'darwin' : 'linux'], platform)) {
    matched.push('desktop-entry');
  }

  // 4. Windows 注册表
  if (platform === 'win32' && def.registryKeys && def.registryKeys.length > 0) {
    if (checkRegistry(def.registryKeys)) matched.push('registry');
  }

  // 5. MCP 配置文件（最低优先级，仅兜底）
  const configPath = findExistingConfigPath(def.configPaths);
  if (configPath) {
    matched.push('config-dir');
    evidence.configPath = configPath;
  }

  // 选择最高优先级的检测方式作为"主方式"
  const bestMethod: DetectionMethod =
    matched.length === 0
      ? 'none'
      : matched.reduce((best, cur) => (METHOD_PRIORITY[cur] > METHOD_PRIORITY[best] ? cur : best));

  const detected = matched.length > 0;
  const installed = configPath ? hasInstalledMcpConfig(configPath, def.zedFormat) : false;

  return {
    detected,
    installed,
    method: bestMethod,
    matchedMethods: matched,
    executablePath: evidence.executablePath,
    configPath: evidence.configPath,
    confidence: detected ? METHOD_PRIORITY[bestMethod] : 0,
  };
}

/**
 * 检测所有编辑器，并按"是否安装 + 可信度"排序
 */
export function detectAllEditors(): Array<{ definition: EditorDefinition; detection: DetectionResult }> {
  const results = EDITOR_DEFINITIONS.map((def) => ({
    definition: def,
    detection: detectEditor(def),
  }));

  results.sort((a, b) => {
    if (a.detection.detected !== b.detection.detected) {
      return a.detection.detected ? -1 : 1;
    }
    if (a.detection.installed !== b.detection.installed) {
      return a.detection.installed ? -1 : 1;
    }
    return b.detection.confidence - a.detection.confidence;
  });

  return results;
}

/**
 * 便捷：获取第一个存在的 MCP 配置文件路径（用于安装写入）
 */
export function resolveConfigPath(def: EditorDefinition): string | undefined {
  for (const p of def.configPaths) {
    const dir = path.dirname(p);
    const parent = path.dirname(dir);
    if (fs.existsSync(p) || fs.existsSync(dir) || fs.existsSync(parent)) {
      return p;
    }
  }
  // 没有命中任何路径时，返回第一个候选（会在安装时自动创建）
  return def.configPaths[0];
}

export function getEditorDefinitions(): EditorDefinition[] {
  return EDITOR_DEFINITIONS;
}
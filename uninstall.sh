#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_NAME="figma-dev-tools"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${CYAN}ℹ${NC} $*"; }
log_success() { echo -e "${GREEN}✓${NC} $*"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
log_error()   { echo -e "${RED}✗${NC} $*"; }
log_step()    { echo -e "\n${BOLD}▶ $*${NC}"; }
log_header()  { echo -e "\n${MAGENTA}${BOLD}$*${NC}"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

print_banner() {
  echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${MAGENTA}${BOLD}║     Figma Dev Tools - MCP 卸载向导          ║${NC}"
  echo -e "${MAGENTA}${BOLD}║     Figma Dev Tools - MCP Uninstaller       ║${NC}"
  echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════╝${NC}"
}

declare -a REMOVED=()
declare -a NOT_FOUND=()
declare -a FAILED=()

has_server_config() {
  local file="$1"
  if [ ! -f "$file" ]; then echo "false"; return; fi
  if command_exists node; then
    node -e "
      const fs = require('fs');
      try {
        const cfg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        console.log(cfg.mcpServers && cfg.mcpServers['$SERVER_NAME'] ? 'true' : 'false');
      } catch { console.log('false'); }
    "
  else
    grep -q "\"$SERVER_NAME\"" "$file" 2>/dev/null && echo "true" || echo "false"
  fi
}

remove_server_config() {
  local file="$1"
  if command_exists node; then
    node -e "
      const fs = require('fs');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync('$file', 'utf8')); } catch(e) { process.exit(1); }
      if (cfg.mcpServers && cfg.mcpServers['$SERVER_NAME']) {
        delete cfg.mcpServers['$SERVER_NAME'];
        if (Object.keys(cfg.mcpServers).length === 0) delete cfg.mcpServers;
        fs.writeFileSync('$file', JSON.stringify(cfg, null, 2) + '\n');
        console.log('removed');
      } else {
        console.log('notfound');
      }
    "
  else
    log_error "Node.js is required to modify config files"
    return 1
  fi
}

configure_editor() {
  local name="$1"
  shift
  local paths=("$@")
  local found=false
  local removed=false

  for config_path in "${paths[@]}"; do
    [ -z "$config_path" ] && continue
    if [ -f "$config_path" ]; then
      found=true
      local has
      has=$(has_server_config "$config_path")
      if [ "$has" = "true" ]; then
        if result=$(remove_server_config "$config_path"); then
          if [ "$result" = "removed" ]; then
            REMOVED+=("$name|$config_path")
            removed=true
            break
          fi
        fi
      fi
    fi
  done

  if ! $found; then
    NOT_FOUND+=("$name")
  elif ! $removed; then
    NOT_FOUND+=("$name (config exists but figma-dev-tools not found)")
  fi
}

print_summary() {
  log_header "卸载总结 / Uninstall Summary"
  echo ""

  if [ ${#REMOVED[@]} -gt 0 ]; then
    log_success "已从以下编辑器移除配置 / Removed from:"
    for entry in "${REMOVED[@]}"; do
      IFS='|' read -r ename epath <<< "$entry"
      echo -e "  ${GREEN}✓${NC} $ename"
      echo -e "    ${NC}$epath${NC}"
    done
  else
    log_info "未在任何编辑器中找到 figma-dev-tools 配置 / No configuration found"
  fi

  if [ ${#NOT_FOUND[@]} -gt 0 ]; then
    echo ""
    log_info "未检测到配置的编辑器 / Not configured in:"
    for name in "${NOT_FOUND[@]}"; do
      echo -e "  ${NC}- $name${NC}"
    done
  fi

  if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    log_header "失败 / Failed"
    for ename in "${FAILED[@]}"; do
      log_error "$ename"
    done
  fi

  echo ""
  log_header "后续步骤 / Next Steps"
  echo -e "
  1. ${YELLOW}重启编辑器${NC}: 重启你的 AI 编辑器以应用更改
     Restart editor: Restart your AI editor for changes to take effect

  2. ${NC}如需完全卸载${NC}: 运行 ${CYAN}npm uninstall -g figma-dev-tools${NC} 或删除本地目录
     To fully uninstall: Run npm uninstall -g figma-dev-tools or delete local directory

  3. ${NC}重新安装${NC}: 随时可以运行 ${CYAN}npx figma-dev-tools install${NC} 重新配置
     To reinstall: Run npx figma-dev-tools install anytime
  "

  echo -e "${GREEN}${BOLD}卸载完成！/ Uninstall complete! 👋${NC}\n"
}

main() {
  print_banner

  log_step "正在移除 MCP 配置 / Removing MCP configuration"

  configure_editor "Trae" \
    "$HOME/.trae/mcp.json" \
    "${APPDATA:-$HOME/.config}/Trae/mcp.json" \
    "${APPDATA:-$HOME/.config}/TRAE SOLO CN/mcp.json"

  configure_editor "VS Code" \
    "$HOME/Library/Application Support/Code/User/mcp.json" \
    "$HOME/.config/Code/User/mcp.json"

  configure_editor "VS Code (Insiders)" \
    "$HOME/Library/Application Support/Code - Insiders/User/mcp.json" \
    "$HOME/.config/Code - Insiders/User/mcp.json"

  configure_editor "Cursor" "$HOME/.cursor/mcp.json"
  configure_editor "Windsurf" "$HOME/.codeium/windsurf/mcp.json"

  if [[ "$OSTYPE" == "darwin"* ]]; then
    configure_editor "Claude Desktop" \
      "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  else
    configure_editor "Claude Desktop" \
      "$HOME/.config/claude/claude_desktop_config.json"
  fi

  print_summary
}

main "$@"

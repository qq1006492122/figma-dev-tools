#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_NAME="figma-dev-tools"
DIST_INDEX="$SCRIPT_DIR/dist/index.js"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

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

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

read_json_key() {
  local file="$1"
  local key="$2"
  if command_exists node; then
    node -e "
      const fs = require('fs');
      try {
        const cfg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        const val = cfg.mcpServers && cfg.mcpServers['$SERVER_NAME'] ? true : false;
        console.log(val ? 'true' : 'false');
      } catch { console.log('false'); }
    "
  else
    grep -q "\"$SERVER_NAME\"" "$file" 2>/dev/null && echo "true" || echo "false"
  fi
}

write_mcp_config() {
  local file="$1"
  local dist_path="$DIST_INDEX"

  mkdir -p "$(dirname "$file")"

  if [ ! -f "$file" ]; then
    cat > "$file" <<JSONEOF
{
  "mcpServers": {
    "$SERVER_NAME": {
      "command": "node",
      "args": ["$dist_path"],
      "env": {
        "FIGMA_ACCESS_TOKEN": ""
      }
    }
  }
}
JSONEOF
    return 0
  fi

  if command_exists node; then
    node -e "
      const fs = require('fs');
      const path = require('path');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync('$file', 'utf8')); } catch(e) { cfg = {}; }
      if (!cfg.mcpServers) cfg.mcpServers = {};
      cfg.mcpServers['$SERVER_NAME'] = {
        command: 'node',
        args: ['$dist_path'],
        env: { FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN || '' }
      };
      fs.writeFileSync('$file', JSON.stringify(cfg, null, 2) + '\n');
    "
  else
    log_warn "Node.js not found in PATH, using fallback merge (may not preserve non-MCP config)"
    local tmp
    tmp=$(mktemp)
    if grep -q '"mcpServers"' "$file"; then
      python3 -c "
import json, sys
with open('$file') as f: cfg = json.load(f)
cfg.setdefault('mcpServers', {})['$SERVER_NAME'] = {
    'command': 'node',
    'args': ['$dist_path'],
    'env': {'FIGMA_ACCESS_TOKEN': ''}
}
with open('$file', 'w') as f: json.dump(cfg, f, indent=2)
f.write('\n')
" 2>/dev/null || {
        log_error "Cannot merge config: need node or python3"
        rm -f "$tmp"
        return 1
      }
    fi
  fi
}

print_banner() {
  echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${MAGENTA}${BOLD}║     Figma Dev Tools - MCP 安装向导          ║${NC}"
  echo -e "${MAGENTA}${BOLD}║     Figma Dev Tools - MCP Installer         ║${NC}"
  echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════╝${NC}"
}

NPM_INSTALL_OK=false
BUILD_OK=false
ENV_CREATED=false
declare -a CONFIGURED_EDITORS=()
declare -a ALREADY_EDITORS=()
declare -a FAILED_EDITORS=()

main() {
  print_banner

  log_step "Step 1/4: 安装依赖 / Installing dependencies"
  if command_exists npm; then
    log_info "Running: npm install"
    (cd "$SCRIPT_DIR" && npm install) && NPM_INSTALL_OK=true
    if $NPM_INSTALL_OK; then
      log_success "依赖安装成功 / Dependencies installed"
    else
      log_error "依赖安装失败 / Failed to install dependencies"
    fi
  else
    log_error "npm not found. Please install Node.js first."
  fi

  log_step "Step 2/4: 编译 TypeScript / Building TypeScript"
  if [ -f "$SCRIPT_DIR/package.json" ]; then
    (cd "$SCRIPT_DIR" && npm run build) && BUILD_OK=true
    if [ -f "$DIST_INDEX" ]; then
      BUILD_OK=true
      log_success "编译成功 / Build successful"
    else
      log_error "编译失败：dist/index.js 不存在 / Build failed"
    fi
  fi

  if ! $BUILD_OK; then
    log_error "无法继续安装，编译未完成 / Cannot continue without successful build"
    print_summary
    exit 1
  fi

  log_step "Step 3/4: 创建环境配置 / Setting up environment"
  if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ENV_CREATED=true
    log_success "已创建 .env 文件，请编辑填写 FIGMA_ACCESS_TOKEN / Created .env"
    log_info "  $ENV_FILE"
  elif [ -f "$ENV_FILE" ]; then
    log_info ".env 文件已存在 / .env already exists"
    ENV_CREATED=true
  else
    log_warn ".env.example 不存在，跳过 / .env.example not found"
  fi

  log_step "Step 4/4: 配置 AI 编辑器 MCP / Configuring AI editor MCP settings"

  configure_editor "Trae" \
    "$HOME/.trae/mcp.json" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/Trae/mcp.json"

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

configure_editor() {
  local name="$1"
  shift
  local paths=("$@")
  local done=false

  for config_path in "${paths[@]}"; do
    [ -z "$config_path" ] && continue
    if [ -f "$config_path" ] || [ -d "$(dirname "$config_path")" ]; then
      local already
      already=$(read_json_key "$config_path" "mcpServers")
      if [ "$already" = "true" ]; then
        ALREADY_EDITORS+=("$name|$config_path")
        done=true
        break
      fi
      if write_mcp_config "$config_path"; then
        CONFIGURED_EDITORS+=("$name|$config_path")
        done=true
        break
      fi
    fi
  done

  if ! $done; then
    for config_path in "${paths[@]}"; do
      [ -z "$config_path" ] && continue
      local parent_dir
      parent_dir="$(dirname "$config_path")"
      if mkdir -p "$parent_dir" 2>/dev/null; then
        if write_mcp_config "$config_path"; then
          CONFIGURED_EDITORS+=("$name|$config_path")
          done=true
          break
        fi
      fi
    done
  fi

  if ! $done; then
    FAILED_EDITORS+=("$name")
  fi
}

print_summary() {
  log_header "安装总结 / Installation Summary"
  echo ""

  if $NPM_INSTALL_OK; then
    log_success "依赖安装 ✓ / Dependencies installed ✓"
  else
    log_error "依赖安装 ✗ / Dependencies failed ✗"
  fi

  if $BUILD_OK; then
    log_success "TypeScript 编译 ✓ / TypeScript built ✓"
  else
    log_error "TypeScript 编译 ✗ / TypeScript build failed ✗"
  fi

  if $ENV_CREATED; then
    log_success ".env 配置就绪 ✓ / .env ready ✓"
  else
    log_warn ".env 需要手动配置 / .env needs manual setup"
  fi

  echo ""
  log_header "已配置的编辑器 / Configured Editors"

  if [ ${#CONFIGURED_EDITORS[@]} -eq 0 ] && [ ${#ALREADY_EDITORS[@]} -eq 0 ]; then
    log_warn "未检测到已安装的 AI 编辑器 / No AI editors detected"
    echo ""
    echo -e "${YELLOW}  手动配置方法 / Manual configuration:${NC}"
    echo "  将以下配置添加到你的编辑器 MCP 设置文件中："
    echo "  Add the following to your editor's MCP config:"
    echo ""
    echo -e "${NC}  {"
    echo "    \"mcpServers\": {"
    echo "      \"$SERVER_NAME\": {"
    echo "        \"command\": \"node\","
    echo "        \"args\": [\"$DIST_INDEX\"],"
    echo "        \"env\": { \"FIGMA_ACCESS_TOKEN\": \"\" }"
    echo "      }"
    echo "    }"
    echo "  }"
  else
    for entry in "${CONFIGURED_EDITORS[@]}"; do
      IFS='|' read -r ename epath <<< "$entry"
      log_success "$ename ✓"
      echo -e "    ${NC}$epath${NC}"
    done
    for entry in "${ALREADY_EDITORS[@]}"; do
      IFS='|' read -r ename epath <<< "$entry"
      log_info "$ename (已配置 / already configured)"
      echo -e "    ${NC}$epath${NC}"
    done
  fi

  if [ ${#FAILED_EDITORS[@]} -gt 0 ]; then
    echo ""
    log_header "配置失败 / Failed Editors"
    for ename in "${FAILED_EDITORS[@]}"; do
      log_error "$ename"
    done
  fi

  echo ""
  log_header "后续步骤 / Next Steps"
  echo -e "
  1. ${YELLOW}配置 Figma Token${NC}: 编辑 ${CYAN}.env${NC} 文件，填入你的 FIGMA_ACCESS_TOKEN
     Configure Figma Token: Edit .env and set your FIGMA_ACCESS_TOKEN
     Get token: ${CYAN}https://www.figma.com/developers/api#access-tokens${NC}

  2. ${YELLOW}重启编辑器${NC}: 重启你的 AI 编辑器以加载 MCP 服务器
     Restart editor: Restart your AI editor to load the MCP server

  3. ${YELLOW}验证安装${NC}: 在编辑器中尝试使用 figma_* 工具
     Verify: Try using figma_* tools in your editor
  "

  echo -e "${GREEN}${BOLD}安装完成！/ Installation complete! 🎉${NC}\n"
}

main "$@"

#!/bin/bash
set -e

# PagerMon Unified Installer
# Supports: Server, Client, or Both | Barebones or Docker
# Target: Linux (Debian/Ubuntu/CentOS/Alpine)

REPO_URL="https://github.com/renfrewcountyscanner/pagermonv2.git"
INSTALL_DIR="/opt/pagermon"
NODE_MIN_MAJOR=18

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

ask() {
    local prompt="$1"
    local default="$2"
    read -rp "$prompt [$default]: " val
    echo "${val:-$default}"
}

ask_yesno() {
    local prompt="$1"
    local default="$2"
    while true; do
        read -rp "$prompt [$default]: " val
        val="${val:-$default}"
        case "$val" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This installer must be run as root (use sudo)"
        exit 1
    fi
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

check_node_version() {
    if check_command node; then
        NODE_MAJOR=$(node -e "console.log(process.version.split('.')[0].replace('v',''))")
        if [ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ]; then
            return 0
        fi
    fi
    return 1
}

install_node() {
    print_warn "Node.js $NODE_MIN_MAJOR+ not found. Installing..."
    case "$OS" in
        debian|ubuntu)
            apt-get update -qq
            apt-get install -y -qq curl ca-certificates gnupg
            mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
            apt-get update -qq
            apt-get install -y -qq nodejs
            ;;
        centos|rhel|fedora|rocky|almalinux)
            if check_command dnf; then
                dnf install -y curl
                curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
                dnf install -y nodejs
            else
                yum install -y curl
                curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
                yum install -y nodejs
            fi
            ;;
        alpine)
            apk add --no-cache nodejs npm curl
            ;;
        *)
            print_error "Unsupported OS: $OS. Please install Node.js $NODE_MIN_MAJOR+ manually."
            exit 1
            ;;
    esac
    print_success "Node.js $(node -v) installed"
}

install_deps_barebones() {
    print_header "Installing System Dependencies"
    case "$OS" in
        debian|ubuntu)
            apt-get update -qq
            apt-get install -y -qq git curl sqlite3 build-essential rtl-sdr multimon-ng
            ;;
        centos|rhel|fedora|rocky|almalinux)
            if check_command dnf; then
                dnf install -y git curl sqlite3 gcc-c++ make rtl-sdr multimon-ng
            else
                yum install -y git curl sqlite3 gcc-c++ make rtl-sdr multimon-ng
            fi
            ;;
        alpine)
            apk add --no-cache git curl sqlite sqlite-dev build-base libusb-dev linux-headers
            ;;
        *)
            print_warn "Unknown OS. Please ensure git, curl, sqlite3, and build tools are installed."
            ;;
    esac
}

install_deps_docker() {
    if ! check_command docker; then
        print_warn "Docker not found. Installing..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
        print_success "Docker installed"
    fi

    if ! check_command docker-compose && ! docker compose version >/dev/null 2>&1; then
        print_warn "Docker Compose not found. Installing..."
        DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
        curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        print_success "Docker Compose installed"
    fi
}

clone_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        if ask_yesno "Directory $INSTALL_DIR already exists. Remove and re-clone?" "N"; then
            rm -rf "$INSTALL_DIR"
        else
            print_warn "Using existing $INSTALL_DIR"
            return
        fi
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    print_success "Repository cloned to $INSTALL_DIR"
}

generate_secret() {
    openssl rand -hex 24
}

hash_password() {
    local password="$1"
    node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$password', 8));"
}

install_server_barebones() {
    print_header "Installing PagerMon Server (Barebones)"
    
    cd "$INSTALL_DIR/server"
    
    print_warn "Installing server dependencies..."
    npm ci
    
    print_warn "Building Vue frontend..."
    cd "$INSTALL_DIR/server/themes/default/vue-client"
    npm ci
    npm run build
    cd "$INSTALL_DIR/server"
    
    if [ ! -f config/config.json ]; then
        cp config/default.json config/config.json
        
        local secret=$(generate_secret)
        sed -i "s/REPLACE_ME_ON_FIRST_RUN/$secret/" config/config.json
        print_success "Generated sessionSecret"
        
        local admin_password=$(ask "Set admin password" "changeme")
        local hashed=$(hash_password "$admin_password")
        sed -i "s|\\$2a\\$08\\$De/aXnQkZIEbQ9p8J22tHuzLltqIbsAxE2CGgRMPLaaIwwHmVrpsu|$hashed|" config/config.json
        print_success "Admin password set"
        
        local apikey=$(generate_secret)
        sed -i "s/REPLACE_WITH_YOUR_API_KEY/$apikey/" config/config.json
        print_success "Generated API key: $apikey"
        echo "API_KEY=$apikey" > "$INSTALL_DIR/.apikey"
    fi
    
    local use_pm2
    if ask_yesno "Use PM2 as process manager? (Recommended)" "Y"; then
        if ! check_command pm2; then
            npm install -g pm2
        fi
        pm2 start process.json
        pm2 startup
        pm2 save
        print_success "PM2 configured. Server is running on port 3000"
    else
        local sysd_dir="/etc/systemd/system"
        cat > "$sysd_dir/pagermon.service" <<EOF
[Unit]
Description=PagerMon Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/server
ExecStart=/usr/bin/node app.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        systemctl enable pagermon
        systemctl start pagermon
        print_success "systemd service configured. Server is running on port 3000"
    fi
}

install_client_barebones() {
    print_header "Installing PagerMon Client (Barebones)"
    
    cd "$INSTALL_DIR/client"
    
    print_warn "Installing client dependencies..."
    npm ci
    
    if [ ! -f config/config.json ]; then
        cp config/default.json config/config.json
        
        local server_url=$(ask "PagerMon server URL" "http://127.0.0.1:3000")
        local apikey=$(ask "Server API key" "")
        local identifier=$(ask "Client identifier (source name)" "MyScanner")
        local device=$(ask "RTL-SDR device ID" "0")
        local freq=$(ask "Frequency (e.g. 148.5875M)" "148.5875M")
        local mode=$(ask "POCSAG mode (POCSAG512/POCSAG1200/POCSAG2400)" "POCSAG512")
        
        cat > config/config.json <<EOF
{
  "apikey": "$apikey",
  "hostname": "$server_url",
  "identifier": "$identifier",
  "sendFunctionCode": false,
  "useTimestamp": true,
  "EAS": {
    "excludeEvents": [],
    "includeFIPS": [],
    "addressAddType": true
  }
}
EOF
        
        # Write reader.sh with chosen settings
        cat > reader.sh <<EOF
#!/bin/bash
rtl_fm -d $device -E dc -F 0 -A fast -f $freq -s22050 - | 
multimon-ng -q -b1 -c -a $mode -f alpha -t raw /dev/stdin | 
node reader.js
EOF
        chmod +x reader.sh
        print_success "Client configured"
    fi
    
    local sysd_dir="/etc/systemd/system"
    cat > "$sysd_dir/pagermon-client.service" <<EOF
[Unit]
Description=PagerMon Client
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/client
ExecStart=/bin/bash $INSTALL_DIR/client/reader.sh
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable pagermon-client
    systemctl start pagermon-client
    print_success "systemd service configured. Client is running"
}

install_docker() {
    print_header "Installing PagerMon (Docker)"
    
    cd "$INSTALL_DIR"
    
    if [ ! -f .env ]; then
        cp .env.example .env
        local port=$(ask "Server port" "3000")
        local tz=$(ask "Timezone" "America/Toronto")
        sed -i "s/SERVER_PORT=3000/SERVER_PORT=$port/" .env
        sed -i "s|TZ=America/Toronto|TZ=$tz|" .env
        print_success ".env created"
    fi
    
    print_warn "Building and starting server..."
    docker compose up -d --build pagermon-server
    
    if ask_yesno "Start the client container too? (requires RTL-SDR dongle)" "N"; then
        local device=$(ask "RTL-SDR device ID" "0")
        local freq=$(ask "Frequency (e.g. 148.5875M)" "148.5875M")
        local mode=$(ask "POCSAG mode" "POCSAG512")
        sed -i "s/RTL_DEVICE=0/RTL_DEVICE=$device/" .env
        sed -i "s/RTL_FREQ=148.5875M/RTL_FREQ=$freq/" .env
        sed -i "s/POCSAG_MODE=POCSAG512/POCSAG_MODE=$mode/" .env
        docker compose --profile client up -d --build
    fi
    
    print_success "Docker containers are running"
    echo "Server available at: http://localhost:$(grep SERVER_PORT .env | cut -d= -f2)"
    echo ""
    echo "To view logs: docker compose logs -f"
    echo "To stop:    docker compose down"
}

# ───────────────────────────────────────────
# MAIN
# ───────────────────────────────────────────

clear
print_header "PagerMon Unified Installer"

detect_os
check_root

echo "Detected OS: $OS $VER"
echo ""

if ! ask_yesno "Continue with installation?" "Y"; then
    exit 0
fi

# What to install?
echo ""
echo "What would you like to install?"
echo "  1) Server only"
echo "  2) Client only"
echo "  3) Both"
install_choice=$(ask "Enter choice" "3")

# How to install?
echo ""
echo "Installation method?"
echo "  1) Barebones (direct install on this machine)"
echo "  2) Docker (containerized)"
method_choice=$(ask "Enter choice" "1")

clone_repo

case "$method_choice" in
    1)
        install_deps_barebones
        if ! check_node_version; then
            install_node
        fi
        case "$install_choice" in
            1) install_server_barebones ;;
            2) install_client_barebones ;;
            3) install_server_barebones; install_client_barebones ;;
        esac
        ;;
    2)
        install_deps_docker
        case "$install_choice" in
            1) install_docker ;;
            2)
                print_error "Client-only Docker install is not supported via this script."
                print_warn "Use 'docker compose --profile client up -d' manually after server setup."
                ;;
            3) install_docker ;;
        esac
        ;;
esac

print_header "Installation Complete"

if [ "$method_choice" = "1" ]; then
    echo "Installation directory: $INSTALL_DIR"
    if [ "$install_choice" = "1" ] || [ "$install_choice" = "3" ]; then
        echo "Server: http://localhost:3000"
        echo "Admin login: admin / (the password you set)"
        if [ -f "$INSTALL_DIR/.apikey" ]; then
            echo "API Key: $(cat $INSTALL_DIR/.apikey)"
        fi
    fi
fi

echo ""
echo "For support, visit: https://github.com/renfrewcountyscanner/pagermonv2"

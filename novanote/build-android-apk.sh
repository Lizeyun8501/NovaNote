#!/usr/bin/env bash
# =============================================================================
# NovaNote Android APK 自动化编译脚本 (Linux)
# =============================================================================
# 用法:
#   ./build-android-apk.sh                  # 默认 aarch64
#   ./build-android-apk.sh aarch64          # 指定 ABI
#   ./build-android-apk.sh --skip-rust      # 跳过 Rust 编译
#   ./build-android-apk.sh --skip-frontend  # 跳过前端编译
#
# 环境依赖 (Environment Dependencies):
#   - JDK 17 (OpenJDK / Temurin)            # AGP 8.11.0 不支持 JDK 25
#   - Rust stable                            # rustc, cargo
#   - Node.js 18+ & pnpm                    # 前端构建
#   - Android SDK 组件:
#       * cmdline-tools (latest)
#       * platform-tools
#       * build-tools;35.0.0
#       * platforms;android-36
#       * ndk;26.1.10909125
#   - Gradle 8.14.4                         # 系统 gradle,绕过 wrapper 下载
#
# 自动下载组件 (Auto-downloaded):
#   - 缺失的 Android SDK 组件 (via sdkmanager)
#   - 缺失的 Rust Android 目标 (via rustup target add)
#
# 关键环境变量:
#   ANDROID_HOME / ANDROID_SDK_ROOT / NDK_HOME / JAVA_HOME
#   BINDGEN_EXTRA_CLANG_ARGS (cross-compile 时由脚本自动设置)
#   HTTP_PROXY / HTTPS_PROXY (代理环境,系统已配置)
# =============================================================================

set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 配置 ----
ANDROID_SDK_DEFAULT="/opt/android-sdk"
NDK_VERSION="26.1.10909125"
BUILD_TOOLS_VERSION="35.0.0"
PLATFORM_VERSION="android-36"
GRADLE_VERSION="8.14.4"
KEYSTORE_PATH="${HOME}/debug.keystore"
KEYSTORE_PASS="android"
KEY_ALIAS="androiddebugkey"

# 解析参数
TARGET="aarch64"
SKIP_RUST=0
SKIP_FRONTEND=0
for arg in "$@"; do
    case "$arg" in
        aarch64|armv7|i686|x86_64) TARGET="$arg" ;;
        --skip-rust)    SKIP_RUST=1 ;;
        --skip-frontend) SKIP_FRONTEND=1 ;;
        --help|-h)
            grep -E "^#( |$)" "$0" | sed 's/^#//'
            exit 0
            ;;
        *) log_warn "未知参数: $arg" ;;
    esac
done

# ---- 1. 定位工作目录 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
log_info "工作目录: $SCRIPT_DIR"

# ---- 2. 检查并安装 JDK 17 ----
log_info "检查 JDK 17..."
if ! command -v java >/dev/null 2>&1; then
    log_error "未检测到 java,请安装 OpenJDK 17"
    echo "  Debian/Ubuntu: sudo apt install -y openjdk-17-jdk"
    echo "  RHEL/CentOS:   sudo dnf install -y java-17-openjdk-devel"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -1 | awk -F'"' '{print $2}' | cut -d'.' -f1)
JAVA_HOME_CANDIDATE=$(dirname $(dirname $(readlink -f $(which java))))
if [ "$JAVA_VERSION" != "17" ] && [ -d "/root/.local/share/mise/installs/java/17.0.2" ]; then
    log_warn "当前 java 版本是 $JAVA_VERSION,AGP 8.11.0 需要 JDK 17,自动切换"
    export JAVA_HOME="/root/.local/share/mise/installs/java/17.0.2"
    export PATH="$JAVA_HOME/bin:$PATH"
fi
if [ -z "${JAVA_HOME:-}" ]; then
    export JAVA_HOME="$JAVA_HOME_CANDIDATE"
fi
log_ok "JAVA_HOME=$JAVA_HOME ($(java -version 2>&1 | head -1))"

# ---- 3. 安装/检查 Android SDK ----
log_info "配置 Android SDK..."
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_SDK_DEFAULT" ]; then
    export ANDROID_HOME="$ANDROID_SDK_DEFAULT"
fi
if [ -z "${ANDROID_HOME:-}" ]; then
    log_warn "未找到 Android SDK,自动安装到 $ANDROID_SDK_DEFAULT"
    sudo mkdir -p "$ANDROID_SDK_DEFAULT" || mkdir -p "$ANDROID_SDK_DEFAULT"
    sudo chown -R "$USER" "$ANDROID_SDK_DEFAULT" 2>/dev/null || true
    export ANDROID_HOME="$ANDROID_SDK_DEFAULT"
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"

# 检查并安装 cmdline-tools
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
    log_info "下载并安装 Android cmdline-tools..."
    CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    TMP_DIR=$(mktemp -d)
    curl -L --connect-timeout 30 --max-time 600 -o "$TMP_DIR/cmdtools.zip" "$CMDLINE_TOOLS_URL"
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    unzip -q "$TMP_DIR/cmdtools.zip" -d "$TMP_DIR"
    mv "$TMP_DIR/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
    rm -rf "$TMP_DIR"
    log_ok "cmdline-tools 安装完成"
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# 接受许可 & 安装必需组件
log_info "检查并安装 Android SDK 组件..."
yes | sdkmanager --licenses >/dev/null 2>&1 || true
NEEDED_PACKAGES=(
    "platform-tools"
    "build-tools;$BUILD_TOOLS_VERSION"
    "platforms;$PLATFORM_VERSION"
    "ndk;$NDK_VERSION"
)
for pkg in "${NEEDED_PACKAGES[@]}"; do
    if [ ! -d "$ANDROID_HOME/${pkg//;/;}" ] 2>/dev/null; then
        log_info "  安装 $pkg ..."
        sdkmanager "$pkg" 2>&1 | tail -3
    else
        log_ok "  $pkg 已安装"
    fi
done

# ---- 4. 安装 Gradle (系统级) ----
log_info "检查 Gradle..."
GRADLE_PATH=$(which gradle 2>/dev/null || true)
if [ -z "$GRADLE_PATH" ]; then
    log_info "安装 Gradle $GRADLE_VERSION..."
    GRADLE_DIST="/tmp/gradle-$GRADLE_VERSION-bin.zip"
    if [ ! -f "$GRADLE_DIST" ]; then
        curl -L --connect-timeout 30 --max-time 1800 -o "$GRADLE_DIST" \
            "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip"
    fi
    sudo unzip -q "$GRADLE_DIST" -d /opt/ 2>/dev/null || unzip -q "$GRADLE_DIST" -d /opt/
    sudo ln -sf "/opt/gradle-$GRADLE_VERSION/bin/gradle" /usr/local/bin/gradle
    log_ok "Gradle 安装完成"
fi
gradle --version | head -3

# ---- 5. 配置全局 gradle.properties (代理) ----
log_info "配置 gradle 全局属性..."
mkdir -p "$HOME/.gradle"
if [ -n "${HTTPS_PROXY:-}" ]; then
    PROXY_HOST=$(echo "$HTTPS_PROXY" | sed -E 's|https?://||;s|:.*||')
    PROXY_PORT=$(echo "$HTTPS_PROXY" | sed -E 's|.*:||')
    cat > "$HOME/.gradle/gradle.properties" <<EOF
systemProp.http.proxyHost=$PROXY_HOST
systemProp.http.proxyPort=$PROXY_PORT
systemProp.https.proxyHost=$PROXY_HOST
systemProp.https.proxyPort=$PROXY_PORT
systemProp.http.nonProxyHosts=localhost|127.0.0.1|::1
org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8 -Dhttp.connectionTimeout=300000 -Dhttp.socketTimeout=300000
EOF
    log_ok "代理已配置: $PROXY_HOST:$PROXY_PORT"
fi

# ---- 6. 安装 Rust 目标 ----
log_info "检查 Rust 目标 $TARGET-linux-android..."
case "$TARGET" in
    aarch64)    RUST_TARGET="aarch64-linux-android" ;;
    armv7)      RUST_TARGET="armv7-linux-androideabi" ;;
    i686)       RUST_TARGET="i686-linux-android" ;;
    x86_64)     RUST_TARGET="x86_64-linux-android" ;;
esac
if ! rustup target list --installed | grep -q "^$RUST_TARGET$"; then
    log_info "  下载 Rust 目标 $RUST_TARGET ..."
    rustup target add "$RUST_TARGET"
fi
log_ok "Rust 目标 $RUST_TARGET 就绪"

# ---- 7. 设置 cross-compile 环境 ----
SYSROOT="$ANDROID_HOME/ndk/$NDK_VERSION/toolchains/llvm/prebuilt/linux-x86_64/sysroot"
export BINDGEN_EXTRA_CLANG_ARGS="--sysroot=$SYSROOT -isystem $SYSROOT/usr/include/x86_64-linux-gnu -isystem $SYSROOT/usr/include"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$ANDROID_HOME/ndk/$NDK_VERSION/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang"
export PATH="$ANDROID_HOME/ndk/$NDK_VERSION/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH"

# ---- 8. 构建前端 ----
if [ "$SKIP_FRONTEND" -eq 0 ]; then
    log_info "构建前端 (pnpm build)..."
    if [ ! -d node_modules ]; then
        pnpm install
    fi
    pnpm build
    log_ok "前端构建完成"
else
    log_warn "跳过前端构建 (--skip-frontend)"
fi

# ---- 9. 构建 Rust 库 ----
if [ "$SKIP_RUST" -eq 0 ]; then
    log_info "构建 Rust 库 (cargo build --target $RUST_TARGET)..."
    cargo build --release --target "$RUST_TARGET"
    log_ok "Rust 库已生成: target/$RUST_TARGET/release/libnovanote_lib.so"
else
    log_warn "跳过 Rust 构建 (--skip-rust)"
fi

# ---- 10. 打包 Android ----
log_info "进入 Android 构建目录..."
cd src-tauri/gen/android

# 确保 buildSrc 已删除 (rust 插件内联后不需要)
if [ -d buildSrc ]; then
    log_info "移除 buildSrc (rust 插件功能已内联到 app/build.gradle.kts)..."
    rm -rf buildSrc
fi

# 同步 .so 到 jniLibs
JNILIBS_DIR="app/src/main/jniLibs/arm64-v8a"
mkdir -p "$JNILIBS_DIR"
if [ -f "../../../target/$RUST_TARGET/release/libnovanote_lib.so" ]; then
    ln -sf "../../../../target/$RUST_TARGET/release/libnovanote_lib.so" \
           "$JNILIBS_DIR/libnovanote_lib.so"
    ln -sf "$SYSROOT/usr/lib/aarch64-linux-android/libc++_shared.so" \
           "$JNILIBS_DIR/libc++_shared.so" 2>/dev/null || true
fi

# gradle build
log_info "运行 gradle assembleRelease..."
rm -rf .gradle 2>/dev/null || true
gradle assembleRelease --no-daemon

APK_UNSIGNED=$(find app/build/outputs/apk/release -name "*.apk" -not -name "*-aligned.apk" | head -1)
if [ -z "$APK_UNSIGNED" ]; then
    log_error "未找到生成的 APK"
    exit 1
fi

# ---- 11. 签名 & 对齐 ----
log_info "准备 debug keystore..."
if [ ! -f "$KEYSTORE_PATH" ]; then
    "$JAVA_HOME/bin/keytool" -genkey -v \
        -keystore "$KEYSTORE_PATH" \
        -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" \
        -alias "$KEY_ALIAS" \
        -dname "CN=Android Debug,O=Android,C=US" \
        -keyalg RSA -keysize 2048 -validity 10000 2>/dev/null
fi

APK_ALIGNED="${APK_UNSIGNED%.apk}-aligned.apk"
APK_FINAL="$SCRIPT_DIR/novanote.apk"
"$ANDROID_HOME/build-tools/$BUILD_TOOLS_VERSION/zipalign" -p -f 4 "$APK_UNSIGNED" "$APK_ALIGNED"
"$ANDROID_HOME/build-tools/$BUILD_TOOLS_VERSION/apksigner" sign \
    --ks "$KEYSTORE_PATH" --ks-pass "pass:$KEYSTORE_PASS" --key-pass "pass:$KEYSTORE_PASS" \
    --ks-key-alias "$KEY_ALIAS" --out "$APK_FINAL" "$APK_ALIGNED"

# 验证
"$ANDROID_HOME/build-tools/$BUILD_TOOLS_VERSION/apksigner" verify --verbose "$APK_FINAL" 2>&1 | grep -v WARNING

# ---- 完成 ----
log_ok "=========================================="
log_ok "APK 构建成功!"
log_ok "  路径: $APK_FINAL"
log_ok "  大小: $(du -h "$APK_FINAL" | cut -f1)"
log_ok "=========================================="

# =============================================================================
# NovaNote Android APK 自动化编译脚本 (Windows PowerShell)
# =============================================================================
# 用法:
#   .\build-android-apk.ps1                     # 默认 aarch64
#   .\build-android-apk.ps1 -Target aarch64     # 指定 ABI
#   .\build-android-apk.ps1 -SkipRust           # 跳过 Rust 编译
#   .\build-android-apk.ps1 -SkipFrontend       # 跳过前端编译
#
# 环境依赖 (Environment Dependencies):
#   - JDK 17 (OpenJDK / Temurin)                # AGP 8.11.0 不支持 JDK 25
#   - Rust stable                                # rustc, cargo
#   - Node.js 18+ & pnpm                        # 前端构建
#   - Android SDK 组件:
#       * cmdline-tools (latest)
#       * platform-tools
#       * build-tools;35.0.0
#       * platforms;android-36
#       * ndk;26.1.10909125
#   - Gradle 8.14.4 (系统 gradle,绕过 wrapper 下载)
#   - 7-Zip (用于解压 cmdline-tools zip)
#
# 自动下载组件 (Auto-downloaded):
#   - 缺失的 Android SDK 组件 (via sdkmanager)
#   - 缺失的 Rust Android 目标 (via rustup target add)
#
# 关键环境变量:
#   ANDROID_HOME / ANDROID_SDK_ROOT / NDK_HOME / JAVA_HOME
#   HTTPS_PROXY (代理环境,系统已配置)
# =============================================================================

[CmdletBinding()]
param(
    [ValidateSet("aarch64", "armv7", "i686", "x86_64")]
    [string]$Target = "aarch64",
    [switch]$SkipRust,
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

# ---- 颜色输出 ----
function Log-Info  { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Log-Ok    { param($msg) Write-Host "[OK]   $msg" -ForegroundColor Green }
function Log-Warn  { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ---- 配置 ----
$AndroidSdkDefault = "C:\Android\android-sdk"
$NdkVersion        = "26.1.10909125"
$BuildToolsVersion = "35.0.0"
$PlatformVersion   = "android-36"
$GradleVersion     = "8.14.4"
$KeyStorePath      = "$env:USERPROFILE\debug.keystore"
$KeyStorePass      = "android"
$KeyAlias          = "androiddebugkey"

# ---- 1. 定位工作目录 ----
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
Log-Info "工作目录: $ScriptDir"

# ---- 2. 检查 JDK 17 ----
Log-Info "检查 JDK 17..."
$javaExe = (Get-Command java -ErrorAction SilentlyContinue)
if (-not $javaExe) {
    Log-Error "未检测到 java,请安装 OpenJDK 17"
    Log-Error "  下载: https://adoptium.net/temurin/releases/?version=17"
    exit 1
}
$javaVersion = (& java -version 2>&1 | Select-String -Pattern '"(\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if ($javaVersion -ne "17") {
    Log-Warn "当前 java 是 $javaVersion,AGP 8.11.0 推荐 JDK 17,请设置 JAVA_HOME 指向 JDK 17"
}
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = (Get-Item $javaExe.Source).Directory.Parent.FullName
}
Log-Ok "JAVA_HOME=$env:JAVA_HOME"

# ---- 3. 配置 Android SDK ----
Log-Info "配置 Android SDK..."
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $AndroidSdkDefault }
if (-not (Test-Path $env:ANDROID_HOME)) {
    Log-Warn "未找到 Android SDK,自动安装到 $env:ANDROID_HOME"
    New-Item -ItemType Directory -Path $env:ANDROID_HOME -Force | Out-Null
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\$NdkVersion"

# 检查并安装 cmdline-tools
$cmdlineToolsBin = "$env:ANDROID_HOME\cmdline-tools\latest\bin"
if (-not (Test-Path $cmdlineToolsBin)) {
    Log-Info "下载并安装 Android cmdline-tools..."
    $cmdlineZip = "$env:TEMP\commandlinetools-win-11076708_latest.zip"
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" `
                      -OutFile $cmdlineZip
    New-Item -ItemType Directory -Path "$env:ANDROID_HOME\cmdline-tools" -Force | Out-Null
    Expand-Archive -Path $cmdlineZip -DestinationPath "$env:TEMP\cmdtools-extract" -Force
    Move-Item "$env:TEMP\cmdtools-extract\cmdline-tools" "$env:ANDROID_HOME\cmdline-tools\latest" -Force
    Remove-Item "$env:TEMP\cmdtools-extract", $cmdlineZip -Recurse -Force
    Log-Ok "cmdline-tools 安装完成"
}
$env:Path = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

# 接受许可 & 安装必需组件
Log-Info "检查并安装 Android SDK 组件..."
$yes = New-Object System.Text.StringBuilder
1..20 | ForEach-Object { [void]$yes.AppendLine("y") }
$yes.ToString() | sdkmanager --licenses 2>&1 | Out-Null

$packages = @(
    "platform-tools",
    "build-tools;$BuildToolsVersion",
    "platforms;$PlatformVersion",
    "ndk;$NdkVersion"
)
foreach ($pkg in $packages) {
    $pkgPath = "$env:ANDROID_HOME\$($pkg -replace ';','\')"
    if (-not (Test-Path $pkgPath)) {
        Log-Info "  安装 $pkg ..."
        $yes.ToString() | sdkmanager $pkg 2>&1 | Select-Object -Last 3
    } else {
        Log-Ok "  $pkg 已安装"
    }
}

# ---- 4. 安装 Gradle (系统级) ----
Log-Info "检查 Gradle..."
$gradleCmd = Get-Command gradle -ErrorAction SilentlyContinue
if (-not $gradleCmd) {
    Log-Info "安装 Gradle $GradleVersion..."
    $gradleZip = "$env:TEMP\gradle-$GradleVersion-bin.zip"
    if (-not (Test-Path $gradleZip)) {
        Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip" `
                          -OutFile $gradleZip
    }
    Expand-Archive -Path $gradleZip -DestinationPath "C:\gradle" -Force
    [Environment]::SetEnvironmentVariable("Path", "$env:Path;C:\gradle\gradle-$GradleVersion\bin", "User")
    $env:Path = "$env:Path;C:\gradle\gradle-$GradleVersion\bin"
    Log-Ok "Gradle 安装完成"
}
& gradle --version | Select-Object -First 3

# ---- 5. 配置 gradle.properties (代理) ----
Log-Info "配置 gradle 全局属性..."
$gradleHome = "$env:USERPROFILE\.gradle"
if (-not (Test-Path $gradleHome)) { New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null }
if ($env:HTTPS_PROXY) {
    $proxyUri = [System.Uri]$env:HTTPS_PROXY
    $propsContent = @"
systemProp.http.proxyHost=$($proxyUri.Host)
systemProp.http.proxyPort=$($proxyUri.Port)
systemProp.https.proxyHost=$($proxyUri.Host)
systemProp.https.proxyPort=$($proxyUri.Port)
systemProp.http.nonProxyHosts=localhost|127.0.0.1|::1
org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8 -Dhttp.connectionTimeout=300000 -Dhttp.socketTimeout=300000
"@
    Set-Content -Path "$gradleHome\gradle.properties" -Value $propsContent
    Log-Ok "代理已配置: $($proxyUri.Host):$($proxyUri.Port)"
}

# ---- 6. 安装 Rust 目标 ----
Log-Info "检查 Rust 目标 $Target..."
$rustTargetMap = @{
    "aarch64" = "aarch64-linux-android"
    "armv7"   = "armv7-linux-androideabi"
    "i686"    = "i686-linux-android"
    "x86_64"  = "x86_64-linux-android"
}
$rustTarget = $rustTargetMap[$Target]
$installed = (& rustup target list --installed) -join "`n"
if ($installed -notmatch "^$rustTarget$") {
    Log-Info "  下载 Rust 目标 $rustTarget ..."
    rustup target add $rustTarget
}
Log-Ok "Rust 目标 $rustTarget 就绪"

# ---- 7. cross-compile 环境 (Windows NDK 工具链) ----
$ndkPrebuilt = "$env:ANDROID_HOME\ndk\$NdkVersion\toolchains\llvm\prebuilt\windows-x86_64"
$sysroot = "$ndkPrebuilt\sysroot"
$env:BINDGEN_EXTRA_CLANG_ARGS = "--sysroot=$sysroot -isystem $sysroot\usr\include\x86_64-w64-mingw32 -isystem $sysroot\usr\include"
$env:Path = "$ndkPrebuilt\bin;$env:Path"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkPrebuilt\bin\aarch64-linux-android24-clang.cmd"

# ---- 8. 构建前端 ----
if (-not $SkipFrontend) {
    Log-Info "构建前端 (pnpm build)..."
    if (-not (Test-Path "node_modules")) {
        pnpm install
    }
    pnpm build
    Log-Ok "前端构建完成"
} else {
    Log-Warn "跳过前端构建 (-SkipFrontend)"
}

# ---- 9. 构建 Rust 库 ----
if (-not $SkipRust) {
    Log-Info "构建 Rust 库 (cargo build --target $rustTarget)..."
    cargo build --release --target $rustTarget
    Log-Ok "Rust 库已生成: target\$rustTarget\release\libnovanote_lib.so"
} else {
    Log-Warn "跳过 Rust 构建 (-SkipRust)"
}

# ---- 10. 打包 Android ----
Log-Info "进入 Android 构建目录..."
Set-Location "src-tauri\gen\android"

# 移除 buildSrc (rust 插件功能已内联)
if (Test-Path "buildSrc") {
    Log-Info "移除 buildSrc (rust 插件功能已内联到 app\build.gradle.kts)..."
    Remove-Item "buildSrc" -Recurse -Force
}

# 同步 .so 到 jniLibs
$jniLibsDir = "app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Path $jniLibsDir -Force | Out-Null
$libSo = "..\..\..\target\$rustTarget\release\libnovanote_lib.so"
if (Test-Path $libSo) {
    Copy-Item $libSo "$jniLibsDir\libnovanote_lib.so" -Force
    $libcxx = "$sysroot\usr\lib\aarch64-linux-android\libc++_shared.so"
    if (Test-Path $libcxx) { Copy-Item $libcxx "$jniLibsDir\libc++_shared.so" -Force }
}

# gradle build
Log-Info "运行 gradle assembleRelease..."
if (Test-Path ".gradle") { Remove-Item ".gradle" -Recurse -Force }
& gradle assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "gradle assembleRelease 失败" }

$apkUnsigned = Get-ChildItem "app\build\outputs\apk\release" -Filter "*.apk" `
    | Where-Object { $_.Name -notlike "*-aligned.apk" } `
    | Select-Object -First 1
if (-not $apkUnsigned) { throw "未找到生成的 APK" }

# ---- 11. 签名 & 对齐 ----
Log-Info "准备 debug keystore..."
if (-not (Test-Path $KeyStorePath)) {
    & "$env:JAVA_HOME\bin\keytool.exe" -genkey -v `
        -keystore $KeyStorePath `
        -storepass $KeyStorePass -keypass $KeyStorePass `
        -alias $KeyAlias `
        -dname "CN=Android Debug,O=Android,C=US" `
        -keyalg RSA -keysize 2048 -validity 10000 2>&1 | Out-Null
}

$apkAligned = $apkUnsigned.FullName -replace "\.apk$", "-aligned.apk"
$apkFinal   = Join-Path $ScriptDir "novanote.apk"
& "$env:ANDROID_HOME\build-tools\$BuildToolsVersion\zipalign.exe" -p -f 4 $apkUnsigned.FullName $apkAligned
& "$env:ANDROID_HOME\build-tools\$BuildToolsVersion\apksigner.exe" sign `
    --ks $KeyStorePath --ks-pass "pass:$KeyStorePass" --key-pass "pass:$KeyStorePass" `
    --ks-key-alias $KeyAlias --out $apkFinal $apkAligned
& "$env:ANDROID_HOME\build-tools\$BuildToolsVersion\apksigner.exe" verify --verbose $apkFinal

# ---- 完成 ----
$size = (Get-Item $apkFinal).Length / 1MB
Log-Ok "=========================================="
Log-Ok "APK 构建成功!"
Log-Ok "  路径: $apkFinal"
Log-Ok "  大小: $([math]::Round($size, 2)) MB"
Log-Ok "=========================================="

@echo off
chcp 65001 >nul
rem 시연용 실행 (Windows): 처음 한 번은 패키지 설치와 빌드(인터넷 필요), 그다음부터는 바로 켜진다.
cd /d "%~dp0"
set "PATH=%~dp0node;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 없습니다. 사용법.txt 의 1번을 따라 설치하세요.
  pause
  exit /b 1
)
if not exist "billiards-ai\api\dist\main.js" (
  echo [1/2] 서버 준비 중 - 처음 한 번, 몇 분 걸립니다
  pushd "billiards-ai\api"
  call npm ci
  if errorlevel 1 call npm install
  call npx prisma generate
  call npm run build
  popd
)
if not exist "billiards-ai\api\dist\main.js" (
  echo 서버 준비에 실패했습니다. 위 오류 메시지를 사진으로 찍어 두세요.
  pause
  exit /b 1
)
if not exist "billiards-ai\web\.next\BUILD_ID" (
  echo [2/2] 화면 준비 중 - 처음 한 번, 몇 분 걸립니다
  pushd "billiards-ai\web"
  call npm ci
  if errorlevel 1 call npm install
  call npm run build
  popd
)
if not exist "billiards-ai\web\.next\BUILD_ID" (
  echo 화면 준비에 실패했습니다. 위 오류 메시지를 사진으로 찍어 두세요.
  pause
  exit /b 1
)
start "당구AI 서버 - 닫지 마세요" cmd /k "cd /d ""%~dp0billiards-ai\api"" && node dist\main.js"
start "당구AI 화면 - 닫지 마세요" cmd /k "cd /d ""%~dp0billiards-ai\web"" && npx next start -p 3000"
timeout /t 8 /nobreak >nul
start "" http://localhost:3000
echo 브라우저가 열렸습니다. 시연이 끝나면 검은 창 두 개를 닫으세요.
pause

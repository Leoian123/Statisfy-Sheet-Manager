@echo off
rem Avvia STATISFY Sheet Manager: backend (porta 8000), frontend (porta 5174) e apre la pagina di login.
setlocal
cd /d "%~dp0"
title STATISFY Sheet Manager

where python >nul 2>nul || (echo [ERRORE] Python non trovato. Installa Python 3.12 e riprova. & goto :fail)
where npm >nul 2>nul || (echo [ERRORE] Node.js/npm non trovato. Installa Node.js e riprova. & goto :fail)

if not exist "backend\.venv\Scripts\python.exe" (
  echo Prima installazione del backend...
  python -m venv backend\.venv || goto :fail
  "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt || goto :fail
)

if not exist "frontend\node_modules" (
  echo Prima installazione del frontend...
  call npm --prefix frontend install || goto :fail
)

echo Avvio del backend su http://127.0.0.1:8000 ...
start "STATISFY backend" /D "%~dp0" cmd /k backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

echo Avvio del frontend su http://localhost:5174 ...
start "STATISFY frontend" /D "%~dp0frontend" cmd /k npm run dev

echo In attesa che l'app sia pronta...
set /a tries=0
:wait
curl -s -o nul http://localhost:5174/ && goto :open
set /a tries+=1
if %tries% geq 60 (echo [ERRORE] Il frontend non risponde dopo 60 secondi. Controlla la finestra "STATISFY frontend". & goto :fail)
timeout /t 1 /nobreak >nul
goto :wait

:open
start "" http://localhost:5174/login
echo App avviata. Per fermarla chiudi le finestre "STATISFY backend" e "STATISFY frontend".
timeout /t 5 >nul
exit /b 0

:fail
echo.
pause
exit /b 1

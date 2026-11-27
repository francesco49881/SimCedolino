@echo off
setlocal
cd /d "%~dp0"
set PORT=8765

echo Avvio Simulatore Cedolino su http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  node -e "const http=require('http'),fs=require('fs'),path=require('path');const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};http.createServer((q,s)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';const p=path.join(process.cwd(),u);fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end('Not found');return;}s.writeHead(200,{'Content-Type':m[path.extname(p)]||'application/octet-stream'});s.end(d);});}).listen(%PORT%,'127.0.0.1');"
  goto :eof
)

echo Errore: ne' Python ne' Node.js trovati nel PATH.
pause

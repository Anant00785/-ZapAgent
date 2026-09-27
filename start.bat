@echo off
echo ===================================================
echo     Starting ZapAgent Sovereign AI Node
echo ===================================================

start "ZapAgent Backend (FastAPI)" cmd /k "cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
timeout /t 2 >nul
start "ZapAgent Frontend (Vite)" cmd /k "cd frontend && npm run dev"

echo.
echo ZapAgent is launching!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo ===================================================

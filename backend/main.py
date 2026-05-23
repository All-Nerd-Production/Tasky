from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api import auth, workspaces, items

# Cria todas as tabelas
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Tasky API",
    description="Gerenciador de projetos colaborativo em tempo real",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.onrender.com",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/api")
app.include_router(workspaces.router,  prefix="/api")
app.include_router(items.router,       prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Tasky", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "Tasky API — acesse /docs para a documentação"}

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import re

# Pega a URL e limpa parâmetros incompatíveis com psycopg2
raw_url = os.environ.get("DATABASE_URL", "")

# Troca postgres:// por postgresql://
if raw_url.startswith("postgres://"):
    raw_url = raw_url.replace("postgres://", "postgresql://", 1)

# Remove TODOS os query params (?pgbouncer=true, ?sslmode=require etc)
# e reconstrói só com sslmode=require
base_url = raw_url.split("?")[0]
DATABASE_URL = base_url + "?sslmode=require"

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
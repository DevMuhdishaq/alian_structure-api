from fastapi import FastAPI
from src.api import portfolio

app = FastAPI(
    title="Advanced Portfolio Simulation Engine",
    description="A robust engine for portfolio simulation using Monte Carlo analysis.",
    version="0.1.0",
)

app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Advanced Portfolio Simulation Engine"}
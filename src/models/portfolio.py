from pydantic import BaseModel
from typing import List

class Asset(BaseModel):
    """
    Represents a single asset in a portfolio.
    """
    ticker: str
    weight: float

class Portfolio(BaseModel):
    """
    Represents a collection of assets.
    """
    assets: List[Asset]
    initial_investment: float
    time_horizon_years: int
    num_simulations: int = 10000
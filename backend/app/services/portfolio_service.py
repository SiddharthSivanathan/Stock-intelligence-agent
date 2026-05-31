"""Paper-trading portfolio service.

Pure-Python, async, framework-free. Buys/sells execute at the live quote at
trade-time (instantaneous fill, no slippage modelling — this is paper trading
for a demo, not a backtesting engine).
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.db.models.portfolio import Portfolio, Position, Trade
from app.db.models.user import User
from app.schemas.portfolio import PortfolioSnapshot, PositionView
from app.services import market_data

DEFAULT_STARTING_CASH = 100_000.0


async def get_or_create(
    db: AsyncSession,
    user: User,
    *,
    starting_cash: float = DEFAULT_STARTING_CASH,
) -> Portfolio:
    res = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id)
    )
    p = res.scalar_one_or_none()
    if p is not None:
        return p
    p = Portfolio(
        user_id=user.id,
        starting_cash=starting_cash,
        cash=starting_cash,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _get_position(
    db: AsyncSession, portfolio_id: int, symbol: str
) -> Position | None:
    res = await db.execute(
        select(Position).where(
            Position.portfolio_id == portfolio_id,
            Position.symbol == symbol,
        )
    )
    return res.scalar_one_or_none()


async def execute_trade(
    db: AsyncSession,
    portfolio: Portfolio,
    *,
    symbol: str,
    side: str,
    qty: float,
) -> Trade:
    symbol = symbol.upper()
    if qty <= 0:
        raise ValidationError("Quantity must be positive")
    if side not in ("buy", "sell"):
        raise ValidationError("Side must be 'buy' or 'sell'")

    quote = await market_data.get_quote(symbol)
    price = quote.price
    value = qty * price

    if side == "buy":
        if value > portfolio.cash + 1e-6:
            raise ValidationError(
                f"Insufficient cash: need ${value:.2f}, have ${portfolio.cash:.2f}"
            )
        portfolio.cash -= value
        pos = await _get_position(db, portfolio.id, symbol)
        if pos is not None:
            new_qty = pos.qty + qty
            # Weighted-average cost basis
            pos.avg_cost = (pos.avg_cost * pos.qty + value) / new_qty
            pos.qty = new_qty
        else:
            db.add(
                Position(
                    portfolio_id=portfolio.id,
                    symbol=symbol,
                    qty=qty,
                    avg_cost=price,
                )
            )
    else:  # sell
        pos = await _get_position(db, portfolio.id, symbol)
        if pos is None or pos.qty + 1e-6 < qty:
            raise ValidationError(
                f"Cannot sell {qty} {symbol}: insufficient position"
            )
        portfolio.cash += value
        pos.qty -= qty
        if pos.qty <= 1e-6:
            await db.delete(pos)

    trade = Trade(
        portfolio_id=portfolio.id,
        symbol=symbol,
        side=side,
        qty=qty,
        price=price,
        value=value,
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    await db.refresh(portfolio)
    return trade


async def list_trades(
    db: AsyncSession, portfolio: Portfolio, *, limit: int = 100
) -> list[Trade]:
    res = await db.execute(
        select(Trade)
        .where(Trade.portfolio_id == portfolio.id)
        .order_by(Trade.executed_at.desc())
        .limit(limit)
    )
    return list(res.scalars())


async def list_positions(
    db: AsyncSession, portfolio: Portfolio
) -> list[Position]:
    res = await db.execute(
        select(Position).where(Position.portfolio_id == portfolio.id)
    )
    return list(res.scalars())


async def snapshot(
    db: AsyncSession, portfolio: Portfolio
) -> PortfolioSnapshot:
    positions = await list_positions(db, portfolio)
    if not positions:
        total_value = portfolio.cash
        total_pnl = total_value - portfolio.starting_cash
        return PortfolioSnapshot(
            starting_cash=portfolio.starting_cash,
            cash=portfolio.cash,
            positions_value=0.0,
            total_value=total_value,
            total_pnl=total_pnl,
            total_pnl_pct=(
                total_pnl / portfolio.starting_cash * 100
                if portfolio.starting_cash
                else 0.0
            ),
            positions=[],
        )

    symbols = [p.symbol for p in positions]
    quotes = await market_data.get_quotes_batch(symbols)
    quote_map = {q.symbol: q for q in quotes}

    views: list[PositionView] = []
    positions_value = 0.0
    for p in positions:
        q = quote_map.get(p.symbol)
        current = q.price if q else p.avg_cost  # fallback if quote failed
        market_value = p.qty * current
        cost_basis = p.qty * p.avg_cost
        pnl = market_value - cost_basis
        pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0.0
        positions_value += market_value
        views.append(
            PositionView(
                symbol=p.symbol,
                qty=p.qty,
                avg_cost=p.avg_cost,
                current_price=current,
                market_value=market_value,
                pnl=pnl,
                pnl_pct=pnl_pct,
                # Currency comes from the quote when available; service code
                # already imports the heuristic via providers, so just pass through.
                currency=(q.currency if q else None),
            )
        )

    total_value = portfolio.cash + positions_value
    total_pnl = total_value - portfolio.starting_cash
    return PortfolioSnapshot(
        starting_cash=portfolio.starting_cash,
        cash=portfolio.cash,
        positions_value=positions_value,
        total_value=total_value,
        total_pnl=total_pnl,
        total_pnl_pct=(
            total_pnl / portfolio.starting_cash * 100
            if portfolio.starting_cash
            else 0.0
        ),
        positions=views,
    )


async def reset(
    db: AsyncSession, portfolio: Portfolio, *, starting_cash: float | None = None
) -> Portfolio:
    """Wipe positions/trades and reset cash."""
    if not portfolio:
        raise NotFoundError("Portfolio not found")
    # Delete positions + trades
    for pos in await list_positions(db, portfolio):
        await db.delete(pos)
    for tr in await list_trades(db, portfolio, limit=10_000):
        await db.delete(tr)
    if starting_cash is not None:
        portfolio.starting_cash = starting_cash
    portfolio.cash = portfolio.starting_cash
    await db.commit()
    await db.refresh(portfolio)
    return portfolio

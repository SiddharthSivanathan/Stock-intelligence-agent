"""Alert REST endpoints — rules CRUD + event history.

  POST   /alerts              create a rule
  GET    /alerts              list this user's rules
  GET    /alerts/{id}         retrieve one
  PATCH  /alerts/{id}         toggle / adjust
  DELETE /alerts/{id}         remove
  GET    /alerts/events       this user's recent fires
"""
from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbDep
from app.core.exceptions import NotFoundError
from app.schemas.alert import (
    AlertEventOut,
    AlertRuleCreate,
    AlertRuleOut,
    AlertRuleUpdate,
)
from app.services import alert_service

router = APIRouter()


@router.post(
    "",
    response_model=AlertRuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_alert(
    payload: AlertRuleCreate, current_user: CurrentUser, db: DbDep
) -> AlertRuleOut:
    rule = await alert_service.create_rule(db, current_user, payload)
    return AlertRuleOut.model_validate(rule)


@router.get("", response_model=list[AlertRuleOut])
async def list_alerts(
    current_user: CurrentUser, db: DbDep
) -> list[AlertRuleOut]:
    rows = await alert_service.list_rules_for_user(db, current_user)
    return [AlertRuleOut.model_validate(r) for r in rows]


@router.get(
    "/events",
    response_model=list[AlertEventOut],
    summary="Recent triggered events for the current user",
)
async def list_events(
    current_user: CurrentUser,
    db: DbDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AlertEventOut]:
    rows = await alert_service.list_events_for_user(
        db, current_user, limit=limit
    )
    return [AlertEventOut.model_validate(r) for r in rows]


@router.get("/{rule_id}", response_model=AlertRuleOut)
async def get_alert(
    rule_id: int, current_user: CurrentUser, db: DbDep
) -> AlertRuleOut:
    rule = await alert_service.get_rule_for_user(db, current_user, rule_id)
    if rule is None:
        raise NotFoundError(f"Alert rule {rule_id} not found")
    return AlertRuleOut.model_validate(rule)


@router.patch("/{rule_id}", response_model=AlertRuleOut)
async def update_alert(
    rule_id: int,
    payload: AlertRuleUpdate,
    current_user: CurrentUser,
    db: DbDep,
) -> AlertRuleOut:
    rule = await alert_service.get_rule_for_user(db, current_user, rule_id)
    if rule is None:
        raise NotFoundError(f"Alert rule {rule_id} not found")
    updated = await alert_service.update_rule(db, rule, payload)
    return AlertRuleOut.model_validate(updated)


# FastAPI 0.115.x infers response_model from the `-> None` return annotation
# and then asserts that 204 endpoints can't have a body. Pass response_model=None
# explicitly to suppress the inference. Same fix on the other two 204 routes.
@router.delete(
    "/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_alert(
    rule_id: int, current_user: CurrentUser, db: DbDep
) -> None:
    rule = await alert_service.get_rule_for_user(db, current_user, rule_id)
    if rule is None:
        raise NotFoundError(f"Alert rule {rule_id} not found")
    await alert_service.delete_rule(db, rule)
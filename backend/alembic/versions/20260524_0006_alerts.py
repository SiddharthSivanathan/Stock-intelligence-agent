"""create alert_rules and alert_events tables

Revision ID: 0006_alerts
Revises: 0005_recommendations
Create Date: 2026-05-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0006_alerts"
down_revision: Union[str, None] = "0005_recommendations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column(
            "condition_type",
            sa.String(length=50),
            nullable=False,
            server_default="price_change_pct",
        ),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "cooldown_seconds",
            sa.Integer(),
            nullable=False,
            server_default="3600",
        ),
        sa.Column(
            "notify_via_ws",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "re_run_analysis",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "last_triggered_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_alert_rules_user_id", "alert_rules", ["user_id"])
    op.create_index("ix_alert_rules_symbol", "alert_rules", ["symbol"])

    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "rule_id",
            sa.Integer(),
            sa.ForeignKey("alert_rules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("price_at_fire", sa.Float(), nullable=True),
        sa.Column("change_pct_at_fire", sa.Float(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "extra",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "fired_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_alert_events_rule_id", "alert_events", ["rule_id"])
    op.create_index("ix_alert_events_user_id", "alert_events", ["user_id"])
    op.create_index("ix_alert_events_symbol", "alert_events", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_alert_events_symbol", table_name="alert_events")
    op.drop_index("ix_alert_events_user_id", table_name="alert_events")
    op.drop_index("ix_alert_events_rule_id", table_name="alert_events")
    op.drop_table("alert_events")
    op.drop_index("ix_alert_rules_symbol", table_name="alert_rules")
    op.drop_index("ix_alert_rules_user_id", table_name="alert_rules")
    op.drop_table("alert_rules")

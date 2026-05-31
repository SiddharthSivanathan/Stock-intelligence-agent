"""add notify_via_email to alert_rules

Revision ID: 0008_alert_email
Revises: 0007_portfolio
Create Date: 2026-05-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_alert_email"
down_revision: Union[str, None] = "0007_portfolio"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "alert_rules",
        sa.Column(
            "notify_via_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("alert_rules", "notify_via_email")

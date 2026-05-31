"""create insights and agent_logs tables

Revision ID: 0004_insights_and_agent_logs
Revises: 0003_documents
Create Date: 2026-05-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0004_insights_and_agent_logs"
down_revision: Union[str, None] = "0003_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("agent_name", sa.String(length=50), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("sentiment", sa.String(length=20), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "data",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_insights_user_id", "insights", ["user_id"])
    op.create_index("ix_insights_agent_name", "insights", ["agent_name"])
    op.create_index("ix_insights_symbol", "insights", ["symbol"])

    op.create_table(
        "agent_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("agent_name", sa.String(length=50), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "duration_ms", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "input_data",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("output_data", JSONB(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_agent_logs_user_id", "agent_logs", ["user_id"])
    op.create_index("ix_agent_logs_agent_name", "agent_logs", ["agent_name"])
    op.create_index("ix_agent_logs_symbol", "agent_logs", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_agent_logs_symbol", table_name="agent_logs")
    op.drop_index("ix_agent_logs_agent_name", table_name="agent_logs")
    op.drop_index("ix_agent_logs_user_id", table_name="agent_logs")
    op.drop_table("agent_logs")
    op.drop_index("ix_insights_symbol", table_name="insights")
    op.drop_index("ix_insights_agent_name", table_name="insights")
    op.drop_index("ix_insights_user_id", table_name="insights")
    op.drop_table("insights")

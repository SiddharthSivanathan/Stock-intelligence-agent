"""create documents table

Revision ID: 0003_documents
Revises: 0002_watchlist_items
Create Date: 2026-05-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_documents"
down_revision: Union[str, None] = "0002_watchlist_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("filename", sa.String(length=500), nullable=True),
        sa.Column("source_type", sa.String(length=20), nullable=False),
        sa.Column("source_url", sa.String(length=2000), nullable=True),
        sa.Column("symbol", sa.String(length=20), nullable=True),
        sa.Column(
            "chunk_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "collection_name",
            sa.String(length=100),
            nullable=False,
            server_default="documents",
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
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_symbol", "documents", ["symbol"])


def downgrade() -> None:
    op.drop_index("ix_documents_symbol", table_name="documents")
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_table("documents")

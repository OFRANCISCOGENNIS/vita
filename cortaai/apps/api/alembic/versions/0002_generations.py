"""ESTÚDIO IA — generations table (SPEC APÊNDICE — Módulo ESTÚDIO IA).

Revision ID: 0002_generations
Revises: 0001_initial
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002_generations"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

# JSON on sqlite/dev, JSONB on PostgreSQL
JsonB = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "generations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cut_id", sa.String(36), sa.ForeignKey("cuts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("function", sa.String(30), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("params", JsonB, nullable=True),
        sa.Column("input_asset_url", sa.String(2000), nullable=True),
        sa.Column("input_asset_url_2", sa.String(2000), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_url", sa.String(2000), nullable=True),
        sa.Column("thumbnail_url", sa.String(2000), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("resolution", sa.String(10), nullable=True),
        sa.Column("fps", sa.Float(), nullable=True),
        sa.Column("model", sa.String(30), nullable=False, server_default="mock"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_generations_user_id", "generations", ["user_id"])
    op.create_index("ix_generations_project_id", "generations", ["project_id"])
    op.create_index("ix_generations_cut_id", "generations", ["cut_id"])
    op.create_index("ix_generations_function", "generations", ["function"])
    op.create_index("ix_generations_status", "generations", ["status"])


def downgrade() -> None:
    op.drop_table("generations")

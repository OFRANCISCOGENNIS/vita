"""Remove pagamentos/planos: drop table subscriptions + colunas users.plan e
users.minutes_used_month. Todo recurso passa a ser ilimitado para qualquer
usuário autenticado (REVISÃO 2 — sem cobrança).

Revision ID: 0003_remove_billing_plans
Revises: 0002_generations
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003_remove_billing_plans"
down_revision = "0002_generations"
branch_labels = None
depends_on = None

# JSON on sqlite/dev, JSONB on PostgreSQL
JsonB = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.drop_table("subscriptions")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("plan")
        batch.drop_column("minutes_used_month")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("minutes_used_month", sa.Float(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("plan", sa.String(20), nullable=False, server_default="free"))

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stripe_customer_id", sa.String(200), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(200), nullable=True),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("interval", sa.String(10), nullable=False, server_default="month"),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_stripe_customer_id", "subscriptions", ["stripe_customer_id"])
    op.create_index("ix_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

"""Initial schema — full SPEC: users, projects, cuts, jobs, subscriptions,
trend_videos, trend_analyses, niche_patterns, niche_alerts.

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

# JSON on sqlite/dev, JSONB on PostgreSQL
JsonB = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("avatar_url", sa.String(1000), nullable=True),
        sa.Column("google_id", sa.String(200), nullable=True),
        sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
        sa.Column("minutes_used_month", sa.Float(), nullable=False, server_default="0"),
        sa.Column("branding_kit", JsonB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"])

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False, server_default="upload"),
        sa.Column("source_url", sa.String(2000), nullable=True),
        sa.Column("original_filename", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("resolution", sa.String(10), nullable=True),
        sa.Column("fps", sa.Float(), nullable=True),
        sa.Column("language", sa.String(10), nullable=False, server_default="auto"),
        sa.Column("status", sa.String(20), nullable=False, server_default="importing"),
        sa.Column("thumbnail_url", sa.String(2000), nullable=True),
        sa.Column("storage_key", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])
    op.create_index("ix_projects_status", "projects", ["status"])

    op.create_table(
        "cuts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("title_options", JsonB, nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("hashtags", JsonB, nullable=True),
        sa.Column("start_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("end_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("viral_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("score_breakdown", JsonB, nullable=True),
        sa.Column("transcript", JsonB, nullable=True),
        sa.Column("mode", sa.String(20), nullable=False, server_default="viral"),
        sa.Column("suggested_sound", JsonB, nullable=True),
        sa.Column("best_post_time", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="suggested"),
        sa.Column("edit_state", JsonB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cuts_project_id", "cuts", ["project_id"])
    op.create_index("ix_cuts_status", "cuts", ["status"])

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("cut_id", sa.String(36), sa.ForeignKey("cuts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("eta_seconds", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload", JsonB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
    op.create_index("ix_jobs_project_id", "jobs", ["project_id"])
    op.create_index("ix_jobs_cut_id", "jobs", ["cut_id"])
    op.create_index("ix_jobs_type", "jobs", ["type"])
    op.create_index("ix_jobs_status", "jobs", ["status"])

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

    op.create_table(
        "trend_videos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("channel", sa.String(200), nullable=True),
        sa.Column("thumbnail_url", sa.String(2000), nullable=True),
        sa.Column("niche", sa.String(50), nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("views", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("views_per_hour", sa.Float(), nullable=False, server_default="0"),
        sa.Column("likes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("comments", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_index", sa.Float(), nullable=False, server_default="0"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("platform", "external_id", name="uq_trend_platform_external"),
    )
    op.create_index("ix_trend_videos_platform", "trend_videos", ["platform"])
    op.create_index("ix_trend_videos_niche", "trend_videos", ["niche"])

    op.create_table(
        "trend_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("trend_video_id", sa.String(36), sa.ForeignKey("trend_videos.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("sound", JsonB, nullable=True),
        sa.Column("image", JsonB, nullable=True),
        sa.Column("structure", JsonB, nullable=True),
        sa.Column("retention_timeline", JsonB, nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trend_analyses_trend_video_id", "trend_analyses", ["trend_video_id"])

    op.create_table(
        "niche_patterns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("niche", sa.String(50), nullable=False),
        sa.Column("period", sa.String(5), nullable=False),
        sa.Column("avg_duration", sa.Float(), nullable=True),
        sa.Column("top_caption_styles", JsonB, nullable=True),
        sa.Column("trending_sounds", JsonB, nullable=True),
        sa.Column("top_hooks", JsonB, nullable=True),
        sa.Column("best_post_times", JsonB, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("niche", "period", name="uq_niche_pattern_period"),
    )
    op.create_index("ix_niche_patterns_niche", "niche_patterns", ["niche"])

    op.create_table(
        "niche_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("niche", sa.String(50), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "niche", name="uq_niche_alert_user_niche"),
    )
    op.create_index("ix_niche_alerts_user_id", "niche_alerts", ["user_id"])


def downgrade() -> None:
    for table in (
        "niche_alerts",
        "niche_patterns",
        "trend_analyses",
        "trend_videos",
        "subscriptions",
        "jobs",
        "cuts",
        "projects",
        "users",
    ):
        op.drop_table(table)

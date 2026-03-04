"""Enhance audit logs with module and action strings

Revision ID: b62d6696f78a
Revises: eaeb2cc7c9ed
Create Date: 2026-03-04 11:40:23.823029
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers
revision = 'b62d6696f78a'
down_revision = 'eaeb2cc7c9ed'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        # Add module column
        batch_op.add_column(
            sa.Column('module', sa.String(length=50), nullable=True)
        )

        # Increase action column size
        batch_op.alter_column(
            'action',
            existing_type=mysql.VARCHAR(length=10),
            type_=sa.String(length=20),
            existing_nullable=False
        )

        # Add index for faster module filtering
        batch_op.create_index(
            'idx_audit_module',
            ['module'],
            unique=False
        )


def downgrade():
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        # Remove index
        batch_op.drop_index('idx_audit_module')

        # Revert action column size
        batch_op.alter_column(
            'action',
            existing_type=sa.String(length=20),
            type_=mysql.VARCHAR(length=10),
            existing_nullable=False
        )

        # Remove module column
        batch_op.drop_column('module')
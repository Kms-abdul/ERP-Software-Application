from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
import os
from datetime import datetime
from zoneinfo import ZoneInfo

# Database
db = SQLAlchemy()

# Rate limiter (no app yet; init in app.create_app)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["1000 per hour"]  # broad safety net; stricter limits still belong on sensitive routes
)

# Cache (init in app.create_app)
cache = Cache()

def get_now():
    """Get current datetime in UTC for database storage."""
    return datetime.now(ZoneInfo("UTC"))


def get_today():
    """Get current date in the configured APP_TIMEZONE."""
    return get_now().date()

def to_local_time(dt):
    """Convert a datetime (usually from DB) to the configured local timezone."""
    if dt is None:
        return None
    tz_name = os.environ.get("APP_TIMEZONE", "UTC")
    tz = ZoneInfo(tz_name)
    if dt.tzinfo is None:
        # If DB returns unaware datetime, we assume it's stored in UTC
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(tz)

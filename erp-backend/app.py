from flask import Flask, request, jsonify, send_from_directory # Force Reload
from flask_cors import CORS
from dotenv import load_dotenv
from flask_migrate import Migrate 
from extensions import db, limiter, cache
import os

# -----------------------------
# EXTENSIONS
# -----------------------------
from extensions import db
migrate = Migrate()
# -----------------------------
# BLUEPRINTS
# -----------------------------
from routes.auth_routes import bp as auth_bp
from routes.student_routes import bp as student_bp
from routes.fee_master_routes import bp as fee_master_bp
from routes.fee_transaction_routes import bp as fee_transaction_bp
from routes.attendance_routes import bp as attendance_bp
from routes.report_routes import bp as report_bp
from routes.org_routes import bp as org_bp
from routes.academic_routes import bp as academic_bp
from routes.class_routes import bp as class_bp
from routes.test_type_routes import test_type_bp
from routes.class_test_routes import class_test_bp
from routes.class_test_subject_routes import class_test_subject_bp
from routes.student_test_routes import student_test_bp
from routes.grade_scale_routes import grade_scale_bp
from routes.student_marks_routes import student_marks_bp
from routes.report_card_routes import report_bp as report_card_bp
from routes.test_attendance_routes import test_attendance_bp
from routes.config_routes import bp as config_bp
from routes.document_routes import document_routes


  


# -----------------------------
# LOAD ENV
# -----------------------------
# Load .env from the same directory as app.py
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))


def create_app():
    app = Flask(__name__, static_folder="../frontend/dist", static_url_path="/")

    # -----------------------------
    # CONFIG
    # -----------------------------
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT")
    DB_NAME = os.getenv("DB_NAME")

    if DB_HOST:
        app.config["SQLALCHEMY_DATABASE_URI"] = (
            f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )
    else:
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///erp.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_POOL_SIZE"] = 20  
    app.config["SQLALCHEMY_MAX_OVERFLOW"] = 20  
    app.config["SQLALCHEMY_POOL_RECYCLE"] = 300  
    app.config["SQLALCHEMY_POOL_TIMEOUT"] = 30  
    app.config["SQLALCHEMY_POOL_PRE_PING"] = True 
    # -----------------------------
    # INIT EXTENSIONS
    # -----------------------------
    # Allow specific origins with credentials
   # CORS: strict allowlist in production via CORS_ALLOWED_ORIGINS (comma-separated)
    env_name = os.getenv("ENV", "development").lower()
    if env_name == "production":
        allowed_origins = [o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
        if not allowed_origins:
            raise RuntimeError(
                "CORS_ALLOWED_ORIGINS environment variable is required in production "
                "and must contain at least one origin (comma-separated). "
                f"Current env_name={env_name!r}, allowed_origins={allowed_origins!r}. "
                "Set CORS_ALLOWED_ORIGINS (e.g. 'https://myapp.com') or change ENV to 'development'."
            )
    else:
        allowed_origins = [
            r"https://.*\.vercel\.app",
            "http://localhost:5173",
            "http://localhost:3000",
            r"http://192\.168\.[0-9]+\.[0-9]+:[0-9]+"
        ]
    CORS(app, resources={
        r"/*": {
            "origins": allowed_origins,
            "supports_credentials": True,
            "allow_headers": ["Content-Type", "Authorization", "X-Branch", "X-Location", "X-Academic-Year", "X-Requested-With"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
        }
    })
    db.init_app(app)
    migrate.init_app(app, db)

    limiter.init_app(app)  
    cache.init_app(app, config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 300})


    # -----------------------------
    # REGISTER BLUEPRINTS
    # -----------------------------
    app.register_blueprint(auth_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(fee_master_bp)
    app.register_blueprint(fee_transaction_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(report_bp)
    app.register_blueprint(org_bp)
    app.register_blueprint(academic_bp)
    app.register_blueprint(class_bp)
    app.register_blueprint(test_type_bp, url_prefix="/api/test-types")
    app.register_blueprint(class_test_bp, url_prefix="/api/class-tests")
    app.register_blueprint(class_test_subject_bp)
    app.register_blueprint(student_test_bp, url_prefix="/api")
    app.register_blueprint(grade_scale_bp)
    app.register_blueprint(student_marks_bp)
    app.register_blueprint(report_card_bp)
    app.register_blueprint(test_attendance_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(document_routes, url_prefix="/api/documents")

    # -----------------------------
    # SERVE UPLOADS (legacy - kept for backward compatibility)
    # -----------------------------
    @app.route('/uploads/<path:filename>')
    def serve_uploads(filename):
        return send_from_directory(os.path.join(app.root_path, 'uploads'), filename)

    # -----------------------------
    # SERVE MEDIA (student photos + documents)
    # Stored at: HifzErpSoftwareApplication/Media/
    # URL:        /Media/student_document/<admission_no>/profile.jpg
    # -----------------------------
    media_folder = os.path.abspath(os.path.join(app.root_path, '..', 'Media'))

    @app.route('/Media/<path:filename>')
    def serve_media(filename):
        return send_from_directory(media_folder, filename)

    # -----------------------------
    # FAVICON FIX
    # -----------------------------
    @app.route('/favicon.ico')
    def favicon():
        return '', 204

    # -----------------------------
    # SERVE FRONTEND (PRODUCTION)
    # -----------------------------
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve(path):
        if path.startswith("api/"):
            return jsonify({"error": "Not Found"}), 404

        file_path = os.path.join(app.static_folder, path)
        if path and os.path.exists(file_path):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({'message': 'File too large. Maximum size is 16 MB.'}), 413

    return app


if __name__ == "__main__":
    app = create_app()

    # 🔴 RUN ONCE IF TABLES NOT CREATED (DEV ONLY)
    from extensions import db
    from flask_migrate import upgrade
    from sqlalchemy import inspect, text
    with app.app_context():
        upgrade()
        print("✅ Database upgraded.")

    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)

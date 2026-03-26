from flask import Blueprint, jsonify, request, current_app
from extensions import db
from extensions import limiter
from models import User, Branch, UserBranchAccess, PasswordResetOTP
from datetime import date, datetime, timedelta
import jwt
import secrets
import hashlib
from helpers import token_required, hash_user_password, verify_user_password, send_otp_email
 
bp = Blueprint('auth_routes', __name__)

MIN_PASSWORD_LENGTH = 8


def _validate_password_strength(password):
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


@bp.route("/api/users/login", methods=["POST"])
@limiter.limit("10 per minute")
def login_user():
    try:
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")
        
        user = User.query.filter_by(username=username).first()
        
        if not user or not verify_user_password(password, user.password):
            return jsonify({"error": "invalid credentials"}), 401

        # Upgrade legacy plaintext passwords in-place after a successful login.
        if user.password and not str(user.password).startswith(("pbkdf2:", "scrypt:")):
            user.password = hash_user_password(password)
            db.session.commit()
    except Exception as e:
        current_app.logger.exception("Login error")
        return jsonify({"error": "Internal login error"}), 500
    
    # Phase 4: Fetch Valid Branches
    valid_branches = []
    try:
        today = date.today()
        # Query UserBranchAccess joined with Branch
        # is_active=True, start_date <= today, (end_date is None OR end_date >= today)
        access_records = UserBranchAccess.query.filter(
            UserBranchAccess.user_id == user.user_id,
            UserBranchAccess.is_active == True,
            UserBranchAccess.start_date <= today,
            (UserBranchAccess.end_date.is_(None)) | (UserBranchAccess.end_date >= today)
        ).join(Branch).all()
        
        for record in access_records:
            valid_branches.append({
                "branch_id": record.branch_id,
                "branch_code": record.branch.branch_code,
                "branch_name": record.branch.branch_name,
                "location_code": record.branch.location_code
            })
    except Exception as e:
        current_app.logger.warning("Error fetching branches for user %s: %s", username, e)
        # Continue without branches if error occurs, or return error? For now, continue.

    token_payload = {
        'user_id': user.user_id,
        'username': user.username,
        'role': user.role,
        # Include branch and location for convenience, but rely on UserBranchAccess for auth
        'branch': user.branch, 
        'location': user.location,
        'exp': datetime.utcnow() + timedelta(hours=24) # Token expiry
    }
    
    token = jwt.encode(token_payload, current_app.config['SECRET_KEY'], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    
    return jsonify({
        "message": "login successful",
        "token": token,
        "user": {
            "user_id": user.user_id,
            "username": user.username,
            "role": user.role,
            "branch": user.branch, # Legacy string
            "location": user.location,
            "allowed_branches": valid_branches # Phase 4: Auto-reflecting branches
        }
    }), 200

@bp.route("/api/verify-current-password", methods=["POST"])
@token_required
@limiter.limit("10 per minute")
def verify_current_password(current_user):
    data = request.json or {}
    password = data.get("password")
    
    if not password:
        return jsonify({"success": False, "message": "Password required"}), 400
        
    if verify_user_password(password, current_user.password):
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "message": "Invalid password"}), 200

@bp.route("/api/debug-user/<string:username>", methods=["GET"])
@token_required
def debug_user(current_user, username):
    if current_user.role != "Admin":
        return jsonify({"error": "Unauthorized"}), 403
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "branch": user.branch if user.branch else "NULL_OR_EMPTY",
        "location": getattr(user, 'location', 'N/A')
    }), 200

@bp.route("/api/users/add", methods=["POST"])
@token_required
def create_user(current_user):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No input data provided"}), 400
            
        username = data.get("username")
        password = data.get("password")
        useremail = data.get("useremail")
        role = data.get("role", "User")
        location = data.get("location", "")
        # Frontend sends "branches" array and legacy "branch" string
        branches = data.get("branches", [])
        legacy_branch = data.get("branch", "North") # Default fallback

        if not username or not password or not useremail:
            return jsonify({"error": "Username, Password, and Email are required"}), 400

        password_error = _validate_password_strength(password)
        if password_error:
            return jsonify({"error": password_error}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400
            
        if useremail and User.query.filter_by(useremail=useremail).first():
            return jsonify({"error": "Email address is already in use by another user"}), 400

        # Helper: Resolve Branch Code to Name if possible
        final_branch_name = legacy_branch
        if legacy_branch and legacy_branch != 'All':
             # Try to find by code first
             b_obj = Branch.query.filter_by(branch_code=legacy_branch).first()
             if b_obj:
                 final_branch_name = b_obj.branch_name
             else:
                 # Check if it's already a name
                 b_obj_by_name = Branch.query.filter_by(branch_name=legacy_branch).first()
                 if b_obj_by_name:
                     final_branch_name = b_obj_by_name.branch_name

        # Create User
        new_user = User(
            username=username,
            password=hash_user_password(password),
            useremail=useremail,
            role=role,
            location=location,
            branch=final_branch_name, # Save Name instead of Code
            created_by=current_user.user_id,
            updated_by=current_user.user_id
        )
        db.session.add(new_user)
        db.session.flush() # Flush to get user_id

        # Handle Branch Access
        if branches:
            # If "All" is in branches, give access to all active branches
            if "All" in branches:
                all_branches = Branch.query.filter_by(is_active=True).all()
                for b in all_branches:
                    access = UserBranchAccess(
                        user_id=new_user.user_id,
                        branch_id=b.id,
                        start_date=date.today(),
                        is_active=True
                    )
                    db.session.add(access)
            else:
                # Specific branches
                for b_code in branches:
                    branch_obj = Branch.query.filter_by(branch_code=b_code).first()
                    # Fallback to check by name if code fail (frontend sends codes usually, but let's be safe)
                    if not branch_obj:
                         branch_obj = Branch.query.filter_by(branch_name=b_code).first()
                    
                    if branch_obj:
                        access = UserBranchAccess(
                            user_id=new_user.user_id,
                            branch_id=branch_obj.id,
                            start_date=date.today(),
                            is_active=True
                        )
                        db.session.add(access)

        db.session.commit()
        return jsonify({"message": "User created successfully", "user_id": new_user.user_id}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/setup/migrate-users", methods=["POST"])
@token_required
def migrate_users_to_new_system(current_user):
    if current_user.role != "Admin":
        return jsonify({"error": "Unauthorized"}), 403
    try:
        users = User.query.all()
        count = 0
        for u in users:
            if u.branch:
                # Find branch by code
                # Handle "All" or "AllBranches"
                if u.branch in ["All", "AllBranches"]:
                     # Assign all branches
                     all_branches = Branch.query.filter_by(is_active=True).all()
                     for b in all_branches:
                         if not UserBranchAccess.query.filter_by(user_id=u.user_id, branch_id=b.id).first():
                             db.session.add(UserBranchAccess(user_id=u.user_id, branch_id=b.id, start_date=date.today()))
                             count += 1
                else:
                    b = Branch.query.filter_by(branch_code=u.branch).first()
                    if b:
                        if not UserBranchAccess.query.filter_by(user_id=u.user_id, branch_id=b.id).first():
                            db.session.add(UserBranchAccess(user_id=u.user_id, branch_id=b.id, start_date=date.today()))
                            count += 1
        
        db.session.commit()
        return jsonify({"message": f"Migrated {count} access records"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/users/forgot-password", methods=["POST"])
@limiter.limit("3 per minute")
def forgot_password():
    data = request.json or {}
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        # Generic message to prevent email enumeration
        return jsonify({"message": "If an account with that email exists, an OTP has been sent."}), 200
        
    # Invalidate previous unused OTPs for this user
    PasswordResetOTP.query.filter_by(user_id=user.user_id, used=False).update({"used": True})
        
    otp = ''.join(secrets.choice('0123456789') for _ in range(6))
    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    reset_otp = PasswordResetOTP(
        user_id=user.user_id,
        otp_hash=otp_hash,
        expires_at=expires_at,
        used=False
    )
    db.session.add(reset_otp)
    db.session.commit()
    
    send_otp_email(email, otp)
    
    return jsonify({"message": "If an account with that email exists, an OTP has been sent."}), 200

@bp.route("/api/users/verify-otp", methods=["POST"])
@limiter.limit("5 per minute")
def verify_otp():
    data = request.json or {}
    email = data.get("email")
    otp = data.get("otp")
    
    if not email or not otp:
        return jsonify({"error": "Email and OTP are required"}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        return jsonify({"error": "Invalid request"}), 400
        
    otp_record = PasswordResetOTP.query.filter_by(
        user_id=user.user_id,
        used=False
    ).order_by(PasswordResetOTP.id.desc()).first()
    
    if not otp_record:
        return jsonify({"error": "Invalid OTP"}), 400
        
    if (otp_record.attempts or 0) >= 5:
        return jsonify({"error": "Maximum OTP attempts exceeded. Please request a new OTP."}), 400
    
    submitted_hash = hashlib.sha256(otp.encode()).hexdigest()
    if not secrets.compare_digest(otp_record.otp_hash, submitted_hash):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        db.session.commit()
        return jsonify({"error": "Invalid OTP"}), 400
        
    if otp_record.expires_at < datetime.utcnow():
        return jsonify({"error": "OTP has expired"}), 400
        
    return jsonify({"message": "OTP is valid"}), 200

@bp.route("/api/users/reset-password", methods=["POST"])
@limiter.limit("5 per minute")
def reset_password():
    data = request.json or {}
    email = data.get("email")
    otp = data.get("otp")
    new_password = data.get("new_password")
    
    if not email or not otp or not new_password:
        return jsonify({"error": "Email, OTP, and new password are required"}), 400

    password_error = _validate_password_strength(new_password)
    if password_error:
        return jsonify({"error": password_error}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        return jsonify({"error": "Invalid request"}), 400
        
    otp_record = PasswordResetOTP.query.filter_by(
        user_id=user.user_id,
        used=False
    ).order_by(PasswordResetOTP.id.desc()).first()
    
    if not otp_record:
        return jsonify({"error": "Invalid or expired OTP"}), 400
        
    if (otp_record.attempts or 0) >= 5:
        return jsonify({"error": "Maximum OTP attempts exceeded. Please request a new OTP."}), 400
    
    submitted_hash = hashlib.sha256(otp.encode()).hexdigest()
    if not secrets.compare_digest(otp_record.otp_hash, submitted_hash):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        db.session.commit()
        return jsonify({"error": "Invalid OTP"}), 400
        
    if otp_record.expires_at < datetime.utcnow():
        return jsonify({"error": "Invalid or expired OTP"}), 400
        
    # Mark OTP as used
    otp_record.used = True
    
    # Hash new password
    user.password = hash_user_password(new_password)
    
    db.session.commit()
    
    return jsonify({"message": "Password has been successfully reset."}), 200

@bp.route("/api/users/profile", methods=["GET"])
@token_required
def get_user_profile(current_user):
    try:
        return jsonify({
            "user": {
                "user_id": current_user.user_id,
                "username": current_user.username,
                "useremail": getattr(current_user, 'useremail', ''),
                "role": current_user.role,
                "branch": current_user.branch,
                "location": getattr(current_user, 'location', '')
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/users/update-username", methods=["PUT"])
@token_required
def update_username(current_user):
    try:
        data = request.json or {}
        new_username = data.get("username")
        
        if not new_username:
            return jsonify({"error": "New username is required"}), 400
            
        new_username = new_username.strip()
        
        if new_username == current_user.username:
            return jsonify({"error": "Username is the same as the current one"}), 400
            
        # Check if username already exists
        existing_user = User.query.filter_by(username=new_username).first()
        if existing_user:
            return jsonify({"error": "Username already taken"}), 400
            
        current_user.username = new_username
        db.session.commit()
        
        return jsonify({"message": "Username updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/users/update-password", methods=["PUT"])
@token_required
def update_password(current_user):
    try:
        data = request.json or {}
        current_password = data.get("currentPassword")
        new_password = data.get("newPassword")  # Profile.tsx sends {"newPassword": "..."}
        
        if not new_password:
            return jsonify({"error": "New password is required"}), 400

        password_error = _validate_password_strength(new_password)
        if password_error:
            return jsonify({"error": password_error}), 400

        if not current_password:
            return jsonify({"error": "Current password is required"}), 400

        if not verify_user_password(current_password, current_user.password):
            return jsonify({"error": "Current password is incorrect"}), 400
            
        current_user.password = hash_user_password(new_password)
        db.session.commit()
        
        return jsonify({"message": "Password updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

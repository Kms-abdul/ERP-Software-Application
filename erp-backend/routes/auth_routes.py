from flask import Blueprint, jsonify, request, current_app
from extensions import db
from models import User, Branch, UserBranchAccess
from datetime import date, datetime, timedelta
import jwt
from helpers import token_required
 
bp = Blueprint('auth_routes', __name__)

@bp.route("/api/users/login", methods=["POST"])
def login_user():
    try:
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")
        
        user = User.query.filter_by(username=username).first()
        
        if not user or user.password != password:
            return jsonify({"error": "invalid credentials"}), 401
    except Exception as e:
        print(f"[CRITICAL] Login Error: {e}")
        return jsonify({"error": f"Internal Login Error: {str(e)}"}), 500
    
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
        print(f"Error fetching branches for user {username}: {e}")
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

@bp.route("/api/verify-any-password", methods=["POST"])
def verify_any_password():
    data = request.json or {}
    password = data.get("password")
    
    if not password:
        return jsonify({"success": False, "message": "Password required"}), 400
        
    # Check if ANY user has this password
    user = User.query.filter_by(password=password).first()
    
    if user:
        return jsonify({"success": True}), 200
    else:
        return jsonify({"success": False, "message": "Invalid password"}), 200

@bp.route("/api/debug-user/<string:username>", methods=["GET"])
def debug_user(username):
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
        role = data.get("role", "User")
        location = data.get("location", "")
        # Frontend sends "branches" array and legacy "branch" string
        branches = data.get("branches", [])
        legacy_branch = data.get("branch", "North") # Default fallback

        if not username or not password:
            return jsonify({"error": "Username and Password are required"}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400

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
            password=password,
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
def migrate_users_to_new_system():
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

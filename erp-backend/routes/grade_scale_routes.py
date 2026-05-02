from flask import Blueprint, jsonify, request
from extensions import db, to_local_time
from models import GradeScale, GradeScaleDetails
from sqlalchemy.exc import IntegrityError
from helpers import token_required

grade_scale_bp = Blueprint("grade_scale", __name__)

@grade_scale_bp.route("/api/grade-scales", methods=["POST"])
@token_required
def create_grade_scale(current_user):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
 
        # Extract Master Data
        scale_name = data.get("scale_name")
        location = data.get("location")
        branch = data.get("branch")
        academic_year = data.get("academic_year")
        total_marks = data.get("total_marks") # New Field
        description = data.get("scale_description")
        details = data.get("details", [])

        if not all([scale_name, location, academic_year, total_marks]):
             return jsonify({"error": "Missing required fields (scale_name, location, academic_year, total_marks)"}), 400

        # Validate Details (Min/Max and Overlap)
        sorted_details = sorted(details, key=lambda x: int(x['min_marks']))
        for i in range(len(sorted_details)):
            d = sorted_details[i]
            if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                return jsonify({"error": "Invalid details format"}), 400

            min_m = int(d['min_marks'])
            max_m = int(d['max_marks'])
            
            if min_m < 0 or max_m < 0:
                 return jsonify({"error": f"Marks cannot be negative for grade {d['grade']}"}), 400
            if min_m > max_m:
                 return jsonify({"error": f"Min marks cannot be greater than Max marks for grade {d['grade']}"}), 400
            if max_m > int(total_marks):
                 return jsonify({"error": f"Max marks for grade {d['grade']} cannot exceed Total Marks ({total_marks})"}), 400

            # Overlap Check
            if i < len(sorted_details) - 1:
                next_d = sorted_details[i+1]
                next_min = int(next_d['min_marks'])
                if max_m >= next_min: # Inclusive Overlap
                     return jsonify({"error": f"Grade range overlap detected: {d['grade']} ({min_m}-{max_m}) overlaps with {next_d['grade']} ({next_min}-{next_d.get('max_marks')})"}), 400

        # Check for duplicates (Location + Year + Branch + TotalMarks scope)
        # Note: Branch usually "All" for location wide.
        existing = GradeScale.query.filter_by(
            scale_name=scale_name,
            location=location,
            academic_year=academic_year,
            total_marks=total_marks
        ).first()

        if existing:
            # If it exists but is inactive, maybe reactivate? 
            # For now, strict duplicate error.
            if not existing.is_active:
                return jsonify({"error": f"Grade Scale '{scale_name}' exists but is inactive. Please contact admin."}), 409
            return jsonify({"error": f"Grade Scale '{scale_name}' already exists for this context."}), 409

        # Create Master (Location Wide)
        # Note: Frontend might send specific branch, but we generalize it to 'All' 
        # or rely on model default if we don't pass it. 
        # But explicit is better.
        
        new_scale = GradeScale(
            scale_name=scale_name,
            scale_description=description,
            location=location,
            branch="All", # Location-wide scope
            academic_year=academic_year,
            total_marks=total_marks,
            is_active=True


        )
        db.session.add(new_scale)
        db.session.flush() # Get ID

        # Create Details
        for d in details:
            # Basic validation
            # Check keys
            if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                continue
                
            new_detail = GradeScaleDetails(
                grade_scale_id=new_scale.id,
                grade=d["grade"],
                min_marks=d["min_marks"],
                max_marks=d["max_marks"],
                description=d.get("description", ""),
                is_active=True
            )
            db.session.add(new_detail)

        db.session.commit()
        return jsonify({"message": "Grade Scale created successfully", "id": new_scale.id}), 201

    except IntegrityError as e:
        db.session.rollback()
        return jsonify({"error": "Duplicate entry or Invalid Data (Integrity Error)"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales", methods=["GET"])
def get_grade_scales():
    try:
        academic_year = request.args.get("academic_year")
        branch = request.args.get("branch")
        
        query = GradeScale.query.filter_by(is_active=True)

        if academic_year:
            query = query.filter_by(academic_year=academic_year)
        if academic_year:
            query = query.filter_by(academic_year=academic_year)
            
        # Scope is Location-based. 
        # If frontend sends a branch, we still fetch the 'All' branch scales (Location Wide)
        # We might also filter by Location if frontend sends it (it usually does not in GET params explicitly if inferred from branch)
        # But GradeScale table has location. We need to match location.
        # Ideally frontend sends location. If not, we can't filter by location easily without a lookup.
        # But since we store location, let's assume valid scales are those with 'All' branch 
        # OR specific branch if we supported mixed mode (but we don't now).
        
        # Simple Logic: Fetch all 'All' branch scales.
        # If we had location in params, we would filter by location.
        # Currently the route reads 'branch'. 
        
        # Let's filter strict 'All' for branch column as per new design.
        query = query.filter(GradeScale.branch == "All") 

        # Filter by Location if provided (Fix for cross-location visibility bug)
        location = request.args.get("location")
        if location:
            query = query.filter_by(location=location) 

        # Future: If we receive location, filter by it.
        # query = query.filter_by(location=request.args.get('location'))
            
        scales = query.all()
        
        result = []
        for s in scales:
            result.append({
                "id": s.id,
                "scale_name": s.scale_name,
                "scale_description": s.scale_description,
                "academic_year": s.academic_year,
                "branch": s.branch,
                "location": s.location,
                "total_marks": s.total_marks,
                "created_at": to_local_time(s.created_at).isoformat() if s.created_at else None,
                "updated_at": to_local_time(s.updated_at).isoformat() if s.updated_at else None,
                "created_by": s.created_by,
                "updated_by": s.updated_by
            })
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["GET"])
def get_grade_scale_details_route(id):
    try:
        scale = GradeScale.query.get(id)
        if not scale or not scale.is_active:
            return jsonify({"error": "Grade scale not found"}), 404
            
        details = GradeScaleDetails.query.filter_by(grade_scale_id=id).order_by(GradeScaleDetails.min_marks.asc()).all()
        
        details_list = [{
            "id": d.id,
            "grade": d.grade,
            "min_marks": d.min_marks,
            "max_marks": d.max_marks,
            "description": d.description
        } for d in details]

        return jsonify({
            "id": scale.id,
            "scale_name": scale.scale_name,
            "scale_description": scale.scale_description,
            "academic_year": scale.academic_year,
            "branch": scale.branch,
            "location": scale.location,
            "total_marks": scale.total_marks,
            "details": details_list
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["PUT"])
@token_required
def update_grade_scale(current_user, id):
    try:
        scale = GradeScale.query.get(id)
        if not scale or not scale.is_active:
            return jsonify({"error": "Grade scale not found"}), 404

        data = request.json
        if not data:
             return jsonify({"error": "No data"}), 400

        # Update Master
        if "scale_name" in data: scale.scale_name = data["scale_name"]
        if "scale_description" in data: scale.scale_description = data["scale_description"]
        if "total_marks" in data: scale.total_marks = data["total_marks"]

        # Validate Details with Payload
        current_total_marks = data.get("total_marks", scale.total_marks)
        new_details = data.get("details", [])
        
        if new_details:
            sorted_details = sorted(new_details, key=lambda x: int(x['min_marks']))
            for i in range(len(sorted_details)):
                d = sorted_details[i]
                if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                     return jsonify({"error": "Invalid details format"}), 400

                min_m = int(d['min_marks'])
                max_m = int(d['max_marks'])
                
                if min_m < 0 or max_m < 0:
                     return jsonify({"error": f"Marks cannot be negative"}), 400
                if min_m > max_m:
                     return jsonify({"error": f"Min > Max for {d['grade']}"}), 400
                if max_m > int(current_total_marks):
                     return jsonify({"error": f"Max marks for {d['grade']} > Total Marks ({current_total_marks})"}), 400

                # Overlap
                if i < len(sorted_details) - 1:
                    next_d = sorted_details[i+1]
                    next_min = int(next_d['min_marks'])
                    if max_m >= next_min:
                         return jsonify({"error": f"Overlap: {d['grade']} and {next_d['grade']}"}), 400
        if "details" in data:
            # 1. Delete all existing details for this scale
            GradeScaleDetails.query.filter_by(grade_scale_id=id).delete()
            
            # 2. Add new details
            for d in data["details"]:
                 if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                    continue

                 new_detail = GradeScaleDetails(
                    grade_scale_id=id,
                    grade=d["grade"],
                    min_marks=d["min_marks"],
                    max_marks=d["max_marks"],
                    description=d.get("description", ""),
                    is_active=True
                )
                 db.session.add(new_detail)

        db.session.commit()
        return jsonify({"message": "Updated successfully"}), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Duplicate entry or range conflict"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["DELETE"])
@token_required
def delete_grade_scale(current_user, id):
    try:
        scale = GradeScale.query.get(id)
        if not scale:
            return jsonify({"error": "Grade scale not found"}), 404

        # 🛑 FUTURE: Check References (Subject, Test, Marks)
        # For now, Soft Delete as requested.
        
        scale.is_active = False
        # Soft delete details too?
        # GradeScaleDetails.query.filter_by(grade_scale_id=id).update({"is_active": False}) 
        # Not strictly necessary if query logic checks Parent, but safest.
        
        db.session.commit()
        return jsonify({"message": "Grade Scale deleted (soft)"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

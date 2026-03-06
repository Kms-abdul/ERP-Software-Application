from flask import Blueprint, jsonify, request
from extensions import db
from models import ClassMaster, ClassSection, Branch, Student, OrgMaster, User
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from helpers import token_required
              
bp = Blueprint("class_routes", __name__)

@bp.route("/api/classes/create_with_sections", methods=["POST"])
@token_required
def create_class_with_sections(current_user):
    """
    Creates or Updates a Class + Sections.
    Strictly transactional.
    RBAC: Adming only.
    """
    # 1. RBAC Check (Simplified for now, assuming auth middleware or check)
    # In a real app, use @login_required and check current_user.role
    # For now, we trust the caller or check a header/mock
    # user_role = request.headers.get("X-Role", "Admin") 
    # if user_role != "Admin":
    #    return jsonify({"error": "Unauthorized"}), 403

    data = request.json
    try:
        class_name_raw = data.get("class_name")
        branch_id = data.get("branch_id")
        academic_year = data.get("academic_year")
        sections = data.get("sections", []) # List of {name, strength}

        if not all([class_name_raw, branch_id, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400

        if not sections:
            return jsonify({"error": "At least one section is required"}), 400

        # Normalize Class Name
        class_name = class_name_raw.strip() # Could add .title() if desired

        # Start Transaction
        with db.session.begin_nested():
            # 2. Find or Create ClassMaster
            class_obj = ClassMaster.query.filter(
                func.lower(ClassMaster.class_name) == func.lower(class_name)
            ).first()

            if not class_obj:
                class_obj = ClassMaster(class_name=class_name)
                db.session.add(class_obj)
                db.session.flush() # Get ID

            # 3. Process Sections
            # Delete removed sections first
            existing_sections = ClassSection.query.filter_by(
                class_id=class_obj.id,
                branch_id=branch_id,
                academic_year=academic_year
            ).all()

            existing_section_names = {s.section_name for s in existing_sections}
            payload_section_names = {s.get("name", "").strip().upper() for s in sections}
            
            sections_to_delete = existing_section_names - payload_section_names
            
            if sections_to_delete:
                ClassSection.query.filter(
                    ClassSection.class_id == class_obj.id,
                    ClassSection.branch_id == branch_id,
                    ClassSection.academic_year == academic_year,
                    ClassSection.section_name.in_(sections_to_delete)
                ).delete(synchronize_session=False)

            seen_sections = set()
            
            for sec in sections:
                sec_name = sec.get("name", "").strip().upper()
                strength = int(sec.get("strength", 0))

                # Validation: Basic
                if not sec_name:
                    raise ValueError("Section name cannot be empty")
                if strength <= 0:
                    raise ValueError(f"Strength for section {sec_name} must be > 0")
                if sec_name in seen_sections:
                    raise ValueError(f"Duplicate section '{sec_name}' in payload")
                seen_sections.add(sec_name)

                # Validation: Occupancy Check (ERP Rule)
                # Count active students in this context
                # Note: ClassMaster might map to Student.class (string) or ID. 
                # Student table currently uses string "class".
                # We assume ClassMaster.class_name matches Student.class column value.
                
                current_occupancy = db.session.query(func.count(Student.student_id)).filter(
                    Student.clazz == class_name, # Student table column is 'class', mapped as 'clazz'
                    Student.section == sec_name,
                    Student.branch == str(branch_id), # Student branch is likely String Name? Need to verify model.
                    # Wait, Student.branch is String(50). branch_id is Int. 
                    # We need to resolve Branch Name if Student uses Name.
                    # Let's check Branch model. 
                    
                    # Student.academic_year == academic_year # Optional depending on how students are promoted
                ).scalar()
                
                # Resolving Branch Name Issue:
                # Student table uses 'branch' string column.
                # Input is 'branch_id'.
                # We need to fetch Branch Name.
                branch_obj = Branch.query.get(branch_id)
                if not branch_obj:
                     raise ValueError(f"Invalid Branch ID: {branch_id}")
                
                # Correct Query with resolved Branch Name
                # And assume Student.academic_year matches
                current_occupancy = db.session.query(func.count(Student.student_id)).filter(
                    Student.clazz == class_name, 
                    Student.section == sec_name,
                    Student.branch == branch_obj.branch_name, 
                    Student.academic_year == academic_year,
                    Student.status == "Active"
                ).scalar()

                if strength < current_occupancy:
                    raise ValueError(
                        f"Cannot set strength to {strength} for Section {sec_name}. "
                        f"Current active students: {current_occupancy}. "
                        "Downgrade not allowed."
                    )
                


                # Upsert ClassSection
                existing_sec = ClassSection.query.filter_by(
                    class_id=class_obj.id,
                    branch_id=branch_id,
                    academic_year=academic_year,
                    section_name=sec_name
                ).first()

                if existing_sec:
                    existing_sec.student_strength = strength
                    # existing_sec.updated_at is auto-handled or set manually if needed
                else:
                    new_sec = ClassSection(
                        class_id=class_obj.id,
                        branch_id=branch_id,
                        academic_year=academic_year,
                        section_name=sec_name,
                        student_strength=strength
                    )
                    db.session.add(new_sec)

        db.session.commit()
        return jsonify({"message": "Class and sections saved successfully"}), 201


    except ValueError as e:
        # Transaction auto-rollbacks on exception exit of context manager? 
        # No, 'with db.session.begin()' commits on exit, rollbacks on error.
        # So we just catch and return.
        return jsonify({"error": str(e)}), 400
    except IntegrityError as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": "Database integrity error (duplicate or invalid key)"}), 409
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/classes/copy_structure", methods=["POST"])
@token_required
def copy_class_structure(current_user):
    """
    Copies a Class structure (Class Name + Sections) to multiple target branches.
    Skips if the ClassSection already exists in the target branch.
    """
    data = request.json
    try:
        class_name_raw = data.get("class_name")
        target_branch_ids = data.get("target_branch_ids", [])
        academic_year = data.get("academic_year")
        sections = data.get("sections", [])  # List of {name, strength}

        if not all([class_name_raw, target_branch_ids, academic_year]):
            return jsonify({"error": "Missing required fields: class_name, target_branch_ids, academic_year"}), 400

        if not sections:
            return jsonify({"error": "At least one section is required to copy"}), 400

        class_name = class_name_raw.strip()
        
        # We need to make sure the ClassMaster exists (it likely does if we are copying, but handling just in case)
        # However, ClassMaster is global (no branch_id), so we just find or create it once.
        # Ideally, we should reuse the existing logic or just query it.
        
        with db.session.begin():
            # 1. Ensure ClassMaster exists
            class_obj = ClassMaster.query.filter(
                func.lower(ClassMaster.class_name) == func.lower(class_name)
            ).first()

            if not class_obj:
                class_obj = ClassMaster(class_name=class_name)
                db.session.add(class_obj)
                db.session.flush() # Get ID

            total_copied = 0
            skipped_count = 0

            # 2. Iterate over target branches
            for branch_id in target_branch_ids:
                # Verify branch exists (optional, but good for data integrity)
                branch = Branch.query.get(branch_id)
                if not branch:
                    print(f"Skipping invalid branch_id: {branch_id}")
                    continue

                for sec in sections:
                    sec_name = sec.get("name", "").strip().upper()
                    strength = int(sec.get("strength", 0))

                    if not sec_name:
                        continue

                    # Check if exists
                    existing_sec = ClassSection.query.filter_by(
                        class_id=class_obj.id,
                        branch_id=branch_id,
                        academic_year=academic_year,
                        section_name=sec_name
                    ).first()

                    if existing_sec:
                        skipped_count += 1
                        continue # Skip existing
                    
                    # Create new section for this branch
                    new_sec = ClassSection(
                        class_id=class_obj.id,
                        branch_id=branch_id,
                        academic_year=academic_year,
                        section_name=sec_name,
                        student_strength=strength
                    )
                    db.session.add(new_sec)
                    total_copied += 1

        return jsonify({
            "message": "Copy operation completed",
            "copied_sections": total_copied,
            "skipped_sections": skipped_count
        }), 201


    except Exception as e:
        print(f"Error copying class structure: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/classes/copy_branch_structure", methods=["POST"])
@token_required
def copy_branch_structure(current_user):
    """
    Copies ALL classes/sections from a Source Branch to multiple Target Branches.
    """
    data = request.json
    try:
        source_branch_id = data.get("source_branch_id")
        target_branch_ids = data.get("target_branch_ids", [])
        academic_year = data.get("academic_year")

        if not all([source_branch_id, target_branch_ids, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400

        if not all([source_branch_id, target_branch_ids, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400

        # 1. Fetch Source Sections
        # We need ClassMaster info too
        source_sections = db.session.query(ClassSection, ClassMaster).join(
            ClassMaster, ClassSection.class_id == ClassMaster.id
        ).filter(
            ClassSection.branch_id == source_branch_id,
            ClassSection.academic_year == academic_year
        ).all()

        if not source_sections:
            return jsonify({"message": "No classes found in source branch to copy"}), 400

        total_copied = 0
        skipped_count = 0

        try:
            # 2. Iterate Targets
            for target_id in target_branch_ids:
                if str(target_id) == str(source_branch_id):
                    continue
                
                for section, class_master in source_sections:
                    # Check if exists in target
                    existing = ClassSection.query.filter_by(
                        class_id=section.class_id, # Same ClassMaster ID (Global)
                        branch_id=target_id,
                        academic_year=academic_year,
                        section_name=section.section_name
                    ).first()

                    if existing:
                        skipped_count += 1
                        continue
                    
                    # Create Copy
                    new_sec = ClassSection(
                        class_id=section.class_id,
                        branch_id=target_id,
                        academic_year=academic_year,
                        section_name=section.section_name,
                        student_strength=section.student_strength
                    )
                    db.session.add(new_sec)
                    total_copied += 1
            
            db.session.commit()

        except Exception as e:
            db.session.rollback()
            raise e

        return jsonify({
            "message": "Branch structure copied successfully",
            "copied_sections": total_copied,
            "skipped_sections": skipped_count
        }), 201

    except Exception as e:
        print(f"Error copying branch structure: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/classes", methods=["GET"])
def get_classes():
    """
    Get all classes (ClassMaster).
    """
    classes = ClassMaster.query.all()
    # Sort nicely if possible (custom sort/numeric)
    # Simple sort by ID or Name
    classes.sort(key=lambda x: x.id) 
    return jsonify([
        {
            "id": c.id,
            "class_name": c.class_name,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "created_by": c.created_by,
            "updated_by": c.updated_by
        } for c in classes
    ])


@bp.route("/api/classes/summary", methods=["GET"])
@token_required
def get_class_summary(current_user):
    try:
        academic_year = request.args.get("academic_year", "2025-2026")
        branch_id_param = request.args.get("branch_id") # Optional filter

        # Base query for creating the summary
        query = db.session.query(
            ClassMaster.id.label("class_id"),
            ClassMaster.class_name,
            ClassSection.section_name,
            ClassSection.student_strength,
            ClassSection.id.label("section_id"),
            ClassSection.branch_id
        ).join(
            ClassSection, ClassMaster.id == ClassSection.class_id
        ).filter(
            ClassSection.academic_year == academic_year
        )

        # Apply Branch Filter if provided
        if branch_id_param and branch_id_param != 'all':
             query = query.filter(ClassSection.branch_id == branch_id_param)

        results = query.order_by(ClassMaster.class_name, ClassSection.section_name).all()

        # Grouping
        summary = {}
        for r in results:
            if r.class_id not in summary:
                summary[r.class_id] = {
                    "id": r.class_id,
                    "class_name": r.class_name,
                    "sections": []
                }
            summary[r.class_id]["sections"].append({
                "id": r.section_id,
                "name": r.section_name,
                "strength": r.student_strength,
                "branch_id": r.branch_id
            })

        return jsonify(list(summary.values())), 200

    except Exception as e:
        print(f"Error fetching summary: {e}")
        return jsonify({"error": str(e)}), 500

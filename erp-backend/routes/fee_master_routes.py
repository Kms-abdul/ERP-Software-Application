from flask import Blueprint, jsonify, request
from extensions import db
from models import FeeType, ClassFeeStructure, StudentFee, FeeInstallment, Concession, Branch, OrgMaster, Student
from helpers import fee_type_to_dict
from helpers import token_required, require_academic_year, generate_installments, shift_installments, assign_fee_to_student, normalize_fee_title, get_default_location
from datetime import datetime
from sqlalchemy import or_, and_, select
import traceback


bp = Blueprint('fee_master_routes', __name__)

MONTHS = [
    "May", "June", "July", "August", "September", "October",
    "November", "December", "January", "February", "March", "April"
]

@bp.route("/api/fee-types", methods=["GET"])
@token_required
def get_fee_types(current_user):
    # Header Filtering
    h_branch = request.headers.get("X-Branch")
    
    # MANDATORY: Require Academic Year
    h_year, err, code = require_academic_year()
    if err:
        return err, code

    # STRICT BRANCH ENFORCEMENT
    if current_user.role != 'Admin':
        h_branch = current_user.branch

    query = FeeType.query.filter_by(academic_year=h_year)
    
    if h_branch and h_branch != "All":
        # Strict Branch Filter: Show ONLY fees for this branch + Global "All" fees
        # (Assuming "All" fee types are visible to everyone)
        query = query.filter(or_(FeeType.branch == h_branch, FeeType.branch == "All"))
    elif current_user.role == 'Admin' and h_branch == "All":
        pass # Show all
        
    fee_types = query.all()
    return jsonify({
    "fee_types": [fee_type_to_dict(ft) for ft in fee_types]
}), 200


@bp.route("/api/fee-types", methods=["POST"])
@token_required
def create_fee_type(current_user):
    data = request.json or {}
    feetype_name = data.get("fee_type")
    type_ = data.get("type", "One-Time")
    description = data.get("description")
    
    # 1. Branch Handling
    if current_user.role == 'Admin':
        branch = data.get("branch", "All")
    else:
        branch = current_user.branch # Force User's Branch
        
    academic_year = data.get("academic_year", "2025-2026")

    if not feetype_name:
        return jsonify({"error": "Fee Type Name is required"}), 400
        
    try:
        # Check for duplicates (Name + Branch + Year)
        existing = FeeType.query.filter_by(
            feetype=feetype_name, 
            branch=branch, 
            academic_year=academic_year
        ).first()
        
        if existing:
            return jsonify({"error": f"Fee Type '{feetype_name}' already exists for {branch} ({academic_year})"}), 400

        new_ft = FeeType(
        feetype=data.get("fee_type"),
        category=data.get("category"),              # ✅ ADD THIS
        feetypegroup=data.get("fee_type_group"),    # ✅ ADD THIS
        type=type_,
        displayname=data.get("display_name"),       # ✅ ADD THIS
        description=description,
        isrefundable=data.get("is_refundable", False),
        branch=branch,
        academic_year=academic_year
        )

    
        db.session.add(new_ft)
        db.session.commit()
        return jsonify({"message": "Fee Type created", "id": new_ft.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fee-types/<int:id>", methods=["PUT"])
@token_required
def update_fee_type(current_user, id):
    data = request.json or {}
    
    ft = FeeType.query.get(id)
    if not ft:
        return jsonify({"error": "Fee Type not found"}), 404
        
    # Validation: Only Admin or Owner Branch can edit
    if current_user.role != 'Admin':
         if ft.branch != "All" and ft.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
         if ft.branch == "All":
             return jsonify({"error": "Only Admin can edit Global Fee Types"}), 403

    ft.feetype = data.get("feetype", ft.feetype)
    ft.type = data.get("type", ft.type)
    ft.isrefundable = data.get("is_refundable", ft.isrefundable)
    ft.description = data.get("description", ft.description)
    ft.branch = data.get("branch", ft.branch) # Allow updating branch/year if needed
    ft.academic_year = data.get("academic_year", ft.academic_year)
    
    try:
        db.session.commit()
        return jsonify({"message": "Fee type updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fee-types/<int:fee_type_id>", methods=["DELETE"])
@token_required
def delete_fee_type(current_user, fee_type_id):
    """Delete a fee type with proper validation and cascade cleanup"""
    fee_type = FeeType.query.get_or_404(fee_type_id)
    
    # 1. CRITICAL CHECK: Is it used in FINANCE (StudentFee)?
    student_fees_count = StudentFee.query.filter_by(fee_type_id=fee_type_id, is_active = True).count()
    if student_fees_count > 0:
        return jsonify({
            "error": f"Cannot delete this fee type. It is currently assigned to {student_fees_count} student(s) as 'Student Fees'. "
                     "These are financial records. Please remove the fee assignments from students first if you imply to delete this."
        }), 400
        
    # 2. DEPENDENCY CLEANUP
    try:
        # Delete related Class Fee Structures
        ClassFeeStructure.query.filter_by(feetypeid=fee_type_id).delete()
        
        # Delete related Fee Installments linked to this fee type
        FeeInstallment.query.filter_by(fee_type_id=fee_type_id).delete()
        
        # Delete related Concessions
        Concession.query.filter_by(fee_type_id=fee_type_id).delete()
        
        # Finally delete the Fee Type itself
        db.session.delete(fee_type)
        db.session.commit()
        return jsonify({"message": "Fee type and related templates deleted successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Error deleting fee type: {str(e)}"}), 500

@bp.route("/api/class-fee-structure", methods=["GET"])
@token_required 
def get_class_fee_structure(current_user): 
    class_name = request.args.get("class")
    
    # Header Filtering
    h_branch = request.headers.get("X-Branch")
    
    # MANDATORY: Require Academic Year
    h_year, err, code = require_academic_year()
    if err:
        return err, code

    # FIXED: Use ClassFeeStructure.query
    query = ClassFeeStructure.query 
    
    # Filter by Class if provided
    if class_name:
        query = query.filter_by(clazz=class_name)
    
    # STRICT BRANCH SEGREGATION
    if current_user.role != 'Admin':
         if current_user.branch != 'All':
              query = query.filter_by(branch=current_user.branch)
    else:
         # Admins: Check Header
         if h_branch and h_branch != "All":
             query = query.filter_by(branch=h_branch)

    # FIX: Strict Year Filter
    query = query.filter_by(academic_year=h_year)
        
    branch = request.args.get('branch')
    location_param = request.args.get('location') # New param
    target_branch = branch if  branch else h_branch # Explicit arg takes precedence

    if target_branch and target_branch != "All":
        query = query.filter_by(branch=target_branch)
    elif target_branch == "All":
        query = query.filter_by(branch="All")
        # Location Filtering for All Branches
        if location_param and location_param not in ["All", "All Locations"]:
            query = query.filter_by(location=location_param)

    results = []
    for fs in query.all():
        results.append({
            "id": fs.id,
            "class": fs.clazz,
            "fee_type_id": fs.feetypeid,
            "fee_type_name": fs.feetype.feetype if fs.feetype else None,
            "academic_year": fs.academicyear, 
            "total_amount": float(fs.totalamount or 0),
            "monthly_amount": float(fs.monthly_amount or 0),
            "installments_count": fs.installments_count,
            "is_new_admission": fs.isnewadmission,
            "fee_group": fs.feegroup,
            "created_at": fs.created_at.isoformat() if fs.created_at else None,
            "updated_at": fs.updated_at.isoformat() if fs.updated_at else None,
            "created_by": fs.created_by,
            "updated_by": fs.updated_by,
            "installments": generate_installments(fs)
        })
    return jsonify({"fee_structures": results}), 200

@bp.route("/api/admin/migrate-class-fee-structures", methods=["POST"])
@token_required
def migrate_class_fee_structures(current_user):
    """
    Migration Tool: Backfill academic_year from academicyear
    """
    if current_user.role != 'Admin':
        return jsonify({"error": "Admin required"}), 403
        
    try:
        structs = ClassFeeStructure.query.filter(
            (ClassFeeStructure.academic_year == None) | (ClassFeeStructure.academic_year == "")
        ).all()
        
        count = 0
        for fs in structs:
            if fs.academicyear:
                fs.academic_year = fs.academicyear
                count += 1
        
        db.session.commit()
        return jsonify({"message": f"Migrated {count} ClassFeeStructure records to standard 'academic_year' column"}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/class-fee-structure", methods=["POST"])
@token_required
def create_class_fee_structure(current_user):
    data = request.json or {}
    
    # Check if this is a bulk create request (frontend sends 'fees' array)
    if "fees" in data and isinstance(data["fees"], list):
        created_ids = []
        class_name = data.get("class")
        academic_year = data.get("academic_year", "2025-2026")
        fee_group = data.get("fee_group")
        branch = data.get("branch", "All") 
        
        for fee_item in data["fees"]:
            fee_id = fee_item.get("id")
            fee_type_id = fee_item.get("fee_type_id")
            is_new_admission = fee_item.get("is_new_admission", False)
            
            fs = None
            
            # 1. Try to find by ID if provided
            if fee_id:
                fs = ClassFeeStructure.query.get(fee_id)
            
            # 2. If not found by ID, try to find by unique constraints AND BRANCH
            if not fs:
                fs = ClassFeeStructure.query.filter_by(
                    clazz=class_name,
                    academic_year=academic_year,
                    feetypeid=fee_type_id,
                    branch=branch,
                    isnewadmission=is_new_admission
                ).first()
            
            if fs:
                # UPDATE existing record
                fs.totalamount = fee_item.get("total_amount")
                fs.monthly_amount = fee_item.get("monthly_amount")
                fs.installments_count = len(fee_item.get("installments", []))
                fs.feegroup = fee_group 
                fs.branch = branch 
                fs.location = fee_item.get("location", fs.location)
                fs.academic_year = academic_year 
            else:
                # CREATE new record
                fs = ClassFeeStructure(
                    clazz=class_name,
                    feetypeid=fee_type_id,
                    academicyear=academic_year,
                    academic_year=academic_year, # Sync
                    totalamount=fee_item.get("total_amount"),
                    monthly_amount=fee_item.get("monthly_amount"),
                    installments_count=len(fee_item.get("installments", [])),
                    isnewadmission=is_new_admission,
                    feegroup=fee_group,
                    branch=branch,
                    location=fee_item.get("location", get_default_location())
                )
                db.session.add(fs)
            
            db.session.flush()
            created_ids.append(fs.id)
            
            # AUTO ASSIGN TO EXISTING STUDENTS
            if not is_new_admission:
                students_query = Student.query.filter_by(clazz=fs.clazz)
                
                if fs.branch and fs.branch != "All":
                    students_query = students_query.filter_by(branch=fs.branch)
                elif fs.branch == "All" and fs.location and fs.location not in ["All", "All Locations"]:
                    # Optimization: Filter students by Location if Branch is All
                    loc_master = OrgMaster.query.filter_by(display_name=fs.location, master_type='LOCATION').first()
                    if loc_master:
                         students_query = students_query.join(Branch, Student.branch == Branch.branch_name)\
                                                        .filter(Branch.location_code == loc_master.code)

                # Strict Academic Year Match
                if fs.academic_year:
                    students_query = students_query.filter_by(academic_year=fs.academic_year)
                
                students = students_query.all()
                print(f"DEBUG: Found {len(students)} students in Class {fs.clazz} (Branch: {fs.branch}) for auto-assignment.")
                
                for s in students:
                    if fs.branch and fs.branch != "All" and s.branch != fs.branch:
                        continue
                    assign_fee_to_student(s.student_id, fs, is_student_new=False)

        try:
            db.session.commit()
        except Exception as commit_error:
            db.session.rollback()
            return jsonify({"error": f"Failed to save fee structures: {str(commit_error)}"}), 500
            
        return jsonify({"message": "Class fee structures saved successfully", "ids": created_ids}), 201
        
    return jsonify({"error": "Invalid data format. Expected 'fees' list."}), 400

@bp.route("/api/class-fee-structure/<int:id>", methods=["DELETE"])
@token_required
def delete_class_fee_structure(current_user, id):
    try:
        fs = ClassFeeStructure.query.get(id)
        if not fs:
            return jsonify({"error": "Fee structure not found"}), 404
            
        assigned_count = StudentFee.query.join(Student).filter(
            StudentFee.fee_type_id == fs.feetypeid,
            StudentFee.academic_year == fs.academic_year, 
            StudentFee.is_active == True,
            Student.clazz == fs.clazz,
            Student.branch == fs.branch if fs.branch != 'All' else True 
        ).count()
        
        if assigned_count > 0:
            return jsonify({
                "error": "Cannot delete this fee structure because it has already been assigned to students. "
                         "Please remove the fee assignments from students first if you really need to delete this."
            }), 400
            
        db.session.delete(fs)
        db.session.commit()
        return jsonify({"message": "Fee structure deleted successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/concessions", methods=["GET"])
@token_required
def get_concessions(current_user):
    academic_year, err, code = require_academic_year()
    if err:
        return err, code

    query = Concession.query.filter_by(academic_year=academic_year)
    
    if current_user.role == 'Admin':
        h_branch = request.headers.get("X-Branch", "All")
        if h_branch and h_branch not in ["All", "AllBranches"]:
            from sqlalchemy import or_
            query = query.filter(or_(Concession.branch == h_branch, Concession.branch == "All"))
    else:
        target_branch = current_user.branch
        if not target_branch:
             return jsonify({"concessions": []}), 200
        from sqlalchemy import or_
        query = query.filter(or_(Concession.branch == target_branch, Concession.branch == "All"))

    concessions = query.all()
    
    grouped = {}
    for c in concessions:
        key = (c.title, c.academic_year)
        if key not in grouped:
            grouped[key] = {
                "title": c.title,
                "description": c.description,
                "academic_year": c.academic_year,
                "branch": c.branch, 
                "is_percentage": c.is_percentage,
                "show_in_payment": c.show_in_payment,
                "items": []
            }
        
        grouped[key]["items"].append({
            "id": c.id,
            "fee_type_id": c.fee_type_id,
            "fee_type_name": c.fee_type.feetype if c.fee_type else "Unknown",
            "percentage": float(c.percentage or 0)
        })
        
    return jsonify({"concessions": list(grouped.values())}), 200

@bp.route("/api/concessions", methods=["POST"])
@token_required
def create_concession(current_user):
    data = request.json or {}
    
    title = data.get("title")
    description = data.get("description")
    academic_year = data.get("academic_year")
    
    if current_user.role == 'Admin':
        branch = data.get("branch") or "All"
    else:
        branch = current_user.branch
        if not branch:
             return jsonify({"error": "User has no branch assigned"}), 403

    is_percentage = data.get("is_percentage", True)
    show_in_payment = data.get("show_in_payment", False)
    items = data.get("items", []) 
    
    if not title or not academic_year:
        return jsonify({"error": "Title and Academic Year are required"}), 400
        
    try:
        existing = Concession.query.filter_by(title=title, academic_year=academic_year, branch=branch).first()
        if existing:
            return jsonify({"error": f"Concession '{title}' already exists for {academic_year} in {branch} branch"}), 400
            
        created_ids = []
        for item in items:
            c = Concession(
                title=title,
                description=description,
                academic_year=academic_year,
                branch=branch,
                is_percentage=is_percentage,
                show_in_payment=show_in_payment,
                fee_type_id=item.get("fee_type_id"),
                percentage=item.get("percentage", 0)
            )
            db.session.add(c)
            db.session.flush()
            created_ids.append(c.id)
            
        db.session.commit()
        return jsonify({"message": "Concession created successfully", "ids": created_ids}), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/concessions/<string:title>/<string:year>", methods=["DELETE"])
@token_required
def delete_concession(current_user, title, year):
    try:
        query = Concession.query.filter_by(title=title, academic_year=year)
        
        if current_user.role != 'Admin':
             if not current_user.branch:
                  return jsonify({"error": "Unauthorized"}), 403
             query = query.filter_by(branch=current_user.branch)
             
        deleted = query.delete()
        db.session.commit()
        
        if deleted == 0:
            return jsonify({"error": "Concession not found or unauthorized"}), 404
            
        return jsonify({"message": f"Concession '{title}' deleted successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/concessions/<string:original_title>/<string:original_year>", methods=["PUT"])
@token_required
def update_concession(current_user, original_title, original_year):
    data = request.json or {}
    
    new_title = data.get("title")
    description = data.get("description")
    new_year = data.get("academic_year")
    
    if current_user.role == 'Admin':
        new_branch = data.get("branch") or "All"
    else:
        new_branch = current_user.branch
        if not new_branch:
             return jsonify({"error": "Unauthorized"}), 403

    is_percentage = data.get("is_percentage", True)
    show_in_payment = data.get("show_in_payment", False)
    items = data.get("items", []) 
    
    if not new_title or not new_year:
        return jsonify({"error": "Title and Academic Year are required"}), 400
        
    try:
        query = Concession.query.filter_by(title=original_title, academic_year=original_year)
        
        if current_user.role != 'Admin':
             check = query.filter_by(branch=new_branch).count()
             if check == 0:
                  pass 
             query = query.filter_by(branch=new_branch)
        else:
             pass 

        deleted = query.delete()
        if deleted == 0 and current_user.role != 'Admin':
             return jsonify({"error": "Concession not found or unauthorized to edit global concession"}), 403
            
        created_ids = []
        for item in items:
            c = Concession(
                title=new_title,
                description=description,
                academic_year=new_year,
                branch=new_branch,
                is_percentage=is_percentage,
                show_in_payment=show_in_payment,
                fee_type_id=item.get("fee_type_id"),
                percentage=item.get("percentage", 0)
            )
            db.session.add(c)
            db.session.flush()
            created_ids.append(c.id)
            
        db.session.commit()
        return jsonify({"message": "Concession updated successfully", "ids": created_ids}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/installment-schedule", methods=["GET"])
@token_required
def get_installments(current_user):
    try:
        fee_type_id = request.args.get('fee_type_id')
        branch = request.args.get('branch')
        location_param = request.args.get('location') 
        
        h_branch = request.headers.get("X-Branch")
        
        h_year, err, code = require_academic_year()
        if err:
            return err, code
        
        target_branch = branch if branch else h_branch
        
        query = FeeInstallment.query
        
        if fee_type_id:
            query = query.filter_by(fee_type_id=fee_type_id)
            
        if target_branch and target_branch != "All":
             from sqlalchemy import or_, and_
             
             branch_loc_name = get_default_location() 
             branch_obj = Branch.query.filter_by(branch_name=target_branch).first()
             if branch_obj:
                 loc_master = OrgMaster.query.filter_by(code=branch_obj.location_code, master_type='LOCATION').first()
                 if loc_master:
                     branch_loc_name = loc_master.display_name
             
             query = query.filter(
                 or_(
                     FeeInstallment.branch == target_branch,
                     and_(
                         FeeInstallment.branch == "All",
                         or_(
                             FeeInstallment.location == None,
                             FeeInstallment.location == "All",
                             FeeInstallment.location == "All Locations",
                             FeeInstallment.location == branch_loc_name
                         )
                     )
                 )
             )
        elif target_branch == "All":
             if location_param and location_param not in ["All", "All Locations"]:
                 query = query.filter_by(location=location_param)

        query = query.filter_by(academic_year=h_year)

        installments = query.order_by(FeeInstallment.installment_no).all()
        
        return jsonify({
            "installments": [{
                "id": i.id,
                "installment_no": i.installment_no,
                "title": i.title,
                "start_date": i.start_date.isoformat() if i.start_date else None,
                "end_date": i.end_date.isoformat() if i.end_date else None,
                "last_pay_date": i.last_pay_date.isoformat() if i.last_pay_date else None,
                "is_admission": i.is_admission,
                "description": i.description,
                "fee_type_id": i.fee_type_id,
                "fee_type_name": i.fee_type.feetype if i.fee_type else None,
                "branch": i.branch,
                "academic_year": i.academic_year,
                "created_at": i.created_at.isoformat() if i.created_at else None,
                "updated_at": i.updated_at.isoformat() if i.updated_at else None,
                "created_by": i.created_by,
                "updated_by": i.updated_by
            } for i in installments]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/installment-schedule", methods=["POST"])
@token_required
def create_installment(current_user):
    data = request.json or {}
    try:
        # Require Academic Year from Payload OR Header
        # If payload has it, good. If not, check header.
        payload_year = data.get("academic_year")
        
        # Helper check
        h_year, err, code = require_academic_year()
        
        # Logic: Prefer payload, fallback to header, fallback to ERROR (no hardcode)
        target_year = payload_year if payload_year else h_year
        
        if not target_year:
             return jsonify({"error": "Academic Year is required"}), 400

        target_branch = data.get("branch", "All")
        target_location = data.get("location") 

        # Bulk creation
        if isinstance(data, list):
            created_ids = []
            for item in data:
                inst_no = item.get("installment_no")
                item_branch = item.get("branch", "All")
                item_year = item.get("academic_year") or target_year
                if not item_year:
                     return jsonify({"error": "Academic Year required for all items"}), 400
                item_loc = item.get("location")
                
                shift_installments(inst_no, item_branch, item_year, item_loc)
                
                new_inst = FeeInstallment(
                    installment_no=inst_no,
                    title=item.get("title"),
                    start_date=datetime.strptime(item.get("start_date"), "%Y-%m-%d").date(),
                    end_date=datetime.strptime(item.get("end_date"), "%Y-%m-%d").date(),
                    last_pay_date=datetime.strptime(item.get("last_pay_date"), "%Y-%m-%d").date(),
                    is_admission=item.get("is_admission", False),
                    description=item.get("description"),
                    fee_type_id=item.get("fee_type_id"),
                    branch=item.get("branch"),
                    location=item.get("location"),
                    academic_year=item.get("academic_year")
                )
                db.session.add(new_inst)
                db.session.flush()
                created_ids.append(new_inst.id)
            db.session.commit()
            return jsonify({"message": "Installments created successfully", "ids": created_ids}), 201
            
        # Single creation
        inst_no = data.get("installment_no")
        shift_installments(inst_no, target_branch, target_year, target_location)
        
        new_inst = FeeInstallment(
            installment_no=inst_no,
            title=data.get("title"),
            start_date=datetime.strptime(data.get("start_date"), "%Y-%m-%d").date(),
            end_date=datetime.strptime(data.get("end_date"), "%Y-%m-%d").date(),
            last_pay_date=datetime.strptime(data.get("last_pay_date"), "%Y-%m-%d").date(),
            is_admission=data.get("is_admission", False),
            description=data.get("description"),
            fee_type_id=data.get("fee_type_id"),
            branch=data.get("branch"),
            location=data.get("location"),
            academic_year=data.get("academic_year")
        )
        db.session.add(new_inst)
        db.session.commit()
        return jsonify({"message": "Installment created successfully", "id": new_inst.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/installment-schedule/<int:id>", methods=["PUT"])
@token_required
def update_installment(current_user, id):
    data = request.json or {}
    try:
        inst = FeeInstallment.query.get(id)
        if not inst:
            return jsonify({"error": "Installment not found"}), 404
            
        new_no = data.get("installment_no")
        current_branch = data.get("branch", inst.branch) or "All"
        # Fix: Remove hardcoded fallback. Use existing year if not provided.
        current_year = data.get("academic_year", inst.academic_year)
        if not current_year:
             return jsonify({"error": "Academic Year cannot be empty"}), 400

        if new_no and int(new_no) != inst.installment_no:
             # Shift logic for update (local definition or import if needed, assuming usage of imported one for new inserts but this is complex)
             # Let's implementation local shift_for_update as it was in app.py
             def shift_for_update(start_no, branch, year, exclude_id):
                 query = FeeInstallment.query.filter(
                     FeeInstallment.installment_no >= start_no,
                     FeeInstallment.branch == branch,
                     FeeInstallment.academic_year == year,
                     FeeInstallment.id != exclude_id
                 )
                 existing = query.order_by(FeeInstallment.installment_no.desc()).all()
                 for i in existing:
                     i.installment_no += 1
                 if existing:
                     db.session.flush()

             shift_for_update(int(new_no), current_branch, current_year, inst.id)
             inst.installment_no = int(new_no)

        inst.title = data.get("title", inst.title)
        if data.get("start_date"):
            inst.start_date = datetime.strptime(data.get("start_date"), "%Y-%m-%d").date()
        if data.get("end_date"):
            inst.end_date = datetime.strptime(data.get("end_date"), "%Y-%m-%d").date()
        if data.get("last_pay_date"):
            inst.last_pay_date = datetime.strptime(data.get("last_pay_date"), "%Y-%m-%d").date()
        inst.is_admission = data.get("is_admission", inst.is_admission)
        inst.description = data.get("description", inst.description)
        inst.branch = current_branch
        inst.academic_year = current_year
        
        db.session.commit()
        return jsonify({"message": "Installment updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/installment-schedule/<int:id>", methods=["DELETE"])
@token_required
def delete_installment(current_user, id):
    try:
        inst = FeeInstallment.query.get(id)
        if not inst:
            return jsonify({"error": "Installment not found"}), 404
            
        deleted_no = inst.installment_no
        branch = inst.branch
        academic_year = inst.academic_year
        
        assigned_count = StudentFee.query.join(Student).filter(
            StudentFee.academic_year == inst.academic_year,
            StudentFee.month == inst.title,
            StudentFee.is_active == True,
        ).count()
        
        if assigned_count > 0:
            return jsonify({"error": f"Cannot delete installment '{inst.title}' as it has decided fees for {assigned_count} students."}), 400
            
        db.session.delete(inst)
        
        subsequent_installments = FeeInstallment.query.filter(
            FeeInstallment.branch == branch,
            FeeInstallment.academic_year == academic_year,
            FeeInstallment.installment_no > deleted_no
        ).all()

        for sub_inst in subsequent_installments:
            sub_inst.installment_no -= 1
        
        db.session.commit()
        return jsonify({"message": "Installment deleted and schedule reordered successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
@bp.route("/api/fees/copy-class-fee-structure", methods=["POST"])
@token_required
def copy_class_fee_structure(current_user):
    try:
        data = request.json or {}
        source_branch_id = data.get("source_branch_id")
        target_branch_ids = data.get("target_branch_ids", [])
        academic_year = data.get("academic_year")
        class_name = data.get("class")
        
        if not all([source_branch_id, target_branch_ids, academic_year, class_name]):
            return jsonify({"error": "Missing required fields (source_branch_id, target_branch_ids, academic_year, class)"}), 400
            
        # 1. Resolve Source Branch Name (Frontend sends ID)
        source_branch_name = None
        s_br = Branch.query.filter_by(id=source_branch_id).first()
        if s_br:
             source_branch_name = s_br.branch_name
        else:
             # Fallback: maybe it's already a name?
             if isinstance(source_branch_id, str) and not source_branch_id.isdigit():
                 source_branch_name = source_branch_id
             else:
                 return jsonify({"error": "Source branch not found"}), 404

        # 2. Fetch Source Fee Structure
        source_fees = ClassFeeStructure.query.filter_by(
            clazz=class_name,
            academic_year=academic_year,
            branch=source_branch_name
        ).all()
        
        if not source_fees:
             return jsonify({"message": "No fee structures found in source branch to copy."}), 404

        # 3. Resolve Target Branches & Locations
        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()
        
        # Location Helper
        loc_map = {}
        all_locs = OrgMaster.query.filter_by(master_type='LOCATION').all()
        for l in all_locs:
            loc_map[l.code] = l.display_name
            
        copied_count = 0
        skipped_count = 0
        skipped_validation_count = 0
        
        for t_br in target_branches:
            t_branch_name = t_br.branch_name
            # Fallback to location_code if name lookup fails (Specific fix for 'Delhi' etc.)
            t_location_name = loc_map.get(t_br.location_code, t_br.location_code) or "Unknown Location"
            
            for src_fee in source_fees:
                # --- VALIDATION 1: Fee Type Existence ---
                src_ft = FeeType.query.get(src_fee.feetypeid)
                if not src_ft:
                    continue # Should not happen
                
                target_ft_id = None
                
                if src_ft.branch == 'All':
                     # Global Fee Type: Valid for everyone
                     target_ft_id = src_ft.id
                else:
                     # Branch-Specific: Check if Target has a Fee Type with SAME NAME
                     target_ft_obj = FeeType.query.filter_by(
                         feetype=src_ft.feetype,
                         branch=t_branch_name,
                         academic_year=academic_year
                     ).first()
                     
                     if target_ft_obj:
                         target_ft_id = target_ft_obj.id
                     else:
                         # VALIDATION FAILED: Target missing required fee type
                         skipped_validation_count += 1
                         print(f"[SKIP] Target {t_branch_name} missing fee type '{src_ft.feetype}'")
                         continue

                # --- VALIDATION 2: Installment Count Match ---
                if src_fee.installments_count > 0:
                    # Check how many installments are configured for the TARGET context
                    # Logic: global installments + branch specific installments? 
                    # Usually FeeInstallment is searched by fee_type_id and (branch OR All).
                    
                    # We use a query similar to 'get_installments' logic:
                    cnt_query = FeeInstallment.query.filter(
                        FeeInstallment.fee_type_id == target_ft_id,
                        FeeInstallment.academic_year == academic_year,
                        or_(FeeInstallment.branch == t_branch_name, FeeInstallment.branch == 'All')
                    )
                    t_inst_count = cnt_query.count()
                    
                    if t_inst_count != src_fee.installments_count:
                         # VALIDATION FAILED: Mismatch in installments
                         skipped_validation_count += 1
                         print(f"[SKIP] Target {t_branch_name} installment mismatch for '{src_ft.feetype}'. Source: {src_fee.installments_count}, Target: {t_inst_count}")
                         continue

                # Check Existing (Merge Mode)
                # Note: We must check existence using the TARGET Fee Type ID
                existing = ClassFeeStructure.query.filter_by(
                    clazz=class_name,
                    academic_year=academic_year,
                    branch=t_branch_name,
                    feetypeid=target_ft_id # Important: Use resolved ID
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue # SKIP duplicate logic
                
                # COPY
                new_fee = ClassFeeStructure(
                    clazz=src_fee.clazz,
                    feetypeid=target_ft_id, # Use resolved ID
                    academicyear=academic_year,
                    academic_year=academic_year,
                    totalamount=src_fee.totalamount,
                    monthly_amount=src_fee.monthly_amount,
                    installments_count=src_fee.installments_count,
                    isnewadmission=src_fee.isnewadmission,
                    feegroup=src_fee.feegroup,
                    branch=t_branch_name,
                    location=t_location_name
                )
                db.session.add(new_fee)
                copied_count += 1
                
        db.session.commit()
        
        return jsonify({
            "message": "Copy completed (Merge Mode with Validation)",
            "details": {
                "copied": copied_count,
                "skipped_duplicates": skipped_count,
                "skipped_validation": skipped_validation_count,
                "targets": len(target_branches)
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Fee Structure Failed: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fees/copy-fee-types", methods=["POST"])
@token_required
def copy_fee_types(current_user):
    try:
        data = request.json or {}
        source_branch_id = data.get("source_branch_id")
        target_branch_ids = data.get("target_branch_ids", [])
        academic_year = data.get("academic_year")
        
        if not all([source_branch_id, target_branch_ids, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400
            
        # 1. Resolve Source Branch Name
        source_branch_name = None
        s_br = Branch.query.filter_by(id=source_branch_id).first()
        if s_br:
             source_branch_name = s_br.branch_name
        elif isinstance(source_branch_id, str):
             source_branch_name = source_branch_id
        else:
             return jsonify({"error": "Source branch not found"}), 404

        # 2. Fetch Source Fee Types (Only specific to this branch, not 'All')
        source_fee_types = FeeType.query.filter_by(
            branch=source_branch_name,
            academic_year=academic_year
        ).all()
        
        if not source_fee_types:
             return jsonify({"message": "No fee types found in source branch to copy."}), 404

        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()
        
        copied_count = 0
        skipped_count = 0
        
        for t_br in target_branches:
            t_branch_name = t_br.branch_name
            
            for src_ft in source_fee_types:
                # Check if exists in target (by name)
                # Also check 'All' just in case, though we are copying branch specific logic
                existing = FeeType.query.filter(
                    FeeType.feetype == src_ft.feetype,
                    FeeType.academic_year == academic_year,
                    or_(FeeType.branch == t_branch_name, FeeType.branch == 'All')
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Create New
                new_ft = FeeType(
                    feetype=src_ft.feetype,
                    category=src_ft.category,
                    feetypegroup=src_ft.feetypegroup,
                    type=src_ft.type,
                    displayname=src_ft.displayname,
                    isrefundable=src_ft.isrefundable,
                    description=src_ft.description,
                    branch=t_branch_name,
                    academic_year=academic_year
                )
                db.session.add(new_ft)
                copied_count += 1
                
        db.session.commit()
        return jsonify({
            "message": "Fee Types copied successfully",
            "details": { "copied": copied_count, "skipped": skipped_count }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Fee Types: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/copy-installments", methods=["POST"])
@token_required
def copy_installments(current_user):
    try:
        data = request.json or {}
        source_branch_id = data.get("source_branch_id")
        target_branch_ids = data.get("target_branch_ids", [])
        source_fee_type_id = data.get("source_fee_type_id")
        academic_year = data.get("academic_year")
        
        if not all([source_branch_id, target_branch_ids, source_fee_type_id, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400
            
        # 1. Resolve Source
        s_br = Branch.query.filter_by(id=source_branch_id).first()
        source_branch_name = s_br.branch_name if s_br else str(source_branch_id)
        
        src_ft = FeeType.query.get(source_fee_type_id)
        if not src_ft:
            return jsonify({"error": "Source fee type not found"}), 404
            
        fee_type_name = src_ft.feetype # or fee_type
        
        # 2. Fetch Source Installments
        source_installments = FeeInstallment.query.filter_by(
            fee_type_id=source_fee_type_id,
            branch=source_branch_name,
            academic_year=academic_year
        ).all()
        
        if not source_installments:
             return jsonify({"message": "No installments found to copy."}), 404

        # 3. Process Targets
        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()
        
        # Helper for locations
        loc_map = {}
        all_locs = OrgMaster.query.filter_by(master_type='LOCATION').all()
        for l in all_locs:
            loc_map[l.code] = l.display_name
            
        copied_batches = 0
        skipped_batches = 0
        errors = []
        
        for t_br in target_branches:
            t_branch_name = t_br.branch_name
            t_location = loc_map.get(t_br.location_code, t_br.location_code) or "Unknown Location"
            
            # Find Target Fee Type by Name
            target_ft = FeeType.query.filter_by(
                feetype=fee_type_name,
                branch=t_branch_name,
                academic_year=academic_year
            ).first()
            
            if not target_ft:
                # Try Global
                target_ft = FeeType.query.filter_by(
                    feetype=fee_type_name,
                    branch='All',
                    academic_year=academic_year
                ).first()
                
            if not target_ft:
                errors.append(f"Target '{t_branch_name}' missing fee type '{fee_type_name}'")
                continue
                
            # Check for EXISTING installments
            existing_count = FeeInstallment.query.filter_by(
                fee_type_id=target_ft.id,
                branch=t_branch_name,
                academic_year=academic_year
            ).count()
            
            if existing_count > 0:
                skipped_batches += 1
                continue # Skip to avoid duplicates/mess
            
            # COPY
            for inst in source_installments:
                new_inst = FeeInstallment(
                    installment_no=inst.installment_no,
                    title=inst.title,
                    start_date=inst.start_date,
                    end_date=inst.end_date,
                    last_pay_date=inst.last_pay_date,
                    is_admission=inst.is_admission,
                    description=inst.description,
                    fee_type_id=target_ft.id, # Link to TARGET fee type
                    branch=t_branch_name,
                    location=t_location,
                    academic_year=academic_year
                )
                db.session.add(new_inst)
            
            copied_batches += 1
            
        db.session.commit()
        return jsonify({
            "message": "Installments copy process completed",
            "details": {
                "copied_batches": copied_batches, 
                "skipped_batches": skipped_batches,
                "errors": errors
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Installments: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fees/copy-concessions", methods=["POST"])
@token_required
def copy_concessions(current_user):
    try:
        data = request.json or {}
        source_branch_id = data.get("source_branch_id")
        target_branch_ids = data.get("target_branch_ids", [])
        academic_year = data.get("academic_year")
        
        if not all([source_branch_id, target_branch_ids, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400
            
        # 1. Resolve Source Branch Name
        s_br = Branch.query.filter_by(id=source_branch_id).first()
        source_branch_name = s_br.branch_name if s_br else str(source_branch_id)
        
        # 2. Fetch Source Concessions
        # Concessions are stored as one row per fee type per concession title
        # We need to fetch all rows for this branch and year
        source_concessions = Concession.query.filter_by(
            branch=source_branch_name,
            academic_year=academic_year
        ).all()
        
        if not source_concessions:
             return jsonify({"message": "No concessions found to copy."}), 404

        # Group by Title to handle them as logical units
        # title -> list of concession rows
        concessions_by_title = {}
        for c in source_concessions:
            if c.title not in concessions_by_title:
                concessions_by_title[c.title] = []
            concessions_by_title[c.title].append(c)

        # 3. Process Targets
        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()
        
        # Helper for locations
        loc_map = {}
        all_locs = OrgMaster.query.filter_by(master_type='LOCATION').all()
        for l in all_locs:
            loc_map[l.code] = l.display_name
            
        copied_count = 0
        skipped_count = 0
        errors = []
        
        for t_br in target_branches:
            t_branch_name = t_br.branch_name
            t_location = loc_map.get(t_br.location_code, t_br.location_code) or "Unknown Location"
            
            for title, rows in concessions_by_title.items():
                # Check if this concession title already exists in target
                existing = Concession.query.filter_by(
                    title=title,
                    branch=t_branch_name,
                    academic_year=academic_year
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Copy logic
                # For each row (fee type link), find equivalent fee type in target
                
                rows_inserted = 0
                for src_row in rows:
                    if not src_row.fee_type_id:
                        continue 
                        
                    # Get source fee type name
                    src_ft = FeeType.query.get(src_row.fee_type_id)
                    if not src_ft:
                        continue # Should not happen usually
                    
                    ft_name = src_ft.feetype
                    
                    # Find target fee type
                    target_ft = FeeType.query.filter_by(
                        feetype=ft_name,
                        branch=t_branch_name,
                        academic_year=academic_year
                    ).first()
                    
                    if not target_ft:
                         # Try Global
                        target_ft = FeeType.query.filter_by(
                            feetype=ft_name,
                            branch='All',
                            academic_year=academic_year
                        ).first()
                    
                    if not target_ft:
                        # Skip this specific fee type link if target doesn't have it
                        # We don't fail the whole concession, just this part
                        continue
                        
                    # Create new concession row
                    new_c = Concession(
                        title=src_row.title,
                        description=src_row.description,
                        location=t_location,
                        branch=t_branch_name,
                        academic_year=academic_year,
                        fee_type_id=target_ft.id,
                        percentage=src_row.percentage,
                        is_percentage=src_row.is_percentage,
                        show_in_payment=src_row.show_in_payment
                    )
                    db.session.add(new_c)
                    rows_inserted += 1
                
                if rows_inserted > 0:
                    copied_count += 1
                    
        db.session.commit()
        return jsonify({
            "message": "Concessions copied successfully",
            "details": {
                "copied_titles": copied_count, 
                "skipped_titles": skipped_count,
                "errors": errors
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Concessions: {e}")
        return jsonify({"error": str(e)}), 500

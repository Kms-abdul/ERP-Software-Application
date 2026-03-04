from flask import request, jsonify, current_app
import jwt
from functools import wraps
import traceback
from extensions import db
from datetime import datetime, date
import os
from models import Branch, OrgMaster, Student, FeeInstallment, StudentFee, User, FeeType

MONTHS = [
    "May", "June", "July", "August", "September", "October",
    "November", "December", "January", "February", "March", "April"
]

def get_default_location():
    """Fetch the first active location from DB as default"""
    try:
        loc = OrgMaster.query.filter_by(master_type='LOCATION', is_active=True).first()
        return loc.display_name if loc else "Hyderabad" # Fallback only if DB empty
    except:
        return "Hyderabad"


from flask import g

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
        
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.filter_by(user_id=data['user_id']).first()
            if not current_user:
                 return jsonify({'error': 'User invalid!'}), 401
                 
            # Store user_id in global context for AuditMixin event listener
            g.user_id = current_user.user_id
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired!'}), 401
        except Exception as e:
            return jsonify({'error': 'Token is invalid!', 'details': str(e)}), 401
            
        return f(current_user, *args, **kwargs)
    
    return decorated

def require_academic_year():
    """Helper to enforce academic year validation"""
    year = request.headers.get("X-Academic-Year")
    if not year:
        return None, jsonify({"error": "Academic Year header is required"}), 400
    return year, None, None

def get_branch_query_filter(model_col, val):
    """Helper to generate branch filter allowing ID or Name match"""
    from sqlalchemy import or_
    filters = [model_col == val]
    if val and isinstance(val, str) and val.isdigit():
        b = Branch.query.get(int(val))
        if b: filters.append(model_col == b.branch_name)
    return or_(*filters)

def normalize_fee_title(title):
    """Normalize fee title for matching (lowercase, remove 'fee', strip)"""
    if not title:
        return ""
    return title.lower().replace(" fee", "").replace("admisson", "admission").strip()

def student_to_dict(s):
    # build name safely (no extra spaces if a part is missing)
    name_parts = [s.first_name, s.StudentMiddleName, s.last_name]
    name = " ".join([p for p in name_parts if p])
    
    photo_url = None
    if s.photopath:
        clean_path = s.photopath.replace(os.sep, '/')
        photo_url = f"{request.url_root}{clean_path}"

    return {
        "student_id": s.student_id,
        "admission_no": s.admission_no, # Explicit key for frontend
        "admNo": s.admission_no,
        "Roll_Number": s.Roll_Number, # Explicit key for frontend
        "rollNo": s.Roll_Number,
        "name": name,
        "first_name": s.first_name,
        "StudnetMiddleName": s.StudentMiddleName,
        "last_name": s.last_name,
        "class": s.clazz,
        "section": s.section,
        "dob": s.dob.isoformat() if s.dob else "", # ISO format for date input
        "father": s.Fatherfirstname,
        "fatherMobile": s.FatherPhone,
        "smsNo": s.SmsNo,
        "status": s.status,
        "photos": {
            "student": photo_url
        },
        "photo": photo_url, # For frontend compatibility (StudentAdministration, StudentAttendance)
        "photopath": s.photopath,
        "gender": s.gender,
        "email": s.email,
        "address": s.address,
        "Category": s.Category,
        "admission_date": s.admission_date.isoformat() if s.admission_date else "", # ISO format for date input
        # Include other fields needed for edit form
        "Doa": s.Doa.isoformat() if s.Doa else None,
        "BloodGroup": s.BloodGroup,
        "Adharcardno": s.Adharcardno,
        "Religion": s.Religion,
        "phone": s.phone,
        "MotherTongue": s.MotherTongue,
        "Caste": s.Caste,
        "StudentType": s.StudentType,
        "House": s.House,
        "AdmissionClass": s.AdmissionClass,
        "Fatherfirstname": s.Fatherfirstname,
        "FatherMiddleName": s.FatherMiddleName,
        "FatherLastName": s.FatherLastName,
        "FatherPhone": s.FatherPhone,
        "SmsNo": s.SmsNo,
        "FatherEmail": s.FatherEmail,
        "PrimaryQualification": s.PrimaryQualification,
        "FatherOccuption": s.FatherOccuption,
        "FatherCompany": s.FatherCompany,
        "FatherDesignation": s.FatherDesignation,
        "FatherAadhar": s.FatherAadhar,
        "FatherOrganizationId": s.FatherOrganizationId,
        "FatherOtherOrganization": s.FatherOtherOrganization,
        "Motherfirstname": s.Motherfirstname,
        "MothermiddleName": s.MothermiddleName,
        "Motherlastname": s.Motherlastname,
        "SecondaryPhone": s.SecondaryPhone,
        "SecondaryEmail": s.SecondaryEmail,
        "SecondaryQualification": s.SecondaryQualification,
        "SecondaryOccupation": s.SecondaryOccupation,
        "SecondaryCompany": s.SecondaryCompany,
        "SecondaryDesignation": s.SecondaryDesignation,
        "MotherAadhar": s.MotherAadhar,
        "MotherOrganizationId": s.MotherOrganizationId,
        "MotherOtherOrganization": s.MotherOtherOrganization,
        "GuardianName": s.GuardianName,
        "GuardianRelation": s.GuardianRelation,
        "GuardianQualification": s.GuardianQualification,
        "GuardianOccupation": s.GuardianOccupation,
        "GuardianDesignation": s.GuardianDesignation,
        "GuardianDepartment": s.GuardianDepartment,
        "GuardianOfficeAddress": s.GuardianOfficeAddress,
        "GuardianContactNo": s.GuardianContactNo,
        "SchoolName": s.SchoolName,
        "AdmissionNumber": s.AdmissionNumber,
        "TCNumber": s.TCNumber,
        "PreviousSchoolClass": s.PreviousSchoolClass,
        "AdmissionCategory": s.AdmissionCategory,
        "AdmissionClass": s.AdmissionClass,
        "StudentHeight": str(s.StudentHeight) if s.StudentHeight else None,
        "StudentWeight": str(s.StudentWeight) if s.StudentWeight else None,
        "SamagraId": s.SamagraId,
        "ChildId": s.ChildId,
        "PEN": s.PEN,
        "permanentCity": s.permanentCity,
        "previousSchoolName": s.previousSchoolName,
        "primaryIncomePerYear": str(s.primaryIncomePerYear) if s.primaryIncomePerYear else None,
        "secondaryIncomePerYear": str(s.secondaryIncomePerYear) if s.secondaryIncomePerYear else None,
        "primaryOfficeAddress": s.primaryOfficeAddress,
        "secondaryOfficeAddress": s.secondaryOfficeAddress,
        "Hobbies": s.Hobbies,
        "SecondLanguage": s.SecondLanguage,
        "ThirdLanguage": s.ThirdLanguage,
        "GroupUniqueId": s.GroupUniqueId,
        "serviceNumber": s.serviceNumber,
        "EmploymentservingStatus": s.EmploymentservingStatus,
        "inactivated_date": s.inactivated_date.isoformat() if s.inactivated_date else None,
        "inactivate_reason": s.inactivate_reason,
        "inactivated_by": s.inactivated_by,
        "ApaarId": s.ApaarId,
        "Stream": s.Stream,
        "EmploymentCategory": s.EmploymentCategory,
        "branch": s.branch,
        "location": s.location,
        "academic_year": s.academic_year
    }

def fee_type_to_dict(ft):
    return {
        "id": ft.id,
        "fee_type": ft.feetype,
        "category": ft.category,
        "fee_type_group": ft.feetypegroup,
        "type": ft.type,
        "display_name": ft.displayname,
        "is_refundable": bool(ft.isrefundable),
        "description": ft.description,
        "branch": ft.branch,
        "academic_year": ft.academic_year,
        "location": ft.location
    }

def assign_fee_to_student(student_id, fee_structure, is_student_new=False):
    try:
        student = Student.query.get(student_id)
        if not student:
            print(f"DEBUG: Student {student_id} not found in assign_fee_to_student")
            return
            
        # Verify strict branch match: FeeStructure Branch must match Student Branch (or be All)
        # If Fee Structure is for "North" and Student is "West", DO NOT ASSIGN.
        if fee_structure.branch and fee_structure.branch != "All" and fee_structure.branch != student.branch:
             print(f"DEBUG: Skipping Fee {fee_structure.id} (Branch: {fee_structure.branch}) for Student {student.branch}")
             return
            
        # Verify strict Location match if Branch is All
        if fee_structure.branch == "All" and fee_structure.location and fee_structure.location not in ["All", "All Locations"]:
             # Check if student's branch belongs to this location
             # 1. Get Student Branch Location Code
             s_branch = Branch.query.filter_by(branch_name=student.branch).first()
             if s_branch:
                 # 2. Get Display Name for this code
                 s_loc_master = OrgMaster.query.filter_by(code=s_branch.location_code, master_type='LOCATION').first()
                 s_loc_name = s_loc_master.display_name if s_loc_master else get_default_location()
                 
                 if s_loc_name.lower() != fee_structure.location.lower():
                      print(f"DEBUG: Skipping Fee {fee_structure.id} (Loc: {fee_structure.location}) for Student {student.branch} (Loc: {s_loc_name})")
                      return

        with open("debug_log.txt", "a") as log:
            log.write(f"DEBUG: assign_fee_to_student called for Student {student_id}, FeeStruct {fee_structure.id}\\n")
        # LOGIC:
        # If fee structure is marked 'isnewadmission=True', it applies ONLY to New Students.
        # If current student is NOT new (is_student_new=False), skip this fee.
        if fee_structure.isnewadmission and not is_student_new:
            with open("debug_log.txt", "a") as log:
                log.write(f"DEBUG: Skipping - Fee is for new admission, student is not new.\\n")
            return

        # Check if fee is already assigned to prevent duplicates
        exists = StudentFee.query.filter_by(
            student_id=student_id,
            fee_type_id=fee_structure.feetypeid,
            academic_year=fee_structure.academicyear,
        ).first()
        if exists:
            with open("debug_log.txt", "a") as log:
                log.write(f"DEBUG: Skipping - Fee already exists for student.\\n")
            return
        
        # Installment Logic
        # Create map with normalized keys, FILTERED by Student's Branch AND Academic Year
        from sqlalchemy import or_
        relevant_installments = FeeInstallment.query.filter(
            or_(FeeInstallment.branch == student.branch, FeeInstallment.branch == "All"),
            FeeInstallment.academic_year == fee_structure.academicyear
        ).all()
        installments_map = {normalize_fee_title(i.title): i for i in relevant_installments}
        
        # STRICT CHECK: Ensure FeeInstallment exists for this Fee Type (for this Branch and Year)
        # The user requested: "if fee_installment was not created for that fee type ... should not be created"
        
        # Check if any installment is linked to this fee_type_id
        linked_installments = [i for i in relevant_installments if i.fee_type_id == fee_structure.feetypeid]
        has_linked_installment = len(linked_installments) > 0
        
        # Fallback Check: For One-Time fees, maybe they linked by Title? 
        # (e.g. Installment Title "Admission Fee" matches Fee Type "Admission Fee")
        if not has_linked_installment and fee_structure.feetype:
             norm_type = normalize_fee_title(fee_structure.feetype.feetype)
             # Check if any installment title matches the fee type name
             # (Only if that installment isn't linked to a DIFFERENT fee type)
             has_title_match = any(normalize_fee_title(i.title) == norm_type for i in relevant_installments)
             
             if not has_title_match:
                 with open("debug_log.txt", "a") as log:
                     log.write(f"DEBUG: No matching Installment found for {fee_structure.feetype.feetype}. Proceeding to fallback checks (One-Time/Monthly).\\n")
                 # REMOVED strict return here to allow fallback to One-Time/Monthly logic below
                 # return 
        
        if fee_structure.installments_count > 0 and fee_structure.totalamount:
            with open("debug_log.txt", "a") as log:
                log.write(f"DEBUG: Creating installments for Student {student_id}\\n")
            
            # 1. NEW LOGIC: Use Linked Installments if available
            if not linked_installments and fee_structure.feetype:
                 norm_type = normalize_fee_title(fee_structure.feetype.feetype)
                 linked_installments = [i for i in relevant_installments if normalize_fee_title(i.title) == norm_type]
                 if linked_installments:
                     with open("debug_log.txt", "a") as log:
                         log.write(f"DEBUG: Found {len(linked_installments)} installments via Title Match. Using them.\\n")

            if linked_installments:
                with open("debug_log.txt", "a") as log:
                    log.write(f"DEBUG: Found {len(linked_installments)} linked installments. Using them.\\n")
                
                # Sort by start_date to ensuring chronological order 
                linked_installments.sort(key=lambda x: x.start_date)
                
                count = len(linked_installments)
                total_amount = float(fee_structure.totalamount)
                
                # Calculate base monthly amount rounded down to nearest 10
                if count > 0:
                    base_monthly = int((total_amount / count) // 10 * 10)
                    rest_total = base_monthly * (count - 1)
                    first_month_amount = total_amount - rest_total
                else: 
                     # Should not happen given if check
                    base_monthly = total_amount
                    first_month_amount = total_amount

                for idx, inst in enumerate(linked_installments):
                    amount = first_month_amount if idx == 0 else base_monthly
                    
                    sf = StudentFee(
                        student_id=student_id,
                        fee_type_id=fee_structure.feetypeid,
                        academic_year=fee_structure.academicyear,
                        month=inst.title, # Use Installment Title as "Month"
                        monthly_amount=amount,
                        total_fee=amount,
                        due_amount=amount,
                        status="Pending",
                        due_date=inst.last_pay_date
                    )
                    db.session.add(sf)
                with open("debug_log.txt", "a") as log:
                    log.write(f"DEBUG: Added {count} installments from definitions.\\n")

            else:
                 # 2. FALLBACK REMOVED
                 # If no installments defined (by ID or Title), DO NOT create random 12 months.
                 # User Requirement: "if we don't create installments ... should not be created"
                 with open("debug_log.txt", "a") as log:
                     log.write(f"DEBUG: No linked or title-matched installments found. Skipping installment creation.\\n")
                 pass
                
        elif fee_structure.monthly_amount:
            with open("debug_log.txt", "a") as log:
                log.write(f"DEBUG: Creating monthly fees (fallback) for Student {student_id}\\n")
            # Fallback for simple monthly amount if installments_count is 0 but monthly_amount is set
            # (Though usually installments_count should be set for monthly fees)
            for month in MONTHS:
                # Find due date from installments
                inst_title = f"{month} Fee"
                norm_title = normalize_fee_title(inst_title)
                due_date = None
                if norm_title in installments_map:
                    due_date = installments_map[norm_title].last_pay_date
                    
                sf = StudentFee(
                    student_id=student_id,
                    fee_type_id=fee_structure.feetypeid,
                    academic_year=fee_structure.academicyear,
                    month=month,
                    monthly_amount=fee_structure.monthly_amount,
                    total_fee=fee_structure.monthly_amount,
                    due_amount=fee_structure.monthly_amount,
                    status="Pending",
                    due_date=due_date
                )
                db.session.add(sf)
        else:
            with open("debug_log.txt", "a") as log:
                log.write(f"DEBUG: Creating one-time fee for Student {student_id}\\n")
            # One-Time Fee
            # Try to find due date by Fee Type Name
            due_date = None
            if fee_structure.feetype:
                norm_type = normalize_fee_title(fee_structure.feetype.feetype)
                if norm_type in installments_map:
                    due_date = installments_map[norm_type].last_pay_date
                
            sf = StudentFee(
                student_id=student_id,
                fee_type_id=fee_structure.feetypeid,
                academic_year=fee_structure.academicyear,
                month="One-Time",
                monthly_amount=fee_structure.totalamount,
                total_fee=fee_structure.totalamount,
                due_amount=fee_structure.totalamount,
                status="Pending",
                due_date=due_date
            )
            db.session.add(sf)
            
        db.session.flush() # Flush to ensure IDs are generated if needed, but commit is handled by caller
    except Exception as e:
        with open("debug_log.txt", "a") as log:
            log.write(f"Fee assignment error: {e}\\n")
        traceback.print_exc()

def auto_enroll_student_fee(student_id, class_name, year=None, is_student_new=True):
    student = Student.query.get(student_id)
    if not student: 
        return
    
    # Use student's year if not provided
    target_year = year if year else student.academic_year
    if not target_year:
         # Fix Issue 3: No fallback
         raise Exception(f"Academic Year missing for auto enrollment of Student {student_id}")

    from models import ClassFeeStructure # Avoid circular import if needed or already imported?
    # It is already imported at top.

    # FIX 3: STRICT AUTO-ENROLLMENT LOGIC
    # User Request: "Refine auto_enroll_student_fee logic"
    # "A structure created for Class A, Branch = All Automatically applies to every student... Result: Frontend looks like fee structure is shared"
    # To fix this, we should only enroll fees that match the student's branch EXACTLY,
    # unless we explicitly decide "All" means global.
    # Given the User's emphasis on STRICT branch control ("North sees only North"), 
    # and the removal of "All" from GET logic, we should also be strict here.
    
    # However, if a school creates "Tuition Fee" for "All Branches", they want it to apply to everyone.
    # But the User complained about "Merging All Branch Data".
    # So I will change this to be strict for now. If "All" is needed, they should create it for "All" and we might need to handle "All" students? No, students always have a branch.
    # If the fee is "All", does it apply to "North"?
    # The user said: "A structure created for Class A, Branch = All... Automatically applies to every student... Frontend looks like reused".
    # This implies they DO NOT want "All" fees to auto-apply if they want strict separation.
    
    structures = ClassFeeStructure.query.filter(
        ClassFeeStructure.clazz == class_name,
        ClassFeeStructure.academic_year == target_year,
        ClassFeeStructure.branch == student.branch # STRICT: Only apply fees created for THIS branch
    ).all()
    
    print(f"DEBUG: Auto-enrolling Student {student_id} (Class {class_name}, Year {target_year}). Found {len(structures)} structures.")

    for fs in structures:
        assign_fee_to_student(student_id, fs, is_student_new=is_student_new)

def generate_installments(fs):
    """Helper to generate installment list for frontend display"""
    installments = []
    if fs.monthly_amount and fs.installments_count > 0:
        # Logic to reconstruct installments for display
        # This is a simplified version; ideally we'd store installments in a separate table
        # but for now we reconstruct based on the total/monthly logic
        base_monthly = float(fs.monthly_amount)
        total = float(fs.totalamount)
        
        # Re-create the logic: First month gets remainder
        eleven_months_total = base_monthly * 11
        first_month_amount = total - eleven_months_total
        
        # If installments_count is not 12, this logic might need adjustment, 
        # but assuming standard 12-month structure for now as per frontend logic
        for i, month in enumerate(MONTHS):
            if i >= fs.installments_count: break
            amount = first_month_amount if i == 0 else base_monthly
            installments.append({
                "month": month,
                "amount": amount,
                "month_order": i + 1
            })
    return installments

def shift_installments(start_no, branch, year, location):
    """Shift all installments >= start_no by 1 for the specific branch, year & location"""
    query = FeeInstallment.query.filter(
        FeeInstallment.installment_no >= start_no,
        FeeInstallment.branch == branch,
        FeeInstallment.academic_year == year
    )
    # If we are shifting "All" branch installments, we must respect location scope
    if branch == "All":
        if location and location not in ["All", "All Locations"]:
            # Only shift installments that match this location
            query = query.filter_by(location=location)
        else:
            # If location is All or None, we might shift everything? 
            # Or only those with location=All/None?
            # Safer to shift compatible ones.
            # If I insert "All/All", I interrupt "All/Mumbai"? Yes.
            pass 
    
    existing = query.order_by(FeeInstallment.installment_no.desc()).all()
    for inst in existing:
        inst.installment_no += 1
    if existing:
        db.session.flush() # Apply updates before inserting new one

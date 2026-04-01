from flask import request, jsonify, current_app
import jwt
from functools import wraps
import traceback
from extensions import db
from datetime import datetime, date
import os
import hmac
import hashlib
from models import Branch, OrgMaster, Student, FeeInstallment, StudentFee, User, FeeType
from werkzeug.security import generate_password_hash, check_password_hash
import smtplib
from email.message import EmailMessage
from flask import current_app
import logging

logger = logging.getLogger(__name__)

MONTHS = [
    "May", "June", "July", "August", "September", "October",
    "November", "December", "January", "February", "March", "April"
]


def is_password_hash(stored_password):
    """Return True if the value appears to be a werkzeug-generated hash."""
    if not stored_password:
        return False
    return stored_password.startswith(("pbkdf2:", "scrypt:"))


def verify_user_password(raw_password, stored_password):
    """Verify both modern hashed passwords and legacy plaintext during migration phase."""
    if is_password_hash(stored_password):
        return check_password_hash(stored_password, raw_password or "")
    return hmac.compare_digest(stored_password or "", raw_password or "")


def hash_user_password(raw_password):
    """Create a secure password hash for storage."""
    return generate_password_hash(raw_password or "")


def _mask_email(email: str) -> str:
    """
    Return a privacy-preserving representation of an email address for logging.

    Examples:
        "user@example.com" -> "u***@example.com"
        "a@b.com" -> "a***@b.com"
        "invalid" -> "***"
    """
    if not email:
        return "***"
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        # Not a valid email format, avoid logging raw value
        return "***"

    if not local:
        return f"***@{domain}"

    masked_local = f"{local}***" if len(local) == 1 else f"{local[0]}***"

    return f"{masked_local}@{domain}"


def send_otp_email(to_email, otp):
    """Send an OTP email to the user using SMTP settings from .env"""
    # Load dynamically in case .env was recently modified
    from dotenv import load_dotenv
    load_dotenv(override=True)
    
    masked = _mask_email(to_email)
    
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com").strip()
    smtp_port_raw = os.environ.get("SMTP_PORT")
    try:
        smtp_port = int(smtp_port_raw) if smtp_port_raw else 587
    except (ValueError, TypeError):
        current_app.logger.warning(f"Invalid SMTP_PORT value '{smtp_port_raw}', falling back to 587")
        smtp_port = 587
    smtp_username = os.environ.get("SMTP_USERNAME", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    
    if current_app.debug:
        current_app.logger.debug(f"[EMAIL DEBUG] Server={smtp_server}, Port={smtp_port}, To={masked}")
    
    if not smtp_username or not smtp_password:
        current_app.logger.warning("SMTP credentials missing in .env. Falling back to console logging.")
        if current_app.debug:
            current_app.logger.debug("EMAIL MOCK - OTP email would be sent (credentials not configured)")
        return True

    msg = EmailMessage()
    msg['Subject'] = 'Password Reset OTP'
    msg['From'] = smtp_username
    msg['To'] = to_email
    msg.set_content(f"""Hello,

Your OTP for password reset is:

{otp}

This OTP will expire in 10 minutes.

If you did not request this, please ignore this email.
""")

    try:
        if current_app.debug:
            current_app.logger.debug("[EMAIL DEBUG] Connecting to %s:%s", smtp_server, smtp_port)
        with smtplib.SMTP(smtp_server, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
        current_app.logger.info(f"Email sent successfully to {masked}")
        return True
    except Exception as e:
        current_app.logger.error(f"Failed to send email to {masked}: {str(e)}")
        return False


def get_default_location():
    """Fetch the first active location from DB as default"""
    try:
        loc = OrgMaster.query.filter_by(master_type='LOCATION', is_active=True).first()
        return loc.display_name if loc else "Hyderabad" # Fallback only if DB empty
    except Exception:
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
            current_app.logger.exception('Token validation failed')
            return jsonify({'error': 'Token is invalid!'}), 401
            
        return f(current_user, *args, **kwargs)
    
    return decorated

def require_academic_year():
    """Helper to enforce academic year validation"""
    if not (year := request.headers.get("X-Academic-Year")):
        return None, jsonify({"error": "Academic Year header is required"}), 400
    return year, None, None

def get_branch_query_filter(model_col, val):
    """Helper to generate branch filter allowing ID or Name match"""
    from sqlalchemy import or_
    filters = [model_col == val]
    if val and isinstance(val, str) and val.isdigit():
        if b := Branch.query.get(int(val)):
            filters.append(model_col == b.branch_name)
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
    
    photo_url = f"{request.url_root}{s.photopath.replace(os.sep, '/')}" if s.photopath else None

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
        "academic_year": s.academic_year,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "created_by": s.created_by,
        "updated_by": s.updated_by
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
        "location": ft.location,
        "created_at": ft.created_at.isoformat() if ft.created_at else None,
        "updated_at": ft.updated_at.isoformat() if ft.updated_at else None,
        "created_by": ft.created_by,
        "updated_by": ft.updated_by
    }


def write_debug_log(message):
    logger.debug(message)

def _is_fee_applicable_to_student(student, fee_structure):
    """Check if the fee structure branch and location match the student."""
    if fee_structure.branch and fee_structure.branch != "All" and fee_structure.branch != student.branch:
        logger.debug("Skipping fee %s because branch %s does not match student branch %s", fee_structure.id, fee_structure.branch, student.branch)
        return False
        
    if fee_structure.branch == "All" and fee_structure.location and fee_structure.location not in ["All", "All Locations"]:
        if s_branch := Branch.query.filter_by(branch_name=student.branch).first():
            s_loc_master = OrgMaster.query.filter_by(code=s_branch.location_code, master_type='LOCATION').first()
            s_loc_name = s_loc_master.display_name if s_loc_master else get_default_location()
            
            if s_loc_name.lower() != fee_structure.location.lower():
                logger.debug("Skipping fee %s because location %s does not match student location %s", fee_structure.id, fee_structure.location, s_loc_name)
                return False
    return True

def _create_linked_installments(student_id, fee_structure, linked_installments):
    write_debug_log(f"Found {len(linked_installments)} linked installments.")
    linked_installments.sort(key=lambda x: x.start_date)
    
    count = len(linked_installments)
    if fee_structure.totalamount is None:
        write_debug_log(f"Error: totalamount is None for FeeStruct {fee_structure.id}, Student {student_id}")
        raise ValueError(f"Fee structure {fee_structure.id} totalamount is None for student {student_id}")
    total_amount = float(fee_structure.totalamount)
    
    if count > 0:
        base_monthly = int((total_amount / count) // 10 * 10)
        first_month_amount = total_amount - (base_monthly * (count - 1))
    else: 
        base_monthly = first_month_amount = total_amount

    for idx, inst in enumerate(linked_installments):
        amount = first_month_amount if idx == 0 else base_monthly
        db.session.add(StudentFee(
            student_id=student_id,
            fee_type_id=fee_structure.feetypeid,
            academic_year=fee_structure.academicyear,
            month=inst.title,
            monthly_amount=amount,
            total_fee=amount,
            due_amount=amount,
            status="Pending",
            due_date=inst.last_pay_date
        ))
    write_debug_log(f"Added {count} installments from definitions.")

def assign_fee_to_student(student_id, fee_structure, is_student_new=False):
    try:
        student = Student.query.get(student_id)
        if not student:
            logger.debug("Student %s not found in assign_fee_to_student", student_id)
            return

        if not _is_fee_applicable_to_student(student, fee_structure):
            return

        logger.debug(f"assign_fee_to_student called for Student {student_id}, FeeStruct {fee_structure.id}")

        if fee_structure.isnewadmission and not is_student_new:
            logger.debug("Skipping - Fee is for new admission, student is not new.")
            return

        if StudentFee.query.filter_by(
            student_id=student_id,
            fee_type_id=fee_structure.feetypeid,
            academic_year=fee_structure.academicyear,
        ).first():
            write_debug_log("Skipping fee assignment because the fee already exists for the student.")
            return
        
        from sqlalchemy import or_
        relevant_installments = FeeInstallment.query.filter(
            or_(FeeInstallment.branch == student.branch, FeeInstallment.branch == "All"),
            FeeInstallment.academic_year == fee_structure.academicyear
        ).all()
        installments_map = {normalize_fee_title(i.title): i for i in relevant_installments}
        
        linked_installments = [i for i in relevant_installments if i.fee_type_id == fee_structure.feetypeid]
        
        if not linked_installments and fee_structure.feetype:
             norm_type = normalize_fee_title(fee_structure.feetype.feetype)
             if all(normalize_fee_title(i.title) != norm_type for i in relevant_installments):
                 write_debug_log(f"No matching installment found for fee type {fee_structure.feetype.feetype}. Proceeding to fallback checks.")
        
        if fee_structure.installments_count > 0 and fee_structure.totalamount:
            write_debug_log(f"Creating installments for student {student_id}.")
            
            if not linked_installments and fee_structure.feetype:
                 norm_type = normalize_fee_title(fee_structure.feetype.feetype)
                 if linked_installments := [i for i in relevant_installments if normalize_fee_title(i.title) == norm_type]:
                     write_debug_log(f"Found {len(linked_installments)} installments via title match.")

            if linked_installments:
                _create_linked_installments(student_id, fee_structure, linked_installments)
            else:
                 write_debug_log("No linked or title-matched installments found. Skipping installment creation.")

        elif fee_structure.monthly_amount:
            write_debug_log(f"Creating monthly fee fallback for student {student_id}.")
            for month in MONTHS:
                norm_title = normalize_fee_title(f"{month} Fee")
                db.session.add(StudentFee(
                    student_id=student_id,
                    fee_type_id=fee_structure.feetypeid,
                    academic_year=fee_structure.academicyear,
                    month=month,
                    monthly_amount=fee_structure.monthly_amount,
                    total_fee=fee_structure.monthly_amount,
                    due_amount=fee_structure.monthly_amount,
                    status="Pending",
                    due_date=installments_map[norm_title].last_pay_date if norm_title in installments_map else None
                ))
        else:
            write_debug_log(f"Creating one-time fee for student {student_id}.")
            due_date = None
            if fee_structure.feetype:
                norm_type = normalize_fee_title(fee_structure.feetype.feetype)
                if norm_type in installments_map:
                    due_date = installments_map[norm_type].last_pay_date
                
            db.session.add(StudentFee(
                student_id=student_id,
                fee_type_id=fee_structure.feetypeid,
                academic_year=fee_structure.academicyear,
                month="One-Time",
                monthly_amount=fee_structure.totalamount,
                total_fee=fee_structure.totalamount,
                due_amount=fee_structure.totalamount,
                status="Pending",
                due_date=due_date
            ))
            
        db.session.flush()
    except Exception as e:
        logger.exception("Fee assignment error")
        traceback.print_exc()

def auto_enroll_student_fee(student_id, class_name, year=None, is_student_new=True):
    student = Student.query.get(student_id)
    if not student: 
        return
    
    # Use student's year if not provided
    target_year = year or student.academic_year
    if not target_year:
         # Fix Issue 3: No fallback
         raise ValueError(f"Academic Year missing for auto enrollment of Student {student_id}")

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
    
    logger.debug("Auto-enrolling student %s for class %s year %s with %s structures", student_id, class_name, target_year, len(structures))

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
            
        if fs.installments_count == 1:
            first_month_amount = total
            base_monthly = total
        else:
            remainder = total - base_monthly * (fs.installments_count - 1)
            first_month_amount = remainder
        
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
    if branch == "All" and location and location not in ["All", "All Locations"]:
        # Only shift installments that match this location
        query = query.filter_by(location=location)
        # If location is All or None, we might shift everything? 
        # Or only those with location=All/None?
        # Safer to shift compatible ones.
        # If I insert "All/All", I interrupt "All/Mumbai"? Yes.
    
    existing = query.order_by(FeeInstallment.installment_no.desc()).all()
    for inst in existing:
        inst.installment_no += 1
    if existing:
        db.session.flush() # Apply updates before inserting new one

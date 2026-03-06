from flask import Blueprint, jsonify, request, send_file
from extensions import db
from models import Student, Branch, UserBranchAccess, StudentFee, StudentAcademicRecord
from services.sequence_service import SequenceService
from helpers import token_required, require_academic_year, get_branch_query_filter, student_to_dict, auto_enroll_student_fee
from datetime import datetime
from sqlalchemy import or_, and_, func
import io
import csv
import pandas as pd
import traceback 
import base64
import os 

bp = Blueprint('student_routes', __name__)

def save_student_photo(student, photo_data):
    try:
        if not student.admission_no:
            return

        # Expect base64 data URI: data:image/jpeg;base64,...
        if "base64," not in photo_data:
            return

        header, encoded = photo_data.split(",", 1)
        ext = "jpg"
        if "image/png" in header:
            ext = "png"
        elif "image/jpeg" in header or "image/jpg" in header:
            ext = "jpg"
        elif "image/webp" in header:
            ext = "webp"

        data_bytes = base64.b64decode(encoded)

        # ── New path: HifzErpSoftwareApplication/Media/student_document/<admission_no>/ ──
        # __file__ = .../erp-backend/routes/student_routes.py
        # project root = two levels up from routes/
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        student_dir = os.path.join(project_root, 'Media', 'student_document', student.admission_no)

        if not os.path.exists(student_dir):
            os.makedirs(student_dir)

        # Always name the file profile.<ext> — easy to find, one photo per student
        filename = f"profile.{ext}"
        file_path = os.path.join(student_dir, filename)

        with open(file_path, "wb") as f:
            f.write(data_bytes)

        # Store relative path from project root, forward slashes for URL compatibility
        student.photopath = f"Media/student_document/{student.admission_no}/{filename}"

    except Exception as e:
        print(f"Error saving photo: {e}")


@bp.route("/api/students", methods=["GET"])
@token_required
def get_students(current_user):
    try:
        class_name = request.args.get("class")
        section = request.args.get("section")
        search = request.args.get("search")
        
        # Header Filtering
        h_branch = request.headers.get("X-Branch")
        h_year = request.headers.get("X-Academic-Year")
        
        # Base Query
        # We always start with Student.
        # If h_year is present, we filter by that year context (History-Aware)
        
        if h_year:
            # HISTORY AWARE MODE
            # We need both Student and StudentAcademicRecord (if it exists)
            q = db.session.query(Student, StudentAcademicRecord).outerjoin(
                StudentAcademicRecord, 
                and_(Student.student_id == StudentAcademicRecord.student_id, StudentAcademicRecord.academic_year == h_year)
            )
            # Filter: Either has a record for this year OR is currently in this year (and no record needed)
            q = q.filter(or_(StudentAcademicRecord.id != None, Student.academic_year == h_year))
        else:
            # CURRENT STATE MODE
            q = Student.query
        
        # Apply Filters
        # Note: In History Mode, we must check both Record and Student for Class/Section
        
        if class_name:
            if h_year:
                 q = q.filter(or_(
                    StudentAcademicRecord.class_name == class_name,
                    and_(StudentAcademicRecord.id == None, Student.clazz == class_name)
                ))
            else:
                 q = q.filter_by(clazz=class_name)

        if section:
            if h_year:
                q = q.filter(or_(
                    StudentAcademicRecord.section == section,
                    and_(StudentAcademicRecord.id == None, Student.section == section)
                ))
            else:
                 q = q.filter_by(section=section)

        if search:
            like = f"%{search}%"
            # Search is always on Student Profile fields
            q = q.filter(
                (Student.first_name.like(like)) |
                (Student.StudentMiddleName.like(like)) |
                (Student.last_name.like(like)) |
                (Student.admission_no.like(like)) |
                (Student.Fatherfirstname.like(like)) |
                (Student.phone.like(like)) |
                (Student.FatherPhone.like(like))
            )
        
        # Status Filtering
        include_inactive = request.args.get("include_inactive")
        if include_inactive != "true":
             q = q.filter(Student.status == "Active")

        # Branch Filtering (Unified Logic)
        branch_filter = None
        
        if current_user.role != 'Admin':
             req_branch = h_branch 
             
             has_access = False
             # Check explicit branch request access
             if req_branch and req_branch != "All":
                 b_obj = Branch.query.filter(or_(Branch.branch_code == req_branch, Branch.branch_name == req_branch)).first()
                 if b_obj:
                     access = UserBranchAccess.query.filter_by(user_id=current_user.user_id, branch_id=b_obj.id, is_active=True).first()
                     if access:
                         has_access = True
             
             if has_access:
                 # User has access to the requested branch
                 branch_filter = get_branch_query_filter(Student.branch, req_branch)
             elif current_user.branch != 'All':
                 # User is restricted to their home branch 
                 # (If they requested a different branch but didn't have access, we fall back or show empty? 
                 #  Ideally strict check would block earlier, but here we filter query)
                  branch_filter = get_branch_query_filter(Student.branch, current_user.branch)
             else:
                 # User is All branch (e.g. Super Staff?) - rare for non-admin
                 if req_branch and req_branch != "All":
                      branch_filter = get_branch_query_filter(Student.branch, req_branch)

        else:
             # Admin
             branch_param = request.args.get("branch")
             if branch_param == "All" or branch_param == "All Branches":
                 pass 
             elif branch_param:
                 branch_filter = get_branch_query_filter(Student.branch, branch_param)
             elif h_branch and h_branch != "All":
                 branch_filter = get_branch_query_filter(Student.branch, h_branch)
        
        if branch_filter is not None:
            q = q.filter(branch_filter)
            
        # Execute
        rows = q.all()
        
        with open("debug_students.txt", "a") as f:
            f.write(f"--- Request ---\n")
            f.write(f"Params: class={class_name}, sec={section}, branch={h_branch}, year={h_year}\n")
            f.write(f"User: {current_user.username}, Role: {current_user.role}, Branch: {current_user.branch}\n")
            f.write(f"Generated SQL: {str(q.statement.compile(compile_kwargs={'literal_binds': True}))}\n")
            f.write(f"Rows found: {len(rows)}\n")

        results = []
        
        for row in rows:
            try:
                # Handle tuple vs object
                if h_year:
                    s, record = row
                    s_dict = student_to_dict(s)
                    if record:
                        s_dict['class'] = record.class_name
                        s_dict['section'] = record.section
                        s_dict['Roll_Number'] = record.roll_number
                        s_dict['rollNo'] = record.roll_number
                        s_dict['academic_year'] = record.academic_year
                        s_dict['is_promoted'] = record.is_promoted
                    else:
                        s_dict['academic_year'] = h_year
                else:
                    s = row
                    s_dict = student_to_dict(s)
                    
                results.append(s_dict)
            except Exception as inner_e:
                print(f"Error processing student row: {inner_e}")
                continue # Skip bad rows to avoid crashing the whole list

        return jsonify({"students": results}), 200

    except Exception as e:
        with open("last_error.txt", "w") as f:
            f.write(str(e) + "\n")
            traceback.print_exc(file=f)
        print(f"API Error in get_students: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/<int:student_id>", methods=["PUT"])
@token_required
def update_student(current_user, student_id):
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404

        # Permission check
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
            return jsonify({"error": "Unauthorized"}), 403

        data = request.json or {}

        # -------- EXPLICIT FIELD MAPPING --------
        # Map frontend field names to backend model attributes
        field_mapping = {
            'admission_no': 'admission_no',
            'admissionNo': 'admission_no',
            'first_name': 'first_name',
            'last_name': 'last_name',
            'StudentMiddleName': 'StudentMiddleName',
            'gender': 'gender',
            'class': 'clazz',
            'section': 'section',
            'Roll_Number': 'Roll_Number',
            'status': 'status',
            'branch': 'branch',
            'location': 'location',
            'academic_year': 'academic_year',
            'BloodGroup': 'BloodGroup',
            'Adharcardno': 'Adharcardno',
            'Religion': 'Religion',
            'phone': 'phone',
            'email': 'email',
            'address': 'address',
            'Category': 'Category',
            'AdmissionClass': 'AdmissionClass',
            'MotherTongue': 'MotherTongue',
            'Caste': 'Caste',
            'StudentType': 'StudentType',
            'House': 'House',
            'StudentHeight': 'StudentHeight',
            'StudentWeight': 'StudentWeight',
            'SamagraId': 'SamagraId',
            'ChildId': 'ChildId',
            'PEN': 'PEN',
            'permanentCity': 'permanentCity',
            'previousSchoolName': 'previousSchoolName',
            'primaryIncomePerYear': 'primaryIncomePerYear',
            'secondaryIncomePerYear': 'secondaryIncomePerYear',
            'primaryOfficeAddress': 'primaryOfficeAddress',
            'secondaryOfficeAddress': 'secondaryOfficeAddress',
            'Hobbies': 'Hobbies',
            'SecondLanguage': 'SecondLanguage',
            'ThirdLanguage': 'ThirdLanguage',
            'GroupUniqueId': 'GroupUniqueId',
            'serviceNumber': 'serviceNumber',
            'EmploymentservingStatus': 'EmploymentservingStatus',
            'ApaarId': 'ApaarId',
            'Stream': 'Stream',
            'EmploymentCategory': 'EmploymentCategory',
            # Father
            'Fatherfirstname': 'Fatherfirstname',
            'FatherMiddleName': 'FatherMiddleName',
            'FatherLastName': 'FatherLastName',
            'FatherPhone': 'FatherPhone',
            'SmsNo': 'SmsNo',
            'FatherEmail': 'FatherEmail',
            'PrimaryQualification': 'PrimaryQualification',
            'FatherOccuption': 'FatherOccuption',
            'FatherCompany': 'FatherCompany',
            'FatherDesignation': 'FatherDesignation',
            'FatherAadhar': 'FatherAadhar',
            'FatherOrganizationId': 'FatherOrganizationId',
            'FatherOtherOrganization': 'FatherOtherOrganization',
            # Mother
            'Motherfirstname': 'Motherfirstname',
            'MothermiddleName': 'MothermiddleName',
            'Motherlastname': 'Motherlastname',
            'SecondaryPhone': 'SecondaryPhone',
            'SecondaryEmail': 'SecondaryEmail',
            'SecondaryQualification': 'SecondaryQualification',
            'SecondaryOccupation': 'SecondaryOccupation',
            'SecondaryCompany': 'SecondaryCompany',
            'SecondaryDesignation': 'SecondaryDesignation',
            'MotherAadhar': 'MotherAadhar',
            'MotherOrganizationId': 'MotherOrganizationId',
            'MotherOtherOrganization': 'MotherOtherOrganization',
            # Guardian
            'GuardianName': 'GuardianName',
            'GuardianRelation': 'GuardianRelation',
            'GuardianQualification': 'GuardianQualification',
            'GuardianOccupation': 'GuardianOccupation',
            'GuardianDesignation': 'GuardianDesignation',
            'GuardianDepartment': 'GuardianDepartment',
            'GuardianOfficeAddress': 'GuardianOfficeAddress',
            'GuardianContactNo': 'GuardianContactNo',
            # Bank
            'SchoolName': 'SchoolName',
            'AdmissionNumber': 'AdmissionNumber',
            'TCNumber': 'TCNumber',
            'PreviousSchoolClass': 'PreviousSchoolClass',
            'AdmissionCategory': 'AdmissionCategory',
            'SchoolName': 'SchoolName',
            'PreviousSchoolClass': 'PreviousSchoolClass',
            'TCNumber': 'TCNumber',
            'AdmissionNumber': 'AdmissionNumber', 
        }

        # Update fields
        for frontend_key, backend_attr in field_mapping.items():
            if frontend_key in data:
                value = data[frontend_key]
                
                # Handle empty strings - convert to None for optional fields
                if value == "":
                    value = None
                    
                # Type conversions
                if backend_attr in ['Roll_Number'] and value is not None:
                    value = int(value) if value else None
                elif backend_attr in ['StudentHeight', 'StudentWeight', 'primaryIncomePerYear', 'secondaryIncomePerYear'] and value is not None:
                    value = float(value) if value else None
                
                setattr(student, backend_attr, value)

        # -------- DATE FIELDS (SAFE PARSING) --------
        if data.get("dob"):
            try:
                student.dob = datetime.strptime(data["dob"], "%Y-%m-%d").date()
            except:
                pass

        if data.get("Doa"):
            try:
                student.Doa = datetime.strptime(data["Doa"], "%Y-%m-%d").date()
            except:
                pass

        if data.get("admission_date"):
            try:
                student.admission_date = datetime.strptime(
                    data["admission_date"], "%Y-%m-%d"
                ).date()
            except:
                pass

        # -------- ADDRESS HANDLING --------
        if data.get("presentAddress"):
            student.address = data["presentAddress"]

        # -------- STATUS CHANGE VALIDATION & PROCESSING --------
        # If updating status to Inactive, check fee
        if data.get("status") == "Inactive":
            # Only do the fee check if they might be trying to bypass the UI constraint (or if backend needs strict enforcement)
            # We can skip the `student.status != "Inactive"` check because `setattr` already updated it.
            # However, if we want to be safe, we just check pending fees:
            total_due = db.session.query(func.sum(StudentFee.due_amount)).filter_by(student_id=student_id, is_active=True).scalar() or 0
            if total_due > 0:
                print(f"Blocking inactivation for student {student_id} due to pending fee: {total_due}")
                return jsonify({"error": "student has fee to pay unable to deactivate"}), 400
                
            # Save inactivation details
            if data.get("inactivation_date"):
                try:
                    student.inactivated_date = datetime.strptime(data["inactivation_date"], "%Y-%m-%d")
                except:
                    pass
            
            if "inactivation_reason" in data:
                student.inactivate_reason = data.get("inactivation_reason")
            
            student.inactivated_by = current_user.user_id
        
        elif data.get("status") == "Active":
            # If reactivated, clear the fields
            student.inactivated_date = None
            student.inactivate_reason = None
            student.inactivated_by = None


        # -------- PHOTO HANDLING --------
        photos = data.get("photos")
        if photos and photos.get("student"):
            save_student_photo(student, photos["student"])

        # -------- UPDATE ACADEMIC RECORD (if year/class/section changed) --------
        if data.get("academic_year") and (
            data.get("class") or data.get("section") or data.get("Roll_Number")
        ):
            year = data.get("academic_year")
            new_class = data.get("class", student.clazz)
            new_section = data.get("section", student.section)
            new_roll = data.get("Roll_Number", student.Roll_Number)
            
            # Find or create academic record for this year
            record = StudentAcademicRecord.query.filter_by(
                student_id=student_id,
                academic_year=year
            ).first()
            
            if record:
                # Update existing record
                record.class_name = new_class
                record.section = new_section
                record.roll_number = new_roll
            else:
                # Create new record
                record = StudentAcademicRecord(
                    student_id=student_id,
                    academic_year=year,
                    class_name=new_class,
                    section=new_section,
                    roll_number=new_roll,
                    is_promoted=False
                )
                db.session.add(record)

        db.session.commit()

        return jsonify({
            "message": "Student updated successfully",
            "student": student_to_dict(student)
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating student: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
@bp.route("/api/students", methods=["POST"])
@token_required
def create_student(current_user):
    h_year, err, code = require_academic_year()
    if err:
        return err, code

    data = request.json or {}
    
    try:
        s = Student()
        
        # -------------------------------------------------------------
        # AUTO-ENROLLMENT LOGIC (ADMISSION NUMBER)
        # -------------------------------------------------------------
        # 1. Resolve Academic Year ID
        ay_id = SequenceService.resolve_academic_year_id(h_year)
        if not ay_id:
            # Fallback or initialization required? 
            # If OrgMaster isn't populated, this fails. 
            # Ideally OrgMaster should have this year.
            return jsonify({"error": f"Academic Year {h_year} not found in Master"}), 400

        # 2. Resolve Branch ID
        branch_name_code = data.get("branch")
        branch_id = SequenceService.resolve_branch_id(branch_name_code)
        if not branch_id:
             return jsonify({"error": f"Invalid Branch: {branch_name_code}"}), 400

        # 3. Generate Number (Thread-Safe)
        # Note: We must ensure this runs in the transaction. 
        # db.session is active here.
        new_admission_no = SequenceService.generate_admission_number(branch_id, ay_id)
        
        s.admission_no = new_admission_no
        # -------------------------------------------------------------
        
        s.first_name = data.get("first_name")
        s.StudentMiddleName = data.get("StudentMiddleName")
        s.last_name = data.get("last_name")
        s.gender = data.get("gender")
        
        if data.get('dob'):
            try:
                s.dob = datetime.strptime(data['dob'], '%Y-%m-%d').date()
            except:
                pass
                
        if data.get('Doa'):
            try:
                s.Doa = datetime.strptime(data['Doa'], '%Y-%m-%d').date()
            except:
                pass

        s.clazz = data.get("class")
        s.section = data.get("section")
        
        if data.get("Roll_Number"):
            s.Roll_Number = int(data.get("Roll_Number"))
            
        if data.get('admission_date'):
            try:
                s.admission_date = datetime.strptime(data['admission_date'], '%Y-%m-%d').date()
            except:
                pass
                
        s.status = data.get("status", "Active")
        s.branch = data.get("branch")
        s.location = data.get("location")
        s.academic_year = h_year
        
        s.BloodGroup = data.get("BloodGroup")
        s.Adharcardno = data.get("Adharcardno")
        s.Religion = data.get("Religion")
        s.phone = data.get("phone")
        s.email = data.get("email")
        s.address = data.get("address")
        s.Category = data.get("Category")
        s.MotherTongue = data.get("MotherTongue")
        s.Caste = data.get("Caste")
        s.StudentType = data.get("StudentType")
        s.House = data.get("House")

        # Handle Photo Upload
        photos = data.get("photos")
        if photos and photos.get("student"):
            save_student_photo(s, photos["student"]) 


        # Father Information
        s.Fatherfirstname = data.get("Fatherfirstname")
        s.FatherMiddleName = data.get("FatherMiddleName")
        s.FatherLastName = data.get("FatherLastName")
        s.FatherPhone = data.get("FatherPhone")
        s.SmsNo = data.get("SmsNo")
        s.FatherEmail = data.get("FatherEmail")
        s.PrimaryQualification = data.get("PrimaryQualification")
        s.FatherOccuption = data.get("FatherOccuption")
        s.FatherCompany = data.get("FatherCompany")
        s.FatherDesignation = data.get("FatherDesignation")
        s.FatherAadhar = data.get("FatherAadhar")
        s.FatherOrganizationId = data.get("FatherOrganizationId")
        s.FatherOtherOrganization = data.get("FatherOtherOrganization")

        # Mother Information
        s.Motherfirstname = data.get("Motherfirstname")
        s.MothermiddleName = data.get("MothermiddleName")
        s.Motherlastname = data.get("Motherlastname")
        s.SecondaryPhone = data.get("SecondaryPhone")
        s.SecondaryEmail = data.get("SecondaryEmail")
        s.SecondaryQualification = data.get("SecondaryQualification")
        s.SecondaryOccupation = data.get("SecondaryOccupation")
        s.SecondaryCompany = data.get("SecondaryCompany")
        s.SecondaryDesignation = data.get("SecondaryDesignation")
        s.MotherAadhar = data.get("MotherAadhar")
        s.MotherOrganizationId = data.get("MotherOrganizationId")
        s.MotherOtherOrganization = data.get("MotherOtherOrganization")

        # Guardian Information
        s.GuardianName = data.get("GuardianName")
        s.GuardianRelation = data.get("GuardianRelation")
        s.GuardianQualification = data.get("GuardianQualification")
        s.GuardianOccupation = data.get("GuardianOccupation")
        s.GuardianDesignation = data.get("GuardianDesignation")
        s.GuardianDepartment = data.get("GuardianDepartment")
        s.GuardianOfficeAddress = data.get("GuardianOfficeAddress")
        s.GuardianContactNo = data.get("GuardianContactNo")

        # Bank Information
        s.SchoolName = data.get("SchoolName")
        s.AdmissionNumber = data.get("AdmissionNumber")
        s.TCNumber = data.get("TCNumber")
        s.PreviousSchoolClass = data.get("PreviousSchoolClass")

        # Additional Information
        s.AdmissionCategory = data.get("AdmissionCategory")
        s.AdmissionClass = data.get("AdmissionClass")
        
        if data.get("StudentHeight"):
            s.StudentHeight = float(data.get("StudentHeight"))
        if data.get("StudentWeight"):
            s.StudentWeight = float(data.get("StudentWeight"))
            
        s.SamagraId = data.get("SamagraId")
        s.ChildId = data.get("ChildId")
        s.PEN = data.get("PEN")
        s.permanentCity = data.get("permanentCity")
        s.previousSchoolName = data.get("previousSchoolName")
        
        if data.get("primaryIncomePerYear"):
            s.primaryIncomePerYear = float(data.get("primaryIncomePerYear"))
        if data.get("secondaryIncomePerYear"):
            s.secondaryIncomePerYear = float(data.get("secondaryIncomePerYear"))
            
        s.SchoolName = data.get("SchoolName")
        s.PreviousSchoolClass = data.get("PreviousSchoolClass")
        s.TCNumber = data.get("TCNumber")
        s.AdmissionNumber = data.get("AdmissionNumber")

            
        s.primaryOfficeAddress = data.get("primaryOfficeAddress")
        s.secondaryOfficeAddress = data.get("secondaryOfficeAddress")
        s.Hobbies = data.get("Hobbies")
        s.SecondLanguage = data.get("SecondLanguage")
        s.ThirdLanguage = data.get("ThirdLanguage")
        s.GroupUniqueId = data.get("GroupUniqueId")
        s.serviceNumber = data.get("serviceNumber")
        s.EmploymentservingStatus = data.get("EmploymentservingStatus")
        s.ApaarId = data.get("ApaarId")
        s.Stream = data.get("Stream")
        s.EmploymentCategory = data.get("EmploymentCategory")
        
        db.session.add(s)
        db.session.flush() # Get ID
        
        # Create Initial Academic Record
        try:
            init_record = StudentAcademicRecord(
                student_id=s.student_id,
                academic_year=s.academic_year,
                class_name=s.clazz,
                section=s.section,
                roll_number=s.Roll_Number,
                is_promoted=False
            )
            db.session.add(init_record)
        except Exception as e:
            print(f"Error creating initial academic record: {e}")

        try:
            auto_enroll_student_fee(s.student_id, s.clazz)
        except Exception as e:
            print(f"Fee enrollment error: {str(e)}") # Non-blocking
        
        db.session.commit()
        
        return jsonify({"message": "Student created", "student_id": s.student_id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/<int:student_id>", methods=["DELETE"])
@token_required
def delete_student(current_user, student_id):
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
            
        # Soft Delete Implementation
        
        # Check for outstanding fees before inactivating
        total_due = db.session.query(func.sum(StudentFee.due_amount)).filter_by(student_id=student_id, is_active=True).scalar() or 0
        if total_due > 0:
             return jsonify({"error": "student has fee to pay unable to deactivate"}), 400

        student.status = "Inactive"
        student.inactivated_date = datetime.now()
        student.inactivate_reason = "Deleted via API"
        student.inactivated_by = current_user.user_id
        db.session.commit()
        return jsonify({"message": "Student marked as Inactive successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/upload_csv", methods=["POST"])
@token_required
def upload_students_csv(current_user):
    """Bulk upload students from CSV file"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Determine file type and read accordingly
        data = []
        
        if file.filename.lower().endswith('.csv'):
            # Read CSV content with fallback encoding
            try:
                stream = io.StringIO(file.stream.read().decode("utf-8"), newline=None)
            except UnicodeDecodeError:
                file.seek(0)
                stream = io.StringIO(file.stream.read().decode("latin-1"), newline=None)
            csv_reader = csv.DictReader(stream)
            data = list(csv_reader)
            
        elif file.filename.lower().endswith(('.xlsx', '.xls')):
            dtype_map = {
                'Adharcardno': str,
                'FatherAadhar': str,
                'MotherAadhar': str,
                'phone': str,
                'FatherPhone': str,
                'SecondaryPhone': str,
                'GuardianContactNo': str,
                'SmsNo': str,
                'AccountNumber': str,
                'BankCodeNo': str,
                'IFSC': str,
                'MICR': str
            }
            df = pd.read_excel(file, dtype=dtype_map)
            # Replace NaN with empty string or None
            df = df.where(pd.notnull(df), None)
            data = df.to_dict('records')
            
            # rigorous cleanup of nan values that might persist
            import math
            for row in data:
                for k, v in row.items():
                    if isinstance(v, float) and math.isnan(v):
                        row[k] = None
            
        else:
            return jsonify({"error": "Invalid file type. Please upload .csv, .xlsx, or .xls"}), 400
        
        students_created = 0
        errors = []

        # ---------------------------------------------------------
        # RISK 3 FIX: PRE-VALIDATION & DUPLICATE CHECKS
        # Prevent partial failures and data corruption
        # ---------------------------------------------------------
        # 1. Validate Duplicate Admission Numbers in File
        admission_nos_in_file = [str(r.get('admission_no', '')).strip() for r in data if r.get('admission_no')]
        if len(admission_nos_in_file) != len(set(admission_nos_in_file)):
             from collections import Counter
             c = Counter(admission_nos_in_file)
             duplicates = [k for k, v in c.items() if v > 1]
             return jsonify({"error": f"Duplicate Admission Numbers found in uploaded file: {duplicates}"}), 400

        # 2. Validate Against Database (Prevent Overwrites/Conflicts)
        if admission_nos_in_file:
            existing_students = Student.query.filter(Student.admission_no.in_(admission_nos_in_file)).all()
            if existing_students:
                found_admissions = [s.admission_no for s in existing_students]
                return jsonify({"error": f"Admission Numbers already exist in database: {found_admissions}. Import aborted to prevent corruption."}), 400
        # ---------------------------------------------------------
        
        for row_num, row in enumerate(data, start=2):
            try:
                # Create student from CSV row
                student = Student(
                    admission_no=row.get('admission_no'),
                    first_name=row.get('first_name'),
                    StudentMiddleName=row.get('StudentMiddleName'),
                    last_name=row.get('last_name'),
                    gender=row.get('gender'),
                    dob=datetime.strptime(row['dob'], '%d/%m/%Y').date() if row.get('dob') else None,
                    Doa=datetime.strptime(row['Doa'], '%d/%m/%Y').date() if row.get('Doa') else None,
                    BloodGroup=row.get('BloodGroup'),
                    Adharcardno=row.get('Adharcardno'),
                    Religion=row.get('Religion'),
                    phone=row.get('phone'),
                    email=row.get('email'),
                    address=row.get('address'),
                    Category=row.get('Category'),
                    AdmissionClass=row.get('AdmissionClass'),
                    clazz=row.get('class'),
                    section=row.get('section'),
                    Roll_Number=int(row['Roll_Number']) if row.get('Roll_Number') else None,
                    admission_date=datetime.strptime(row['admission_date'], '%d/%m/%Y').date() if row.get('admission_date') else None,
                    status=row.get('status', 'Active'),
                    MotherTongue=row.get('MotherTongue'),
                    Caste=row.get('Caste'),
                    StudentType=row.get('StudentType'),
                    House=row.get('House'),
                    # Father Information
                    Fatherfirstname=row.get('Fatherfirstname'),
                    FatherMiddleName=row.get('FatherMiddleName'),
                    FatherLastName=row.get('FatherLastName'),
                    FatherPhone=row.get('FatherPhone'),
                    SmsNo=row.get('SmsNo'),
                    FatherEmail=row.get('FatherEmail'),
                    PrimaryQualification=row.get('PrimaryQualification'),
                    FatherOccuption=row.get('FatherOccuption'),
                    FatherCompany=row.get('FatherCompany'),
                    FatherDesignation=row.get('FatherDesignation'),
                    FatherAadhar=row.get('FatherAadhar'),
                    FatherOrganizationId=row.get('FatherOrganizationId'),
                    FatherOtherOrganization=row.get('FatherOtherOrganization'),
                    # Mother Information
                    Motherfirstname=row.get('Motherfirstname'),
                    MothermiddleName=row.get('MothermiddleName'),
                    Motherlastname=row.get('Motherlastname'),
                    SecondaryPhone=row.get('SecondaryPhone'),
                    SecondaryEmail=row.get('SecondaryEmail'),
                    SecondaryQualification=row.get('SecondaryQualification'),
                    SecondaryOccupation=row.get('SecondaryOccupation'),
                    SecondaryCompany=row.get('SecondaryCompany'),
                    SecondaryDesignation=row.get('SecondaryDesignation'),
                    MotherAadhar=row.get('MotherAadhar'),
                    MotherOrganizationId=row.get('MotherOrganizationId'),
                    MotherOtherOrganization=row.get('MotherOtherOrganization'),
                    # Guardian Information
                    GuardianName=row.get('GuardianName'),
                    GuardianRelation=row.get('GuardianRelation'),
                    GuardianQualification=row.get('GuardianQualification'),
                    GuardianOccupation=row.get('GuardianOccupation'),
                    GuardianDesignation=row.get('GuardianDesignation'),
                    GuardianDepartment=row.get('GuardianDepartment'),
                    GuardianOfficeAddress=row.get('GuardianOfficeAddress'),
                    GuardianContactNo=row.get('GuardianContactNo'),
                    # Bank Information
                    SchoolName=row.get('SchoolName'),
                    AdmissionNumber=row.get('AdmissionNumber'),
                    TCNumber=row.get('TCNumber'),
                    PreviousSchoolClass=row.get('PreviousSchoolClass'),
                    # Additional Information
                    AdmissionCategory=row.get('AdmissionCategory'),
                    StudentHeight=float(row['StudentHeight']) if row.get('StudentHeight') else None,
                    StudentWeight=float(row['StudentWeight']) if row.get('StudentWeight') else None,
                    SamagraId=row.get('SamagraId'),
                    ChildId=row.get('ChildId'),
                    PEN=row.get('PEN'),
                    permanentCity=row.get('permanentCity'),
                    previousSchoolName=row.get('previousSchoolName'),
                    primaryIncomePerYear=float(row['primaryIncomePerYear']) if row.get('primaryIncomePerYear') else None,
                    secondaryIncomePerYear=float(row['secondaryIncomePerYear']) if row.get('secondaryIncomePerYear') else None,
                    primaryOfficeAddress=row.get('primaryOfficeAddress'),
                    secondaryOfficeAddress=row.get('secondaryOfficeAddress'),
                    Hobbies=row.get('Hobbies'),
                    SecondLanguage=row.get('SecondLanguage'),
                    ThirdLanguage=row.get('ThirdLanguage'),
                    GroupUniqueId=row.get('GroupUniqueId'),
                    serviceNumber=row.get('serviceNumber'),
                    EmploymentservingStatus=row.get('EmploymentservingStatus'),
                    ApaarId=row.get('ApaarId'),
                    Stream=row.get('Stream'),
                    EmploymentCategory=row.get('EmploymentCategory')
                )
                
                db.session.add(student)
                db.session.commit() # Commit each student individually
                
                # Auto-enroll in fee structures
                if student.clazz:
                    auto_enroll_student_fee(student.student_id, student.clazz)
                    db.session.commit() # Commit fees for this student
                
                students_created += 1
                
            except Exception as e:
                db.session.rollback() # Rollback only this transaction
                errors.append(f"Row {row_num}: {str(e)}")
        
        result = {
            "message": f"Successfully uploaded {students_created} students",
            "students_created": students_created
        }
        
        if errors:
            result["errors"] = errors[:10]  # Limit to first 10 errors
            result["total_errors"] = len(errors)
        
        return jsonify(result), 201 if students_created > 0 else 400
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/<int:student_id>/history", methods=["GET"])
@token_required
def get_student_history(current_user, student_id):
    """Get academic history (promotion records) for a student"""
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
            
        # Permission check
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        records = StudentAcademicRecord.query.filter_by(student_id=student_id).order_by(StudentAcademicRecord.created_at.desc()).all()
        
        history = [{
            "id": r.id,
            "academic_year": r.academic_year,
            "class": r.class_name,
            "section": r.section,
            "roll_no": r.roll_number,
            "is_promoted": r.is_promoted,
            "promoted_date": r.promoted_date.isoformat() if r.promoted_date else None,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in records]
        
        return jsonify({"history": history}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/promote-bulk", methods=["POST"])
@token_required
def promote_students_bulk(current_user):
    """
    Bulk promote students to a new academic year.
    Mirrors the individual promote logic for each student.
    Skips duplicates & unauthorized students, collects errors per student.
    """
    data = request.json or {}
    student_ids = data.get("student_ids", [])
    new_year = data.get("target_year")
    new_class = data.get("target_class")
    new_section = data.get("target_section")        # Optional
    roll_numbers = data.get("roll_numbers", {})    # Optional dict: {student_id: new_roll_no}

    # -----------------------------
    # 1️⃣  INPUT VALIDATION
    # -----------------------------
    if not isinstance(student_ids, list) or not student_ids:
        return jsonify({"error": "student_ids must be a non‑empty list"}), 400
    if not new_year or not new_class:
        return jsonify({"error": "target_year and target_class are required"}), 400

    success_count = 0
    errors = []          # Stores error messages per student
    processed_ids = set()  # Avoid processing same student twice

    try:
        # -----------------------------
        # 2️⃣  FETCH ALL STUDENTS IN ONE QUERY
        # -----------------------------
        students = Student.query.filter(Student.student_id.in_(student_ids)).all()
        
        # Build a quick lookup: {student_id: Student object}
        student_map = {s.student_id: s for s in students}
        # Identify invalid student_ids (not found)
        not_found = [sid for sid in student_ids if sid not in student_map]
        if not_found:
            errors.append(f"Students not found: {', '.join(map(str, not_found))}")

        # -----------------------------
        # 3️⃣  PERMISSION CHECK (PER STUDENT)
        # -----------------------------
        # If user is NOT Admin & branch != 'All', we must validate EACH student's branch
        if current_user.role != 'Admin' and current_user.branch != 'All':
            for sid in student_ids:
                if sid in student_map:
                    student = student_map[sid]
                    if student.branch != current_user.branch:
                        errors.append(f"Unauthorized for student {student.admission_no} (branch mismatch)")
                        # Remove unauthorized student from map → won't be processed
                        del student_map[sid]

        # -----------------------------
        # 4️⃣  PROCESS EACH STUDENT
        # -----------------------------
        for student_id, student in student_map.items():
            try:
                # ---- Skip already processed (duplicate ID in input) ----
                if student_id in processed_ids:
                    continue
                processed_ids.add(student_id)

                # ---- 4.1 Check Existing Record for Target Year ----
                existing = StudentAcademicRecord.query.filter_by(
                    student_id=student_id,
                    academic_year=new_year
                ).first()

                if existing:
                    errors.append(f"Student {student.admission_no} already exists in Academic Year {new_year}")
                    continue   # SKIP

                # ---- 4.2 Determine New Roll Number ----
                new_roll_no = roll_numbers.get(str(student_id), student.Roll_Number)

                # ---- 4.X Determine Final Section ----
                # If target_section is explicitly provided (e.g. "B"), use it.
                # If target_section is empty (e.g. "All Sec"), keep student's current section (e.g. "A" -> "A").
                final_section = new_section if new_section else student.section

                # ---- 4.3 Create New Academic Record ----
                new_record = StudentAcademicRecord(
                    student_id=student_id,
                    academic_year=new_year,
                    class_name=new_class,
                    section=final_section,
                    roll_number=new_roll_no,
                    is_promoted=True,
                    promoted_date=datetime.now()
                )
                db.session.add(new_record)

                # ---- 4.4 Update Student's Current State ----
                student.clazz = new_class
                student.section = final_section
                student.Roll_Number = new_roll_no
                student.academic_year = new_year

                # Commit changes for this student first to ensure consistency for fee generation
                db.session.commit()

                # ---- 4.5 Auto‑Enroll Fees ----
                try:
                    auto_enroll_student_fee(
                        student_id=student_id,
                        class_name=new_class,  # FIXED: Correct argument name
                        year=new_year,
                        is_student_new=False
                    )
                    db.session.commit() # Commit fees
                except Exception as fee_err:
                    app.logger.warning(f"Fee auto‑enroll failed for {student.admission_no}: {fee_err}")
                    errors.append(f"Fee enrollment warning for {student.admission_no}: {fee_err}")
                    # Fee failure is non-blocking for promotion success, already committed promotion.

                success_count += 1

            except Exception as e:
                db.session.rollback()  # Rollback changes for this specific student if promotion failed
                errors.append(f"Error for {student.admission_no}: {str(e)}")
                # Continue processing next student

        # -----------------------------
        # 5️⃣  FINAL RESPONSE
        # -----------------------------
        return jsonify({
            "message": f"Bulk promotion processed. {success_count} students promoted successfully.",
            "success_count": success_count,
            "errors": errors
        }), 200 if success_count > 0 else 400

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/students/summary", methods=["GET"])
@token_required
def get_student_summary(current_user):
    """
    Get aggregated student summary:
    - Overall counts by status
    - Counts by Class
    - Counts by Class & Section
    Supports filtering by Academic Year (History) and Branch.
    """
    try:
        h_year = request.headers.get("X-Academic-Year")
        
        # 1. Base Query Construction
        if h_year:
            # History Aware: complex join
            base_q = db.session.query(Student, StudentAcademicRecord).outerjoin(
                StudentAcademicRecord, 
                and_(Student.student_id == StudentAcademicRecord.student_id, StudentAcademicRecord.academic_year == h_year)
            )
            # Filter: Has record OR is currently in year
            base_q = base_q.filter(or_(StudentAcademicRecord.id != None, Student.academic_year == h_year))
        else:
            # Current State
            base_q = db.session.query(Student, None)

        # 2. Apply Branch Filter
        if current_user.role != 'Admin':
             target_branch = current_user.branch
        else:
             target_branch = request.headers.get("X-Branch") or request.args.get("branch")

        if target_branch and target_branch not in ['All', 'All Branches', 'AllBranches']:
             # Apply to Student table
             base_q = base_q.filter(Student.branch == target_branch)

        # 3. Aggregations via Python (Flexible for History Mode complexity)
        # SQLAlchemy GroupBy with complex join conditions + OR logic is readable but tricky.
        # Fetching simplified objects might be safer/easier to maintain than pure SQL GroupBy for this specific "fallback" logic.
        
        # However, for performance on large datasets, SQL GroupBy is better. 
        # But given the structure (Student OR Record), let's try to fetch relevant columns and aggregate in Python or simplified SQL.
        
        # Let's try fetching all relevant rows (id, status, class, section) and pivoting in Python. 
        # Assuming < 10k students, this is instant. > 100k, maybe slow. 
        
        rows = base_q.with_entities(
            Student.status,
            Student.clazz.label('s_class'),
            Student.section.label('s_section'),
            StudentAcademicRecord.class_name.label('r_class'),
            StudentAcademicRecord.section.label('r_section')
        ).all()
        
        summary = {
            "total": 0,
            "statuses": {},
            "classes": {}, # { "ClassName": { total: 10, sections: { "A": 5, "B": 5 } } }
        }
        
        for r in rows:
            status = r.status or "Active"
            
            # Resolve appropriate class/section
            # Logic: If h_year context exists, prioritize Record. If Record is None, use Student (assuming they belong to year).
            if h_year and r.r_class:
                c_name = r.r_class
                s_name = r.r_section
            else:
                c_name = r.s_class
                s_name = r.s_section

            c_name = c_name or "Unknown"
            s_name = s_name or "Unknown"

            # 1. Total & Status
            summary["total"] += 1
            summary["statuses"][status] = summary["statuses"].get(status, 0) + 1
            
            # 2. Class & Section
            # Only count Active students in class structure? Or all?
            # User UI usually implies Active students for class lists, but Summary might want all.
            # Let's categorize by class regardless of status, or maybe separate "Active" counts?
            # Looking at UI screenshot (Step 0), sidebar has "All", "Active", "Inactive".
            # It seems the UI filters the *List*, but maybe the counts should reflect the current filter?
            # The prompt says "nothing should be hardcode classes and section and students should extrack from backend".
            # The sidebar count "111 Total" implies total students.
            
            if c_name not in summary["classes"]:
                summary["classes"][c_name] = { "total": 0, "sections": {} }
            
            summary["classes"][c_name]["total"] += 1
            
            if s_name not in summary["classes"][c_name]["sections"]:
                summary["classes"][c_name]["sections"][s_name] = 0
            
            summary["classes"][c_name]["sections"][s_name] += 1

        # Sort classes?
        # Helper to numeric sort class names if possible? (1, 2, 10 instead of 1, 10, 2)
        # We'll send as list for frontend
        
        sorted_classes = []
        for c_name, data in summary["classes"].items():
            sections_list = [{"name": k, "count": v} for k, v in data["sections"].items()]
            # Sort sections
            sections_list.sort(key=lambda x: x["name"])
            
            sorted_classes.append({
                "name": c_name,
                "count": data["total"],
                "sections": sections_list
            })
            
        # Basic sort by name
        sorted_classes.sort(key=lambda x: x["name"])

        return jsonify({
            "stats": {
                "total": summary["total"],
                "by_status": summary["statuses"]
            },
            "structure": sorted_classes
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500



@bp.route("/api/students/template", methods=["GET"])
def download_student_template():
    """Download student import template"""
    template_data = {
        "admission_no": ["ADM001"],
        "first_name": ["John"],
        "StudentMiddleName": ["Mark"],
        "last_name": ["Doe"],
        "class": ["1"],
        "section": ["A"],
        "dob": ["01/01/2015"],
        "Doa": ["01/04/2024"],
        "admission_date": ["01/04/2024"],
        "gender": ["Male"],
        "Fatherfirstname": ["Robert"],
        "FatherPhone": ["9876543210"],
        "address": ["123 Main St"],
        "StudentHeight": [120.5],
        "StudentWeight": [25.0],
        "primaryIncomePerYear": [500000]
    }
    
    df = pd.DataFrame(template_data)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Students')
    output.seek(0)
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='student_import_template.xlsx'
    )
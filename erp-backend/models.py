from extensions import db
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import or_, event
from sqlalchemy.orm import declared_attr
from sqlalchemy import inspect
from flask import g, has_request_context, request



class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.BigInteger, primary_key=True)

    table_name = db.Column(db.String(100), nullable=False)
    record_id = db.Column(db.String(100), nullable=True)

    module = db.Column(db.String(50), nullable=True)

    action = db.Column(db.String(20), nullable=False)

    old_data = db.Column(db.JSON, nullable=True)
    new_data = db.Column(db.JSON, nullable=True)

    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    ip_address = db.Column(db.String(50), nullable=True)

    timestamp = db.Column(db.DateTime, nullable=False)

    __table_args__ = (
        db.Index("idx_audit_table_record", "table_name", "record_id"),
        db.Index("idx_audit_user", "user_id"),
        db.Index("idx_audit_timestamp", "timestamp"),
    )
    
class AuditMixin(object):
    """
    Mixin to add created_at, updated_at, created_by, updated_by to all tables.
    """
    __audit_module__ = "GENERAL"
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @declared_attr
    def created_by(cls):
        return db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    @declared_attr
    def updated_by(cls):
        return db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

class ClassMaster(db.Model, AuditMixin):
    __tablename__ = "classes"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    class_name = db.Column(db.String(50), unique=True, nullable=False)
    location = db.Column(db.String(50), default="Hyderabad")
    branch = db.Column(db.String(50), default="All")


class ClassSection(db.Model, AuditMixin):
    __tablename__ = "class_sections"
    __audit_module__ = "ACADEMICS"

    id = db.Column(db.Integer, primary_key=True)

    # FK to ClassMaster
    class_id = db.Column(
        db.Integer,
        db.ForeignKey("classes.id", ondelete="RESTRICT"),
        nullable=False
    )

    # FK to Branch
    branch_id = db.Column(
        db.Integer,
        db.ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False
    )

    academic_year = db.Column(db.String(20), nullable=False)

    section_name = db.Column(db.String(10), nullable=False)

    student_strength = db.Column(db.Integer, nullable=False)

    is_active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint(
            "class_id",
            "branch_id",
            "academic_year",
            "section_name",
            name="uq_class_branch_year_section"
        ),
        # Indexes for frequent lookup
        db.Index("idx_class_section_branch_year", "branch_id", "academic_year"),
        db.Index("idx_class_section_class", "class_id"),
    )



class User(db.Model, AuditMixin):
    __tablename__ = "users"
    __audit_module__ = "SYSTEM"
    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(50), nullable=False)
    role = db.Column(db.String(20), default="Admin")
    branch = db.Column(db.String(50), default="AllBranches")
    location = db.Column(db.String(50), default="Hyderabad")


class Student(db.Model, AuditMixin):
    __tablename__ = "students"
    __audit_module__ = "STUDENT"
    student_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    
    # Basic Information
    admission_no = db.Column(db.String(50), unique=True)
    first_name = db.Column(db.String(100))
    StudentMiddleName = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    gender = db.Column(db.String(10))
    dob = db.Column(db.Date)
    Doa = db.Column(db.Date)
    BloodGroup = db.Column(db.String(10))
    Adharcardno = db.Column(db.String(50))
    Religion = db.Column(db.String(50))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(100))
    address = db.Column(db.Text)
    Category = db.Column(db.String(50))
    clazz = db.Column("class", db.String(20))
    section = db.Column(db.String(20))
    Roll_Number = db.Column(db.Integer)
    admission_date = db.Column(db.Date)
    status = db.Column(db.Enum("Active", "Inactive"), default="Active")
    MotherTongue = db.Column(db.String(50))
    Caste = db.Column(db.String(50))
    StudentType = db.Column(db.String(50))
    House = db.Column(db.String(50))
    photopath = db.Column(db.String(255))
    
    # Father Information
    Fatherfirstname = db.Column(db.String(100))
    FatherMiddleName = db.Column(db.String(100))
    FatherLastName = db.Column(db.String(100))
    FatherPhone = db.Column(db.String(20))
    SmsNo = db.Column(db.String(20))
    FatherEmail = db.Column(db.String(100))
    PrimaryQualification = db.Column(db.String(100))
    FatherOccuption = db.Column(db.String(100))
    FatherCompany = db.Column(db.String(100))
    FatherDesignation = db.Column(db.String(100))
    FatherAadhar = db.Column(db.String(50))
    FatherOrganizationId = db.Column(db.String(100))
    FatherOtherOrganization = db.Column(db.String(100))
    
    # Mother Information
    Motherfirstname = db.Column(db.String(100))
    MothermiddleName = db.Column(db.String(100))
    Motherlastname = db.Column(db.String(100))
    SecondaryPhone = db.Column(db.String(20))
    SecondaryEmail = db.Column(db.String(100))
    SecondaryQualification = db.Column(db.String(100))
    SecondaryOccupation = db.Column(db.String(100))
    SecondaryCompany = db.Column(db.String(100))
    SecondaryDesignation = db.Column(db.String(100))
    MotherAadhar = db.Column(db.String(50))
    MotherOrganizationId = db.Column(db.String(100))
    MotherOtherOrganization = db.Column(db.String(100))
    
    # Guardian Information
    GuardianName = db.Column(db.String(100))
    GuardianRelation = db.Column(db.String(50))
    GuardianQualification = db.Column(db.String(100))
    GuardianOccupation = db.Column(db.String(100))
    GuardianDesignation = db.Column(db.String(100))
    GuardianDepartment = db.Column(db.String(100))
    GuardianOfficeAddress = db.Column(db.Text)
    GuardianContactNo = db.Column(db.String(20))
    
    # Previous School Information
    SchoolName = db.Column(db.String(100))
    AdmissionNumber = db.Column(db.String(100))
    TCNumber = db.Column(db.String(20))
    PreviousSchoolClass = db.Column(db.String(15))
   
    
    # Additional Information
    AdmissionCategory = db.Column(db.String(50))
    AdmissionClass = db.Column(db.String(20))
    StudentHeight = db.Column(db.Numeric(5, 2))
    StudentWeight = db.Column(db.Numeric(5, 2))
    SamagraId = db.Column(db.String(50))
    ChildId = db.Column(db.String(50))
    PEN = db.Column(db.String(50))
    permanentCity = db.Column(db.String(100))
    previousSchoolName = db.Column(db.String(200))
    primaryIncomePerYear = db.Column(db.Numeric(12, 2))
    secondaryIncomePerYear = db.Column(db.Numeric(12, 2))
    primaryOfficeAddress = db.Column(db.Text)
    secondaryOfficeAddress = db.Column(db.Text)
    Hobbies = db.Column(db.Text)
    SecondLanguage = db.Column(db.String(50))
    ThirdLanguage = db.Column(db.String(50))
    GroupUniqueId = db.Column(db.String(50))
    serviceNumber = db.Column(db.String(50))
    EmploymentservingStatus = db.Column(db.String(50))
    inactivated_date = db.Column(db.DateTime, nullable=True)
    inactivate_reason = db.Column(db.String(255), nullable=True)
    inactivated_by = db.Column(db.Integer, nullable=True)
    ApaarId = db.Column(db.String(50))
    Stream = db.Column(db.String(50))
    EmploymentCategory = db.Column(db.String(50))
    
    # Branch and Year Segregation
    location = db.Column(db.String(50), default="Hyderabad")
    branch = db.Column(db.String(50))
    academic_year = db.Column(db.String(20))

    __table_args__ = (
        db.Index('idx_student_occupancy', 'class', 'section', 'branch', 'academic_year'),
    )


class FeeType(db.Model, AuditMixin):
    __tablename__ = "feetypes"
    __audit_module__ = "FEES"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    feetype = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50))
    feetypegroup = db.Column(db.String(50))
    type = db.Column(db.String(50), default="Installment")
    displayname = db.Column(db.String(100))
    isrefundable = db.Column(db.Boolean, default=False)
    description = db.Column(db.String(255))
    
    # Branch and Year Segregation
    branch = db.Column(db.String(50))
    location = db.Column(db.String(50), default="Hyderabad")
    academic_year = db.Column(db.String(20))


class StudentFee(db.Model, AuditMixin):
    __tablename__ = "studentfees"
    __audit_module__ = "FEES"
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"))
    fee_id = db.Column(db.Integer, nullable=True)  # Added to match DB schema
    fee_type_id = db.Column(db.Integer, db.ForeignKey("feetypes.id"))
    academic_year = db.Column(db.String(20))
    month = db.Column(db.String(20))
    monthly_amount = db.Column(db.Numeric(10, 2)) # Added to match DB schema
    total_fee = db.Column(db.Numeric(10, 2))
    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    due_amount = db.Column(db.Numeric(10, 2), default=0)
    concession = db.Column(db.Numeric(10, 2), default=0)
    status = db.Column(db.Enum("Pending", "Partial", "Paid"), default="Pending")
    due_date = db.Column(db.Date, nullable=True)  # Added to match DB schema
    is_active = db.Column(db.Boolean, nullable=False, default= True)
    deleted_at = db.Column(db.DateTime, nullable = True)
    deleted_by = db.Column(db.Integer,nullable = True)
    fee_type = db.relationship("FeeType")
    student = db.relationship("Student")


class ClassFeeStructure(db.Model, AuditMixin):
    __tablename__ = "classfeestructure"
    __audit_module__ = "FEES"
    id = db.Column(db.Integer, primary_key=True)
    clazz = db.Column("class", db.String(50))
    feetypeid = db.Column(db.Integer, db.ForeignKey("feetypes.id"))
    academicyear = db.Column(db.String(20))
    totalamount = db.Column(db.Numeric(10, 2))
    monthly_amount = db.Column(db.Numeric(10, 2))
    installments_count = db.Column(db.Integer, default=0)
    isnewadmission = db.Column(db.Boolean, default=False)
    feegroup = db.Column(db.String(50))
    feetype = db.relationship("FeeType")

    # Branch and Year Segregation
    branch = db.Column(db.String(50))
    location = db.Column(db.String(50), default="Hyderabad")
    academic_year = db.Column(db.String(20))


class Concession(db.Model, AuditMixin):
    __tablename__ = "concessions"
    __audit_module__ = "FEES"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100)) # e.g., "Sibling Discount"
    description = db.Column(db.String(255))
    location = db.Column(db.String(50), default="Hyderabad")
    branch = db.Column(db.String(50))
    academic_year = db.Column(db.String(20))
    fee_type_id = db.Column(db.Integer, db.ForeignKey("feetypes.id"))
    percentage = db.Column(db.Numeric(5, 2)) # The value, e.g., 50.00
    is_percentage = db.Column(db.Boolean, default=True) # Flag: True=%, False=Flat Amount
    show_in_payment = db.Column(db.Boolean, default=False) # Flag: Show in Fee Payment dropdown
    
    fee_type = db.relationship("FeeType")


class FeeInstallment(db.Model, AuditMixin):
    __tablename__ = "fee_installments"
    __audit_module__ = "FEES"
    id = db.Column(db.Integer, primary_key=True)
    installment_no = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    last_pay_date = db.Column(db.Date, nullable=False)
    is_admission = db.Column(db.Boolean, default=False)
    description = db.Column(db.Text)
    fee_type_id = db.Column(db.Integer, db.ForeignKey("feetypes.id"), nullable=True)
    location = db.Column(db.String(50), default="Hyderabad")
    branch = db.Column(db.String(50))
    academic_year = db.Column(db.String(20))
    
    fee_type = db.relationship("FeeType")


class FeePayment(db.Model, AuditMixin):
    # STEP 2: FINAL fee_payments TABLE
    __tablename__ = "fee_payments"
    __audit_module__ = "FEES"
    id = db.Column("payment_id", db.Integer, primary_key=True, autoincrement=True)

    # Receipt - Not strict unique to allow line items per receipt (One receipt = Multiple Fee Rows)
    receipt_no = db.Column(db.String(50), nullable=False, index=True) 

    # Organization scope - Snapshot
    branch = db.Column(db.String(50), nullable=False) # Storing Name as ID is not available/consistent
    location = db.Column(db.String(50), nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)

    # Student snapshot
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    class_name = db.Column("class", db.String(50), nullable=False) # Snapshot of class
    section = db.Column(db.String(20)) # Snapshot of section

    # Installment / Fee Type
    installment_id = db.Column(db.Integer) # derived from FeeInstallment if possible
    installment_name = db.Column(db.String(100)) # e.g. "June Fee"
    fee_type = db.Column(db.String(100))   # Tuition, Transport, etc.

    # Amounts (VERY IMPORTANT)
    gross_amount = db.Column(db.Numeric(10, 2))   # total fee for this item
    concession_amount = db.Column(db.Numeric(10, 2))
    net_payable = db.Column(db.Numeric(10, 2)) # gross - concession
    amount_paid = db.Column(db.Numeric(10, 2)) # Amount paying NOW
    due_amount = db.Column(db.Numeric(10, 2)) # Remaining due after this payment

    # Payment info
    payment_mode = db.Column(db.String(50))
    transaction_ref = db.Column(db.String(100))
    payment_date = db.Column(db.Date)
    payment_month = db.Column(db.Integer) # Monthly Collection Report
    payment_year = db.Column(db.Integer) 

    note = db.Column(db.String(25))
    TransactionDetails=db.Column(db.String(100))
    collected_by = db.Column(db.Integer) # User ID
    collected_by_name = db.Column(db.String(100)) # User Name (Added per request)

    status = db.Column(db.Enum("A", "I"), default="A") # A=Active, I=Inactive (Cancelled)
    cancel_reason = db.Column(db.String(255)) # Reason for cancellation

    student = db.relationship("Student")



# ----------------------------------------------------------
# BRANCH & ORGANIZATION MANAGEMENT (PHASE 1)
# ----------------------------------------------------------

class OrgMaster(db.Model, AuditMixin):
    __tablename__ = "org_master"
    __audit_module__ = "SYSTEM"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    master_type = db.Column(db.Enum('LOCATION', 'ACADEMIC_YEAR'), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    __table_args__ = (db.UniqueConstraint('master_type', 'code', name='_master_type_code_uc'),)

class Branch(db.Model, AuditMixin):
    __tablename__ = "branches"
    __audit_module__ = "SYSTEM"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    branch_code = db.Column(db.String(50), unique=True, nullable=False)
    branch_name = db.Column(db.String(100), nullable=False)
    location_code = db.Column(db.String(50)) # refers to org_master.code
    is_active = db.Column(db.Boolean, default=True)

class UserBranchAccess(db.Model, AuditMixin):
    __tablename__ = "user_branch_access"
    __audit_module__ = "SYSTEM"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=False)

    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=True)  # NULL = Permanent
    is_active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint(
            'user_id', 
            'branch_id', 
            'start_date', 
            name='_user_branch_start_uc'
        ),
    )

    # Relationships
    branch = db.relationship("Branch", foreign_keys=[branch_id])

    user = db.relationship(
        "User",
        foreign_keys=[user_id]
    )

class BranchYearSequence(db.Model, AuditMixin):
    __tablename__ = "enrollment_sequences"
    __audit_module__ = "SYSTEM"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id"), nullable=False)
    academic_year_id = db.Column(db.Integer, db.ForeignKey("org_master.id"), nullable=False)
    
    admission_prefix = db.Column(db.String(20), nullable=False)
    last_admission_no = db.Column(db.Integer, default=0, nullable=False)
    
    receipt_prefix = db.Column(db.String(20), nullable=False)
    last_receipt_no = db.Column(db.Integer, default=0, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'academic_year_id', name='uq_branch_year_sequence'),
        db.CheckConstraint('last_admission_no >= 0', name='chk_admission_no_positive'),
        db.CheckConstraint('last_receipt_no >= 0', name='chk_receipt_no_positive'),
    )


class StudentAcademicRecord(db.Model, AuditMixin):
    __tablename__ = "student_academic_records"
    __audit_module__ = "STUDENT"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)
    class_name = db.Column("class", db.String(20))
    section = db.Column(db.String(20))
    roll_number = db.Column(db.Integer)
    is_promoted = db.Column(db.Boolean, default=False)
    promoted_date = db.Column(db.DateTime)
    
    student = db.relationship("Student", backref=db.backref("academic_records", lazy=True))



# ----------------------------------------------------------
# ATTENDANCE MODEL
# ----------------------------------------------------------

class Attendance(db.Model, AuditMixin):
    __tablename__ = "attendance"
    __audit_module__ = "ATTENDANCE"
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.Enum("Present", "Absent", name="attendance_status"), default="Present")
    remarks = db.Column(db.String(255))
    update_count = db.Column(db.Integer, default=0)
    
    student = db.relationship("Student")
    
    # Branch and Year Segregation
    branch = db.Column(db.String(50))
    location = db.Column(db.String(50), default="Hyderabad")
    academic_year = db.Column(db.String(20))

    __table_args__ = (db.UniqueConstraint('student_id', 'date', name='_student_date_uc'),)


# ----------------------------------------------------------
# WEEKLY OFF & HOLIDAY CALENDAR
# ----------------------------------------------------------

class WeeklyOffRule(db.Model, AuditMixin):
    __tablename__ = "weekly_off_rule"
    __audit_module__ = "ATTENDANCE"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id', ondelete='RESTRICT'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id', ondelete='RESTRICT'), nullable=True)  # NULL = applies to all classes

    weekday = db.Column(db.Integer, nullable=False)      # 0=Monday … 6=Sunday
    week_number = db.Column(db.Integer, nullable=True)   # NULL=Every, 1-5=specific week of month

    academic_year = db.Column(db.String(20), nullable=False)

    active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'class_id', 'weekday', 'week_number', 'academic_year',
                            name='uq_weekoff_rule'),
        db.CheckConstraint('weekday >= 0 AND weekday <= 6', name='chk_weekoff_weekday'),
        db.CheckConstraint('week_number IS NULL OR (week_number >= 1 AND week_number <= 5)', name='chk_weekoff_week_number'),
    )


class HolidayCalendar(db.Model, AuditMixin):
    __tablename__ = "holiday_calendar"
    __audit_module__ = "ATTENDANCE"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    branch_id = db.Column(db.Integer, db.ForeignKey('branches.id', ondelete='RESTRICT'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id', ondelete='RESTRICT'), nullable=True)  # NULL = applies to all classes

    title = db.Column(db.String(150), nullable=False)

    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    holiday_for = db.Column(
        db.Enum("StudentOnly", "StaffOnly", "All", name="holiday_scope"),
        nullable=False,
        default="All"
    )

    description = db.Column(db.Text)
    display_order = db.Column(db.Integer)

    academic_year = db.Column(db.String(20), nullable=False)

    active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.CheckConstraint('start_date <= end_date', name='chk_holiday_date_range'),
        db.Index('idx_holiday_dates', 'branch_id', 'start_date', 'end_date'),
    )


# ----------------------------------------------------------
#  Subject Master Model
# ----------------------------------------------------------
class SubjectMaster(db.Model, AuditMixin):
    __tablename__ = "subjectmaster"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    subject_name = db.Column(db.String(100), nullable=False)
    subject_name_urdu = db.Column(db.String(255), nullable=True)  # New field

    subject_type = db.Column(db.Enum('Hifz', 'Academic'), default='Academic')
    academic_year = db.Column(db.String(20)) # New: Scope to year
    is_active = db.Column(db.Boolean, default=True) # New: Active Status

class ClassSubjectAssignment(db.Model, AuditMixin):
    __tablename__ = "classsubjectassignment"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    class_id = db.Column(db.Integer, nullable=False) # Maps to classid
    subject_id = db.Column(db.Integer, nullable=False) # Maps to subjectid
    academic_year = db.Column(db.String(50), nullable=False) 
    location_name = db.Column(db.String(50), nullable=False)
    branch_name = db.Column(db.String(50), nullable=False) 

    __table_args__ = (
        db.UniqueConstraint('class_id', 'subject_id', 'academic_year', 'location_name', 'branch_name', name='uq_classsubject_context'),
    )

class StudentSubjectAssignment(db.Model, AuditMixin):
    __tablename__ = "studentsubjectassignment"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey("subjectmaster.id"), nullable=False)
    academic_year = db.Column(db.String(50), nullable=False)
    branch = db.Column(db.String(50))
    status = db.Column(db.Boolean, default=True) # 1=Assigned, 0=Removed

    __table_args__ = (
        db.UniqueConstraint('student_id', 'subject_id', 'academic_year', name='uq_student_subject_assign'),
    )


class TestType(db.Model, AuditMixin):
    __tablename__ = "testtype"
    __audit_module__ = "ACADEMICS"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    test_name = db.Column(db.String(100), nullable=False)
    max_marks = db.Column(db.Integer, nullable=False)

    display_order = db.Column(db.Integer, nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)

    is_active = db.Column(db.Boolean, default=True)



class TestAttendanceMonth(db.Model, AuditMixin):
    __tablename__ = "test_attendance_months"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    test_id = db.Column(db.Integer, db.ForeignKey("testtype.id"), nullable=False)
    
    # Context
    branch = db.Column(db.String(50), nullable=False)
    class_id = db.Column(db.Integer, nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)
    
    month = db.Column(db.Integer, nullable=False) # 1-12
    year = db.Column(db.Integer, nullable=False)
    
    # Relationship
    test_type = db.relationship("TestType")

    __table_args__ = (
        db.UniqueConstraint('test_id', 'branch', 'class_id', 'academic_year', 'month', 'year', name='uq_test_context_month'),
    )


class ClassTest(db.Model, AuditMixin):
    __tablename__ = "class_test"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    academic_year = db.Column(db.String(50), nullable=False)
    branch = db.Column(db.String(50), nullable=False)
    location = db.Column(db.String(50), nullable=False)
    
    class_id = db.Column(db.Integer, nullable=False)
    test_id = db.Column(db.Integer, nullable=False)

    test_order = db.Column(db.Integer, nullable=False)

    status = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint('academic_year', 'branch', 'class_id', 'test_id', name='uniq_class_test'),
        db.UniqueConstraint('academic_year', 'branch', 'class_id', 'test_order', name='uniq_test_order')
    )

class ClassTestSubject(db.Model, AuditMixin):
    __tablename__ = "class_test_subjects"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    class_test_id = db.Column(db.Integer, db.ForeignKey("class_test.id"), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey("subjectmaster.id"), nullable=False)
    max_marks = db.Column(db.Integer, nullable=False)
    subject_order = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('class_test_id', 'subject_id', name='uniq_class_test_subject'),
        db.UniqueConstraint('class_test_id', 'subject_order', name='uniq_subject_order_per_test')
    )

class StudentTestAssignment(db.Model, AuditMixin):
    __tablename__ = "student_test_assignments"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    class_test_id = db.Column(db.Integer, db.ForeignKey("class_test.id"), nullable=False)
    
    academic_year = db.Column(db.String(50), nullable=False)
    branch = db.Column(db.String(50))
    location = db.Column(db.String(50), default="Hyderabad")
    
    status = db.Column(db.Boolean, default=True) # True=Assigned, False=Unassigned

    __table_args__ = (
        db.UniqueConstraint('student_id', 'class_test_id', name='uniq_student_test_assign'),
    )


class GradeScale(db.Model, AuditMixin):
    __tablename__ = "grade_scales"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    scale_name = db.Column(db.String(100), nullable=False)
    scale_description = db.Column(db.String(255))

    # Context scope
    location = db.Column(db.String(50), nullable=False)
    branch = db.Column(db.String(50), default="All") # Default to All for location-wide
    academic_year = db.Column(db.String(50), nullable=False)
    
    total_marks = db.Column(db.Integer, nullable=False, default=100) # Added default for migration safety, though should be explicit

    is_active = db.Column(db.Boolean, default=True)

    __table_args__ = (
        db.UniqueConstraint('scale_name', 'academic_year', 'branch', 'total_marks', name='uq_grade_scale_context'),
    )

class GradeScaleDetails(db.Model, AuditMixin):
    __tablename__ = "grade_scale_details"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    grade_scale_id = db.Column(db.Integer, db.ForeignKey('grade_scales.id', ondelete="CASCADE"), nullable=False)

    grade = db.Column(db.String(5), nullable=False)
    min_marks = db.Column(db.Integer, nullable=False)
    max_marks = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255)) # Added per user request

    is_active = db.Column(db.Boolean, default=True)
    
    grade_scale = db.relationship("GradeScale", backref=db.backref("details", cascade="all, delete-orphan"))


    __table_args__ = (
        db.UniqueConstraint('grade_scale_id', 'min_marks', 'max_marks', name='uq_grade_range'),
    )


class StudentMarks(db.Model, AuditMixin):
    __tablename__ = "student_marks"
    __audit_module__ = "ACADEMICS"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    student_id = db.Column(db.Integer, db.ForeignKey("students.student_id"), nullable=False)
    class_test_id = db.Column(db.Integer, db.ForeignKey("class_test.id"), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey("subjectmaster.id"), nullable=False)

    marks_obtained = db.Column(db.Numeric(5, 2), default=None)
    is_absent = db.Column(db.Boolean, nullable=False, default=False)

    # Context snapshot for reporting/history
    academic_year = db.Column(db.String(20), nullable=False)
    branch = db.Column(db.String(100), nullable=False)
    class_id = db.Column(db.Integer, nullable=False)
    section = db.Column(db.String(20))

    # Relationships
    student = db.relationship("Student")
    class_test = db.relationship("ClassTest")
    subject = db.relationship("SubjectMaster")

    __table_args__ = (
        db.UniqueConstraint('student_id', 'class_test_id', 'subject_id', name='uq_student_test_subject'),
        db.Index('idx_student_marks_test', 'class_test_id'),
        db.Index('idx_student_marks_student', 'student_id'),
    )


class DocumentType(db.Model, AuditMixin):
    __tablename__ = "document_types"
    __audit_module__ = "STUDENT"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True)


class StudentDocument(db.Model, AuditMixin):
    __tablename__ = "student_documents"
    __audit_module__ = "STUDENT"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.student_id', ondelete='CASCADE'), nullable=False)
    document_type_id = db.Column(db.Integer, db.ForeignKey('document_types.id', ondelete='RESTRICT'), nullable=False)
    document_no = db.Column(db.String(100))
    issued_by = db.Column(db.String(100))
    issue_date = db.Column(db.Date)
    notes = db.Column(db.Text)
    file_name = db.Column(db.String(255))
    file_path = db.Column(db.String(500))
    file_size = db.Column(db.Integer)
    mime_type = db.Column(db.String(100))
    is_verified = db.Column(db.Boolean, default=False)
    verified_by = db.Column(db.Integer)
    verified_at = db.Column(db.DateTime)
    document_type = db.relationship("DocumentType")
    student = db.relationship("Student")

    __table_args__ = (
        db.UniqueConstraint('student_id', 'document_type_id', name='uq_student_doc_type'),
    )


# ----------------------------------------------------------
# GLOBAL AUDIT EVENT LISTENERS
# ----------------------------------------------------------

VALID_AUDIT_ACTIONS = {
    "CREATE",
    "UPDATE",
    "DELETE",
    "SOFT_DELETE",
    "LOGIN",
    "LOGOUT"
}

@event.listens_for(db.session, "before_flush")
def receive_before_flush(session, flush_context, instances):

    # Only run inside request context
    if not has_request_context():
        return

    user_id = getattr(g, "user_id", None)

    # Nginx-safe IP detection
    ip_address = request.headers.get(
        "X-Forwarded-For",
        request.remote_addr
    )

    # -------------------------
    # HELPER: Get Primary Key
    # -------------------------
    def get_record_id(obj):
        state = inspect(obj)
        pk = state.identity
        return str(pk[0]) if pk else None

    # -------------------------
    # HELPER: Make JSON-safe
    # -------------------------
    def _make_serializable(val):
        if isinstance(val, datetime):
            return val.isoformat()
        if isinstance(val, date):
            return val.isoformat()
        if isinstance(val, Decimal):
            return float(val)
        return val

    # =========================================================
    # AUTO-FILL created_by / updated_by on NEW objects
    # =========================================================
    for obj in session.new:
        if isinstance(obj, AuditMixin) and not isinstance(obj, AuditLog):
            if user_id is not None:
                if obj.created_by is None:
                    obj.created_by = user_id
                obj.updated_by = user_id
            now = datetime.utcnow()
            if obj.created_at is None:
                obj.created_at = now
            obj.updated_at = now

    # =========================================================
    # AUTO-FILL updated_by on DIRTY objects
    # =========================================================
    for obj in session.dirty:
        if isinstance(obj, AuditMixin) and not isinstance(obj, AuditLog):
            if user_id is not None:
                obj.updated_by = user_id
            obj.updated_at = datetime.utcnow()

    # =========================================================
    # INSERT
    # =========================================================
    for obj in session.new:

        if not isinstance(obj, AuditMixin) or isinstance(obj, AuditLog):
            continue

        if obj.__tablename__ == "audit_logs":
            continue

        new_data = {}
        for col in obj.__table__.columns:
            try:
                value = getattr(obj, col.name)
                new_data[col.name] = _make_serializable(value)
            except Exception:
                new_data[col.name] = None
        
        module = getattr(obj, "__audit_module__", "GENERAL")
        action = "CREATE"
        if action not in VALID_AUDIT_ACTIONS:
            continue

        log = AuditLog(
            table_name=obj.__tablename__,
            record_id=None,  # PK may not exist yet (before flush)
            module=module,
            action=action,
            old_data=None,
            new_data=new_data,
            user_id=user_id,
            ip_address=ip_address,
            timestamp=datetime.utcnow()
        )

        session.add(log)

    # =========================================================
    # UPDATE
    # =========================================================
    for obj in session.dirty:

        if not isinstance(obj, AuditMixin) or isinstance(obj, AuditLog):
            continue

        if obj.__tablename__ == "audit_logs":
            continue

        if not session.is_modified(obj, include_collections=False):
            continue

        state = inspect(obj)

        old_data = {}
        new_data = {}

        for col in obj.__table__.columns:
            attr = state.attrs.get(col.key)
            if not attr:
                continue

            hist = attr.history

            if not hist.has_changes():
                continue

            old_value = hist.deleted[0] if hist.deleted else None
            new_value = hist.added[0] if hist.added else None

            old_data[col.key] = _make_serializable(old_value)
            new_data[col.key] = _make_serializable(new_value)

        if old_data:
            module = getattr(obj, "__audit_module__", "GENERAL")
            action = "UPDATE"
            if action not in VALID_AUDIT_ACTIONS:
                continue

            log = AuditLog(
                table_name=obj.__tablename__,
                record_id=get_record_id(obj),
                module=module,
                action=action,
                old_data=old_data,
                new_data=new_data,
                user_id=user_id,
                ip_address=ip_address,
                timestamp=datetime.utcnow()
            )

            session.add(log)

    # =========================================================
    # DELETE
    # =========================================================
    for obj in session.deleted:

        if not isinstance(obj, AuditMixin) or isinstance(obj, AuditLog):
            continue

        if obj.__tablename__ == "audit_logs":
            continue

        old_data = {}
        for col in obj.__table__.columns:
            try:
                old_data[col.name] = _make_serializable(getattr(obj, col.name))
            except Exception:
                old_data[col.name] = None
                
        module = getattr(obj, "__audit_module__", "GENERAL")
        action = "DELETE"
        if action not in VALID_AUDIT_ACTIONS:
            continue

        log = AuditLog(
            table_name=obj.__tablename__,
            record_id=get_record_id(obj),
            module=module,
            action=action,
            old_data=old_data,
            new_data=None,
            user_id=user_id,
            ip_address=ip_address,
            timestamp=datetime.utcnow()
        )

        session.add(log)

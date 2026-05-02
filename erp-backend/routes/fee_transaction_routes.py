from flask import Blueprint, jsonify, request
from extensions import db, get_now, get_today
from models import Student, StudentFee, FeePayment, Branch, FeeInstallment, Concession, ClassFeeStructure, StudentAcademicRecord, FeeType
from helpers import token_required, require_academic_year, normalize_fee_title, assign_fee_to_student, require_editable_student, ensure_student_editable
from services.sequence_service import SequenceService
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import func, or_, and_
import traceback

bp = Blueprint('fee_transaction_routes', __name__)

@bp.route("/api/fees/students", methods=["GET"])
@token_required
def get_fee_students(current_user):
    """List students with fee summary"""
    class_name = request.args.get("class")
    section = request.args.get("section")
    search = request.args.get("search")
    
    # Header Filtering
    h_branch = request.headers.get("X-Branch")
    
    # MANDATORY: Require Academic Year
    h_year, err, code = require_academic_year()
    if err:
        return err, code
    
    # STRICT BRANCH ENFORCEMENT
    if current_user.role != 'Admin':
         h_branch = current_user.branch
    elif not h_branch:
         h_branch = "All"
    
    # HISTORY-AWARE QUERY
    # query selects: Student, StudentAcademicRecord, total, paid, due, concession
    q = db.session.query(
        Student,
        StudentAcademicRecord,
        func.sum(StudentFee.total_fee).label("total"),
        func.sum(StudentFee.paid_amount).label("paid"),
        func.sum(StudentFee.due_amount).label("due"),
        func.sum(StudentFee.concession).label("concession"),
    ).join(StudentAcademicRecord, Student.student_id == StudentAcademicRecord.student_id)\
     .outerjoin(StudentFee, (Student.student_id == StudentFee.student_id) & (StudentFee.academic_year == h_year) & (StudentFee.is_active == True)) # Filter fees by year in join itself? 
     # Actually StudentFee has academic_year. joining on year ensures we sum fees for THAT year.
     # BUT we used to use WHERE clause for that.
     
    # Let's stick to WHERE for StudentFee filtering for safety, but the join above is crucial for StudentAcademicRecord
    
    # FIX: STRICT CROSS-TABLE YEAR FILTERING
    q = q.filter(
        StudentAcademicRecord.academic_year == h_year, # Filter by Record's year
        Student.status == "Active", # Soft Delete Support
        or_(
            StudentFee.academic_year == h_year,
            StudentFee.academic_year.is_(None) # allow null? usually fees have year.
        )
    )

    # STRICT BRANCH SEGREGATION
    if current_user.role == 'Admin':
         # Admins: Check Query Param first, then Header
         branch_param = request.args.get("branch")
         if branch_param and branch_param != "All":
             q = q.filter(Student.branch == branch_param)
         elif branch_param == "All":
             pass # Explicitly show all
         elif h_branch and h_branch != "All":
             q = q.filter(Student.branch == h_branch)
    elif current_user.branch != 'All':
         q = q.filter(Student.branch == current_user.branch)

    if class_name:
        q = q.filter(StudentAcademicRecord.class_name == class_name) # Use Record's class
    if section:
        q = q.filter(StudentAcademicRecord.section == section) # Use Record's section
    
    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                Student.first_name.like(like),
                Student.StudentMiddleName.like(like),
                Student.last_name.like(like),
                Student.admission_no.like(like),
            )
        )
    
    q = q.group_by(Student.student_id, StudentAcademicRecord.id) # Group by record too for safety
    rows = q.all()
    
    output = [
        {
            "student_id": s.student_id, 
            "name": f"{s.first_name} {s.last_name}".strip(),
            "fatherName": s.Fatherfirstname,
            "fatherPhone": s.FatherPhone or s.SmsNo or s.phone,
            "admNo": s.admission_no,
            "branch": s.branch,
            "class": record.class_name,
            "section": record.section,
            "total_fee": float(total or 0),
            "paid_amount": float(paid or 0),
            "due_amount": float(due or 0),
            "concession": float(concession or 0),
            "status": "Paid" if float(due or 0) <= 0 else "Partial" if float(paid or 0) > 0 else "Pending",
        }
        for s, record, total, paid, due, concession in rows
    ]
    
    return jsonify(output), 200


@bp.route("/api/fees/student-details/<int:student_id>", methods=["GET"])
@token_required
def get_student_fees_detail(current_user, student_id):
    """Get detailed fee installments for a student with proper sorting"""
    try:
        h_year = request.headers.get("X-Academic-Year")
        
        # Verify Student belongs to user's branch
        if current_user.role != 'Admin':
            student = Student.query.get(student_id)
            if not student or (current_user.branch != 'All' and student.branch != current_user.branch):
                return jsonify({"error": "Unauthorized access to student data"}), 403
        
        # Use join to filter by Student's branch
        q = StudentFee.query.join(Student).filter(StudentFee.student_id == student_id, StudentFee.is_active == True)
        
        if h_year:
            q = q.filter(StudentFee.academic_year == h_year)
            
        student_fees = q.all()
        
        installments = []
        sr = 1
        
        student_obj = Student.query.get(student_id)
        current_branch = student_obj.branch if student_obj else "All"
        
        relevant_inst = FeeInstallment.query.filter(
             or_(FeeInstallment.branch == current_branch, FeeInstallment.branch == "All"),
             FeeInstallment.academic_year == h_year if h_year else True
        ).all()
        
        inst_map = {normalize_fee_title(i.title): i.installment_no for i in relevant_inst}
        
        def sort_key(sf):
            # Primary Sort: Due Date (Earliest first)
            date_key = sf.due_date or date(9999, 12, 31)
            
            # Secondary Determine Title & Installment No for tie-breaking
            title = ""
            if sf.month == "One-Time" or (sf.fee_type and sf.fee_type.type != "Installment"):
                title = sf.fee_type.feetype if sf.fee_type else "Special Fee"
            else:
                title = f"{sf.month} Fee"
                
            norm_title = normalize_fee_title(title)
            
            # If title is in map, use its installment number
            inst_num = 999
            if norm_title in inst_map:
                inst_num = inst_map[norm_title]
                
            return (date_key, inst_num, sf.id)
        
        sorted_fees = sorted(student_fees, key=sort_key)
        
        for sf in sorted_fees:
            # Determine Title
            if sf.month == "One-Time" or (sf.fee_type and sf.fee_type.type != "Installment"):
                title = sf.fee_type.feetype if sf.fee_type else "Special Fee"
            else:
                title = f"{sf.month} Fee"
            
            payable = float(sf.total_fee or 0)
            paid_amt = float(sf.paid_amount or 0)
            due_amt = float(sf.due_amount or 0)
            concession = float(sf.concession or 0)
            
            # Recalculate due if needed
            if due_amt == 0 and paid_amt < payable:
                due_amt = payable - paid_amt - concession
            
            is_paid = sf.status == "Paid" or (payable > 0 and paid_amt >= payable)
            
            installments.append({
                "sr": sr,
                "title": title,
                "payable": payable,
                "paid": is_paid,
                "paidAmount": paid_amt,
                "dueAmount": due_amt,
                "concession": concession,
                "fee_type_id": sf.fee_type_id,
                "student_fee_id": sf.id,
                "month": sf.month,
                "status": sf.status,
                "due_date": sf.due_date.isoformat() if sf.due_date else None
            })
            sr += 1
        
        return jsonify({"installments": installments}), 200
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def _process_fee_allocation(alloc, student, receipt_no, payment_mode, payment_date, note, transaction_details, current_user):
    amount = Decimal(str(alloc.get("amount", 0)))
    concession_val = Decimal(str(alloc.get("concession_amount", 0)))
    if amount <= 0 and concession_val <= 0:
        return Decimal(0)

    sf = StudentFee.query.get(alloc.get("student_fee_id"))
    if not sf or not sf.is_active:
        return Decimal(0)

    sf.paid_amount = (sf.paid_amount or Decimal(0)) + amount
    sf.concession = (sf.concession or Decimal(0)) + concession_val
    
    total_fee = sf.total_fee or Decimal(0)
    sf.due_amount = max(Decimal(0), total_fee - (sf.paid_amount + sf.concession))
    sf.status = "Paid" if sf.due_amount <= 0 else "Partial" if sf.paid_amount > 0 else "Pending"
    
    inst_id = None
    if sf.month:
         if inst := FeeInstallment.query.filter_by(title=sf.month, academic_year=student.academic_year).first():
             inst_id = inst.id

    fee_type_name = sf.fee_type.feetype if sf.fee_type else "General"
    final_concession_amount = concession_val
    
    if sf.due_amount <= 0:
        prev_recorded = db.session.query(func.sum(FeePayment.concession_amount))\
            .filter(
                FeePayment.student_id == student.student_id,
                FeePayment.fee_type == fee_type_name,
                FeePayment.installment_name == (sf.month or "One-Time"),
                FeePayment.academic_year == student.academic_year
            ).scalar() or 0
        
        unrecorded = (sf.concession or Decimal(0)) - Decimal(prev_recorded) - final_concession_amount
        if unrecorded > 0:
            final_concession_amount += unrecorded

    payment_entry = FeePayment(
        receipt_no=receipt_no,
        branch=student.branch,
        location=student.location,
        academic_year=sf.academic_year or student.academic_year,
        student_id=student.student_id,
        class_name=student.clazz,
        section=student.section,
        installment_id=inst_id,
        installment_name=sf.month or "One-Time",
        fee_type=fee_type_name,
        gross_amount=total_fee,
        concession_amount=final_concession_amount,
        net_payable=total_fee - (Decimal('0') if sf.concession is None else Decimal(str(sf.concession))),
        amount_paid=amount,
        due_amount=sf.due_amount,
        payment_mode=payment_mode,
        payment_date=payment_date,
        payment_month=payment_date.month,
        payment_year=payment_date.year,
        note=note,
        TransactionDetails=transaction_details,
        collected_by=current_user.user_id,
        collected_by_name=current_user.username 
    )
    db.session.add(payment_entry)
    return amount

@bp.route("/api/fees/payment", methods=["POST"])
@token_required
@require_editable_student
def record_fee_payment(current_user):
    """Record payment with proper status and due amount calculation"""
    data = request.json or {}
    student_id = data.get("student_id")
    allocations = data.get("fee_allocations") or data.get("allocations", [])
    payment_amount = data.get("amount_paid") or data.get("amount")
    
    payment_mode = data.get("payment_mode", "Cash")
    payment_date_str = data.get("payment_date", get_today().strftime("%Y-%m-%d"))
    transaction_id = data.get("transaction_id")
    transaction_id_description = data.get("transaction_id_description")

    try:
        payment_date = datetime.strptime(payment_date_str, "%Y-%m-%d").date()
    except ValueError:
       return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    note = data.get("note", "")
    
    #Validation for entering fields for UPI transaction id/ description if payment mode upi or online

    if payment_mode in ("UPI", "CardSwap"):
        if not transaction_id or not str(transaction_id).strip():
            return jsonify({
                "error": "UPI/Card Transaction ID is required for UPI and CardSwap payments."
            }), 400
        if not transaction_id_description or not str(transaction_id_description).strip():
            return jsonify({
                "error": "UPI/Card Transaction Description is required for UPI and CardSwap payments."
            }), 400

    h_year, err, code = require_academic_year()
    if err:
        return err, code

    if current_user.role != 'Admin':
        student = Student.query.get(student_id)
        if not student or student.branch != current_user.branch:
            return jsonify({"error": "Unauthorized: Cannot accept fees for student from another branch"}), 403
    
    if not student_id or not allocations:
        return jsonify({"error": "Student ID and Allocations are required"}), 400
    
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
        
        transaction_details = ""
        if transaction_id or transaction_id_description:
            if parts := [p for p in (transaction_id, transaction_id_description) if p]:
                transaction_details = " / ".join(parts)

        ay_id = SequenceService.resolve_academic_year_id(h_year)
        branch_id = SequenceService.resolve_branch_id(student.branch)
        
        if not ay_id:
                return jsonify({"error": f"Academic Year {h_year} not found"}), 400
        if not branch_id:
                return jsonify({"error": f"Branch {student.branch} not found"}), 400

        receipt_no = SequenceService.generate_receipt_number(branch_id, ay_id, include_prefix=False)

        total_allocated = sum(
            _process_fee_allocation(alloc, student, receipt_no, payment_mode, payment_date, note, transaction_details, current_user)
            for alloc in allocations
        )
        
        db.session.commit()
        
        return jsonify({
            "message": "Payment recorded successfully", 
            "receipt_no": receipt_no,
            "total_paid": str(total_allocated),
            "collected_by_name": current_user.username,
            "transaction_detials":transaction_details
        }), 201
    
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fees/payments/<int:student_id>", methods=["GET"])
@token_required
def get_student_payment_history(current_user, student_id):
    """Fetch all payments for a student"""
    try:
        # Check permissions
        if current_user.role != 'Admin':
            student = Student.query.get(student_id)
            if not student or (current_user.branch != 'All' and student.branch != current_user.branch):
                return jsonify({"error": "Unauthorized"}), 403
        
        # Filter by Academic Year (SMART FILTER)
        h_year = request.headers.get("X-Academic-Year")
        show_cancelled = request.args.get("show_cancelled", "false").lower() == "true"
        
        query = FeePayment.query.filter_by(student_id=student_id)

        if not show_cancelled:
            query = query.filter(FeePayment.status == 'A')
        
        if h_year:
            relevant_fees = db.session.query(StudentFee.month, FeeType.feetype)\
                .join(FeeType)\
                .filter(StudentFee.student_id == student_id, StudentFee.academic_year == h_year)\
                .all()
            
            relevant_keys = [(month or "One-Time", ftype) for month, ftype in relevant_fees]
            
            conditions = [FeePayment.academic_year == h_year, FeePayment.academic_year.is_(None)]
            
            if relevant_keys:
                conditions.extend(and_(FeePayment.installment_name == inst, FeePayment.fee_type == ftype) for inst, ftype in relevant_keys)
            
            query = query.filter(or_(*conditions))
            
        payments = query.order_by(FeePayment.payment_date.desc(), FeePayment.id.desc()).all()
        
        output = [{
            "payment_id": p.id,
            "receipt_no": p.receipt_no,
            "academic_year": p.academic_year,
            "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            "amount_paid": str(p.amount_paid),
            "concession_amount": str(p.concession_amount),
            "gross_amount": str(p.gross_amount),
            "due_amount": str(p.due_amount),
            "fee_type": p.fee_type,
            "installment": p.installment_name,
            "mode": p.payment_mode,
            "collected_by": p.collected_by_name,
            "status": p.status,
            "cancel_reason": p.cancel_reason
        } for p in payments]
            
        return jsonify(output), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fees/payment/<int:payment_id>", methods=["DELETE"])
@token_required
def delete_fee_payment(current_user, payment_id):
    """Cancel a payment (soft delete) and revert the fee status"""
    try:
        payment = FeePayment.query.get(payment_id)
        if not payment:
            return jsonify({"error": "Payment not found"}), 404
            
        try:
            h_year = request.headers.get("X-Academic-Year")
            if h_year:
                ensure_student_editable(payment.student_id, h_year)
        except Exception as e:
            return jsonify({"error": str(e)}), 403
            
        # Get Reason from Body (DELETE with body)
        data = request.get_json(silent=True) or {}
        reason = data.get("reason")
        
        # If no body or reason provided, you might want to enforce it, but let's allow optional for backward compat
        # User requested "valid reason", so let's check it.
        if not reason:
             return jsonify({"error": "Cancellation reason is required"}), 400

        payment = FeePayment.query.get(payment_id)
        if not payment:
            return jsonify({"error": "Payment not found"}), 404
        
        if payment.status == 'I':
            return jsonify({"error": "Payment is already cancelled"}), 400

        # Permission Check
        if current_user.role != 'Admin' and payment.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403

        # Revert Logic
        # Find the linked StudentFee record
        # We match on student_id, academic_year, fee_type, and installment
        
        # NOTE: payment.installment_name is "One-Time" if sf.month was None or "One-Time"
        
        sf_query = StudentFee.query.join(FeeType).filter(
            StudentFee.student_id == payment.student_id,
            StudentFee.academic_year == payment.academic_year,
            FeeType.feetype == payment.fee_type,
            StudentFee.is_active == True
        )
        
        if payment.installment_name == "One-Time":
             sf_query = sf_query.filter(or_(StudentFee.month == "One-Time", StudentFee.month.is_(None)))
        else:
             sf_query = sf_query.filter(StudentFee.month == payment.installment_name)
             
        if sf := sf_query.first():
            # Revert amounts
            sf.paid_amount = (sf.paid_amount or Decimal(0)) - payment.amount_paid
            sf.concession = (sf.concession or Decimal(0)) - (payment.concession_amount or Decimal(0))
            
            # Recalculate due
            total = sf.total_fee or Decimal(0)
            paid_plus_concession = sf.paid_amount + sf.concession
            sf.due_amount = max(Decimal(0), total - paid_plus_concession)
            
            # Update Status
            if sf.due_amount <= 0 and total > 0:
                 sf.status = "Paid"
            elif sf.paid_amount > 0:
                 sf.status = "Partial"
            else:
                 sf.status = "Pending"
        
        # Soft Delete (Cancel)
        payment.status = 'I'
        payment.cancel_reason = reason
        # We do NOT decrement sequence here. Sequence continues.
        
        db.session.commit()
        
        return jsonify({"message": "Payment cancelled and fee status reverted"}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/fees/assign-special", methods=["POST"])
@token_required
def assign_special_fee(current_user):
    """
    Assign special fees to multiple students.
    Prevents duplicate assignment of the same Fee Type for the same Academic Year.
    """
    data = request.json or {}
    student_ids = data.get("student_ids", [])
    fee_assignments = data.get("fee_assignments", [])

    if not student_ids or not fee_assignments:
        return jsonify({"error": "Missing students or fee assignments"}), 400

    assigned_count = 0
    skipped_count = 0
    errors = []

    try:
        # Fetch all students to verify branch access (if not Admin)
        students = Student.query.filter(Student.student_id.in_(student_ids)).all()
        student_map = {s.student_id: s for s in students}

        # Validate Access
        if current_user.role != 'Admin' and current_user.branch != 'All':
            if unauthorized_ids := [sid for sid, s in student_map.items() if s.branch != current_user.branch]:
                return jsonify({"error": "Unauthorized access to some students"}), 403

        # Process Assignments
        for s_id in student_ids:
            student = student_map.get(s_id)
            if not student:
                continue

            for fa in fee_assignments:
                fee_type_id = fa.get("fee_type_id")
                amount = fa.get("amount")
                academic_year = fa.get("academic_year")

                if not fee_type_id or amount is None or not academic_year:
                    continue
                    
                try:
                    frompers = __import__("helpers")
                    frompers.ensure_student_editable(s_id, academic_year)
                except Exception:
                    skipped_count += 1
                    continue

                # Fetch Fee Type for details
                fee_type = FeeType.query.get(fee_type_id)
                if not fee_type:
                    continue
                
                # DUPLICATE CHECK
                # Check if this student already has this Fee Type assigned for this Academic Year
                # We check regular fees (month specified) and special fees (month is None or "One-Time")
                # Since this is "Special Fee", we assume it's One-Time or generic.
                
                # Check existing using fee_type_id and academic_year
                existing_fee = StudentFee.query.filter_by(
                    student_id=s_id,
                    fee_type_id=fee_type_id,
                    academic_year=academic_year,
                    is_active=True
                ).first()

                if existing_fee:
                    skipped_count += 1
                    continue
                
                # Create Student Fee Record
                new_fee = StudentFee(
                    student_id=s_id,
                    fee_type_id=fee_type_id,
                    total_fee=amount,
                    due_amount=amount,
                    paid_amount=0,
                    concession=0,
                    status="Pending",
                    academic_year=academic_year,
                    month="One-Time" # Special fees are usually one-time
                )
                db.session.add(new_fee)
                assigned_count += 1
        
        db.session.commit()
        
        return jsonify({
            "message": "Fee assignment process completed",
            "assigned_count": assigned_count,
            "skipped_count": skipped_count
        }), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/student-fee/add", methods=["POST"])
@token_required
@require_editable_student
def add_student_fee(current_user):
    """Manually add a fee record to a student"""
    data = request.json or {}
    student_id = data.get("student_id")
    fee_type_id = data.get("fee_type_id")
    amount = data.get("amount")
    month = data.get("month", "One-Time")
    
    if not student_id or not fee_type_id or amount is None:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
            
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        # Create Fee
        new_fee = StudentFee(
            student_id=student_id,
            fee_type_id=fee_type_id,
            total_fee=amount,
            due_amount=amount,
            paid_amount=0,
            concession=0,
            status="Pending",
            academic_year=student.academic_year,
            month=month
        )
        db.session.add(new_fee)
        db.session.commit()
        
        return jsonify({"message": "Fee added successfully"}), 201
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/student-fee/<int:fee_id>", methods=["PUT"])
@token_required
def update_student_fee(current_user, fee_id):
    """Update fee amount and concession"""
    data = request.json or {}
    total_fee = data.get("total_fee")
    concession = data.get("concession")
    
    if total_fee is None or concession is None:
        return jsonify({"error": "Total Fee and Concession are required"}), 400
        
    try:
        sf = StudentFee.query.get(fee_id)
        
        if sf:
            try:
                h_year = request.headers.get("X-Academic-Year")
                if h_year:
                    ensure_student_editable(sf.student_id, h_year)
            except Exception as e:
                return jsonify({"error": str(e)}), 403
        if not sf or not sf.is_active:
             return jsonify({"error": "Fee record not found"}), 404
             
        # Check permissions
        student = Student.query.get(sf.student_id)
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        # Validation
        paid = sf.paid_amount or Decimal(0)
        new_total = Decimal(str(total_fee))
        new_concession = Decimal(str(concession))
        
        sf.total_fee = new_total
        sf.concession = new_concession
        
        # Recalculate Logic
        # Due = Total - (Paid + Concession)
        due = new_total - (paid + new_concession)
        sf.due_amount = max(Decimal(0), due)
        
        if sf.due_amount <= 0:
            sf.status = "Paid"
        elif paid > 0:
            sf.status = "Partial"
        else:
            sf.status = "Pending"
            
        db.session.commit()
        return jsonify({"message": "Fee updated successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/student-fee/<int:fee_id>", methods=["DELETE"])
@token_required
def delete_student_fee(current_user, fee_id):
    """Delete a student fee record"""
    try:
        sf = StudentFee.query.get(fee_id)
        
        if sf:
            try:
                h_year = request.headers.get("X-Academic-Year")
                if h_year:
                    ensure_student_editable(sf.student_id, h_year)
            except Exception as e:
                return jsonify({"error": str(e)}), 403
        if not sf:
             return jsonify({"error": "Fee record not found"}), 404
             
        # Check permissions
        student = Student.query.get(sf.student_id)
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        if sf.paid_amount and sf.paid_amount > 0:
            return jsonify({"error": "Cannot delete fee that has payments collected. Please delete payments first."}), 400
            
        sf.is_active = False
        sf.deleted_at = get_now()
        sf.deleted_by = current_user.user_id

        db.session.commit()        
        return jsonify({"message": "Fee deleted successfully"}), 200
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def _calculate_concession(payable, rule):
    return payable * (rule.percentage / Decimal(100)) if rule.is_percentage else min(payable, rule.percentage)

def _update_sf_with_concession(sf, rule):
    payable = sf.total_fee or Decimal(0)
    amount = _calculate_concession(payable, rule)
    sf.concession = amount
    sf.due_amount = max(Decimal(0), payable - amount)
    sf.status = "Paid" if sf.due_amount <= 0 else "Pending"

def _apply_concession_to_sf(fee_id, student_id, rule_map):
    sf = StudentFee.query.get(fee_id)
    if not sf or not sf.is_active or sf.student_id != student_id:
        return 0
    if sf.paid_amount and sf.paid_amount > 0:
        return 0
    if rule := rule_map.get(sf.fee_type_id):
        _update_sf_with_concession(sf, rule)
        return 1
    return 0

def _get_concession_rule_map(concession_title, academic_year, student_branch):
    c_query = Concession.query.filter_by(title=concession_title, academic_year=academic_year)
    rules_all = c_query.all()
    relevant_rules = [r for r in rules_all if r.branch in ("All", student_branch)]
    
    rule_map = {}
    for r in relevant_rules:
        if r.fee_type_id in rule_map:
            existing = rule_map[r.fee_type_id]
            if existing.branch == "All" and r.branch != "All":
                rule_map[r.fee_type_id] = r 
        else:
            rule_map[r.fee_type_id] = r
            
    return rule_map

@bp.route("/api/fees/assign-concession", methods=["POST"])
@token_required
def assign_concession(current_user):
    """Assign concession to multiple student installments"""
    data = request.json or {}
    student_id = data.get("student_id")
    concession_title = data.get("concession_title")
    academic_year = data.get("academic_year")
    installments = data.get("installments", []) # List of student_fee_ids need to be string or int
    
    if not student_id or not concession_title or not installments:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        # 1. Fetch Student
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
            
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        # 2. Fetch Concession Template (All items for this title)
        rule_map = _get_concession_rule_map(concession_title, academic_year, student.branch)
                
        if not rule_map:
             return jsonify({"error": "No Concession Rules found for this title/year/branch"}), 404
             
        # 3. Process Installments
        updated_count = sum(_apply_concession_to_sf(fee_id, student_id, rule_map) for fee_id in installments)
                
        db.session.commit()
        return jsonify({"message": f"Concession assigned to {updated_count} installments"}), 200
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/assign-fee-type", methods=["POST"])
@token_required
def assign_fee_type(current_user):
    """Assign a missing fee type to a student based on Class Fee Structure"""
    data = request.json or {}
    student_id = data.get("student_id")
    fee_type_id = data.get("fee_type_id")
    
    if not student_id or not fee_type_id:
        return jsonify({"error": "Student ID and Fee Type ID are required"}), 400
        
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404
            
        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
             return jsonify({"error": "Unauthorized"}), 403
             
        # Check if already exists
        exists = StudentFee.query.filter_by(
            student_id=student_id,
            fee_type_id=fee_type_id,
            academic_year=student.academic_year,
            is_active=True
        ).count()
        
        if exists > 0:
             return jsonify({"message": "Fee type already assigned"}), 200
             
        # Lookup Structure
        structs = ClassFeeStructure.query.filter_by(
            clazz=student.clazz,
            feetypeid=fee_type_id,
            academic_year=student.academic_year
        ).all()
        
        selected_struct = None
        
        # Filter for best match
        # 1. Exact Branch Match or 'All' branch
        selected_struct = next((s for s in structs if s.branch == student.branch), None) or next((s for s in structs if s.branch == "All"), None)
        
        if selected_struct:
             # Pass is_student_new=True to bypass the restriction on 'isnewadmission' fees 
             # because the user explicitly requested to assign this fee manually.
             assign_fee_to_student(student.student_id, selected_struct, is_student_new=True)
             db.session.commit()
             return jsonify({"message": "Fee assigned based on structure"}), 201
        else:
             # Manual Fallback
             new_fee = StudentFee(
                student_id=student_id,
                fee_type_id=fee_type_id,
                total_fee=0,
                due_amount=0,
                paid_amount=0,
                concession=0,
                status="Pending",
                academic_year=student.academic_year,
                month="One-Time"
            )
             db.session.add(new_fee)
             db.session.commit()
             return jsonify({"message": "Fee assigned (No Structure found, Amount 0)"}), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Nullify Fee Structure for a Student (zero out unpaid installments)
# ---------------------------------------------------------------------------
@bp.route("/api/fees/nullify/<int:student_id>", methods=["POST"])
@token_required
def nullify_student_fees(current_user, student_id):
    """Zero out all unpaid (paid_amount == 0) fee installments for a student."""
    try:
        h_year, err, code = require_academic_year()
        if err:
            return err, code

        # Permission check
        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404

        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
            return jsonify({"error": "Unauthorized"}), 403

        # Fetch all active, unpaid installments for this student in this academic year
        unpaid_fees = StudentFee.query.filter(
            StudentFee.student_id == student_id,
            StudentFee.academic_year == h_year,
            StudentFee.is_active == True,
            StudentFee.paid_amount == 0
        ).all()

        if not unpaid_fees:
            return jsonify({"message": "No unpaid fee installments found to nullify", "nullified": 0}), 200

        count = 0
        for sf in unpaid_fees:
            sf.is_active = False
            sf.deleted_at = datetime.now()
            sf.deleted_by = current_user.user_id
            count += 1

        db.session.commit()
        return jsonify({"message": f"Fee structure nullified successfully. {count} installment(s) zeroed out.", "nullified": count}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/fees/student/<int:student_id>/assign-standard", methods=["POST"])
@token_required
def assign_standard_fees(current_user, student_id):
    """Assign standard class fees to a student."""
    try:
        h_year, err, code = require_academic_year()
        if err:
            return err, code

        student = Student.query.get(student_id)
        if not student:
            return jsonify({"error": "Student not found"}), 404

        if current_user.role != 'Admin' and current_user.branch != 'All' and student.branch != current_user.branch:
            return jsonify({"error": "Unauthorized"}), 403

        from helpers import auto_enroll_student_fee
        # Call auto_enroll_student_fee which automatically assigns ClassFeeStructure skipping already existing fee_types
        # We pass is_student_new=False so that fees strictly targetting "new admissions" are skipped unless intended.
        # This matches the requirement of assigning standard types like tuition fee.
        auto_enroll_student_fee(student_id, student.clazz, h_year, is_student_new=False)
        db.session.commit()

        return jsonify({"message": "Standard fees assigned successfully."}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

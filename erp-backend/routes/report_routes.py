from flask import Blueprint, jsonify, request
from extensions import db, to_local_time
from models import FeePayment, Student, StudentFee
from helpers import token_required, require_academic_year
from datetime import date, datetime
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload

def consolidate_receipts(payments):
    """
    Consolidates multiple payment rows (line items) into single receipt entries.
    Returns a list of receipt dicts suitable for frontend display.
    """
    receipt_map = {}
    
    for p in payments:
        #Group by both branch and receipt_no to prevent cross-branching receipt merging
        key = f"{p.branch}_{p.receipt_no}"

        if key not in receipt_map:
            receipt_map[key] = {
                "receipt_no": p.receipt_no,
                "student_name": (p.student.first_name if p.student else "Unknown") + " " + (p.student.last_name if p.student and p.student.last_name else ""),
                "admission_no": p.student.admission_no if p.student else "",
                "class": p.class_name,
                "section": p.section,
                "branch": p.branch,
                "gross_amount": 0.0,
                "concession": 0.0,
                "net_payable": 0.0,
                "amount_paid": 0.0,
                "due_amount": 0.0,
                "date": p.payment_date.isoformat(),
                "time": to_local_time(p.created_at).strftime("%I:%M %p") if p.created_at else "",
                "mode": p.payment_mode,
                "note": p.note,
                "transaction_id": p.TransactionDetails,
                "cheque_no": p.cheque_no,
                "bank_name": p.bank_name,
                "cheque_date": p.cheque_date.isoformat() if p.cheque_date else None,
                "collected_by": p.collected_by_name,
                "fee_types": [],
                "line_items":[]
            }
        
        key = f"{p.branch}_{p.receipt_no}"
        item = receipt_map[key]
        item["gross_amount"] += float(p.gross_amount or 0)
        item["concession"] += float(p.concession_amount or 0)
        item["net_payable"] += float(p.net_payable or 0)
        item["amount_paid"] += float(p.amount_paid or 0)
        item["amount"] = item["amount_paid"] # Frontend expects 'amount'
        item["due_amount"] += float(p.due_amount or 0)
        
        # Avoid duplicate fee type strings
        f_name = f"{p.fee_type or ''} {p.installment_name or ''}".strip()
        if f_name and f_name not in item["fee_types"]:
            item["fee_types"].append(f_name)
        item["line_items"].append({
            "fee_type": p.fee_type,
            "installment_name": p.installment_name,
            "fee_type_str": f_name,
            "gross_amount": float(p.gross_amount or 0),
            "concession": float(p.concession_amount or 0),
            "net_payable": float(p.net_payable or 0),
            "amount_paid": float(p.amount_paid or 0),
            "due_amount": float(p.due_amount or 0)
        })
    final_receipts = []
    # Sort by recent first (assuming input was sorted, but we iterate dict. Python 3.7+ preserves insertion order)
    # The input 'payments' should be sorted.
    
    for r in receipt_map.values():
        final_receipts.append({
            **r,
            "fee_type_str": ", ".join(r["fee_types"]) 
        })
    
    return final_receipts

bp = Blueprint('report_routes', __name__)

@bp.route("/api/reports/fees/today", methods=["GET"])
@token_required
def report_fee_today(current_user):
    h_year, err, code = require_academic_year()
    if err: return err, code
    
    if current_user.role == 'Admin':
        target_branch = request.headers.get("X-Branch", "All")
    else:
         target_branch = current_user.branch

    today = date.today()
    
    try:
        query = FeePayment.query.options(selectinload(FeePayment.student)).filter(FeePayment.payment_date == today)
        query = query.filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(FeePayment.branch == target_branch)
            
        # Exclude Cancelled Receipts
        query = query.filter(FeePayment.status == 'A')

        payments = query.order_by(FeePayment.created_at.desc()).all()
        
        total_amount = sum(float(p.amount_paid or 0) for p in payments)
        
        receipts_list = consolidate_receipts(payments)
        
        return jsonify({
            "date": today.isoformat(),
            "total_collection": total_amount,
            "receipts_count": len(receipts_list),
            "receipts": receipts_list
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/reports/fees/daily", methods=["GET"])
@bp.route("/api/reports/fees/daily", methods=["GET"])
@token_required
def report_fee_daily(current_user):
    """Get fee collection for specific date or date range"""
    h_year, err, code = require_academic_year()
    if err: return err, code
    
    if current_user.role == 'Admin':
        target_branch = request.headers.get("X-Branch", "All")
    else:
        target_branch = current_user.branch

    date_str = request.args.get('date')
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    # Filters
    class_filter = request.args.get('class')
    section_filter = request.args.get('section')

    target_start = None
    target_end = None

    try:
        if start_date_str and end_date_str:
             target_start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
             target_end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
        elif date_str:
            target_start = datetime.strptime(date_str, '%Y-%m-%d').date()
            target_end = target_start
        else:
             return jsonify({"error": "Date range (start_date, end_date) or specific date required"}), 400
        
        query = FeePayment.query.options(selectinload(FeePayment.student)).filter(FeePayment.payment_date >= target_start)
        query = query.filter(FeePayment.payment_date <= target_end)
        query = query.filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(FeePayment.branch == target_branch)
            
        if class_filter and class_filter != 'All':
            query = query.filter(FeePayment.class_name == class_filter)
            
        if section_filter and section_filter != 'All':
            query = query.filter(FeePayment.section == section_filter)

        fee_type_filter = request.args.get('fee_type')
        if fee_type_filter and fee_type_filter != 'All':
            query = query.filter(FeePayment.fee_type == fee_type_filter)
            
        # Exclude Cancelled Receipts
        query = query.filter(FeePayment.status == 'A')

        payments = query.order_by(FeePayment.created_at.desc()).all()
        
        # Consolidate Receipts
        final_receipts = consolidate_receipts(payments)
        
        # Summaries
        mode_summary = {}
        collected_details = {} # Key: (name, branch) -> {amount, count}
        
        # Re-calc totals from consolidated receipts if needed, OR just iterate payments for simple sums
        # Actually mode_summary and collected_by_summary should also be accurate. 
        # Mode summary is sum of amounts, so iterating raw payments is fine.
        
        for p in payments:
             mode = p.payment_mode or "Unknown"
             mode_summary[mode] = mode_summary.get(mode, 0) + float(p.amount_paid or 0)

        total_amount = 0.0
        
        # Collected By Summary (Count RECEIPTS, not line items)
        for r in final_receipts:
            total_amount += r["amount_paid"]
            
            key = (r["collected_by"] or "Unknown", r["branch"] or "Unknown")
            if key not in collected_details:
                collected_details[key] = {"amount": 0.0, "count": 0}
            
            collected_details[key]["amount"] += r["amount_paid"]
            collected_details[key]["count"] += 1

        # Format collected_by_summary for frontend
        collected_list = []
        for (name, branch), data in collected_details.items():
            collected_list.append({
                "user": name,
                "branch": branch,
                "count": data["count"],
                "amount": data["amount"]
            })

        return jsonify({
            "start_date": target_start.isoformat(),
            "end_date": target_end.isoformat(),
            "total_collection": total_amount,
            "receipts_count": len(final_receipts),
            "mode_summary": mode_summary,
            "collected_by_summary": collected_list,
            "receipts": final_receipts
        }), 200
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/reports/fees/monthly", methods=["GET"])
@token_required
def report_fee_monthly(current_user):
    """Get fee collection for month"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        month = request.args.get('month') # 1-12
        year = request.args.get('year')   # 2025
        
        if not month or not year:
            return jsonify({"error": "Month and Year required"}), 400
            
        query = FeePayment.query.options(selectinload(FeePayment.student)).filter(
            FeePayment.payment_month == int(month),
            FeePayment.payment_year == int(year)
        )
        query = query.filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(FeePayment.branch == target_branch)
        elif current_user.role != 'Admin':
             return jsonify({
                "period": f"{month}-{year}",
                "total_collection": 0,
                "class_wise": {},
                "receipts_count": 0,
                "receipts": []
            }), 200
            
        # Exclude Cancelled Receipts
        query = query.filter(FeePayment.status == 'A')
            
        payments = query.all()
        
        total = sum(float(p.amount_paid or 0) for p in payments)
        class_totals = {}
        
        for p in payments:
            cls = p.class_name or "Unknown"
            class_totals[cls] = class_totals.get(cls, 0) + float(p.amount_paid or 0)
            
        receipts_list = consolidate_receipts(payments)
        
        return jsonify({
            "period": f"{month}-{year}",
            "total_collection": total,
            "class_wise": class_totals,
            "receipts_count": len(receipts_list),
             "receipts": receipts_list
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/class-wise", methods=["GET"])
@token_required
def report_fee_class_wise(current_user):
    """Get fee stats by class"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        class_name = request.args.get('class')
        
        if not class_name:
            return jsonify({"error": "Class required"}), 400
            
        # Security Check
        if current_user.role != 'Admin' and (not target_branch or target_branch in ['All', 'AllBranches']):
             return jsonify({
                "class": class_name, "total_fee": 0, "collected": 0, "due": 0, "receipts": []
            }), 200

        # 1. Total Collected (from FeePayment)
        p_query = FeePayment.query.options(selectinload(FeePayment.student)).filter_by(class_name=class_name, academic_year=h_year)
        if target_branch and target_branch not in ['All', 'AllBranches']:
            p_query = p_query.filter_by(branch=target_branch)
        
        # Exclude Cancelled Receipts
        p_query = p_query.filter(FeePayment.status == 'A')
            
        payments = p_query.all()
        collected = sum(float(p.amount_paid or 0) for p in payments)
        
        # 2. Total Demand (from StudentFee)
        # Find students of this class & branch
        s_query = Student.query.filter_by(clazz=class_name, academic_year=h_year)
        if target_branch and target_branch != "All":
            s_query = s_query.filter_by(branch=target_branch)
        students = s_query.all()
        student_ids = [s.student_id for s in students]
        
        if student_ids:
            # Query StudentFee for these students
            sf_stats = db.session.query(
                func.sum(StudentFee.total_fee),
                func.sum(StudentFee.due_amount)
            ).filter(
                StudentFee.student_id.in_(student_ids),
                StudentFee.academic_year == h_year,
                StudentFee.is_active == True
            ).first()
            
            total_fee = float(sf_stats[0] or 0)
            total_due = float(sf_stats[1] or 0)
        else:
            total_fee = 0
            total_due = 0

        # Note: collected might not match total_fee - total_due exactly if there are data inconsistencies, 
        # but normally total_fee = paid + due + concession.
        
        receipts_list = consolidate_receipts(payments)
        
        return jsonify({
            "class": class_name,
            "total_fee": total_fee,
            "collected": collected, # From Payments Table (Reality)
            "due": total_due,       # From StudentFee Table (Plan)
            "receipts": receipts_list
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/installment-wise", methods=["GET"])
@token_required
def report_fee_installment_wise(current_user):
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        installment = request.args.get('installment') # e.g. "June Fee" or title
        
        if not installment:
             return jsonify({"error": "Installment name required"}), 400

        # Security Check
        if current_user.role != 'Admin' and (not target_branch or target_branch in ['All', 'AllBranches']):
             return jsonify({
                "installment": installment, "total_demand": 0, "collected": 0, "due": 0, 
                "total_students": 0, "paid_students": 0, "pending_students": 0, "receipts": []
            }), 200

        # 1. Payments for this installment
        # We search by installment_name or month
        p_query = FeePayment.query.options(selectinload(FeePayment.student)).filter(
            (FeePayment.installment_name == installment) | (FeePayment.fee_type == installment)
        ).filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            p_query = p_query.filter(FeePayment.branch == target_branch)
        
        # Exclude Cancelled Receipts
        p_query = p_query.filter(FeePayment.status == 'A')
        
        payments = p_query.all()
        collected = sum(float(p.amount_paid or 0) for p in payments)
        
        # 2. Demand for this installment
        # We search StudentFee where month == installment
        sf_query = db.session.query(
            func.sum(StudentFee.total_fee),
            func.sum(StudentFee.due_amount),
            func.count(StudentFee.id) # Total students assigned
        ).join(Student).filter(
            StudentFee.month == installment,
            StudentFee.academic_year == h_year,
            StudentFee.is_active == True
        )
        
        if target_branch and target_branch != "All":
            sf_query = sf_query.filter(Student.branch == target_branch)
            
        stats = sf_query.first()
        total_demand = float(stats[0] or 0)
        total_due = float(stats[1] or 0)
        student_count = int(stats[2] or 0)
        
        # Paid count? Students with status='Paid' for this fee
        paid_count = db.session.query(func.count(StudentFee.id)).join(Student).filter(
            StudentFee.month == installment,
            StudentFee.academic_year == h_year,
            StudentFee.status == 'Paid',
            StudentFee.is_active == True
        )
        if target_branch and target_branch != "All":
            paid_count = paid_count.filter(Student.branch == target_branch)
        paid_count = paid_count.scalar()

        
        receipts_list = consolidate_receipts(payments)

        return jsonify({
            "installment": installment,
            "total_demand": total_demand,
            "collected": collected,
            "due": total_due,
            "total_students": student_count,
            "paid_students": paid_count,
            "pending_students": student_count - paid_count,
            "receipts": receipts_list
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/due", methods=["GET"])
@token_required
def report_fee_due(current_user):
    """Get students with due amount"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
        
        # Security Check
        if current_user.role != 'Admin' and (not target_branch or target_branch in ['All', 'AllBranches']):
             return jsonify([]), 200

        # Query StudentFees grouped by Student
        # Filter where due_amount > 0
        
        query = db.session.query(
            Student,
            func.sum(StudentFee.due_amount).label("total_due"),
            func.sum(StudentFee.total_fee).label("total_fee")
        ).join(StudentFee).filter(
            StudentFee.academic_year == h_year,
            Student.academic_year == h_year,
            StudentFee.is_active == True
        )
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(Student.branch == target_branch)
            
        query = query.group_by(Student.student_id).having(func.sum(StudentFee.due_amount) > 0)
        
        results = query.all()
        
        output = []
        for s, due, fee in results:
            output.append({
                "student_id": s.student_id,
                "name": f"{s.first_name} {s.StudentMiddleName or ''} {s.last_name}".strip(),
                "admission_no": s.admission_no,
                "class": s.clazz,
                "section": s.section,
                "father_name": s.Fatherfirstname,
                "total_fee": float(fee or 0),
                "due_amount": float(due or 0),
                "father_mobile": s.FatherPhone
            })
            
        return jsonify(output), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/late-due", methods=["GET"])
@token_required
def report_fee_late_due(current_user):
    """Get students with late due amount (due date passed or no due date)"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
        
        # Security Check
        if current_user.role != 'Admin' and (not target_branch or target_branch in ['All', 'AllBranches']):
             return jsonify([]), 200

        # Query StudentFees grouped by Student
        # Filter where due_amount > 0 and (due_date is NULL or due_date < today)
        
        query = db.session.query(
            Student,
            func.sum(StudentFee.due_amount).label("total_due"),
            func.sum(StudentFee.total_fee).label("total_fee")
        ).join(StudentFee).filter(
            StudentFee.academic_year == h_year,
            Student.academic_year == h_year,
            StudentFee.is_active == True,
            or_(
                StudentFee.due_date == None,
                StudentFee.due_date < date.today()
            )
        )
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(Student.branch == target_branch)
            
        query = query.group_by(Student.student_id).having(func.sum(StudentFee.due_amount) > 0)
        
        results = query.all()
        
        output = []
        for s, due, fee in results:
            output.append({
                "student_id": s.student_id,
                "name": f"{s.first_name} {s.StudentMiddleName or ''} {s.last_name}".strip(),
                "admission_no": s.admission_no,
                "class": s.clazz,
                "section": s.section,
                "father_name": s.Fatherfirstname,
                "total_fee": float(fee or 0),
                "due_amount": float(due or 0),
                "father_mobile": s.FatherPhone
            })
            
        return jsonify(output), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/receipt/<string:receipt_no>", methods=["GET"])
@token_required
def get_receipt_data(current_user, receipt_no):
    """Get Receipt Details (Immutable Read-Only)"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Scoped by Branch (if strict) and Year
        # Actually receipt_no should be unique regardless of year, but we enforce year check for security context
        query = FeePayment.query.options(selectinload(FeePayment.student)).filter_by(receipt_no=receipt_no) #, academic_year=h_year) 
        # Note: If we enforce year check, user can't view old receipts easily if they switched year? 
        # But instructions say "Receipts must be fetched by receipt_no + branch + academic_year."
        query = query.filter_by(academic_year=h_year)

        # Strict Branch Logic
        if current_user.role == 'Admin':
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
             if not target_branch or target_branch in ['All', 'AllBranches']:
                  return jsonify({"error": "Unauthorized"}), 403

        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter_by(branch=target_branch)
            
        payments = query.all()
        
        if not payments:
            return jsonify({"error": "Receipt not found"}), 404
            
        if not payments:
            return jsonify({"error": "Receipt not found"}), 404
            
        # One receipt = Multiple payment rows
        first = payments[0]
        student = first.student
        
        items = []
        total_paid = 0
        total_concession = 0
        total_gross = 0
        total_due = 0
        
        for p in payments:
            items.append({
                "title": f"{p.fee_type or ''} {p.installment_name or ''}".strip(),
                "installment": p.installment_name,
                "fee_type": p.fee_type,
                "amount_paid": str(p.amount_paid),
                "concession_amount": str(p.concession_amount),
                "gross_amount": str(p.gross_amount),
                "due_amount": str(p.due_amount),
                "student_id": p.student_id,
                "branch": p.branch
            })
            total_paid += float(p.amount_paid)
            total_concession += float(p.concession_amount or 0)
            total_gross += float(p.gross_amount or 0)
            total_due += float(p.due_amount or 0)
            
        return jsonify({
            "receiptNo": first.receipt_no,
            "studentName": f"{student.first_name} {student.StudentMiddleName or ''} {student.last_name}".strip(),
            "fatherName": student.Fatherfirstname,
            "fatherPhone": student.FatherPhone or student.SmsNo or student.phone,
            "admissionNo": student.admission_no,
            "branch": student.branch,
            "className": first.class_name, # Snapshot class from payment
            "paymentDate": first.payment_date.isoformat(),
            "paymentMode": first.payment_mode,
            "paymentNote": first.note,
            "items": items,
            "amount": total_gross, # Gross
            "concession": total_concession,
            "payable": total_gross - total_concession, # Net Payable
            "paid": total_paid,
            "due": total_due
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

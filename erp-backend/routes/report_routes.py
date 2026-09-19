from flask import Blueprint, jsonify, request, current_app
from extensions import db, to_local_time
from models import FeePayment, Student, StudentFee, RemittanceMaster, Branch
from helpers import token_required, require_academic_year, has_global_branch_access, user_can_access_branch
from datetime import date, datetime
from sqlalchemy import func, or_, extract
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
                "student_id": p.student_id,
                "academic_year": p.academic_year,
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
    
    if has_global_branch_access(current_user):
        target_branch = request.headers.get("X-Branch", "All")
    else:
         target_branch = current_user.branch

    today = date.today()
    
    try:
        query = FeePayment.query.options(selectinload(FeePayment.student)).filter(FeePayment.payment_date == today)
        query = query.filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(FeePayment.branch == target_branch)
            
        # Status Filter (A=Active, I=Cancelled/Deleted, All=Both)
        status_filter = request.args.get('status', 'A')
        if status_filter != 'All':
            query = query.filter(FeePayment.status == status_filter)
            
        # Concession Filter
        if request.args.get('has_concession') == 'true':
            query = query.filter(FeePayment.concession_amount > 0)

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
        current_app.logger.exception("standard fee due report failed")
        return jsonify({"error": "Failed to generate report"}), 500
@bp.route("/api/reports/fees/daily", methods=["GET"])
@token_required
def report_fee_daily(current_user):
    """Get fee collection for specific date or date range"""
    h_year, err, code = require_academic_year()
    if err: return err, code
    
    if has_global_branch_access(current_user):
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
            
        # Status Filter (A=Active, I=Cancelled/Deleted, All=Both)
        status_filter = request.args.get('status', 'A')
        if status_filter != 'All':
            query = query.filter(FeePayment.status == status_filter)
            
        # Concession Filter
        if request.args.get('has_concession') == 'true':
            query = query.filter(FeePayment.concession_amount > 0)

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
        if has_global_branch_access(current_user):
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
        elif not has_global_branch_access(current_user):
             return jsonify({
                "period": f"{month}-{year}",
                "total_collection": 0,
                "class_wise": {},
                "receipts_count": 0,
                "receipts": []
            }), 200
            
        # Status Filter
        status_filter = request.args.get('status', 'A')
        if status_filter != 'All':
            query = query.filter(FeePayment.status == status_filter)
            
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
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        class_name = request.args.get('class')
        
        if not class_name:
            return jsonify({"error": "Class required"}), 400
            
        # Security Check
        if not has_global_branch_access(current_user) and (not target_branch or target_branch in ['All', 'AllBranches']):
             return jsonify({
                "class": class_name, "total_fee": 0, "collected": 0, "due": 0, "receipts": []
            }), 200

        # 1. Total Collected (from FeePayment)
        p_query = FeePayment.query.options(selectinload(FeePayment.student)).filter_by(class_name=class_name, academic_year=h_year)
        if target_branch and target_branch not in ['All', 'AllBranches']:
            p_query = p_query.filter_by(branch=target_branch)
        
        # Status Filter
        status_filter = request.args.get('status', 'A')
        if status_filter != 'All':
            p_query = p_query.filter(FeePayment.status == status_filter)
            
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
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        installment = request.args.get('installment') # e.g. "June Fee" or title
        
        if not installment:
             return jsonify({"error": "Installment name required"}), 400

        # Security Check
        if not has_global_branch_access(current_user) and (not target_branch or target_branch in ['All', 'AllBranches']):
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
        
        # Status Filter
        status_filter = request.args.get('status', 'A')
        if status_filter != 'All':
            p_query = p_query.filter(FeePayment.status == status_filter)
        
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
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
        
        # Security Check
        if not has_global_branch_access(current_user) and (not target_branch or target_branch in ['All', 'AllBranches']):
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
                "name": f"{s.first_name or ''} {s.StudentMiddleName or ''} {s.last_name or ''}".strip(),
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


from sqlalchemy import func

@bp.route("/api/reports/fees/standard-due", methods=["GET"])
@token_required
def report_standard_fee_due(current_user):
    """Get students with due amount based on specific filters for the Standard Due Report"""
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Strict Branch Logic
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
            target_branch = current_user.branch
        
        # Security Check
        if not has_global_branch_access(current_user) and (not target_branch or target_branch in ['All', 'AllBranches']):
            return jsonify([]), 200
            
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        fee_type_filter = request.args.get('fee_type', 'All')
        installment_filter = request.args.get('installment', 'All')
        
        from models import FeeType
        
        query = db.session.query(
            Student.student_id,
            Student.clazz,
            Student.section,
            Student.branch,
            Student.admission_no,
            Student.first_name,
            Student.StudentMiddleName,
            Student.last_name,
            Student.Fatherfirstname,
            Student.FatherMiddleName,
            Student.FatherLastName,
            Student.FatherPhone,
            func.sum(StudentFee.due_amount).label("total_due"),
            func.sum(StudentFee.total_fee).label("total_fee"),
            func.sum(StudentFee.paid_amount).label("total_paid"),
            func.count(StudentFee.id).label("no_of_due_installments"),
            func.group_concat(StudentFee.month.distinct()).label("installments"),
            func.group_concat(FeeType.feetype.distinct()).label("fee_types")
        ).join(StudentFee, Student.student_id == StudentFee.student_id)\
         .outerjoin(FeeType, FeeType.id == StudentFee.fee_type_id)\
         .filter(
            StudentFee.academic_year == h_year,
            Student.academic_year == h_year,
            StudentFee.is_active == True,
            StudentFee.due_amount > 0
        )        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(Student.branch == target_branch)
            
        # Date range filter applies when installment is 'All'
        # When a specific installment is chosen (e.g. 'October Fee'), the user explicitly targets that installment
        if start_date_str and end_date_str and installment_filter == 'All':
            try:
                target_start = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                target_end = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                # Fee types without installments (like Annual Fee, Admission Fee) have due_date == NULL
                # Include fees falling within date range OR fees without an installment due date
                query = query.filter(
                    or_(
                        StudentFee.due_date.between(target_start, target_end),
                        StudentFee.due_date.is_(None)
                    )
                )
            except ValueError:
                return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
                
        if fee_type_filter != 'All':
            norm_filter = fee_type_filter.strip().lower()
            if norm_filter in ['tuition fee', 'tution fee']:
                query = query.filter(FeeType.feetype.in_(['Tuition Fee', 'Tution Fee']))
            else:
                query = query.filter(func.lower(func.trim(FeeType.feetype)) == norm_filter)
            
        if installment_filter != 'All':
            if installment_filter in ['One-Time', 'One-Time / Non-Installment']:
                query = query.filter(or_(StudentFee.month == 'One-Time', StudentFee.month.is_(None)))
            else:
                query = query.filter(func.lower(func.trim(StudentFee.month)) == installment_filter.strip().lower())
            
        query = query.group_by(
            Student.student_id, Student.clazz, Student.section, Student.branch, Student.admission_no,
            Student.first_name, Student.StudentMiddleName, Student.last_name,
            Student.Fatherfirstname, Student.FatherMiddleName, Student.FatherLastName,
            Student.FatherPhone
        ).having(func.sum(StudentFee.due_amount) > 0)
        
        results = query.all()
        
        output = []
        for r in results:
            output.append({
                "student_id": r.student_id,
                "name": f"{r.first_name or ''} {r.StudentMiddleName or ''} {r.last_name or ''}".strip(),
                "admission_no": r.admission_no,
                "class": r.clazz,
                "section": r.section,
                "branch": r.branch,
                "father_name": f"{r.Fatherfirstname or ''} {r.FatherMiddleName or ''} {r.FatherLastName or ''}".strip(),
                "father_mobile": r.FatherPhone,
                "total_fee": float(r.total_fee or 0),
                "due_amount": float(r.total_due or 0),
                "paid_amount": float(r.total_paid or 0),
                "no_of_due_installments": r.no_of_due_installments,
                "installments": r.installments,
                "installment": r.installments,  # kept for backward-compat with old field name if frontend uses it
                "fee_type": r.fee_types or "Unknown"
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
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
        
        # Security Check
        if not has_global_branch_access(current_user) and (not target_branch or target_branch in ['All', 'AllBranches']):
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
                "name": f"{s.first_name or ''} {s.StudentMiddleName or ''} {s.last_name or ''}".strip(),
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
        query = query.filter(
            or_(
                FeePayment.academic_year == h_year,
                FeePayment.academic_year.is_(None)
            )
        )

        target_student_id = request.args.get("student_id")

        # Strict Branch Logic
        if has_global_branch_access(current_user):
            target_branch = request.args.get("branch") or request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch
             if not target_branch or target_branch in ['All', 'AllBranches', 'All Locations']:
                  return jsonify({"error": "Unauthorized"}), 403

        if target_branch and target_branch not in ['All', 'AllBranches', 'All Locations', 'all', 'all branches']:
            clean_b = target_branch.replace("MS HifzAcademy", "").replace("MS Education Academy", "").strip()
            if clean_b:
                branch_aliases = {
                    target_branch,
                    target_branch.strip(),
                    clean_b,
                    f"MS HifzAcademy {clean_b}",
                    f"MS Education Academy {clean_b}"
                }
                branch_obj = Branch.query.filter(
                    or_(
                        Branch.branch_name == clean_b,
                        Branch.branch_code == clean_b,
                        Branch.branch_name == target_branch,
                        Branch.branch_code == target_branch
                    )
                ).first()
                if branch_obj:
                    if branch_obj.branch_name:
                        branch_aliases.add(branch_obj.branch_name)
                    if branch_obj.branch_code:
                        branch_aliases.add(branch_obj.branch_code)
                query = query.filter(FeePayment.branch.in_(list(branch_aliases)))
            else:
                query = query.filter(FeePayment.branch == target_branch)

        if target_student_id:
            try:
                query = query.filter(FeePayment.student_id == int(target_student_id))
            except (ValueError, TypeError):
                pass
            
        payments = query.all()
        
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
            "studentName": f"{student.first_name or ''} {student.StudentMiddleName or ''} {student.last_name or ''}".strip(),
            "fatherName": student.Fatherfirstname,
            "fatherPhone": student.FatherPhone or student.SmsNo or student.phone,
            "admissionNo": student.admission_no,
            "branch": student.branch,
            "className": first.class_name, # Snapshot class from payment
            "paymentDate": first.payment_date.isoformat(),
            "paymentMode": first.payment_mode,
            "paymentNote": first.note,
            "transactionId": first.TransactionDetails or "",
            "transaction_id": first.TransactionDetails or "",
            "chequeNo": first.cheque_no or "",
            "bankName": first.bank_name or "",
            "chequeDate": first.cheque_date.isoformat() if first.cheque_date else None,
            "items": items,
            "amount": total_gross, # Gross
            "concession": total_concession,
            "payable": total_gross - total_concession, # Net Payable
            "paid": total_paid,
            "due": total_due
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/reports/fees/deleted-receipts", methods=["GET"])
@token_required
def report_deleted_receipts(current_user):
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        query = FeePayment.query.options(selectinload(FeePayment.student)).filter(FeePayment.status == 'I')
        query = query.filter(FeePayment.academic_year == h_year)
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(FeePayment.branch == target_branch)

        payments = query.order_by(FeePayment.updated_at.desc()).all()
        
        from models import User
        users = {u.user_id: u.username for u in User.query.all()}
        
        receipt_map = {}
        for p in payments:
            key = f"{p.branch}_{p.receipt_no}"
            if key not in receipt_map:
                receipt_map[key] = {
                    "receipt_no": p.receipt_no,
                    "student_name": (p.student.first_name if p.student else "Unknown") + " " + (p.student.last_name if p.student and p.student.last_name else ""),
                    "admission_no": p.student.admission_no if p.student else "",
                    "class": p.class_name,
                    "section": p.section,
                    "branch": p.branch,
                    "amount_paid": 0.0,
                    "gross_amount": 0.0,
                    "date": p.payment_date.isoformat() if p.payment_date else "",
                    "mode": p.payment_mode,
                    "collected_by": p.collected_by_name,
                    "deleted_by": users.get(p.updated_by, "Unknown"),
                    "deleted_at": to_local_time(p.updated_at).strftime("%d-%m-%Y %I:%M %p") if p.updated_at else "",
                    "cancel_reason": p.cancel_reason or "No reason provided",
                    "fee_types": []
                }
            item = receipt_map[key]
            item["amount_paid"] += float(p.amount_paid or 0)
            item["gross_amount"] += float(p.gross_amount or 0)
            f_name = f"{p.fee_type or ''} {p.installment_name or ''}".strip()
            if f_name and f_name not in item["fee_types"]:
                item["fee_types"].append(f_name)
        
        final_receipts = []
        for r in receipt_map.values():
            final_receipts.append({
                **r,
                "fee_type_str": ", ".join(r["fee_types"]) 
            })
            
        return jsonify({"receipts": final_receipts}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/fees/concession-report", methods=["GET"])
@token_required
def report_concession(current_user):
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
             target_branch = current_user.branch

        from models import FeeType
        query = db.session.query(
            StudentFee.student_id,
            func.sum(StudentFee.concession).label('total_concession'),
            func.sum(StudentFee.total_fee).label('total_gross'),
            func.sum(StudentFee.paid_amount).label('total_paid'),
            func.max(StudentFee.updated_by).label('assigned_by'),
            func.max(FeeType.feetype).label('fee_type_name')
        ).join(Student, Student.student_id == StudentFee.student_id)\
         .outerjoin(FeeType, FeeType.id == StudentFee.fee_type_id)
        
        query = query.filter(
            StudentFee.concession > 0, 
            StudentFee.is_active == True,
            StudentFee.academic_year == h_year
        )
        
        if target_branch and target_branch not in ['All', 'AllBranches']:
            query = query.filter(Student.branch == target_branch)
            
        query = query.group_by(StudentFee.student_id).all()
        
        student_ids = [r.student_id for r in query]
        students = Student.query.filter(Student.student_id.in_(student_ids)).all()
        student_map = {s.student_id: s for s in students}
        
        from models import User
        users = {u.user_id: u.username for u in User.query.all()}
        
        results = []
        for r in query:
            s = student_map.get(r.student_id)
            if s:
                results.append({
                    "student_id": s.student_id,
                    "student_name": f"{s.first_name or ''} {s.StudentMiddleName or ''} {s.last_name or ''}".strip(),
                    "admission_no": s.admission_no,
                    "class": s.clazz,
                    "section": s.section,
                    "branch": s.branch,
                    "total_gross": float(r.total_gross or 0),
                    "total_concession": float(r.total_concession or 0),
                    "total_paid": float(r.total_paid or 0),
                    "father_name": s.Fatherfirstname,
                    "phone": s.FatherPhone or s.phone,
                    "assigned_by": users.get(r.assigned_by, "Unknown") if r.assigned_by else "Unknown",
                    "fee_type_name": r.fee_type_name or "Multiple/Unknown"
                })
                
        return jsonify({"concessions": results}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/reports/fees/concession-details/<int:student_id>", methods=["GET"])
@token_required
def get_concession_details(current_user, student_id):
    try:
        h_year, err, code = require_academic_year()
        if err: return err, code
        #Branch Authorization Check
        if has_global_branch_access(current_user):
            target_branch = request.headers.get("X-Branch", "All")
        else:
            target_branch = current_user.branch
        
        #Verify student belongs to accessible branch
        student = Student.query.filter_by(student_id = student_id, academic_year=h_year).first()
        if not student:
            return jsonify({"error": "Student not found"}), 404
        
        if target_branch not in ['All', 'AllBranches'] and student.branch != target_branch:
            return jsonify({"error": "Student does not belong to accessible branch"}), 403
            
        from models import FeeType, FeeInstallment
        
        # Fetch the student fee records where concession > 0
        fees = db.session.query(
            StudentFee, FeeType.feetype.label('fee_type_name'), FeeInstallment.title.label('installment_name')
        ).outerjoin(FeeType, FeeType.id == StudentFee.fee_type_id)\
         .outerjoin(FeeInstallment, FeeInstallment.id == StudentFee.fee_id)\
         .filter(StudentFee.student_id == student_id, StudentFee.concession > 0, StudentFee.academic_year == h_year, StudentFee.is_active == True)\
         .all()
         
        details = []
        for sf, fee_type_name, installment_name in fees:
            details.append({
                "installment": installment_name or sf.month or fee_type_name or "Unknown",
                "fee_type": fee_type_name or "Unknown",
                "total_fee": float(sf.total_fee or 0),
                "paid": float(sf.paid_amount or 0),
                "concession": float(sf.concession or 0),
                "status": sf.status
            })
            
        return jsonify({"details": details}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/reconciliation/month-wise", methods=["GET"])
@token_required
def get_reconciliation_month_wise(current_user):
    try:
        academic_year = request.args.get("academic_year") or request.headers.get("X-Academic-Year") or "2026-2027"
        branch_val = request.args.get("branch") or request.args.get("branch_id") or request.headers.get("X-Branch") or current_user.branch
        if not has_global_branch_access(current_user):
            branch_val = current_user.branch

        from routes.remittance_routes import resolve_branch
        branch_id, branch_name = resolve_branch(branch_val)

        try:
            fy_start_year = int(academic_year.split("-")[0])
        except (ValueError, IndexError):
            fy_start_year = 2026

        months = [
            ("Apr", fy_start_year, 4),
            ("May", fy_start_year, 5),
            ("Jun", fy_start_year, 6),
            ("Jul", fy_start_year, 7),
            ("Aug", fy_start_year, 8),
            ("Sep", fy_start_year, 9),
            ("Oct", fy_start_year, 10),
            ("Nov", fy_start_year, 11),
            ("Dec", fy_start_year, 12),
            ("Jan", fy_start_year + 1, 1),
            ("Feb", fy_start_year + 1, 2),
            ("Mar", fy_start_year + 1, 3),
        ]

        start_date = datetime(fy_start_year, 4, 1).date()

        prev_fee_query = FeePayment.query.filter(
            FeePayment.status == 'A',
            FeePayment.payment_mode.in_(['Cash', 'CASH', 'cash']),
            FeePayment.payment_date < start_date
        )
        if branch_name:
            prev_fee_query = prev_fee_query.filter(FeePayment.branch == branch_name)
        prev_fees = prev_fee_query.all()
        opening_debit = sum(float(p.amount_paid or 0) for p in prev_fees if p.amount_paid)

        prev_rem_query = RemittanceMaster.query.filter(
            RemittanceMaster.is_active == True,
            RemittanceMaster.status.in_(['Approved', 'Pending']),
            RemittanceMaster.business_date < start_date
        )
        if branch_id:
            prev_rem_query = prev_rem_query.filter(RemittanceMaster.branch_id == branch_id)
        prev_rems = prev_rem_query.all()
        opening_credit = sum(float(r.deposit_amount or 0) for r in prev_rems if r.deposit_amount)

        opening_balance = opening_debit - opening_credit
        running_balance = opening_balance

        result = []
        result.append({
            "particulars": "Opening Balance",
            "debit": 0.0,
            "credit": 0.0,
            "cash_in_hand": round(running_balance, 2),
            "is_opening": True
        })

        for label, yr, mn in months:
            fee_q = FeePayment.query.filter(
                FeePayment.status == 'A',
                FeePayment.payment_mode.in_(['Cash', 'CASH', 'cash']),
                extract('month', FeePayment.payment_date) == mn,
                extract('year', FeePayment.payment_date) == yr
            )
            if branch_name:
                fee_q = fee_q.filter(FeePayment.branch == branch_name)
            month_fees = fee_q.all()
            debit = sum(float(p.amount_paid or 0) for p in month_fees if p.amount_paid)

            rem_q = RemittanceMaster.query.filter(
                RemittanceMaster.is_active == True,
                RemittanceMaster.status.in_(['Approved', 'Pending']),
                extract('month', RemittanceMaster.business_date) == mn,
                extract('year', RemittanceMaster.business_date) == yr
            )
            if branch_id:
                rem_q = rem_q.filter(RemittanceMaster.branch_id == branch_id)
            month_rems = rem_q.all()
            credit = sum(float(r.deposit_amount or 0) for r in month_rems if r.deposit_amount)

            running_balance = running_balance + debit - credit

            month_label = f"{label}-{yr}"
            result.append({
                "particulars": month_label,
                "debit": round(debit, 2),
                "credit": round(credit, 2),
                "cash_in_hand": round(running_balance, 2),
                "is_opening": False
            })

        return jsonify(result), 200
    except Exception as e:
        import logging
        logging.error(f"Error in reconciliation month wise: {str(e)}")
        return jsonify({"error": str(e)}), 500


@bp.route("/api/reports/reconciliation/details", methods=["GET"])
@token_required
def get_reconciliation_details(current_user):
    try:
        academic_year = request.args.get("academic_year") or request.headers.get("X-Academic-Year") or "2026-2027"
        branch_val = request.args.get("branch") or request.args.get("branch_id") or request.headers.get("X-Branch") or current_user.branch
        month_filter = request.args.get("month")

        if not has_global_branch_access(current_user):
            branch_val = current_user.branch

        from routes.remittance_routes import resolve_branch
        branch_id, branch_name = resolve_branch(branch_val)

        try:
            fy_start_year = int(academic_year.split("-")[0])
        except (ValueError, IndexError):
            fy_start_year = 2026
        start_date = datetime(fy_start_year, 4, 1).date()
        end_date = datetime(fy_start_year + 1, 3, 31).date()

        prev_fee_q = FeePayment.query.filter(
            FeePayment.status == 'A',
            FeePayment.payment_mode.in_(['Cash', 'CASH', 'cash']),
            FeePayment.payment_date < start_date
        )
        if branch_name:
            prev_fee_q = prev_fee_q.filter(FeePayment.branch == branch_name)
        opening_debit = sum(float(p.amount_paid or 0) for p in prev_fee_q.all() if p.amount_paid)

        prev_rem_q = RemittanceMaster.query.filter(
            RemittanceMaster.is_active == True,
            RemittanceMaster.status.in_(['Approved', 'Pending']),
            RemittanceMaster.business_date < start_date
        )
        if branch_id:
            prev_rem_q = prev_rem_q.filter(RemittanceMaster.branch_id == branch_id)
        opening_credit = sum(float(r.deposit_amount or 0) for r in prev_rem_q.all() if r.deposit_amount)

        opening_balance = opening_debit - opening_credit

        fee_q = FeePayment.query.options(selectinload(FeePayment.student)).filter(
            FeePayment.status == 'A',
            FeePayment.payment_mode.in_(['Cash', 'CASH', 'cash']),
            FeePayment.payment_date >= start_date,
            FeePayment.payment_date <= end_date
        )
        if branch_name:
            fee_q = fee_q.filter(FeePayment.branch == branch_name)
        all_fees = fee_q.all()

        rem_q = RemittanceMaster.query.filter(
            RemittanceMaster.is_active == True,
            RemittanceMaster.status.in_(['Approved', 'Pending']),
            RemittanceMaster.business_date >= start_date,
            RemittanceMaster.business_date <= end_date
        )
        if branch_id:
            rem_q = rem_q.filter(RemittanceMaster.branch_id == branch_id)
        all_rems = rem_q.all()

        combined = []
        for p in all_fees:
            s_name = "Unknown"
            if p.student:
                s_name = f"{p.student.first_name or ''} {p.student.last_name or ''}".strip()
            fee_desc = f"{p.fee_type or 'Fee'} {p.installment_name or ''}".strip()
            combined.append({
                "date_obj": p.payment_date,
                "created_at": p.created_at if p.created_at else datetime.combine(p.payment_date, datetime.min.time()),
                "date": p.payment_date.strftime("%Y-%m-%d") if p.payment_date else "",
                "date_formatted": p.payment_date.strftime("%d %b %Y") if p.payment_date else "",
                "voucher_no": p.receipt_no or f"RCP-{p.id}",
                "voucher_type": "Fee Receipt",
                "ledger_type": "Student Fee",
                "ledger_head": fee_desc or "Fee Collection",
                "narration": f"Cash fee received from {s_name} (Cls: {p.class_name or ''})",
                "debit": float(p.amount_paid or 0),
                "credit": 0.0,
                "is_opening": False
            })

        for r in all_rems:
            is_bank = (getattr(r, 'deposit_type', 'Corporate Office') == 'Bank')
            l_head = "Bank Deposit" if is_bank else "Corporate Office Deposit"
            
            if is_bank:
                details = f"{r.bank_name or ''} {r.account_number or ''}".strip()
                ref = f"Ref: {r.reference_no}" if getattr(r, 'reference_no', None) else ""
                n_text = f"Bank Deposit ({r.status}) - {details} {ref}".strip()
            else:
                ref = f"Ref: {r.reference_no}" if getattr(r, 'reference_no', None) else ""
                n_text = f"Corporate Office Deposit ({r.status}) {('- ' + ref) if ref else ''} {('- ' + r.remarks) if r.remarks else ''}".strip()

            combined.append({
                "date_obj": r.business_date,
                "created_at": r.created_at if r.created_at else datetime.combine(r.business_date, datetime.min.time()),
                "date": r.business_date.strftime("%Y-%m-%d") if r.business_date else "",
                "date_formatted": r.business_date.strftime("%d %b %Y") if r.business_date else "",
                "voucher_no": r.remittance_no or f"REM-{r.id}",
                "voucher_type": "Remittance Deposit",
                "ledger_type": "Bank / Corporate",
                "ledger_head": l_head,
                "narration": n_text,
                "debit": 0.0,
                "credit": float(r.deposit_amount or 0),
                "is_opening": False
            })

        combined.sort(key=lambda x: (x["date_obj"], x["created_at"]))

        running_bal = opening_balance
        for item in combined:
            running_bal = running_bal + item["debit"] - item["credit"]
            item["cash_in_hand"] = round(running_bal, 2)
            del item["date_obj"]
            del item["created_at"]

        if month_filter and month_filter != 'All' and '-' in month_filter:
            m_str, y_str = month_filter.split('-', 1)
            try:
                y_int = int(y_str)
                m_int = datetime.strptime(m_str, "%b").month
            except ValueError:
                y_int, m_int = None, None

            if y_int and m_int:
                month_start = date(y_int, m_int, 1)
                temp_bal = opening_balance
                filtered_items = []
                for item in combined:
                    if not item["date"]: continue
                    item_date = datetime.strptime(item["date"], "%Y-%m-%d").date()
                    if item_date < month_start:
                        temp_bal = item["cash_in_hand"]
                    elif item_date.year == y_int and item_date.month == m_int:
                        filtered_items.append(item)

                opening_row = {
                    "date": month_start.strftime("%Y-%m-%d"),
                    "date_formatted": f"01 {m_str} {y_str}",
                    "voucher_no": "-",
                    "voucher_type": "Opening Balance",
                    "ledger_type": "-",
                    "ledger_head": f"Opening Balance ({month_filter})",
                    "narration": f"Brought forward cash balance for {month_filter}",
                    "debit": 0.0,
                    "credit": 0.0,
                    "cash_in_hand": round(temp_bal, 2),
                    "is_opening": True
                }
                return jsonify([opening_row] + filtered_items), 200

        fy_opening_row = {
            "date": start_date.strftime("%Y-%m-%d"),
            "date_formatted": start_date.strftime("%d %b %Y"),
            "voucher_no": "-",
            "voucher_type": "Opening Balance",
            "ledger_type": "-",
            "ledger_head": f"FY Opening Balance ({academic_year})",
            "narration": "Brought forward balance before fiscal year start",
            "debit": 0.0,
            "credit": 0.0,
            "cash_in_hand": round(opening_balance, 2),
            "is_opening": True
        }
        return jsonify([fy_opening_row] + combined), 200
    except Exception as e:
        import logging
        logging.error(f"Error in reconciliation details: {str(e)}")
        return jsonify({"error": str(e)}), 500


# pyrefly: ignore [missing-import]
from flask import Blueprint, request, jsonify, g
from models import db, HifzProgram, StudentHifzProgress, Student
import logging

hifz_bp = Blueprint('hifz_bp', __name__)
logger = logging.getLogger(__name__)

# --- Master Settings ---

@hifz_bp.route('/programs', methods=['GET'])
def get_programs():
    try:
        programs = HifzProgram.query.filter_by(is_active=True).all()
        return jsonify([
            {
                "id": p.id,
                "program_name": p.program_name,
                "total_months": p.total_months,
                "total_paras": p.total_paras
            } for p in programs
        ]), 200
    except Exception as e:
        logger.error(f"Error getting Hifz programs: {str(e)}")
        return jsonify({"message": "Error fetching programs"}), 500

@hifz_bp.route('/programs', methods=['POST'])
def create_program():
    try:
        data = request.json
        program = HifzProgram(
            program_name=data['program_name'],
            total_months=int(data['total_months']),
            total_paras=int(data['total_paras']),
            is_active=True
        )
        db.session.add(program)
        db.session.commit()
        return jsonify({"message": "Program created", "id": program.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500

@hifz_bp.route('/programs/<int:prog_id>', methods=['PUT'])
def update_program(prog_id):
    try:
        data = request.json
        program = HifzProgram.query.get_or_404(prog_id)
        program.program_name = data['program_name']
        program.total_months = int(data['total_months'])
        program.total_paras = int(data['total_paras'])
        db.session.commit()
        return jsonify({"message": "Program updated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500

@hifz_bp.route('/programs/<int:prog_id>', methods=['DELETE'])
def delete_program(prog_id):
    try:
        program = HifzProgram.query.get_or_404(prog_id)
        program.is_active = False
        db.session.commit()
        return jsonify({"message": "Program deleted"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500

# --- Bulk Entry API ---

@hifz_bp.route('/students', methods=['GET'])
def get_hifz_students():
    try:
        academic_year = request.headers.get("X-Academic-Year", "2024-2025")
        branch = request.args.get('branch')
        class_name = request.args.get('class_name')
        section = request.args.get('section')
        category = request.args.get('category')
        test_id = request.args.get('test_id')

        query = Student.query.filter_by(academic_year=academic_year, status="Active")
        if branch and branch != "All Branches":
            query = query.filter_by(branch=branch)
        if class_name:
            query = query.filter_by(clazz=class_name)
        if section:
            query = query.filter_by(section=section)
        if category:
            # Map frontend dropdown to database string
            cat_str = "Hifz+Nazira" if category == "Hifz + Nazira" else category
            query = query.filter_by(AdmissionCategory=cat_str)
            
        students = query.all()
        student_ids = [s.student_id for s in students]
        # Batch fetch progress records
        if test_id:
            progress_list = StudentHifzProgress.query.filter(
                StudentHifzProgress.student_id.in_(student_ids),
                StudentHifzProgress.academic_year == academic_year,
                StudentHifzProgress.test_id == test_id
            ).all()
            progress_map = {p.student_id: p for p in progress_list}
        else:
            # Get latest progress per student using subquery
            from sqlalchemy import func
            subq = db.session.query(
                StudentHifzProgress.student_id,
                func.max(StudentHifzProgress.completed_months).label('max_months')
            ).filter(
                StudentHifzProgress.student_id.in_(student_ids),
              StudentHifzProgress.academic_year == academic_year
            ).group_by(StudentHifzProgress.student_id).subquery()
            
            progress_list = StudentHifzProgress.query.join(
                subq,
                (StudentHifzProgress.student_id == subq.c.student_id) &
                (StudentHifzProgress.completed_months == subq.c.max_months)
            ).all()
            progress_map = {p.student_id: p for p in progress_list}
        result = []
        for s in students:
            latest_progress = progress_map.get(s.student_id)
            student_name_str = f"{s.first_name or ''} {s.last_name or ''}".strip()
            result.append({
                "student_id": s.student_id,
                "admission_no": s.admission_no,
                "student_name": student_name_str,
                "class_name": s.clazz,
                "section": s.section,
                "roll_number": s.Roll_Number,
                "category": s.AdmissionCategory,
                "completed_months": latest_progress.completed_months if latest_progress else "",
                "completed_paras": float(latest_progress.completed_paras) if latest_progress else ""
            })
            
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error fetching hifz students: {str(e)}")
        return jsonify({"message": str(e)}), 500

@hifz_bp.route('/bulk-progress', methods=['POST'])
def save_bulk_progress():
    try:
        data = request.json
        academic_year = request.headers.get("X-Academic-Year", "2024-2025")
        entries = data.get("entries", [])
        test_id = data.get("test_id")
        
        for entry in entries:
            student_id = entry.get("student_id")
            months = entry.get("completed_months")
            paras = entry.get("completed_paras")
            
            if months == "" or paras == "":
                continue
                
            months = int(months)
            paras = float(paras)
            
            # Update or insert
            if test_id:
                progress = StudentHifzProgress.query.filter_by(
                    student_id=student_id, test_id=test_id, academic_year=academic_year
                ).first()
            else:
                progress = StudentHifzProgress.query.filter_by(
                    student_id=student_id, completed_months=months, academic_year=academic_year
                ).first()
            
            if progress:
                progress.completed_paras = paras
                progress.completed_months = months
                if test_id:
                    progress.test_id = test_id
            else:
                progress = StudentHifzProgress(
                    student_id=student_id,
                    academic_year=academic_year,
                    test_id=test_id,
                    completed_months=months,
                    completed_paras=paras
                )
                db.session.add(progress)
                
        db.session.commit()
        return jsonify({"message": "Progress saved successfully!"}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving bulk progress: {str(e)}")
        return jsonify({"message": str(e)}), 500

# --- Graph Data Generation ---

def get_graph_data_for_student(student_id):
    """
    Returns dict: { expected: [{month, paras}], actual: [{month, paras}] }
    Falls back to dynamically generating expected graph based on student's category.
    """
    student = Student.query.get(student_id)
    if not student:
        return {"expected": [], "actual": []}
        
    category = (student.AdmissionCategory or "").strip()
    is_nazira = any(k in category.lower() for k in ["nazir", "naizr", "+"])
    
    # Match Hifz+Nazira or Hifz program
    program = None
    if is_nazira:
        program = HifzProgram.query.filter(
            HifzProgram.is_active == True,
            (HifzProgram.program_name == "Hifz+Nazira") | 
            (HifzProgram.program_name == "Hifz + Nazira") |
            (HifzProgram.program_name == "Hifz Nazira") |
            (HifzProgram.program_name.ilike("%nazir%")) |
            (HifzProgram.program_name.ilike("%naizr%"))
        ).first()
    else:
        program = HifzProgram.query.filter(
            HifzProgram.is_active == True,
            (HifzProgram.program_name == "Hifz") |
            (HifzProgram.program_name.ilike("Hifz%"))
        ).first()

    if not program:
        program = HifzProgram.query.filter_by(program_name=category, is_active=True).first()

    total_months = program.total_months if (program and program.total_months > 0) else (30 if is_nazira else 24)
    total_paras = program.total_paras if (program and program.total_paras > 0) else 30
    
    expected = []
    pace = total_paras / total_months
    for m in range(0, total_months + 1):
        expected.append({
            "month": m,
            "paras": min(round(pace * m, 1), total_paras)
        })
            
    # Get actual progress
    progress_records = StudentHifzProgress.query.filter_by(student_id=student_id).order_by(StudentHifzProgress.completed_months).all()
    actual = []
    if progress_records:
        actual.append({"month": 0, "paras": 0})
        for p in progress_records:
            actual.append({
                "month": p.completed_months,
                "paras": float(p.completed_paras)
            })
            
    return {
        "expected": expected,
        "actual": actual
    }

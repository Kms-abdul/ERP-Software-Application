from flask import Blueprint, request, jsonify
from extensions import db
from models import (
    StudentMarks, ClassTest, ClassTestSubject, StudentTestAssignment, 
    StudentSubjectAssignment, Student, StudentAcademicRecord, GradeScale, GradeScaleDetails, ClassMaster
)
from sqlalchemy import and_
import traceback
from datetime import datetime
from helpers import token_required, ensure_student_editable

student_marks_bp = Blueprint('student_marks_bp', __name__)

@student_marks_bp.route('/api/marks/entry/subject', methods=['GET'])
def get_marks_entry_grid():
    try: 
        academic_year = request.args.get('academic_year')
        branch = request.args.get('branch')
        class_id = request.args.get('class_id')
        section = request.args.get('section') # Optional filter
        test_id = request.args.get('test_id') # This is the generic test ID (e.g. "Unit 1" ID)
        subject_id = request.args.get('subject_id')

        if not all([academic_year, branch, class_id, test_id, subject_id]):
            return jsonify({"error": "Missing required parameters"}), 400

        # 1. Resolve ClassTest ID
        # We need to find the specific class_test instance for this class/year/test type
        class_test = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=branch,
            class_id=class_id,
            test_id=test_id
        ).first()

        if not class_test:
            return jsonify({"error": "Test not configured for this class"}), 404

        # 2. Validate Subject is in Test
        test_subject = ClassTestSubject.query.filter_by(
            class_test_id=class_test.id,
            subject_id=subject_id
        ).first()

        if not test_subject:
            return jsonify({"error": "Subject not part of this test"}), 404
            
        subject_total_marks = test_subject.max_marks

        # 2b. Resolve Class Name
        class_obj = ClassMaster.query.get(class_id)
        class_name_val = class_obj.class_name if class_obj else str(class_id)

        # 3. Fetch Students
        # Must be:
        # a) In the class/section (StudentAcademicRecord)
        # b) Assigned to the subject (StudentSubjectAssignment)
        # c) (Optional) Explicitly assigned to test? Relaxing this to allow implicit inclusion.

        query = db.session.query(
            Student.student_id,
            Student.admission_no,
            Student.first_name,
            Student.last_name,
            StudentAcademicRecord.roll_number
        ).join(
            StudentAcademicRecord, Student.student_id == StudentAcademicRecord.student_id
        ).join(
            StudentSubjectAssignment, and_(
                Student.student_id == StudentSubjectAssignment.student_id,
                StudentSubjectAssignment.subject_id == subject_id,
                StudentSubjectAssignment.academic_year == academic_year # Scope subject assign to year
            )
        ).filter(
            StudentAcademicRecord.academic_year == academic_year,
            StudentAcademicRecord.class_name == class_name_val,
            Student.branch == branch, 
            Student.status == 'Active',
            
            # Subject Assignment Checks
            StudentSubjectAssignment.status == True
        )

        if section:
            query = query.filter(StudentAcademicRecord.section == section)

        students = query.all()

        # 4. Fetch Existing Marks
        existing_marks = StudentMarks.query.filter_by(
            class_test_id=class_test.id,
            subject_id=subject_id
        ).all()
        
        marks_map = {m.student_id: {'marks': str(m.marks_obtained) if m.marks_obtained is not None else None, 'is_absent': m.is_absent} for m in existing_marks}

        # 5. Resolve Grading Scale (For UI reference/calculation if needed)
        # We need to find a scale that matches the total marks. Prioritize branch-specific, fall back to "All".
        from sqlalchemy import or_
        grade_scale = GradeScale.query.filter(
            GradeScale.academic_year == academic_year,
            GradeScale.total_marks == subject_total_marks,
            GradeScale.is_active == True,
            or_(GradeScale.branch == branch, GradeScale.branch == 'All', GradeScale.branch == 'AllBranches')
        ).order_by(
            # Sort to prioritize specific branch (assuming 'All' comes last alphabetically or we can check python side)
            # Actually, standard SQL sort might not be enough. Let's strict filter or sort by custom.
            # Simple approach: Fetch all candidates and pick best.
            GradeScale.id.desc() 
        ).all()

        selected_scale = None
        # Logic: Pick exact branch match first, then All
        for gs in grade_scale:
            if gs.branch == branch:
                selected_scale = gs
                break
        
        if not selected_scale and grade_scale:
             selected_scale = grade_scale[0] # Pick first available (likely All)

        grading_details = []
        if selected_scale:
            details = GradeScaleDetails.query.filter_by(grade_scale_id=selected_scale.id).all()
            grading_details = [{
                "grade": d.grade,
                "min": d.min_marks,
                "max": d.max_marks
            } for d in details]

        # Construct Response
        student_list = []
        for s in students:
            # Fallback for null roll numbers
            roll = s.roll_number if s.roll_number else 999999 
            
            mark_data = marks_map.get(s.student_id, {'marks': '', 'is_absent': False})
            
            # Calculate Grade
            grade_str = ""
            marks_val = mark_data['marks']
            if not mark_data['is_absent'] and marks_val is not None and marks_val != "":
                try:
                    m_val = float(marks_val)
                    for g_det in grading_details:
                        if g_det['min'] <= m_val <= g_det['max']:
                            grade_str = g_det['grade']
                            break
                except:
                    pass

            student_list.append({
                "student_id": s.student_id,
                "admission_no": s.admission_no,
                "name": f"{s.first_name} {s.last_name}".strip(),
                "roll_number": roll,
                "marks_obtained": mark_data['marks'],
                "is_absent": mark_data['is_absent'],
                "grade": grade_str
            })

        # Sort by roll number
        student_list.sort(key=lambda x: x['roll_number'])

        return jsonify({
            "class_test_id": class_test.id,
            "subject_total_marks": subject_total_marks,
            "students": student_list,
            "grading_scale": grading_details
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@student_marks_bp.route('/api/marks/entry/subject', methods=['POST'])
@token_required
def save_marks_entry(current_user):
    try:
        data = request.json
        class_test_id = data.get('class_test_id')
        subject_id = data.get('subject_id')
        marks_data = data.get('marks', [])
        
        # Context for audit/snapshot
        academic_year = data.get('academic_year')
        branch = data.get('branch')
        class_id = data.get('class_id')
        section = data.get('section')

        if not all([class_test_id, subject_id, academic_year, branch]):
             return jsonify({"error": "Missing context data"}), 400

        # Validate total marks for safety
        test_subject = ClassTestSubject.query.filter_by(
            class_test_id=class_test_id,
            subject_id=subject_id
        ).first()
        
        if not test_subject:
            return jsonify({"error": "Invalid Test/Subject combination"}), 400
            
        max_marks = test_subject.max_marks

        for entry in marks_data:
            student_id = entry.get('student_id')
            raw_value = entry.get('value') # Can be "15", "AB", "ab", ""

            is_absent = False
            marks_obtained = None

            if raw_value is None or raw_value == "":
                # Skip or clear? Let's assume clear (delete) or set to null
                # For now, we update to None/False
                pass
            else:
                try:
                    if str(raw_value).upper() == 'AB':
                        is_absent = True
                        marks_val = 0 # Store 0 for absent? Or None? usually 0 or None. Let's keep 0 but flag absent.
                    else:
                        # Enforce Integer
                        # We use float first to catch "14.0" then round/int
                        marks_val = int(round(float(raw_value)))
                        is_absent = False
                    
                    if marks_val < 0 or marks_val > max_marks:
                        return jsonify({"error": f"Marks for student {student_id} out of range (0-{max_marks})"}), 400
                    marks_obtained = marks_val
                except ValueError:
                    return jsonify({"error": f"Invalid format for student {student_id}: {raw_value}"}), 400

            # Upsert
            existing = StudentMarks.query.filter_by(
                student_id=student_id,
                class_test_id=class_test_id,
                subject_id=subject_id
            ).first()

            if existing:
                existing.marks_obtained = marks_obtained
                existing.is_absent = is_absent
            else:
                new_entry = StudentMarks(
                    student_id=student_id,
                    class_test_id=class_test_id,
                    subject_id=subject_id,
                    marks_obtained=marks_obtained,
                    is_absent=is_absent,
                    academic_year=academic_year,
                    branch=branch,
                    class_id=class_id,
                    section=section
                )
                db.session.add(new_entry)

        db.session.commit()
        return jsonify({"message": "Marks saved successfully"}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

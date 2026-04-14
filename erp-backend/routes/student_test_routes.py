from flask import Blueprint, request, jsonify
from extensions import db
import logging

logger = logging.getLogger(__name__)
from models import Student, ClassTest, StudentTestAssignment, StudentAcademicRecord, ClassMaster, TestType
from helpers import token_required, ensure_student_editable

student_test_bp = Blueprint('student_test', __name__)  

@student_test_bp.route('/student-test-assignments', methods=['GET'])
def get_assignments():
    try:
        branch = request.args.get('branch_id')
        class_id = request.args.get('class_id')
        academic_year = request.args.get('academic_year_id')

        if not all([branch, class_id, academic_year]):
            return jsonify({'error': 'Missing required filters'}), 400

        # 1. Fetch ClassTests (Columns)
        tests = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=branch,
            class_id=class_id,
            status=True
        ).order_by(ClassTest.test_order).all()

        # Fetch Test Names efficiently
        if tests:
            test_ids = [t.test_id for t in tests]
            test_types = TestType.query.filter(TestType.id.in_(test_ids)).all()
            test_map = {tt.id: tt.test_name for tt in test_types}
        else:
            test_map = {}
        
        final_test_columns = []
        for t in tests:
            final_test_columns.append({
                'class_test_id': t.id,
                'test_name': test_map.get(t.test_id, f"Test {t.test_id}"),
                'test_order': t.test_order
            })


        # 2. Fetch Students (Rows)
        # Map class_id to class_name
        cls_obj = ClassMaster.query.get(class_id)
        if not cls_obj:
            return jsonify({'error': 'Invalid Class ID'}), 400
            
        class_name_str = cls_obj.class_name
        
        # Query StudentAcademicRecord joined with Student
        # Filter by Academic Year, Class Name, and Student's Branch
        students_query = db.session.query(
            Student.student_id, 
            Student.first_name, 
            Student.last_name, 
            StudentAcademicRecord.roll_number,
            StudentAcademicRecord.section,
            Student.admission_no
        ).join(StudentAcademicRecord, Student.student_id == StudentAcademicRecord.student_id)\
         .filter(
             StudentAcademicRecord.academic_year == academic_year,
             StudentAcademicRecord.class_name == class_name_str,
             Student.branch == branch
         )
         
        students = students_query.order_by(StudentAcademicRecord.section, StudentAcademicRecord.roll_number).all()
        
        student_list = []
        for s in students:
            student_list.append({
                'student_id': s.student_id,
                'name': f"{s.first_name} {s.last_name or ''}".strip(),
                'roll_number': s.roll_number,
                'admission_no': s.admission_no,
                'section': s.section
            })

        # 3. Fetch Assignments (Matrix Data)
        if tests:
            assignments = StudentTestAssignment.query.filter_by(
                academic_year=academic_year,
                branch=branch
            ).filter(StudentTestAssignment.class_test_id.in_([t.id for t in tests])).all()
        else:
            assignments = []
        
        # Map: student_id -> class_test_id -> bool
        assignment_map = {}
        for a in assignments:
            if a.status:
                if a.student_id not in assignment_map:
                    assignment_map[a.student_id] = []
                assignment_map[a.student_id].append(a.class_test_id)

        return jsonify({
            'columns': final_test_columns,
            'rows': student_list,
            'assignments': assignment_map
        })

    except Exception as e:
        logger.error(f"Error fetching student test assignments: {str(e)}")
        return jsonify({'error': str(e)}), 500

@student_test_bp.route('/student-test-assignments', methods=['POST'])
@token_required
def save_assignments(current_user):
    try:
        data = request.json
        academic_year = data.get('academic_year_id')
        branch = data.get('branch_id')
        # update_list = [ {student_id, class_test_id, status}, ... ]
        update_list = data.get('updates', [])
        
        if not update_list:
             return jsonify({'message': 'No changes to save'}), 200
             
        for update in update_list:
            try:
                ensure_student_editable(update['student_id'], academic_year)
            except Exception as e:
                return jsonify({"error": str(e)}), 403

        for update in update_list:
            student_id = update.get('student_id')
            class_test_id = update.get('class_test_id')
            status = update.get('status')
            
            # Upsert
            existing = StudentTestAssignment.query.filter_by(
                student_id=student_id,
                class_test_id=class_test_id
            ).first()
            
            if existing:
                existing.status = status
            else:
                new_assign = StudentTestAssignment(
                    student_id=student_id,
                    class_test_id=class_test_id,
                    academic_year=academic_year,
                    branch=branch,
                    status=status
                )
                db.session.add(new_assign)
        
        db.session.commit()
        return jsonify({'message': 'Assignments saved successfully'}), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving student test assignments: {str(e)}")
        return jsonify({'error': str(e)}), 500

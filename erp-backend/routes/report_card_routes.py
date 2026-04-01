from flask import Blueprint, request, jsonify
from datetime import datetime
import mysql.connector
from mysql.connector import Error 
import os
import logging
from helpers import token_required
from models import Branch, UserBranchAccess

report_bp = Blueprint('report', __name__)
logger = logging.getLogger(__name__)


def resolve_branch_scope(current_user, requested_branch=None):
    if current_user.role == "Admin" or current_user.branch == "All":
        return requested_branch

    if requested_branch and requested_branch not in ["All", "All Branches", current_user.branch]:
        branch_obj = Branch.query.filter(
            (Branch.branch_code == requested_branch) | (Branch.branch_name == requested_branch)
        ).first()
        if branch_obj:
            access = UserBranchAccess.query.filter_by(
                user_id=current_user.user_id,
                branch_id=branch_obj.id,
                is_active=True
            ).first()
            if access:
                return branch_obj.branch_name

    return current_user.branch


def ensure_student_branch_access(current_user, student_branch):
    if current_user.role == "Admin" or current_user.branch == "All":
        return True
    if not student_branch:
        return False
    if student_branch == current_user.branch:
        return True

    branch_obj = Branch.query.filter(
        (Branch.branch_code == student_branch) | (Branch.branch_name == student_branch)
    ).first()
    if not branch_obj:
        return False

    if current_user.branch in [branch_obj.branch_code, branch_obj.branch_name]:
        return True

    access = UserBranchAccess.query.filter_by(
        user_id=current_user.user_id,
        branch_id=branch_obj.id,
        is_active=True
    ).first()
    return access is not None

def get_db_connection():
    """Create database connection"""
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        port=int(os.getenv('DB_PORT', 3306))
    )
# ============== GET STUDENTS FOR DROPDOWN ==============
@report_bp.route('/api/students', methods=['GET'])
@token_required
def get_students(current_user):
    """Get students by branch, class, section for dropdown"""
    branch = resolve_branch_scope(current_user, request.args.get('branch'))
    class_name = request.args.get('class')
    section = request.args.get('section')
    academic_year = request.args.get('academic_year')
    
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT DISTINCT
                s.student_id as id,
                s.student_id,
                CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as name,
                CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as student_name,
                s.Fatherfirstname as father_name,
                COALESCE(sar.roll_number, s.Roll_Number) as roll_number,
                s.admission_no
            FROM students s
            LEFT JOIN student_academic_records sar 
                ON s.student_id = sar.student_id AND sar.academic_year = %s
            WHERE s.status = 'Active'
        """
        params = [academic_year]
        
        if branch and branch != 'All':
            query += " AND s.branch = %s"
            params.append(branch)
        
        if class_name:
            query += " AND (sar.class = %s OR s.class = %s)"
            params.extend([class_name, class_name])
        
        if section:
            query += " AND (sar.section = %s OR s.section = %s)"
            params.extend([section, section])
        
        query += " ORDER BY COALESCE(sar.roll_number, s.Roll_Number)"
        
        cursor.execute(query, params)
        students = cursor.fetchall()
        
        return jsonify({'students': students})
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============== GET COMPLETE STUDENT REPORT ==============
@report_bp.route('/api/report/student', methods=['GET'])
@token_required
def get_student_report(current_user):
    """Get complete student report data"""
    student_id = request.args.get('student_id')
    test_id = request.args.get('test_id')
    academic_year = request.args.get('academic_year')
    branch = request.args.get('branch')
    class_id = request.args.get('class_id')
    section = request.args.get('section')
    
    if not student_id or not test_id:
        return jsonify({'error': 'student_id and test_id are required'}), 400
    
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # ========== 1. Get Student Details ==========
        student_query = """
            SELECT 
                s.student_id,
                CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as student_name,
                s.Fatherfirstname as father_name,
                s.branch as raw_branch,
                COALESCE(b.branch_code, s.branch) as branch_code,
                COALESCE(b.branch_name, s.branch) as branch_name,
                COALESCE(sar.class, s.class) as class_name,
                COALESCE(sar.section, s.section) as section,
                COALESCE(sar.roll_number, s.Roll_Number) as roll_number,
                s.admission_no,
                s.location
            FROM students s
            LEFT JOIN student_academic_records sar 
                ON s.student_id = sar.student_id AND sar.academic_year = %s
            LEFT JOIN branches b ON (s.branch = b.branch_code OR s.branch = b.branch_name)
            WHERE s.student_id = %s
        """
        cursor.execute(student_query, (academic_year, student_id))
        student = cursor.fetchone()
        
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if not ensure_student_branch_access(current_user, student.get('raw_branch') or student.get('branch_name')):
            return jsonify({'error': 'Unauthorized'}), 403
        
        # ========== 2. Get Test Details and class_test_id ==========
        # Input test_id is expected to be the test_type_id (e.g. 1 for FA-1, 2 for FA-2)
        test_query = """
            SELECT ct.id as class_test_id, tt.test_name, tt.id as test_type_id
            FROM class_test ct
            JOIN testtype tt ON ct.test_id = tt.id
            WHERE ct.test_id = %s 
              AND ct.class_id = %s 
              AND ct.academic_year = %s 
              AND ct.branch = %s
        """
        # ClassTest uses Branch Name (e.g. "Murad Nagar") typically.
        # We use the raw branch or resolved name.
        query_branch = student['branch_name'] if student else branch
        
        cursor.execute(test_query, (test_id, class_id, academic_year, query_branch))
        test = cursor.fetchone()
        
        if not test:
            # Try without branch restriction
            test_query_alt = """
                SELECT ct.id as class_test_id, tt.test_name, tt.id as test_type_id
                FROM class_test ct
                JOIN testtype tt ON ct.test_id = tt.id
                WHERE ct.test_id = %s 
                  AND ct.class_id = %s 
                  AND ct.academic_year = %s
                LIMIT 1
            """
            cursor.execute(test_query_alt, (test_id, class_id, academic_year))
            test = cursor.fetchone()
            
            if not test:
                logger.warning(
                    "Report lookup failed for test_id=%s class_id=%s academic_year=%s branch=%s",
                    test_id, class_id, academic_year, query_branch
                )
                return jsonify({'error': 'Test not found for this class'}), 404

        class_test_id = test['class_test_id']
        current_test_name = test['test_name']
        
        # ========== 3. Get All Grading Scales ==========
        grading_query = """
            SELECT gs.id, gs.total_marks, gsd.grade, gsd.min_marks, gsd.max_marks
            FROM grade_scales gs
            JOIN grade_scale_details gsd ON gs.id = gsd.grade_scale_id
            WHERE gs.academic_year = %s 
              AND gs.is_active = 1 
              AND gsd.is_active = 1
            ORDER BY gs.total_marks, gsd.min_marks
        """
        cursor.execute(grading_query, (academic_year,))
        grading_rows = cursor.fetchall()
        
        # Group grading by total_marks
        grading_by_total = {}
        for row in grading_rows:
            total = row['total_marks']
            if total not in grading_by_total:
                grading_by_total[total] = []
            grading_by_total[total].append(row)
        
        # ========== 4. Get all subjects for this test with marks ==========
        subjects_query = """
            SELECT 
                sm.id as subject_id,
                sm.subject_name,
                sm.subject_name_urdu,
                sm.subject_type,
                cts.max_marks,
                cts.subject_order,
                stm.marks_obtained as secured_marks,
                COALESCE(stm.is_absent, 0) as is_absent
            FROM class_test_subjects cts
            JOIN subjectmaster sm ON cts.subject_id = sm.id
            LEFT JOIN student_marks stm ON stm.class_test_id = cts.class_test_id 
                AND stm.subject_id = sm.id 
                AND stm.student_id = %s
            WHERE cts.class_test_id = %s
            ORDER BY cts.subject_order
        """
        cursor.execute(subjects_query, (student_id, class_test_id))
        subjects = cursor.fetchall()

        avg_query = """
            SELECT subject_id, AVG(marks_obtained) as class_avg
            FROM student_marks
            WHERE class_test_id = %s AND is_absent = 0
            GROUP BY subject_id
        """
        cursor.execute(avg_query, (class_test_id,))
        avg_rows = cursor.fetchall()
        avg_map = {row['subject_id']: round(float(row['class_avg'] or 0), 1) for row in avg_rows}
        for subject in subjects:
            subject['class_average'] = avg_map.get(subject['subject_id'], 0)
        
        # ========== Helper function to get grade ==========
        def get_grade(marks, max_marks, require_exact_scale=False):
            if marks is None or max_marks is None or max_marks == 0:
                return '-'
            
            marks = float(marks)
            
            # Find the grading scale for this max_marks
            scale = grading_by_total.get(max_marks, [])
            
            if not scale:
                # If require_exact_scale is True, return '-' if no exact match
                if require_exact_scale:
                    return '-'
                    
                # Try to find closest scale
                closest_total = None
                for total in sorted(grading_by_total.keys()):
                    if total >= max_marks:
                        closest_total = total
                        break
                
                if closest_total:
                    scale = grading_by_total[closest_total]
                    # Proportionally adjust marks
                    marks = (marks / max_marks) * closest_total
                elif grading_by_total:
                    # Use highest available scale
                    highest_total = max(grading_by_total.keys())
                    scale = grading_by_total[highest_total]
                    marks = (marks / max_marks) * highest_total
                else:
                    return '-'
            
            for grade_info in scale:
                if grade_info['min_marks'] <= marks <= grade_info['max_marks']:
                    return grade_info['grade']
            
            return '-'
        
        # ========== Separate Hifz and Academic subjects ==========
        hifz_data = []
        academic_data = []
        colors = ['#4ade80', '#38bdf8', '#f472b6', '#facc15', '#a78bfa', '#fb923c', '#f87171', '#34d399']
        
        hifz_total_marks = 0
        hifz_secured_marks = 0
        academic_total_marks = 0
        academic_secured_marks = 0
        
        color_idx = 0
        for subject in subjects:
            is_absent = subject['is_absent'] == 1
            secured = 0 if is_absent else float(subject['secured_marks'] or 0)
            max_marks = subject['max_marks']
            # Use require_exact_scale=True to only show grades when exact scale exists
            # For absent students, grade should be '-', not 'AB'
            grade = '-' if is_absent else get_grade(secured, max_marks, require_exact_scale=True)
            percentage = 0 if max_marks == 0 else round((secured / max_marks) * 100)
            
            if subject['subject_type'] == 'Hifz':
                hifz_total_marks += max_marks
                hifz_secured_marks += secured
                hifz_data.append({
                    'subject': subject['subject_name'],
                    'urduSubject': subject['subject_name_urdu'] or '',
                    'totalMarks': max_marks,
                    'securedMarks': 'AB' if is_absent else int(secured),  # Show 'AB' in marks column
                    'classMarks': int(subject['class_average']),
                    'grade': grade
                })
            else:
                academic_total_marks += max_marks
                academic_secured_marks += secured
                academic_data.append({
                    'subject': subject['subject_name'],
                    'urduSubject': subject['subject_name_urdu'] or '',
                    'totalMarks': max_marks,
                    'securedMarks': 'AB' if is_absent else int(secured),  # Show 'AB' in marks column
                    'percentage': percentage,
                    'grade': grade,
                    'color': colors[color_idx % len(colors)]
                })
                color_idx += 1
        
        # Add totals to hifz data
        if hifz_data:
            hifz_grade = get_grade(hifz_secured_marks, hifz_total_marks, require_exact_scale=True) if hifz_total_marks > 0 else '-'
            hifz_data.append({
                'subject': 'Total/Grade',
                'urduSubject': 'کل/گریڈ',
                'totalMarks': hifz_total_marks,
                'securedMarks': int(hifz_secured_marks),
                'classMarks': 0,
                'grade': hifz_grade
            })
        
        # Add totals to academic data
        if academic_data:
            academic_grade = get_grade(academic_secured_marks, academic_total_marks, require_exact_scale=True) if academic_total_marks > 0 else '-'
            academic_percentage = round((academic_secured_marks / academic_total_marks) * 100) if academic_total_marks > 0 else 0
            academic_data.append({
                'subject': 'Total/Grade',
                'urduSubject': 'کل/گریڈ',
                'totalMarks': academic_total_marks,
                'securedMarks': int(academic_secured_marks),
                'percentage': academic_percentage,
                'grade': academic_grade,
                'color': '#6b7280'  # Gray color for total
            })
        
        # ========== 5. Get Attendance Data ==========
        # Check for mapped months first
        # We need the class_id from the student record or the input params. Using 'class_id' from earlier query logic.
        # But wait, class_id passed as arg might be empty if we rely on student's current class?
        # The 'class_id' arg to this function is used for filtering. If student is in class 6, we use '6'.
        # However, we resolved 'class_id' for the test earlier. Let's use that or the student's class.
        
        # In get_report_card: 
        # class_id variable comes from request.args. 
        # student variable has class_name (e.g. "6"). 
        # But we need integer ID for mapping? 
        # Looking at models, TestAttendanceMonth.class_id is Integer.
        # ClassMaster has id and class_name.
        # We need to resolve class_name to class_id if we don't have it.
        
        # Let's quickly fetch class_id if we only have class name
        resolved_class_id = class_id
        if not resolved_class_id and student:
             # Try to find class_id from student's class name
             # This requires a query. Or we can just use the input 'class_id' if guaranteed to be present.
             pass
             
        # Actually simplest is: the UI passes class_id. The report request has class_id.
        # If class_id is missing (searching by admission no?), we might have issues.
        # But standard flow has class_id.
        
        mapping_query = """
            SELECT month, year 
            FROM test_attendance_months 
            WHERE test_id = %s 
              AND academic_year = %s
              AND branch = %s
              AND class_id = %s
        """
        # Ensure we use the correct branch code from the student record
        # This avoids issues if the request param was Branch Name or mismatched
        mapping_branch = student['branch_code'] if student and 'branch_code' in student else branch
        
        cursor.execute(mapping_query, (test_id, academic_year, mapping_branch, class_id))
        mapped_months = cursor.fetchall()
        if not mapped_months:  
    # Return empty attendance data when no months are mapped  
            monthly_attendance = []  
            total_present = 0  
            total_absent = 0  
            total_days = 0  
        else:  
            attendance_query = """  
                SELECT   
                MONTHNAME(date) as month_name,  
                MONTH(date) as month_num,  
                YEAR(date) as year_num,  
                COUNT(*) as total,  
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,  
                SUM(CASE WHEN status IN ('Absent', 'Leave') THEN 1 ELSE 0 END) as absent  
            FROM attendance  
            WHERE student_id = %s AND academic_year = %s  
            """  
        att_params = [student_id, academic_year]  
      
        conditions = []  
        for m in mapped_months:  
            conditions.append(f"(MONTH(date) = {m['month']} AND YEAR(date) = {m['year']})")  
      
        if conditions:  
            attendance_query += " AND (" + " OR ".join(conditions) + ")"  
  
        attendance_query += " GROUP BY YEAR(date), MONTH(date), MONTHNAME(date) ORDER BY YEAR(date), MONTH(date)"  
      
        cursor.execute(attendance_query, tuple(att_params))  
        attendance_rows = cursor.fetchall()  
      
        monthly_attendance = []  
        total_present = 0  
        total_absent = 0  
        total_days = 0  
      
        for row in attendance_rows:  
            monthly_attendance.append({  
                'month': row['month_name'][:3],  
                'total': int(row['total']),  
                'present': int(row['present']),  
                'absent': int(row['absent'])  
            })  
            total_present += int(row['present'])  
            total_absent += int(row['absent'])  
            total_days += int(row['total'])
        
        # ========== 6. Get Student's Academic History ==========
        history_query = """
            SELECT 
                sar.academic_year,
                sar.class,
                sar.section,
                sar.roll_number,
                sar.is_promoted,
                DATE_FORMAT(sar.promoted_date, '%%Y-%%m-%%d') as promoted_date,
                DATE_FORMAT(sar.created_at, '%%Y-%%m-%%d') as enrolled_date
            FROM student_academic_records sar
            WHERE sar.student_id = %s
            ORDER BY sar.academic_year DESC
        """
        cursor.execute(history_query, (student_id,))
        academic_history = cursor.fetchall()
        
        # ========== 7. Get Historical Marks (Previous Years) ==========
        historical_performance = []
        for history in academic_history:
            hist_year = history['academic_year']
            hist_class = history['class']
            
            # Get marks for this academic year
            hist_marks_query = """
                SELECT 
                    tt.test_name,
                    sm.subject_name,
                    sm.subject_type,
                    cts.max_marks,
                    stm.marks_obtained,
                    stm.is_absent
                FROM student_marks stm
                JOIN class_test ct ON stm.class_test_id = ct.id
                JOIN testtype tt ON ct.test_id = tt.id
                JOIN subjectmaster sm ON stm.subject_id = sm.id
                JOIN class_test_subjects cts ON cts.class_test_id = ct.id AND cts.subject_id = sm.id
                WHERE stm.student_id = %s AND stm.academic_year = %s
                ORDER BY tt.display_order, cts.subject_order
            """
            cursor.execute(hist_marks_query, (student_id, hist_year))
            hist_marks = cursor.fetchall()
            
            if hist_marks:
                # Group by test
                tests_data = {}
                for mark in hist_marks:
                    test_name = mark['test_name']
                    if test_name not in tests_data:
                        tests_data[test_name] = {
                            'testName': test_name,
                            'subjects': [],
                            'totalMarks': 0,
                            'securedMarks': 0
                        }
                    
                    secured = 0 if mark['is_absent'] else float(mark['marks_obtained'] or 0)
                    max_marks = mark['max_marks']
                    
                    tests_data[test_name]['subjects'].append({
                        'subject': mark['subject_name'],
                        'type': mark['subject_type'],
                        'maxMarks': max_marks,
                        'securedMarks': int(secured),
                        'isAbsent': mark['is_absent'] == 1
                    })
                    tests_data[test_name]['totalMarks'] += max_marks
                    tests_data[test_name]['securedMarks'] += secured
                
                historical_performance.append({
                    'academicYear': hist_year,
                    'class': hist_class,
                    'section': history['section'],
                    'tests': list(tests_data.values())
                })
        
        # ========== Build Grading Scales for Display ==========
        grading_scales = []
        for total_marks in sorted(grading_by_total.keys()):
            grades = grading_by_total[total_marks]
            # Sort by max_marks to get proper order
            sorted_grades = sorted(grades, key=lambda x: x['max_marks'])
            values = [0]
            for g in sorted_grades:
                values.append(g['max_marks'])
            grading_scales.append({
                'label': str(total_marks),
                'values': values,
                'colors': []
            })
        
        # Default grading scale if none found
        if not grading_scales:
            grading_scales = [{
                'label': '20',
                'values': [0, 7, 8, 10, 12, 14, 16, 18, 20],
                'colors': []
            }]
        
        # ========== Build Final Response ==========
        response = {
            'reportTitle': f"PROGRESS REPORT OF {current_test_name.upper()}",
            'student': {
                'studentName': student['student_name'].strip(),
                'fathersName': student['father_name'] or '',
                'classSection': f"{student['class_name']} {student['section'] or ''}".strip(),
                'groupRollNo': str(student['roll_number'] or ''),
                'branchName': student['branch_name'] or '',
                'academicYear': academic_year
            },
            'gradingScales': grading_scales,
            'hifzData': hifz_data,
            'academicPerformance': academic_data,
            'attendance': {
                'monthly': monthly_attendance,
                'summary': {
                    'presentCount': total_present,
                    'presentPercentage': round((total_present / total_days) * 100, 1) if total_days > 0 else 0,
                    'absentCount': total_absent,
                    'absentPercentage': round((total_absent / total_days) * 100, 1) if total_days > 0 else 0,
                    'totalCount': total_days
                }
            },
            'hifzTargetLevel': [],  # Keep empty as per requirement
            'teacherRemark': '',     # Keep empty as per requirement
            'academicHistory': academic_history,
            'historicalPerformance': historical_performance
        }
        
        return jsonify(response)
        
    except Error as e:
        logger.exception("Database error while building student report")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logger.exception("Unexpected error while building student report")
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============== GET STUDENT HISTORY ACROSS YEARS ==============
@report_bp.route('/api/report/student/history', methods=['GET'])
@token_required
def get_student_history(current_user):
    """Get student's complete academic history across all years"""
    student_id = request.args.get('student_id')
    
    if not student_id:
        return jsonify({'error': 'student_id is required'}), 400
    
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Get student basic info
        student_query = """
            SELECT 
                s.student_id,
                CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as student_name,
                s.Fatherfirstname as father_name,
                s.admission_no,
                s.branch,
                s.location
            FROM students s
            WHERE s.student_id = %s
        """
        cursor.execute(student_query, (student_id,))
        student = cursor.fetchone()
        
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if not ensure_student_branch_access(current_user, student.get('branch')):
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get all academic records
        records_query = """
            SELECT 
                sar.academic_year,
                sar.class,
                sar.section,
                sar.roll_number,
                sar.is_promoted,
                DATE_FORMAT(sar.promoted_date, '%%Y-%%m-%%d') as promoted_date,
                DATE_FORMAT(sar.created_at, '%%Y-%%m-%%d') as enrolled_date
            FROM student_academic_records sar
            WHERE sar.student_id = %s
            ORDER BY sar.academic_year
        """
        cursor.execute(records_query, (student_id,))
        records = cursor.fetchall()
        
        # Get all marks grouped by year
        all_years_data = []
        
        for record in records:
            year = record['academic_year']
            
            # Get all tests for this year
            tests_query = """
                SELECT DISTINCT
                    ct.id as class_test_id,
                    tt.test_name,
                    tt.display_order
                FROM student_marks stm
                JOIN class_test ct ON stm.class_test_id = ct.id
                JOIN testtype tt ON ct.test_id = tt.id
                WHERE stm.student_id = %s AND stm.academic_year = %s
                ORDER BY tt.display_order
            """
            cursor.execute(tests_query, (student_id, year))
            tests = cursor.fetchall()
            
            year_tests = []
            for test in tests:
                # Get subjects and marks for this test
                marks_query = """
                    SELECT 
                        sm.subject_name,
                        sm.subject_type,
                        sm.subject_name_urdu,
                        cts.max_marks,
                        stm.marks_obtained,
                        stm.is_absent
                    FROM student_marks stm
                    JOIN subjectmaster sm ON stm.subject_id = sm.id
                    JOIN class_test_subjects cts ON cts.class_test_id = stm.class_test_id 
                        AND cts.subject_id = sm.id
                    WHERE stm.student_id = %s 
                      AND stm.class_test_id = %s
                    ORDER BY cts.subject_order
                """
                cursor.execute(marks_query, (student_id, test['class_test_id']))
                subjects = cursor.fetchall()
                
                total_max = 0
                total_secured = 0
                subject_list = []
                
                for subj in subjects:
                    max_m = subj['max_marks']
                    secured = 0 if subj['is_absent'] else float(subj['marks_obtained'] or 0)
                    total_max += max_m
                    total_secured += secured
                    
                    subject_list.append({
                        'subject': subj['subject_name'],
                        'subjectUrdu': subj['subject_name_urdu'],
                        'type': subj['subject_type'],
                        'maxMarks': max_m,
                        'securedMarks': int(secured),
                        'percentage': round((secured / max_m) * 100) if max_m > 0 else 0,
                        'isAbsent': subj['is_absent'] == 1
                    })
                
                year_tests.append({
                    'testName': test['test_name'],
                    'subjects': subject_list,
                    'totalMaxMarks': total_max,
                    'totalSecuredMarks': int(total_secured),
                    'overallPercentage': round((total_secured / total_max) * 100) if total_max > 0 else 0
                })
            
            # Get attendance for this year
            att_query = """
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
                    SUM(CASE WHEN status IN ('Absent', 'Leave') THEN 1 ELSE 0 END) as absent
                FROM attendance
                WHERE student_id = %s AND academic_year = %s
            """
            cursor.execute(att_query, (student_id, year))
            att = cursor.fetchone()
            
            all_years_data.append({
                'academicYear': year,
                'class': record['class'],
                'section': record['section'],
                'rollNumber': record['roll_number'],
                'isPromoted': record['is_promoted'] == 1,
                'promotedDate': record['promoted_date'],
                'enrolledDate': record['enrolled_date'],
                'tests': year_tests,
                'attendance': {
                    'total': int(att['total'] or 0),
                    'present': int(att['present'] or 0),
                    'absent': int(att['absent'] or 0),
                    'percentage': round((int(att['present'] or 0) / int(att['total'] or 1)) * 100, 1)
                }
            })
        
        response = {
            'student': {
                'id': student['student_id'],
                'name': student['student_name'].strip(),
                'fatherName': student['father_name'],
                'admissionNo': student['admission_no'],
                'branch': student['branch'],
                'location': student['location']
            },
            'academicJourney': all_years_data
        }
        
        return jsonify(response)
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============== GET REPORT WITH SPECIFIC ACADEMIC YEAR (For Historical Reports) ==============
@report_bp.route('/api/report/student/year', methods=['GET'])
@token_required
def get_student_report_by_year(current_user):
    """Get student report for a specific academic year (for historical data)"""
    student_id = request.args.get('student_id')
    academic_year = request.args.get('academic_year')
    test_id = request.args.get('test_id')  # Optional, if not provided returns all tests
    
    if not student_id or not academic_year:
        return jsonify({'error': 'student_id and academic_year are required'}), 400
    
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Get student's record for that year
        record_query = """
            SELECT 
                s.student_id,
                CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) as student_name,
                s.Fatherfirstname as father_name,
                s.admission_no,
                COALESCE(b.branch_name, s.branch) as branch_name,
                sar.class as class_name,
                sar.section,
                sar.roll_number,
                sar.is_promoted
            FROM students s
            JOIN student_academic_records sar ON s.student_id = sar.student_id
            LEFT JOIN branches b ON s.branch = b.branch_code
            WHERE s.student_id = %s AND sar.academic_year = %s
        """
        cursor.execute(record_query, (student_id, academic_year))
        student = cursor.fetchone()
        
        if not student:
            return jsonify({'error': 'No record found for this student in the specified academic year'}), 404
        if not ensure_student_branch_access(current_user, student.get('branch_name')):
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get grading scales
        grading_query = """
            SELECT gs.total_marks, gsd.grade, gsd.min_marks, gsd.max_marks
            FROM grade_scales gs
            JOIN grade_scale_details gsd ON gs.id = gsd.grade_scale_id
            WHERE gs.academic_year = %s AND gs.is_active = 1
            ORDER BY gs.total_marks, gsd.min_marks
        """
        cursor.execute(grading_query, (academic_year,))
        grading_rows = cursor.fetchall()
        
        grading_by_total = {}
        for row in grading_rows:
            total = row['total_marks']
            if total not in grading_by_total:
                grading_by_total[total] = []
            grading_by_total[total].append(row)
        
        def get_grade(marks, max_marks):
            if marks is None or max_marks is None or max_marks == 0:
                return 'E'
            marks = float(marks)
            scale = grading_by_total.get(max_marks, [])
            if not scale:
                for total in sorted(grading_by_total.keys()):
                    if total >= max_marks:
                        scale = grading_by_total[total]
                        marks = (marks / max_marks) * total
                        break
            for g in scale:
                if g['min_marks'] <= marks <= g['max_marks']:
                    return g['grade']
            return 'E'
        
        # Get tests taken in this year
        tests_query = """
            SELECT DISTINCT
                ct.id as class_test_id,
                ct.test_id,
                tt.test_name,
                tt.display_order
            FROM student_marks stm
            JOIN class_test ct ON stm.class_test_id = ct.id
            JOIN testtype tt ON ct.test_id = tt.id
            WHERE stm.student_id = %s AND stm.academic_year = %s
        """
        params = [student_id, academic_year]
        
        if test_id:
            tests_query += " AND ct.test_id = %s"
            params.append(test_id)
        
        tests_query += " ORDER BY tt.display_order"
        
        cursor.execute(tests_query, params)
        tests = cursor.fetchall()
        
        all_tests_data = []
        
        for test in tests:
            # Get subjects and marks
            marks_query = """
                SELECT 
                    sm.id as subject_id,
                    sm.subject_name,
                    sm.subject_name_urdu,
                    sm.subject_type,
                    cts.max_marks,
                    stm.marks_obtained,
                    stm.is_absent
                FROM student_marks stm
                JOIN subjectmaster sm ON stm.subject_id = sm.id
                JOIN class_test_subjects cts ON cts.class_test_id = stm.class_test_id 
                    AND cts.subject_id = sm.id
                WHERE stm.student_id = %s AND stm.class_test_id = %s
                ORDER BY cts.subject_order
            """
            cursor.execute(marks_query, (student_id, test['class_test_id']))
            subjects = cursor.fetchall()

            avg_query = """
                SELECT subject_id, AVG(marks_obtained) as avg
                FROM student_marks
                WHERE class_test_id = %s AND is_absent = 0
                GROUP BY subject_id
            """
            cursor.execute(avg_query, (test['class_test_id'],))
            avg_rows = cursor.fetchall()
            avg_map = {row['subject_id']: round(float(row['avg'] or 0), 1) for row in avg_rows}
            
            hifz_data = []
            academic_data = []
            colors = ['#4ade80', '#38bdf8', '#f472b6', '#facc15', '#a78bfa', '#fb923c']
            
            for idx, subj in enumerate(subjects):
                is_absent = subj['is_absent'] == 1
                secured = 0 if is_absent else float(subj['marks_obtained'] or 0)
                max_marks = subj['max_marks']
                grade = 'AB' if is_absent else get_grade(secured, max_marks)
                percentage = 0 if max_marks == 0 else round((secured / max_marks) * 100)
                class_avg = avg_map.get(subj['subject_id'], 0)
                
                entry = {
                    'subject': subj['subject_name'],
                    'urduSubject': subj['subject_name_urdu'] or '',
                    'totalMarks': max_marks,
                    'securedMarks': int(secured),
                    'grade': grade
                }
                
                if subj['subject_type'] == 'Hifz':
                    entry['classMarks'] = int(class_avg)
                    hifz_data.append(entry)
                else:
                    entry['percentage'] = percentage
                    entry['color'] = colors[idx % len(colors)]
                    academic_data.append(entry)
            
            all_tests_data.append({
                'testId': test['test_id'],
                'testName': test['test_name'],
                'classTestId': test['class_test_id'],
                'hifzData': hifz_data,
                'academicPerformance': academic_data
            })
        
        # Get attendance for this year
        att_query = """
            SELECT 
                MONTHNAME(date) as month,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status IN ('Absent', 'Leave') THEN 1 ELSE 0 END) as absent
            FROM attendance
            WHERE student_id = %s AND academic_year = %s
            GROUP BY MONTH(date), MONTHNAME(date)
            ORDER BY MONTH(date)
        """
        cursor.execute(att_query, (student_id, academic_year))
        monthly_att = cursor.fetchall()
        
        total_present = sum(int(m['present']) for m in monthly_att)
        total_absent = sum(int(m['absent']) for m in monthly_att)
        total_days = sum(int(m['total']) for m in monthly_att)
        
        response = {
            'academicYear': academic_year,
            'student': {
                'studentName': student['student_name'].strip(),
                'fathersName': student['father_name'] or '',
                'classSection': f"{student['class_name']} {student['section'] or ''}".strip(),
                'rollNumber': str(student['roll_number'] or ''),
                'branchName': student['branch_name'] or '',
                'wasPromoted': student['is_promoted'] == 1
            },
            'tests': all_tests_data,
            'attendance': {
                'monthly': [{'month': m['month'][:3], 'total': int(m['total']), 
                            'present': int(m['present']), 'absent': int(m['absent'])} 
                           for m in monthly_att],
                'summary': {
                    'presentCount': total_present,
                    'presentPercentage': round((total_present / total_days) * 100, 1) if total_days > 0 else 0,
                    'absentCount': total_absent,
                    'absentPercentage': round((total_absent / total_days) * 100, 1) if total_days > 0 else 0,
                    'totalCount': total_days
                }
            }
        }
        
        return jsonify(response)
        
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
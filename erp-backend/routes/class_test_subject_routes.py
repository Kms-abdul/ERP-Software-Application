from flask import Blueprint, request, jsonify, current_app
from extensions import db
from models import StudentTestAssignment
from models import ClassSubjectAssignment
from models import ( 
    ClassTestSubject,
    ClassTest,
    SubjectMaster,
    TestType,
    User,
    ClassMaster,
    Branch,
    OrgMaster
)
from helpers import token_required
# -------------------------------------------------
# Blueprint
# -------------------------------------------------
class_test_subject_bp = Blueprint(
    'class_test_subject_bp',
    __name__,
    url_prefix='/api/class-test-subjects'
)



# -------------------------------------------------
# GET : Load Matrix
# -------------------------------------------------
@class_test_subject_bp.route('/', methods=['GET'])
def get_matrix():
    try:
        academic_year_id = request.args.get('academic_year_id')
        branch_id = request.args.get('branch_id')
        class_id = request.args.get('class_id')
        test_id = request.args.get('test_id')
        subject_type = request.args.get('subject_type')  # Optional filter

        if not all([academic_year_id, branch_id, class_id, test_id]):
            return jsonify({'error': 'Missing required filters'}), 400

        # 1. Resolve ClassTest ID
        class_test = ClassTest.query.filter_by(
            academic_year=academic_year_id,  # Note: Frontend passes ID, but DB column is academic_year (string usually, but treating as passed value)
            branch=branch_id,
            class_id=class_id,
            test_id=test_id
        ).first()

        if not class_test:
            # If no ClassTest mapping exists yet, we can't assign subjects.
            # Assuming ClassTest is created via another module (Test Scheduler?)
            # Or we return empty.
            return jsonify({
                'class_test_id': None,
                'subjects': [],
                'test_max_marks': 0
            }), 200

        # 2. Get Test Max Marks for Validation
        # Assuming test_type table stores max_marks
        test_type = TestType.query.get(test_id)
        test_max_marks = test_type.max_marks if test_type else 0

        # Resolve Names for Filtering (ClassSubjectAssignment stores Names)
        academic_year_name = str(academic_year_id)
        if str(academic_year_id).isdigit():
             ay = OrgMaster.query.filter_by(id=academic_year_id, master_type='ACADEMIC_YEAR').first()
             if ay:
                 academic_year_name = ay.display_name
        
        branch_name = branch_id
        if branch_id and str(branch_id).isdigit():
             br = Branch.query.filter_by(id=branch_id).first()
             if br:
                 branch_name = br.branch_name

        # 3. Fetch Subjects
        from sqlalchemy import or_
        query = (
                db.session.query(SubjectMaster)
            .join(
                ClassSubjectAssignment,
                ClassSubjectAssignment.subject_id == SubjectMaster.id
            )
            .filter(
                ClassSubjectAssignment.academic_year == academic_year_name,
                ClassSubjectAssignment.class_id == class_id,
                ClassSubjectAssignment.branch_name == branch_name,
                SubjectMaster.is_active == True
            ))                
        if academic_year_id:
            query = query.filter(or_(
                SubjectMaster.academic_year == academic_year_id,
                SubjectMaster.academic_year == None
            ))

        if subject_type:
            query = query.filter(SubjectMaster.subject_type == subject_type)
        
        subjects = query.order_by(SubjectMaster.subject_name).all()

        # 4. Fetch Existing Assignments
        assigned_query = ClassTestSubject.query.filter_by(class_test_id=class_test.id)
        assigned_subjects = assigned_query.all()
        assigned_map = {a.subject_id: a for a in assigned_subjects}

        # 5. Build Response
        response_list = []
        for s in subjects:
            is_assigned = s.id in assigned_map
            entry = assigned_map.get(s.id)
            response_list.append({
                'subject_id': s.id,
                'subject_name': s.subject_name,
                'subject_type': s.subject_type,
                'assigned': is_assigned,
                'max_marks': entry.max_marks if entry else None,
                'subject_order': entry.subject_order if entry else None
            })

        return jsonify({
            'class_test_id': class_test.id,
            'test_max_marks': test_max_marks,
            'subjects': response_list
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------
# POST : Save Assignments
# -------------------------------------------------
# -------------------------------------------------
# POST : Save Assignments
# -------------------------------------------------
@class_test_subject_bp.route('/', methods=['POST'])
@token_required
def save_assignments(current_user):
    try:
        data = request.json
        class_test_id = data.get('class_test_id')
        subjects = data.get('subjects', []) # List of {subject_id, max_marks, subject_order}
        
        # New Context for Auto-Creation
        context = data.get('context', {})
        academic_year = context.get('academic_year_id')
        branch = context.get('branch_id')
        class_id = context.get('class_id')
        test_id = context.get('test_id')



        # 1. Resolve or Create ClassTest
        class_test = None
        if class_test_id:
            class_test = ClassTest.query.get(class_test_id)
        
        if not class_test:
            if not all([academic_year, branch, class_id, test_id]):
                return jsonify({'error': 'Missing context for creating Class Test map'}), 400
            
            # Check existing by unique constraint
            class_test = ClassTest.query.filter_by(
                academic_year=academic_year,
                branch=branch,
                class_id=class_id,
                test_id=test_id
            ).first()

            if not class_test:
                # Get next test_order (max + 1) for this context
                max_order = db.session.query(db.func.max(ClassTest.test_order)).filter_by(
                    academic_year=academic_year,
                    branch=branch,
                    class_id=class_id
                ).scalar() or 0
                
                class_test = ClassTest(
                    academic_year=academic_year,
                    branch=branch,
                    location="Hyderabad", # Default or derive
                    class_id=class_id,
                    test_id=test_id,
                    test_order=max_order + 1
                )
                db.session.add(class_test)
                db.session.flush() # Get ID
        
        if not class_test:
             return jsonify({'error': 'Failed to resolve Class Test'}), 400

        # Refetch TestType for Validation
        test_type = TestType.query.get(class_test.test_id)
        test_max_marks = test_type.max_marks if test_type else 0

        total_marks = 0
        assigned_orders = set()

        valid_subjects = []
        for s in subjects:
            # Skip unassigned or invalid rows from frontend if any
            if not s.get('max_marks') or not s.get('subject_order'):
                continue
            
            s_max = float(s['max_marks'])
            s_order = int(s['subject_order'])
            
            if s_max <= 0:
                pass # Allow 0? Ideally > 0 but maybe 0 allowed. Let's strict > 0
                # return jsonify({'error': f"Max marks for subject ID {s['subject_id']} must be > 0"}), 400
            
            if s_order in assigned_orders:
                return jsonify({'error': f"Duplicate subject order {s_order} found"}), 400
            
            assigned_orders.add(s_order)
            total_marks += s_max
            valid_subjects.append({
                'subject_id': s['subject_id'],
                'max_marks': s_max,
                'subject_order': s_order
            })

        if total_marks > test_max_marks:
            return jsonify({
                'error': f"Total subject marks ({total_marks}) exceeds Test Max Marks ({test_max_marks})"
            }), 400
# 🔒 

        # 2. Save (Delete Existing -> Insert New)
        ClassTestSubject.query.filter_by(class_test_id=class_test.id).delete()

        for s in valid_subjects:
            new_entry = ClassTestSubject(
                class_test_id=class_test.id,
                subject_id=s['subject_id'],
                max_marks=s['max_marks'],
                subject_order=s['subject_order']
            )
            db.session.add(new_entry)

        db.session.commit()
        return jsonify({
            'message': 'Assignments saved successfully',
            'class_test_id': class_test.id
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------
# POST : Copy Assignments
# -------------------------------------------------
@class_test_subject_bp.route('/copy', methods=['POST'])
@token_required
def copy_assignments(current_user):
    try:
        data = request.json
        source_class_test_id = data.get('source_class_test_id')
        copy_mode = data.get('copy_mode') # 'test_to_test', 'class_to_class', 'branch_to_branch'
        target_ids = data.get('target_ids', []) # List of IDs (target test_ids, class_ids, or branch_ids)
        
        # Context required for finding target ClassTests in class/branch modes
        current_academic_year = data.get('current_academic_year') # ID/Name
        current_branch = data.get('current_branch')
        current_class = data.get('current_class')
        current_test = data.get('current_test')

        if not source_class_test_id or not target_ids:
            return jsonify({'error': 'Missing required fields'}), 400



        # 1. Fetch Source structure
        source_subjects = ClassTestSubject.query.filter_by(class_test_id=source_class_test_id).all()
        if not source_subjects:
            return jsonify({'error': 'Source test has no assigned subjects to copy'}), 400

        source_data = [{
            'subject_id': s.subject_id,
            'max_marks': s.max_marks,
            'subject_order': s.subject_order
        } for s in source_subjects]

        # 2. Process each target
        success_count = 0
        skipped_count = 0
        
        for target_id in target_ids:
            # Determine filters for this specific target
            t_year = current_academic_year
            t_branch = current_branch
            t_class = current_class
            t_test = current_test

            if copy_mode == 'test_to_test':
                t_test = target_id
            elif copy_mode == 'class_to_class':
                t_class = target_id
            elif copy_mode == 'branch_to_branch':
                b_obj = Branch.query.get(target_id)
                if b_obj:
                    t_branch = b_obj.branch_name
                else:
                    t_branch = target_id 
            else:
                continue
            
            # Find Existing ClassTest for Target
            target_ct = ClassTest.query.filter_by(
                academic_year=t_year,
                branch=t_branch,
                class_id=t_class,
                test_id=t_test
            ).first()

            # RULE 1: Do NOT auto-create. If it doesn't exist, SKIP.
            if not target_ct:
                skipped_count += 1
                continue

            # Prevent self-copy via ID check
            if target_ct.id == int(source_class_test_id):
                continue
            
            # RULE 2: Do NOT overwrite if data exists
            existing_count = ClassTestSubject.query.filter_by(class_test_id=target_ct.id).count()
            if existing_count > 0:
                skipped_count += 1
                continue

            # Insert new subjects
            for item in source_data:
                db.session.add(ClassTestSubject(
                    class_test_id=target_ct.id,
                    subject_id=item['subject_id'],
                    max_marks=item['max_marks'],
                    subject_order=item['subject_order']
                ))
            
            success_count += 1

        db.session.commit()
        
        msg = f'Successfully copied to {success_count} targets.'
        if skipped_count > 0:
            msg += f' Skipped {skipped_count} targets (either not initialized or already had data).'
            
        return jsonify({
            'message': msg
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

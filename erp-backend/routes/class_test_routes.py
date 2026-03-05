from flask import Blueprint, request, jsonify, current_app
from extensions import db
from models import ClassTest, ClassMaster, TestType, OrgMaster, Branch, User, ClassTestSubject, SubjectMaster
import sqlalchemy
from datetime import datetime
from helpers import token_required
 
class_test_bp = Blueprint('class_test_bp', __name__)


@class_test_bp.route('/matrix', methods=['GET'])
def get_matrix():
    try:
        academic_year = request.args.get('academic_year')
        branch = request.args.get('branch')
        # We might need location too if branch isn't unique enough, but usually branch name is unique or sufficient in this context. 
        # But wait, same branch name in different location? If so, we need location.
        # User said "give location also".
        # Let's filter by branch and academic_year.

        if not academic_year or not branch:
             return jsonify({'error': 'Missing academic_year or branch'}), 400

        # Get Classes 
        classes = ClassMaster.query.all()
        
        # Get Test Types for this academic year
        # Note: TestType uses 'academic_year' string column too.
        test_types = TestType.query.filter_by(academic_year=academic_year, is_active=True).order_by(TestType.display_order).all()

        # Get Existing Assignments
        assignments = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=branch
        ).all()

        return jsonify({
            'classes': [{'id': c.id, 'name': c.class_name} for c in classes],
            'test_types': [{'id': t.id, 'name': t.test_name} for t in test_types],
            'assignments': [{
                'class_id': a.class_id, 
                'test_id': a.test_id, 
                'test_order': a.test_order,
                'status': a.status
            } for a in assignments]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@class_test_bp.route('/assign', methods=['POST'])
@token_required
def assign_test(current_user):
    try:
        data = request.json
        academic_year = data.get('academic_year')
        branch = data.get('branch')
        # location = data.get('location') # REMOVED: Derived from Branch
        class_id = data.get('class_id')
        test_id = data.get('test_id')
        test_order = data.get('test_order')
        status = data.get('status', True) # True = Add/Update, False=Delete



        # 1. Resolve Location Strictly
        resolved_location = "Hyderabad" # Default
        
        if branch == "All":
             resolved_location = "Hyderabad" # Or "All" if that's the business rule
        else:
             # Find Branch Object
             br_obj = Branch.query.filter_by(branch_name=branch).first()
             if br_obj:
                 # Get Location Code -> Name
                 loc_code = br_obj.location_code
                 loc_master = OrgMaster.query.filter_by(master_type='LOCATION', code=loc_code).first()
                 if loc_master:
                     resolved_location = loc_master.display_name
                 else:
                     # Fallback if code matches display_name or generic
                     resolved_location = "Hyderabad" 
             else:
                 # If branch not found by name, keep default or error?
                 # Assuming valid branch name passed
                 pass

        # Check existence
        existing = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=branch,
            class_id=class_id,
            test_id=test_id
        ).first()

        if status:
            if existing:
                existing.test_order = test_order
                existing.status = True
                existing.location = resolved_location # ENFORCE standard location
            else:
                new_assignment = ClassTest(
                    academic_year=academic_year,
                    branch=branch,
                    location=resolved_location, # ENFORCE standard location
                    class_id=class_id,
                    test_id=test_id,
                    test_order=test_order,
                    status=True
                )
                db.session.add(new_assignment)
        else:
            if existing:
                db.session.delete(existing)
        
        db.session.commit()
        return jsonify({'message': 'Success', 'location': resolved_location}), 200

    except sqlalchemy.exc.IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Duplicate order or assignment constraint violation'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@class_test_bp.route('/copy', methods=['POST'])
@token_required
def copy_assignments(current_user):
    try:
        data = request.json
        from_branch = data.get('from_branch')
        to_branch = data.get('to_branch')
        to_location = data.get('to_location')
        academic_year = data.get('academic_year')

        if not from_branch or not to_branch or not academic_year or not to_location:
            return jsonify({'error': 'Missing required fields'}), 400



        # Fetch source assignments
        source_assignments = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=from_branch
        ).all()

        if not source_assignments:
            return jsonify({'message': 'No assignments found in source branch'}), 404

        count = 0
        for src in source_assignments:
            # Check collision
            existing = ClassTest.query.filter_by(
                academic_year=academic_year,
                branch=to_branch,
                class_id=src.class_id,
                test_id=src.test_id
            ).first()

            if not existing:
                # Copy
                new_entry = ClassTest(
                    academic_year=academic_year,
                    branch=to_branch, # Target Branch Name
                    location=to_location, # Target Location Name
                    class_id=src.class_id,
                    test_id=src.test_id,
                    test_order=src.test_order,
                    status=src.status
                )
                db.session.add(new_entry)
                count += 1
        
        db.session.commit()
        return jsonify({'message': f'Copied {count} assignments successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
@class_test_bp.route('/list', methods=['GET'])
def list_class_tests():
    try:
        academic_year = request.args.get('academic_year')
        branch = request.args.get('branch')
        class_id = request.args.get('class_id')

        # Resolve Branch Code to Name if possible (ClassTest uses Branch Name)
        branch_obj = Branch.query.filter_by(branch_code=branch).first()
        if branch_obj:
            branch = branch_obj.branch_name

        if not all([academic_year, branch, class_id]):
             return jsonify({'error': 'Missing filters', 'data': []}), 400

        # Fetch Class Tests
        assignments = ClassTest.query.filter_by(
            academic_year=academic_year,
            branch=branch,
            class_id=class_id,
            status=True
        ).all()
        
        results = []
        for a in assignments:
            # Get Test Name
            test_type = TestType.query.get(a.test_id)
            test_name = test_type.test_name if test_type else f"Test {a.test_id}"
            
            # Get Subjects
            subjects_query = db.session.query(ClassTestSubject, SubjectMaster)\
                .join(SubjectMaster, ClassTestSubject.subject_id == SubjectMaster.id)\
                .filter(ClassTestSubject.class_test_id == a.id)\
                .order_by(ClassTestSubject.subject_order)\
                .all()
                
            subj_list = []
            for cts, sm in subjects_query:
                subj_list.append({
                    'id': sm.id,
                    'subject_name': sm.subject_name
                })
                
            results.append({
                'test_id': a.test_id,
                'test_name': test_name,
                'class_test_id': a.id,
                'subjects': subj_list
            })
            
        return jsonify(results), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

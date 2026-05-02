from flask import Blueprint, request, jsonify, current_app
from extensions import db, to_local_time
from models import TestType, User
from helpers import token_required

test_type_bp = Blueprint('test_type_bp', __name__)

from sqlalchemy import or_

@test_type_bp.route('/', methods=['GET'])
def get_test_types():
    try:
        academic_year = request.args.get('academic_year')

        if not academic_year:
            return jsonify({'error': 'Academic Year is required'}), 400

        query = TestType.query.filter_by(academic_year=academic_year)
        
        test_types = query.order_by(TestType.display_order).all()
        
        return jsonify([{
            'id': t.id,
            'test_name': t.test_name,
            'max_marks': t.max_marks,
            'display_order': t.display_order,
            'is_active': t.is_active,
            'academic_year': t.academic_year,
            'created_at': to_local_time(t.created_at).isoformat() if t.created_at else None,
            'updated_at': to_local_time(t.updated_at).isoformat() if t.updated_at else None,
            'created_by': t.created_by,
            'updated_by': t.updated_by
        } for t in test_types]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@test_type_bp.route('/', methods=['POST'])
@token_required
def create_test_type(current_user):
    try:
        data = request.json
        req_fields = ['test_name', 'max_marks', 'academic_year']
        for f in req_fields:
            if not data.get(f):
                return jsonify({'error': f'{f} is required'}), 400

        academic_year = data['academic_year']

        # Check if duplicate name in context
        if TestType.query.filter_by(test_name=data['test_name'], academic_year=academic_year).first():
            return jsonify({'error': 'Test Name already exists in this context'}), 400

        target_order = data.get('display_order')
        
        if target_order is None:
             # Auto-calculate display_order
            max_order = db.session.query(db.func.max(TestType.display_order)).filter_by(
                academic_year=academic_year
            ).scalar()
            target_order = (max_order or 0) + 1

        new_test = TestType(
            test_name=data['test_name'],
            max_marks=data['max_marks'],
            display_order=target_order,
            academic_year=academic_year,
            is_active=True
        )
        
        db.session.add(new_test)
        db.session.commit()
        
        return jsonify({'message': 'Test Type created successfully', 'id': new_test.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@test_type_bp.route('/<int:id>', methods=['PUT'])
@token_required
def update_test_type(current_user, id):
    try:
        test_type = TestType.query.get_or_404(id)
        data = request.json
        
        if 'test_name' in data:
            test_type.test_name = data['test_name']
        if 'max_marks' in data:
            test_type.max_marks = data['max_marks']
            
        if 'display_order' in data:
            try:
                test_type.display_order = int(data['display_order'])
            except:
                pass # Or handle error
        


        db.session.commit()
        return jsonify({'message': 'Test Type updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500



@test_type_bp.route('/<int:id>/status', methods=['PATCH'])
@token_required
def toggle_status(current_user, id):
    try:
        test_type = TestType.query.get_or_404(id)
        test_type.is_active = not test_type.is_active
        


        db.session.commit()
        return jsonify({'message': 'Status updated', 'is_active': test_type.is_active}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

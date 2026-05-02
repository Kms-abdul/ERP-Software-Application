from flask import Blueprint, request, jsonify, send_file, current_app
from extensions import db, get_now, to_local_time
from models import DocumentType, StudentDocument, Student, User, Branch, UserBranchAccess
from helpers import token_required
from datetime import datetime
import os
import uuid
from werkzeug.utils import secure_filename

document_routes = Blueprint('document_routes', __name__)

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ─────────────────────────────────────────────────────────────
# PATH HELPERS
# Folder structure:
#   HifzErpSoftwareApplication/
#     erp-backend/         ← current_app.root_path
#     Media/
#       student_document/
#         <student_id>/
#           AADHAAR_20260225_a1b2c3.pdf
# ─────────────────────────────────────────────────────────────

def get_project_root():
    """One level up from erp-backend → HifzErpSoftwareApplication/"""
    return os.path.abspath(os.path.join(current_app.root_path, '..'))

def get_media_base():
    """Returns: HifzErpSoftwareApplication/Media/student_document/"""
    return os.path.join(get_project_root(), 'Media', 'student_document')


def can_access_student(current_user, student):
    if not student:
        return False
    if current_user.role == 'Admin' or current_user.branch == 'All':
        return True
    if student.branch == current_user.branch:
        return True

    branch_obj = Branch.query.filter(
        (Branch.branch_code == student.branch) | (Branch.branch_name == student.branch)
    ).first()
    if not branch_obj:
        return False

    return UserBranchAccess.query.filter_by(
        user_id=current_user.user_id,
        branch_id=branch_obj.id,
        is_active=True
    ).first() is not None


# ==========================================
# MASTER DOCUMENT TYPES
# ==========================================

@document_routes.route('/types', methods=['GET'])
@token_required
def get_document_types(current_user):
    try:
        types = DocumentType.query.all()
        return jsonify([
            {
                "id": t.id,
                "code": t.code,
                "name": t.name,
                "description": t.description,
                "is_active": t.is_active,
                "created_at": to_local_time(t.created_at).isoformat() if t.created_at else None,
                "updated_at": to_local_time(t.updated_at).isoformat() if t.updated_at else None,
                "created_by": t.created_by,
                "updated_by": t.updated_by
            } for t in types
        ]), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@document_routes.route('/types', methods=['POST'])
@token_required
def create_document_type(current_user):
    if current_user.role != 'Admin':
        return jsonify({"message": "Access denied. Only Admins can manage document categories."}), 403
    try:
        data = request.json

        existing = DocumentType.query.filter_by(code=data.get('code')).first()
        if existing:
            return jsonify({"message": "Document type with this code already exists"}), 400

        new_type = DocumentType(
            code=data.get('code'),
            name=data.get('name'),
            description=data.get('description', ''),
            is_active=data.get('is_active', True)
        )
        db.session.add(new_type)
        db.session.commit()

        return jsonify({"message": "Document type created successfully", "id": new_type.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500


@document_routes.route('/types/<int:id>', methods=['PUT'])
@token_required
def update_document_type(current_user, id):
    if current_user.role != 'Admin':
        return jsonify({"message": "Access denied. Only Admins can manage document categories."}), 403
    try:
        data = request.json
        doc_type = DocumentType.query.get(id)
        if not doc_type:
            return jsonify({"message": "Document type not found"}), 404

        if 'name' in data:
            doc_type.name = data['name']
        if 'description' in data:
            doc_type.description = data['description']
        if 'is_active' in data:
            doc_type.is_active = data['is_active']

        db.session.commit()
        return jsonify({"message": "Document type updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": str(e)}), 500


# ==========================================
# STUDENT DOCUMENTS — UPLOAD
# ==========================================

@document_routes.route('/upload', methods=['POST'])
@token_required
def upload_student_document(current_user):
    try:
        if 'file' not in request.files:
            return jsonify({'message': 'No file part in the request'}), 400

        max_content_length = current_app.config.get('MAX_CONTENT_LENGTH')
        content_length = request.content_length

        if (
            max_content_length is not None
            and content_length is not None
            and content_length > max_content_length
        ):
            return jsonify({'message': 'File too large. Maximum size is 16 MB.'}), 413

        file = request.files['file']
        if file.filename == '':
            return jsonify({'message': 'No selected file'}), 400

        if not allowed_file(file.filename):
            return jsonify({'message': 'File type not allowed. Allowed: PDF, PNG, JPG, JPEG, DOC, DOCX'}), 400

        student_id = request.form.get('student_id')
        document_type_id = request.form.get('document_type_id')

        if not student_id or not document_type_id:
            return jsonify({'message': 'Missing student_id or document_type_id'}), 400

        student = Student.query.get(student_id)
        doc_type = DocumentType.query.get(document_type_id)

        if not student or not doc_type:
            return jsonify({'message': 'Invalid student or document type'}), 400
        if not can_access_student(current_user, student):
            return jsonify({'message': 'Access denied'}), 403

        # Optional metadata
        document_no  = request.form.get('document_no')
        issued_by    = request.form.get('issued_by')
        issue_date_str = request.form.get('issue_date')
        notes        = request.form.get('notes')

        issue_date = None
        if issue_date_str:
            issue_date = datetime.strptime(issue_date_str, '%Y-%m-%d').date()

        # ── Storage path ─────────────────────────────────────────
        # HifzErpSoftwareApplication/Media/student_document/<student_id>/
        student_dir = os.path.join(get_media_base(), str(student.student_id))
        if not os.path.exists(student_dir):
            os.makedirs(student_dir)

        # Unique filename: DOCTYPECODE_YYYYMMDDHHMMSS_xxxxxx.ext
        original_ext   = file.filename.rsplit('.', 1)[1].lower()
        timestamp      = get_now().strftime('%Y%m%d%H%M%S')
        unique_id      = str(uuid.uuid4().hex)[:6]
        secure_code    = secure_filename(doc_type.code)
        new_filename   = f"{secure_code}_{timestamp}_{unique_id}.{original_ext}"

        file_path = os.path.join(student_dir, new_filename)

        # Relative to project root (for portability across machines)
        # e.g.  "Media\student_document\42\AADHAAR_20260225_a1b2c3.pdf"
        relative_path = os.path.relpath(file_path, get_project_root())

        file.save(file_path)

        # Find existing document or create a new one to avoid IntegrityError
        existing_doc = StudentDocument.query.filter_by(
            student_id=student.student_id,
            document_type_id=doc_type.id
        ).first()

        if existing_doc:
            existing_doc.document_no = document_no
            existing_doc.issued_by = issued_by
            existing_doc.issue_date = issue_date
            existing_doc.notes = notes
            existing_doc.file_name = new_filename
            existing_doc.file_path = relative_path
            existing_doc.file_size = os.path.getsize(file_path)
            existing_doc.mime_type = file.content_type
            existing_doc.updated_by = current_user.user_id
            new_doc = existing_doc
        else:
            new_doc = StudentDocument(
                student_id=student.student_id,
                document_type_id=doc_type.id,
                document_no=document_no,
                issued_by=issued_by,
                issue_date=issue_date,
                notes=notes,
                file_name=new_filename,
                file_path=relative_path,
                file_size=os.path.getsize(file_path),
                mime_type=file.content_type,
                created_by=current_user.user_id
            )
            db.session.add(new_doc)
        db.session.commit()

        return jsonify({
            'message': 'Document uploaded successfully',
            'document_id': new_doc.id,
            'file_name': new_filename,
            'stored_at': relative_path
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error uploading document: {str(e)}'}), 500


# ==========================================
# STUDENT DOCUMENTS — LIST (per student)
# ==========================================

@document_routes.route('/student/<int:student_id>', methods=['GET'])
@token_required
def get_student_documents(current_user, student_id):
    try:
        student = Student.query.get(student_id)
        if not student:
            return jsonify({'message': 'Student not found'}), 404
        if not can_access_student(current_user, student):
            return jsonify({'message': 'Access denied'}), 403

        documents = StudentDocument.query.filter_by(
            student_id=student_id
        ).all()

        user_ids = {doc.created_by for doc in documents if doc.created_by}
        users = User.query.filter(User.user_id.in_(user_ids)).all() if user_ids else []
        user_map = {u.user_id: u.username for u in users}

        result = []
        for doc in documents:
            result.append({
                'id': doc.id,
                'document_type_id': doc.document_type_id,
                'document_type_code': doc.document_type.code,
                'document_type_name': doc.document_type.name,
                'document_no': doc.document_no,
                'issued_by': doc.issued_by,
                'issue_date': doc.issue_date.strftime('%Y-%m-%d') if doc.issue_date else None,
                'notes': doc.notes,
                'file_name': doc.file_name,
                'uploaded_at': to_local_time(doc.created_at).strftime('%Y-%m-%d %H:%M:%S') if doc.created_at else None,
                'is_verified': doc.is_verified,
                'upload_by_name': user_map.get(doc.created_by, 'System')
            })

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'message': str(e)}), 500


@document_routes.route('/download/<int:doc_id>', methods=['GET'])
@token_required
def download_document(current_user, doc_id):
    try:
        doc = StudentDocument.query.get(doc_id)
        if not doc:
            return jsonify({'message': 'Document not found'}), 404
        if not can_access_student(current_user, doc.student):
            return jsonify({'message': 'Access denied'}), 403

        project_root = get_project_root()
        abs_path = os.path.abspath(os.path.join(project_root, doc.file_path))

        if not os.path.exists(abs_path):
            return jsonify({'message': 'Physical file not found on server.'}), 404

        # Security: prevent path traversal — file must be inside Media/student_document/
        media_base = os.path.abspath(get_media_base())
        if not abs_path.startswith(media_base + os.sep) and abs_path != media_base:
            return jsonify({'message': 'Access denied.'}), 403

        return send_file(
            abs_path,
            as_attachment=True,
            download_name=doc.file_name,
            mimetype=doc.mime_type
        )
    except Exception as e:
        return jsonify({'message': str(e)}), 500



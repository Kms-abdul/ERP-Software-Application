# pyrefly: ignore [missing-import]
from flask import Blueprint, request, jsonify, g
from decimal import Decimal, InvalidOperation
from datetime import date
from models import (
    db,
    HifzProgram,
    StudentHifzProgress,
    Student,
    HifzReward,
    StudentHifzReward
)
import logging

hifz_bp = Blueprint('hifz_bp', __name__)
logger = logging.getLogger(__name__)

# --- Hifz Reward Settings ---


def reward_rule_to_dict(rule):
    return {
        "id": rule.id,
        "para_number": rule.para_number,
        "days_limit": rule.days_limit,
        "excellent_amount": float(rule.excellent_amount),
        "very_good_amount": float(rule.very_good_amount),
        "good_amount": float(rule.good_amount),
    }


def validate_reward_rule_data(data):
    required_fields = [
        "para_number",
        "days_limit",
        "excellent_amount",
        "very_good_amount",
        "good_amount",
    ]

    missing_fields = [
        field for field in required_fields
        if data.get(field) in (None, "")
    ]

    if missing_fields:
        return None, f"Missing required fields: {', '.join(missing_fields)}"

    try:
        cleaned_data = {
            "para_number": int(data["para_number"]),
            "days_limit": int(data["days_limit"]),
            "excellent_amount": Decimal(str(data["excellent_amount"])),
            "very_good_amount": Decimal(str(data["very_good_amount"])),
            "good_amount": Decimal(str(data["good_amount"])),
        }
    except (ValueError, InvalidOperation):
        return None, "Para number, days limit, and amounts must be valid numbers."

    if not 1 <= cleaned_data["para_number"] <= 30:
        return None, "Para number must be between 1 and 30."

    if cleaned_data["days_limit"] <= 0:
        return None, "Days limit must be greater than zero."

    if any(
        cleaned_data[field] < 0
        for field in (
            "excellent_amount",
            "very_good_amount",
            "good_amount",
        )
    ):
        return None, "Prize amounts cannot be negative."

    return cleaned_data, None


def get_branch_filter_values():
    values = [
        request.args.get("branch"),
        request.args.get("branch_name"),
    ]
    return [
        value for value in values
        if value and value.strip().lower() not in ("all", "all branches")
    ]


@hifz_bp.route("/rewards", methods=["GET"])
def get_hifz_reward_rules():
    try:
        rules = HifzReward.query.order_by(
            HifzReward.para_number,
            HifzReward.days_limit,
            HifzReward.id
        ).all()

        return jsonify({
            "rewards": [reward_rule_to_dict(rule) for rule in rules]
        }), 200

    except Exception as e:
        logger.error(f"Error fetching Hifz reward settings: {str(e)}")
        return jsonify({"message": "Error fetching reward settings"}), 500


@hifz_bp.route("/rewards", methods=["POST"])
def create_hifz_reward_rule():
    try:
        data = request.get_json(silent=True) or {}

        cleaned_data, error = validate_reward_rule_data(data)
        if error:
            return jsonify({"message": error}), 400

        existing_rule = HifzReward.query.filter_by(
            para_number=cleaned_data["para_number"],
            days_limit=cleaned_data["days_limit"]
        ).first()
        if existing_rule:
            return jsonify({
                "message": (
                    f"Settings already exist for Para {cleaned_data['para_number']} "
                    f"with a {cleaned_data['days_limit']}-day limit."
                )
            }), 409

        reward_rule = HifzReward(**cleaned_data)

        db.session.add(reward_rule)
        db.session.commit()

        return jsonify({
            "message": "Hifz reward settings created successfully.",
            "reward": reward_rule_to_dict(reward_rule)
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating Hifz reward settings: {str(e)}")
        return jsonify({"message": "Unable to create reward settings"}), 500


@hifz_bp.route("/rewards/<int:reward_id>", methods=["PUT"])
def update_hifz_reward_rule(reward_id):
    try:
        reward_rule = HifzReward.query.get_or_404(reward_id)

        data = request.get_json(silent=True) or {}
        cleaned_data, error = validate_reward_rule_data(data)

        if error:
            return jsonify({"message": error}), 400

        duplicate_rule = HifzReward.query.filter(
            HifzReward.para_number == cleaned_data["para_number"],
            HifzReward.days_limit == cleaned_data["days_limit"],
            HifzReward.id != reward_id
        ).first()
        if duplicate_rule:
            return jsonify({
                "message": (
                    f"Settings already exist for Para {cleaned_data['para_number']} "
                    f"with a {cleaned_data['days_limit']}-day limit."
                )
            }), 409

        reward_rule.para_number = cleaned_data["para_number"]
        reward_rule.days_limit = cleaned_data["days_limit"]
        reward_rule.excellent_amount = cleaned_data["excellent_amount"]
        reward_rule.very_good_amount = cleaned_data["very_good_amount"]
        reward_rule.good_amount = cleaned_data["good_amount"]

        db.session.commit()

        return jsonify({
            "message": "Hifz reward settings updated successfully.",
            "reward": reward_rule_to_dict(reward_rule)
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating Hifz reward settings: {str(e)}")
        return jsonify({"message": "Unable to update reward settings"}), 500


@hifz_bp.route("/rewards/<int:reward_id>", methods=["DELETE"])
def delete_hifz_reward_rule(reward_id):
    try:
        reward_rule = HifzReward.query.get_or_404(reward_id)

        used_by_students = StudentHifzReward.query.filter_by(
            reward_rule_id=reward_id
        ).first()

        if used_by_students:
            return jsonify({
                "message": "This setting is already used in student rewards and cannot be deleted."
            }), 400

        db.session.delete(reward_rule)
        db.session.commit()

        return jsonify({
            "message": "Hifz reward settings deleted successfully."
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting Hifz reward settings: {str(e)}")
        return jsonify({"message": "Unable to delete reward settings"}), 500
@hifz_bp.route("/student-rewards", methods=["POST"])
def create_student_hifz_reward():
    try:
        data = request.get_json(silent=True) or {}

        student_id = data.get("student_id")
        para_number = data.get("para_number")
        reward_rule_id = data.get("reward_rule_id")
        no_of_days = data.get("no_of_days")
        performance_type = data.get("performance_type")

        if not all([
            student_id,
            para_number,
            reward_rule_id,
            no_of_days,
            performance_type
        ]):
            return jsonify({
                "message": "Student, para, reward limit, days taken, and performance are required."
            }), 400

        try:
            student_id = int(student_id)
            para_number = int(para_number)
            reward_rule_id = int(reward_rule_id)
            no_of_days = int(no_of_days)
        except ValueError:
            return jsonify({
                "message": "Student, para, reward limit, and days must be numbers."
            }), 400

        if not 1 <= para_number <= 30 or no_of_days <= 0:
            return jsonify({
                "message": "Para must be between 1 and 30 and days must be greater than zero."
            }), 400

        if performance_type not in ("Excellent", "Very Good", "Good"):
            return jsonify({"message": "Invalid performance type."}), 400

        student = Student.query.get(student_id)
        if not student:
            return jsonify({"message": "Student not found."}), 404

        reward_rule = HifzReward.query.filter_by(
            id=reward_rule_id,
            para_number=para_number
        ).first()

        if not reward_rule:
            return jsonify({
                "message": f"Reward settings are not available for Para {para_number}."
            }), 404

        existing_reward = StudentHifzReward.query.filter_by(
            student_id=student_id,
            para_number=para_number
        ).first()

        if existing_reward:
            return jsonify({
                "message": "This student already has a reward entry for this para."
            }), 409

        # Change <= to < here if exactly the limit should be ineligible.
        is_eligible = no_of_days <= reward_rule.days_limit

        amount_fields = {
            "Excellent": reward_rule.excellent_amount,
            "Very Good": reward_rule.very_good_amount,
            "Good": reward_rule.good_amount,
        }

        reward_amount = amount_fields[performance_type] if is_eligible else Decimal("0.00")

        reward = StudentHifzReward(
            student_id=student_id,
            reward_rule_id=reward_rule.id,
            para_number=para_number,
            no_of_days=no_of_days,
            performance_type=performance_type,
            days_limit_snapshot=reward_rule.days_limit,
            is_eligible=is_eligible,
            reward_amount=reward_amount,
            completed_date=date.today()
        )

        db.session.add(reward)
        db.session.commit()

        return jsonify({
            "message": (
                "Reward saved successfully."
                if is_eligible
                else f"Saved as not eligible. Limit is {reward_rule.days_limit} days."
            ),
            "reward": {
                "id": reward.id,
                "student_id": reward.student_id,
                "para_number": reward.para_number,
                "no_of_days": reward.no_of_days,
                "performance_type": reward.performance_type,
                "days_limit": reward.days_limit_snapshot,
                "is_eligible": reward.is_eligible,
                "reward_amount": float(reward.reward_amount),
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error saving student Hifz reward: {str(e)}")
        return jsonify({"message": "Unable to save student reward."}), 500
@hifz_bp.route("/student-rewards", methods=["GET"])
def get_student_hifz_rewards():
    try:
        query = StudentHifzReward.query.join(Student)
        branch_values = get_branch_filter_values()
        if branch_values:
            query = query.filter(Student.branch.in_(branch_values))
        if request.args.get("class_name"):
            query = query.filter(Student.clazz == request.args["class_name"])
        if request.args.get("section"):
            query = query.filter(Student.section == request.args["section"])

        rewards = query.order_by(
            StudentHifzReward.completed_date.desc(),
            StudentHifzReward.id.desc()
        ).all()

        def serialize_reward(reward):
            return {
                "id": reward.id,
                "student_id": reward.student_id,
                "student_name": (
                    f"{reward.student.first_name or ''} "
                    f"{reward.student.last_name or ''}"
                ).strip(),
                "admission_no": reward.student.admission_no,
                "roll_number": reward.student.Roll_Number,
                "branch": reward.student.branch,
                "class_name": reward.student.clazz,
                "section": reward.student.section,
                "para_number": reward.para_number,
                "no_of_days": reward.no_of_days,
                "performance_type": reward.performance_type,
                "days_limit": reward.days_limit_snapshot,
                "is_eligible": reward.is_eligible,
                "reward_amount": float(reward.reward_amount),
                "completed_date": reward.completed_date.isoformat(),
            }

        return jsonify({
            "rewards": [serialize_reward(reward) for reward in rewards]
        }), 200

    except Exception as e:
        logger.error(f"Error fetching student Hifz rewards: {str(e)}")
        return jsonify({"message": "Unable to fetch student rewards."}), 500
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
        branch_values = get_branch_filter_values()
        class_name = request.args.get('class_name')
        section = request.args.get('section')
        category = request.args.get('category')
        test_id = request.args.get('test_id')

        query = Student.query.filter_by(academic_year=academic_year, status="Active")
        if branch_values:
            query = query.filter(Student.branch.in_(branch_values))
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

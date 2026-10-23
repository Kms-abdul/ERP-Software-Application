from extensions import db
from models import BranchYearSequence, Branch, OrgMaster
from datetime import datetime

class SequenceService:
    
    @staticmethod
    def resolve_branch_id(branch_identifier):
        """
        Resolves a branch identifier (name or code) to its DB ID.
        Returns ID or None.
        """
        if isinstance(branch_identifier, int):
            return branch_identifier
            
        branch = Branch.query.filter(
            (Branch.branch_code == branch_identifier) | 
            (Branch.branch_name == branch_identifier)
        ).first()
        
        return branch.id if branch else None

    @staticmethod
    def resolve_academic_year_id(year_code):
        """
        Resolves an academic year code (e.g. '2025-2026') to its OrgMaster ID.
        Returns ID or None.
        """
        if isinstance(year_code, int):
            return year_code
            
        ay = OrgMaster.query.filter_by(
            master_type='ACADEMIC_YEAR',
            code=year_code
        ).first()
        
        return ay.id if ay else None

    @staticmethod
    def get_or_create_sequence(branch_id, academic_year_id, user_id=None):
        """
        Ensures a sequence row exists for the given Branch/Year.
        If not, creates it with default prefixes.
        THIS IS NOT LOCKED. Use inside transaction or careful context.
        """
        seq = BranchYearSequence.query.filter_by(
            branch_id=branch_id, 
            academic_year_id=academic_year_id
        ).first()
        
        if not seq:
            # Need to fetch branch and year to generate prefixes
            branch = Branch.query.get(branch_id)
            # Default prefix logic: H + BranchCode (e.g., HATC)
            # Receipt prefix: BranchCode (e.g. TC) - User requested Ex: TC01
            # User Ex: HATC0152 -> Prefix HATC. Receipt TC01 -> Prefix TC.
            # It seems Admission Prefix = 'H' + BranchCode
            # Receipt Prefix = BranchCode (but example TC vs HATC implies TC is code? let's check branch codes)
            
            # If Branch Code is ATC. HATC = H + ATC. TC01 = ?? Maybe slightly different.
            # User Example: "if it is HATC generate TC01 ... VN01"
            # It seems HATC is the branch code? Or Branch is named HATC?
            # Let's assume Admission Prefix = BranchCode (e.g. HATC)
            # And Receipt Prefix = Suffix of BranchCode? Or user defined?
            # "Ex : In auto_enrollment_table Last Admission no is 0151 for HATC ... one student joining his admission_no should be HATC0152"
            # This implies Admission Prefix is "HATC" (the branch code itself).
            
            # "same with fee receipt if it is HATC generate TC01, TC02"
            # This implies Receipt Prefix for HATC is "TC". 
            # This logic is tricky to auto-deduce. 
            # I will use BranchCode as default for BOTH for now, but allow Override.
            # Or better, for HATC -> Admission: HATC, Receipt: TC?
            # I will use Admission Prefix = BranchCode. Receipt Prefix = BranchCode (abbreviated if needed, but standardizing on BranchCode is safer unless mapped).
            # Wait, if Branch is "HAVN", receipt is "VN".
            # It seems like it takes the last 2 chars? 
            # Let's stick to using BranchCode for Admission Prefix.
            # For Receipt Prefix, I will use BranchCode as well to be safe, unless user provides mapping.
            # Actually, I can use the Branch Code directly.
            
            adm_prefix = branch.branch_code if branch else "GEN"
            rec_prefix = branch.branch_code if branch else "REC"
            rem_prefix = f"REM-{branch.branch_code.strip()}" if branch and branch.branch_code else f"REM-B{branch_id}"
            
            # Correction based on user prompt "if it is HATC... generate TC01". 
            # Maybe HATC is the branch code. TC is a sub-part.
            # Given I cannot guess the custom logic "TC" from "HATC" (maybe it's Hafiz Academy TC?), 
            # I will use BranchCode for both. The user can update the table manually if they want custom prefixes
            # OR I can try to carry over "TC" if it exists in some other context. 
            # For now: AdmissionPrefix = branch_code, ReceiptPrefix = branch_code.
            
            seq = BranchYearSequence(
                branch_id=branch_id,
                academic_year_id=academic_year_id,
                admission_prefix=adm_prefix,
                receipt_prefix=rec_prefix,
                remittance_prefix=rem_prefix,
                last_admission_no=0,
                last_receipt_no=0,
                last_remittance_no=0,
                created_by=user_id,
                updated_by=user_id
            )
            db.session.add(seq)
            db.session.flush()
            
        return seq

    @staticmethod
    def _get_locked_sequence(branch_id, academic_year_id):
        """
        Fetches the sequence row with ROW-LEVEL LOCKING.
        Must be called inside an active transaction.
        """
        return db.session.query(BranchYearSequence).with_for_update().filter_by(
            branch_id=branch_id, 
            academic_year_id=academic_year_id
        ).first()

    @staticmethod
    def generate_admission_number(branch_id, academic_year_id):
        """
        Generates next Admission Number: {Prefix}{0000} (e.g. HATC0152)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            # Fallback: Create if not exists (though ideally should exist)
            # CAUTION: get_or_create_sequence does FLUSH. 
            # If we are in existing transaction, this is fine.
            # But we can't lock what doesn't exist.
            # So we create, then lock? Or just use the new one (which is implicitly locked by insert in this txn).
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        seq.last_admission_no += 1
        return f"{seq.admission_prefix}{seq.last_admission_no:04d}"

    @staticmethod
    def generate_receipt_number(branch_id, academic_year_id, include_prefix=False):
        """
        Generates next Fee Receipt Number.
        If include_prefix=True: {Prefix}{00} (e.g. TC01)
        If include_prefix=False: {00} (e.g. 01, 02, 03...)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        seq.last_receipt_no += 1
        
        if include_prefix:
            return f"{seq.receipt_prefix}{seq.last_receipt_no:02d}"
        else:
            return f"{seq.last_receipt_no:02d}"  # Just the number 

    @staticmethod
    def generate_remittance_number(branch_id, academic_year_id):
        """
        Generates next Remittance Number with Branch Code: REM-{BRANCH_CODE}-{YYYY}-{0001}
        Self-healing: never issues a number at or below the highest existing one
        for the same prefix + year (counters are per academic year, but the
        number format uses the calendar year, so they can otherwise collide).
        """
        from models import RemittanceMaster  # local import to avoid circular imports

        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        if not seq:
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)

        if getattr(seq, "last_remittance_no", None) is None:
            seq.last_remittance_no = 0

        prefix = getattr(seq, "remittance_prefix", "REM") or "REM"
        # If prefix is still default 'REM', upgrade it to include branch_code to ensure cross-branch uniqueness
        if prefix == "REM":
            branch = Branch.query.get(branch_id)
            prefix = f"REM-{branch.branch_code.strip()}" if branch and branch.branch_code else f"REM-B{branch_id}"
            seq.remittance_prefix = prefix

        year_str = datetime.now().strftime("%Y")
        base = f"{prefix}-{year_str}-"

        # Find the highest number already used for this prefix + year
        max_existing = 0
        existing = (
            RemittanceMaster.query
            .with_entities(RemittanceMaster.remittance_no)
            .filter(RemittanceMaster.remittance_no.like(f"{base}%"))
            .all()
        )
        for (r_no,) in existing:
            tail = r_no[len(base):]
            if tail.isdigit():
                max_existing = max(max_existing, int(tail))

        seq.last_remittance_no = max(seq.last_remittance_no, max_existing) + 1
        return f"{base}{seq.last_remittance_no:04d}"
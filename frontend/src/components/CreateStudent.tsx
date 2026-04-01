import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "../api";
import { UserIcon } from "./icons";

// --- Constants & Styles ---
const INPUT_STYLE =
  "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm disabled:bg-gray-100 disabled:text-gray-500";
const LABEL_STYLE = "block text-sm font-medium text-gray-700 mb-1";

// --- Helper Components ---

// 1. Collapsible Section
const CollapsibleSection = React.memo(
  ({
    title,
    children,
    defaultOpen = false,
  }: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
  }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
      <div className="md:col-span-4 mt-6 border rounded-lg overflow-hidden shadow-sm bg-white">
        <div
          className="flex justify-between items-center p-4 bg-gray-50 cursor-pointer border-b hover:bg-gray-100 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <h3 className="text-lg font-semibold text-gray-700 flex items-center">
            {title}
          </h3>
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline font-medium focus:outline-none"
          >
            {isOpen ? "Collapse" : "Expand"}
          </button>
        </div>
        {isOpen && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            {children}
          </div>
        )}
      </div>
    );
  }
);

// 2. Form Field Helper
interface FormFieldProps {
  label: string;
  name: string;
  value?: any;
  checked?: boolean;
  onChange: (e: React.ChangeEvent<any>) => void;
  type?: string;
  required?: boolean;
  as?: "input" | "select" | "textarea" | "checkbox";
  children?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const FormField = React.memo(
  ({
    label,
    name,
    value,
    checked,
    onChange,
    type = "text",
    required = false,
    as = "input",
    children,
    disabled = false,
    placeholder,
    className,
  }: FormFieldProps) => {
    const inputId = `field_${name}`;

    if (type === "checkbox") {
      return (
        <div className={`flex items-center pt-6 ${className || ""}`}>
          <input
            type="checkbox"
            name={name}
            id={inputId}
            checked={checked}
            onChange={onChange}
            className="h-5 w-5 text-violet-600 border-gray-300 rounded focus:ring-violet-500 cursor-pointer"
            disabled={disabled}
          />
          <label
            htmlFor={inputId}
            className="ml-2 text-sm text-gray-700 cursor-pointer select-none"
          >
            {label}
          </label>
          {children}
        </div>
      );
    }

    return (
      <div className={className}>
        <label htmlFor={inputId} className={LABEL_STYLE}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {as === "input" && (
          <input
            type={type}
            name={name}
            id={inputId}
            value={value || ""}
            onChange={onChange}
            className={INPUT_STYLE}
            disabled={disabled}
            placeholder={placeholder}
          />
        )}
        {as === "select" && (
          <select
            name={name}
            id={inputId}
            value={value || ""}
            onChange={onChange}
            className={INPUT_STYLE}
            disabled={disabled}
          >
            {children}
          </select>
        )}
        {as === "textarea" && (
          <textarea
            name={name}
            id={inputId}
            value={value || ""}
            onChange={onChange}
            className={INPUT_STYLE}
            rows={2}
            disabled={disabled}
            placeholder={placeholder}
          />
        )}
      </div>
    );
  }
);

// 3. Photo Upload Helper
const PhotoUpload = React.memo(
  ({
    title,
    photo,
    onPhotoChange,
    id,
    isViewMode,
  }: {
    title: string;
    photo: string | null;
    onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    id: string;
    isViewMode: boolean;
  }) => {
    return (
      <div className="flex flex-col items-center">
        <label className={LABEL_STYLE}>{title}</label>
        <div className="w-28 h-28 rounded-md bg-gray-100 mb-2 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 hover:border-violet-500 transition-colors">
          {photo ? (
            <img
              src={photo}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-12 h-12 text-gray-400" />
          )}
        </div>
        {!isViewMode && (
          <>
            <input
              type="file"
              id={id}
              className="hidden"
              accept="image/*"
              onChange={onPhotoChange}
            />
            <label
              htmlFor={id}
              className="cursor-pointer bg-gray-600 text-white px-3 py-1 rounded-md hover:bg-gray-700 text-xs shadow-sm w-full text-center"
            >
              Upload
            </label>
          </>
        )}
      </div>
    );
  }
);

interface CreateStudentProps {
  mode: "create" | "view" | "edit";
  studentData?: any;
  onSave?: (data: any, exit: boolean) => void;
  onCancel: () => void;
  onEdit?: () => void;
}

const CreateStudent: React.FC<CreateStudentProps> = ({
  mode,
  studentData,
  onSave,
  onCancel,
  onEdit,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [classList, setClassList] = useState<string[]>([]);
  const [sectionList, setSectionList] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<{ branch_name: string, location_code: string }[]>([]);
  const [locationOptions, setLocationOptions] = useState<{ code: string, name: string }[]>([]);
  const [academicYearOptions, setAcademicYearOptions] = useState<{ code: string, name: string }[]>([]);
  const isViewMode = mode === "view";
  const currentBranch = localStorage.getItem("currentBranch");
  const isAllBranch = currentBranch === "All" || currentBranch === "All Branches";
  const canSelectBranch = mode === "create" && isAllBranch;
  const currentLocation = localStorage.getItem("currentLocation");
  const isAllLocation = currentLocation === "All" || currentLocation === "All Locations";
  const canSelectLocation = mode === "create" && isAllLocation;



  const initialFormData: Record<string, any> = {
    admissionNo: "",
    first_name: "",
    last_name: "",
    gender: "",
    dob: "",
    Doa: "",
    BloodGroup: "",
    Adharcardno: "",
    Religion: "",
    phone: "",
    email: "",
    address: "",
    Category: "",
    class: "",
    section: "",
    Roll_Number: "",
    admission_date: new Date().toISOString().split('T')[0],
    status: "Active",
    MotherTongue: "",
    Caste: "",
    StudentType: "",
    House: "",
    StudentHeight: "",
    StudentWeight: "",
    SamagraId: "",
    ChildId: "",
    PEN: "",
    permanentCity: "",
    previousSchoolName: "",
    primaryIncomePerYear: "",
    secondaryIncomePerYear: "",
    primaryOfficeAddress: "",
    secondaryOfficeAddress: "",
    Hobbies: "",
    SecondLanguage: "",
    ThirdLanguage: "",
    GroupUniqueId: "",
    serviceNumber: "",
    EmploymentservingStatus: "",
    StudentStatus: "",
    ApaarId: "",
    Stream: "",
    EmploymentCategory: "",
    Fatherfirstname: "",
    FatherLastName: "",
    FatherPhone: "",
    SmsNo: "",
    FatherEmail: "",
    PrimaryQualification: "",
    FatherOccuption: "",
    FatherCompany: "",
    FatherDesignation: "",
    FatherAadhar: "",
    FatherOrganizationId: "",
    FatherOtherOrganization: "",
    Motherfirstname: "",
    MothermiddleName: "",
    Motherlastname: "",
    SecondaryPhone: "",
    SecondaryEmail: "",
    SecondaryQualification: "",
    SecondaryOccupation: "",
    SecondaryCompany: "",
    SecondaryDesignation: "",
    MotherAadhar: "",
    MotherOrganizationId: "",
    MotherOtherOrganization: "",
    GuardianName: "",
    GuardianRelation: "",
    GuardianQualification: "",
    GuardianOccupation: "",
    GuardianDesignation: "",
    GuardianDepartment: "",
    GuardianOfficeAddress: "",
    GuardianContactNo: "",

    AdmissionCategory: "",
    AdmissionClass: "",
    location: localStorage.getItem('location') || '',
    branch: localStorage.getItem('branch') || '',
    academic_year: localStorage.getItem('academicYear') || "",
    presentAddress: "",
    presentCity: "",
    presentPin: "",
    permanentAddress: "",
    permanentCity_ui: "",
    isSameAddress: false,
    // Previous School Details (New Fields)
    SchoolName: "",
    PreviousSchoolClass: "",
    TCNumber: "",
    PreviousAdmissionNumber: "",
  };

  const [formData, setFormData] = useState<Record<string, any>>(initialFormData);



  // Helper to derive location from branch name
  const deriveLocationFromBranch = (branchName: string, branches: any[], availableLocations: any[]) => {
    const selectedBranch = branches.find((b: any) => b.branch_name === branchName);
    if (selectedBranch) {
      const code = (selectedBranch.location_code || '').trim().toUpperCase();
      // Find matching location by code (case-insensitive)
      const match = availableLocations.find(l => l.code.toUpperCase() === code);
      if (match) {
        return match.name;
      }
    }
    return "";
  };

  // Photos
  const [studentPhoto, setStudentPhoto] = useState<string | null>(null);
  const [fatherPhoto, setFatherPhoto] = useState<string | null>(null);
  const [motherPhoto, setMotherPhoto] = useState<string | null>(null);
  const [guardianPhoto, setGuardianPhoto] = useState<string | null>(null);

  // History State
  const [academicHistory, setAcademicHistory] = useState<any[]>([]);

  // Documents
  const [checkedDocuments, setCheckedDocuments] = useState<string[]>([]);

  // Load student data for edit/view
  useEffect(() => {
    if (studentData) {
      console.log("CreateStudent received studentData:", studentData);
      console.log("Keys in studentData:", Object.keys(studentData));

      const mapped = { ...initialFormData };

      Object.keys(initialFormData).forEach((key) => {
        const val =
          studentData[key] ??
          studentData[key.replace(/_/g, "")] ??
          studentData[key.toLowerCase()] ??
          mapped[key];

        mapped[key] = val;

        // Debug specific fields
        if (["Roll_Number", "AdmissionCategory", "StudentStatus", "BloodGroup"].includes(key)) {
          console.log(`Mapping ${key}: studentData[${key}]=${studentData[key]}, Result=${val}`);
        }
      });

      // Normalize Branch and Location (Case-insensitive match)
      // Removed hardcoded branch normalization to support dynamic branches
      // const branchOptions = ["North", "South", "East", "West", "NorthEast"];
      // if (mapped.branch) {
      //   const match = branchOptions.find(opt => opt.toLowerCase() === mapped.branch.trim().toLowerCase());
      //   if (match) mapped.branch = match;
      // }

      const locationOptions = ["Hyderabad", "Mumbai", "Bangalore"];
      if (mapped.location) {
        const match = locationOptions.find(opt => opt.toLowerCase() === mapped.location.trim().toLowerCase());
        if (match) mapped.location = match;
      }

      mapped.admissionNo = studentData.admission_no ?? mapped.admissionNo;
      mapped.presentAddress = studentData.address ?? "";
      mapped.class = studentData.class ?? studentData.clazz ?? "";

      // Explicit Mapping for Previous School Details
      mapped.SchoolName = studentData.SchoolName || "";
      mapped.PreviousSchoolClass = studentData.PreviousSchoolClass || "";
      mapped.TCNumber = studentData.TCNumber || "";
      mapped.PreviousAdmissionNumber = studentData.AdmissionNumber || ""; // Back from backend is AdmissionNumber

      console.log("Mapped formData:", mapped);
      setFormData(mapped);
      setCheckedDocuments(studentData.documents || []);
      setMotherPhoto(studentData.photos?.mother || null);
      setGuardianPhoto(studentData.photos?.guardian || null);

      // Fetch History
      if (studentData.student_id || studentData.id) {
        api.get(`/students/${studentData.student_id || studentData.id}/history`)
          .then(res => setAcademicHistory(res.data.history || []))
          .catch(console.error);
      }
    }
  }, [studentData]);

  // Consolidated into the main useEffect above to ensure we have branches loaded before deriving location
  // Leaving this empty or removing.
  useEffect(() => {
    // Intentionally left empty - logic moved to combined useEffect
  }, []);
  useEffect(() => {
    const fetchSections = async () => {
      if (!formData.class) {
        setSectionList([]);
        return;
      }

      try {
        const branch = formData.branch || localStorage.getItem('currentBranch') || 'All';
        const academicYear = formData.academic_year || localStorage.getItem('academicYear') || '';
        const res = await api.get('/sections', {
          params: {
            class: formData.class,
            branch,
            academic_year: academicYear,
          }
        });
        setSectionList(res.data.sections || []);
      } catch (err) {
        console.error('Failed to load sections', err);
        setSectionList([]);
      }
    };

    fetchSections();
  }, [formData.class, formData.branch, formData.academic_year]);
  useEffect(() => {
    // Fetch Classes
    api
      .get(`/classes`)
      .then((res) => {
        const list = res.data.classes || [];
        list.sort((a: any, b: any) => a.id - b.id);
        setClassList(list.map((c: any) => c.class_name));
      })
      .catch((err) => {
        console.error("Failed to load classes", err);
      });

    // Fetch Master Data: Branches, Locations, Academic Years
    Promise.all([
      api.get("/branches"),
      api.get("/org/locations"),
      api.get("/org/academic-years")
    ])
      .then(([branchRes, locRes, yearRes]) => {
        // 1. Process Locations
        const locs = locRes.data.locations || [];
        setLocationOptions(locs);

        // 2. Process Academic Years
        const years = yearRes.data.academic_years || [];
        setAcademicYearOptions(years);

        // 3. Process Branches
        let branches: any[] = [];
        if (branchRes.data.branches) {
          branches = branchRes.data.branches.map((b: any) => ({
            branch_name: b.branch_name,
            location_code: b.location_code
          }));
          setBranchOptions(branches);
        }

        // 4. Auto-Set Branch and Location (if in Create mode)
        if (mode === "create") {
          const savedBranch = localStorage.getItem("currentBranch");
          const savedUser = localStorage.getItem("user");
          let userRole = "";
          let userBranch = "";

          if (savedUser) {
            try {
              const u = JSON.parse(savedUser);
              userRole = u.role;
              userBranch = u.branch;
            } catch (e) {
              console.error("Error parsing user from localStorage", e);
            }
          }

          let targetBranch = "";
          const isAllBranch = savedBranch === "All" || savedBranch === "All Branches";
          if (userRole === 'Admin') {
            if (savedBranch && !isAllBranch) {
              targetBranch = savedBranch;
            }
          } else if (userBranch) {
            targetBranch = userBranch;
          }

          if (!targetBranch && !isAllBranch) {
            const storedBranch = localStorage.getItem("branch") || "";
            if (storedBranch) {
              targetBranch = storedBranch;
            } else if (branches.length > 0) {
              targetBranch = branches[0].branch_name;
            }
          }

          if (targetBranch) {
            // Pass the loaded 'branches' and 'locs' to the helper
            const derivedLoc = deriveLocationFromBranch(targetBranch, branches, locs);

            let normalizedYear = formData.academic_year;
            // Normalize Academic Year: Match "2025-2026" to "2025 - 2026"
            const currentYearLocal = localStorage.getItem('academicYear') || "";
            const yearMatch = years.find((y: any) => y.name.replace(/\s/g, '') === currentYearLocal.replace(/\s/g, ''));
            if (yearMatch) {
              normalizedYear = yearMatch.name;
            }

            setFormData(prev => ({
              ...prev,
              branch: targetBranch,
              location: derivedLoc || prev.location,
              academic_year: normalizedYear
            }));
          } else if (isAllBranch) {
            setFormData(prev => ({
              ...prev,
              branch: "",
              location: "",
              academic_year: prev.academic_year || (localStorage.getItem("academicYear") || "")
            }));
          }
        }

      })
      .catch(err => console.error("Failed to load master data", err));

  }, [mode]);

  // Removing logic from the other useEffect to avoid conflicts? 
  // The other useEffect [mode] (lines 398-429) was doing similar thing but without access to branchOptions for location.
  // I will leave that one empty or remove it. Better to remove it to avoid double setting.

  // Handle Inputs  
  const handleInputChange = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      const { name, value, type } = e.target;

      if (isViewMode) return;

      // Auto-update location when branch changes
      if (name === 'branch') {
        const newLocation = deriveLocationFromBranch(value, branchOptions, locationOptions);
        setFormData(prev => ({ ...prev, [name]: value, location: newLocation || prev.location }));
        return;
      }

      // Checkbox logic
      if (type === "checkbox") {
        const { checked } = e.target as HTMLInputElement;

        setFormData((prev) => {
          const updated = { ...prev, [name]: checked };
          if (name === "isSameAddress") {
            updated.permanentAddress = checked ? prev.presentAddress : "";
            updated.permanentCity_ui = checked ? prev.presentCity : "";
            updated.permanentPin = checked ? prev.presentPin : "";
          }
          return updated;
        });
        return;
      }

      // Aadhaar Formatting
      if (
        name === "Adharcardno" ||
        name === "FatherAadhar" ||
        name === "MotherAadhar"
      ) {
        let digits = value.replace(/\D/g, "").slice(0, 12);
        const formatted = digits.match(/.{1,4}/g)?.join("-") || "";

        setFormData((prev) => ({
          ...prev,
          [name]: formatted,
        }));
        return;
      }
      if (name === "presentPin") {
        // Only digits, max 6
        const digits = value.replace(/\D/g, "").slice(0, 6);

        setFormData((prev) => ({
          ...prev,
          presentPin: digits,
        }));
        return;
      }
      if (name === "Roll_Number") {
        // Allow only digits (no minus, no decimals)
        const digits = value.replace(/\D/g, "");

        setFormData((prev) => ({
          ...prev,
          Roll_Number: digits,
        }));
        return;
      }


      // Phone formatting with +91 prefix
      // Phone formatting with +91 prefix (stable typing)
      if (
        name === "phone" ||
        name === "FatherPhone" ||
        name === "SecondaryPhone" ||
        name === "SmsNo" ||
        name === "GuardianContactNo"
      ) {
        let input = value;

        // Ensure prefix exists
        if (!input.startsWith("+91 ")) {
          // User deleted prefix → restore it
          input = "+91 " + input.replace(/\D/g, "");
        }

        // Extract digits after +91 
        let digits = input.replace("+91 ", "").replace(/\D/g, "");

        // Limit to 10 digits
        digits = digits.slice(0, 10);

        // Final value = "+91 " + digits
        const finalValue = "+91 " + digits;


        // Update state
        setFormData((prev) => ({
          ...prev,
          [name]: finalValue,
        }));

        return;
      }



      // Default input
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    },
    [isViewMode]
  );




  const handlePhotoChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onloadend = () => setter(reader.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setStudentPhoto(null);
    setFatherPhoto(null);
    setMotherPhoto(null);
    setGuardianPhoto(null);
    setCheckedDocuments([]);
  };

  const handleResetClick = (e: React.MouseEvent) => {
    e.preventDefault();
    resetForm();
  };

  const buildPayload = () => {
    return {
      admission_no: formData.admissionNo,
      first_name: formData.first_name,
      last_name: formData.last_name,
      gender: formData.gender,
      dob: formData.dob,
      Doa: formData.Doa,
      BloodGroup: formData.BloodGroup,
      Adharcardno: formData.Adharcardno,
      Religion: formData.Religion,
      phone: formData.phone,
      email: formData.email,
      address: formData.presentAddress,
      Category: formData.Category,
      class: formData.class,
      section: formData.section,
      Roll_Number: formData.Roll_Number ? Number(formData.Roll_Number) : null,
      admission_date: formData.admission_date,
      status: formData.status,
      MotherTongue: formData.MotherTongue,
      Caste: formData.Caste,
      StudentType: formData.StudentType,
      House: formData.House,
      Fatherfirstname: formData.Fatherfirstname,
      FatherPhone: formData.FatherPhone,
      SmsNo: formData.SmsNo,
      FatherEmail: formData.FatherEmail,
      PrimaryQualification: formData.PrimaryQualification,
      FatherOccuption: formData.FatherOccuption,
      FatherCompany: formData.FatherCompany,
      FatherDesignation: formData.FatherDesignation,
      FatherAadhar: formData.FatherAadhar,
      FatherOrganizationId: formData.FatherOrganizationId,
      FatherOtherOrganization: formData.FatherOtherOrganization,
      Motherfirstname: formData.Motherfirstname,
      MothermiddleName: formData.MothermiddleName,
      Motherlastname: formData.Motherlastname,
      SecondaryPhone: formData.SecondaryPhone,
      SecondaryEmail: formData.SecondaryEmail,
      SecondaryQualification: formData.SecondaryQualification,
      SecondaryOccupation: formData.SecondaryOccupation,
      SecondaryCompany: formData.SecondaryCompany,
      SecondaryDesignation: formData.SecondaryDesignation,
      MotherAadhar: formData.MotherAadhar,
      MotherOrganizationId: formData.MotherOrganizationId,
      MotherOtherOrganization: formData.MotherOtherOrganization,
      GuardianName: formData.GuardianName,
      GuardianRelation: formData.GuardianRelation,
      GuardianQualification: formData.GuardianQualification,
      GuardianOccupation: formData.GuardianOccupation,
      GuardianDesignation: formData.GuardianDesignation,
      GuardianDepartment: formData.GuardianDepartment,
      GuardianOfficeAddress: formData.GuardianOfficeAddress,
      GuardianContactNo: formData.GuardianContactNo,

      AdmissionCategory: formData.AdmissionCategory,
      AdmissionClass: formData.AdmissionClass,
      StudentHeight: formData.StudentHeight ? Number(formData.StudentHeight) : null,
      StudentWeight: formData.StudentWeight ? Number(formData.StudentWeight) : null,
      SamagraId: formData.SamagraId,
      ChildId: formData.ChildId,
      PEN: formData.PEN,
      permanentCity: formData.permanentCity_id,
      previousSchoolName: formData.previousSchoolName,
      primaryIncomePerYear: formData.primaryIncomePerYear ? Number(formData.primaryIncomePerYear) : null,
      secondaryIncomePerYear: formData.secondaryIncomePerYear ? Number(formData.secondaryIncomePerYear) : null,
      primaryOfficeAddress: formData.primaryOfficeAddress,
      secondaryOfficeAddress: formData.secondaryOfficeAddress,
      Hobbies: formData.Hobbies,
      SecondLanguage: formData.SecondLanguage,
      ThirdLanguage: formData.ThirdLanguage,
      GroupUniqueId: formData.GroupUniqueId,
      serviceNumber: formData.serviceNumber,
      EmploymentservingStatus: formData.EmploymentservingStatus,
      StudentStatus: formData.StudentStatus,
      ApaarId: formData.ApaarId,
      Stream: formData.Stream,
      location: formData.location,
      branch: formData.branch,
      academic_year: formData.academic_year,
      photos: {
        student: studentPhoto,
        father: fatherPhoto,
        mother: motherPhoto,
        guardian: guardianPhoto,
      },
      documents: checkedDocuments,
      feeInstallments: formData.feeInstallments,
      // Previous School Details Mapped to Backend
      SchoolName: formData.SchoolName,
      PreviousSchoolClass: formData.PreviousSchoolClass,
      TCNumber: formData.TCNumber,
      AdmissionNumber: formData.PreviousAdmissionNumber, // Map to backend AdmissionNumber (distinct from admission_no)
    };
  };

  const handleSaveClick = async (exit: boolean) => {
    if (
      mode === "create" &&
      (!formData.first_name ||
        !formData.last_name ||
        !formData.admission_date ||
        !formData.AdmissionCategory ||
        !formData.AdmissionClass ||
        !formData.branch ||
        !formData.academic_year ||
        !formData.class ||
        !formData.gender ||
        !formData.dob ||
        !formData.phone ||
        !formData.email ||
        !formData.Adharcardno ||
        !formData.section ||
        !formData.Fatherfirstname ||
        !formData.FatherPhone ||
        !formData.Motherfirstname ||
        !formData.SchoolName ||
        !formData.PreviousSchoolClass)
    ) {
      alert("Fill required fields");
      return;
    }

    const payload = buildPayload();

    try {
      if (mode === "create") {
        const res = await api.post(`/students`, payload);
        alert("Student created successfully!");

        if (onSave) onSave(res.data, exit);

      } else if (mode === "edit") {
        const id = studentData?.student_id || studentData?.id;
        if (!id) {
          alert("Error: Student ID is missing for update.");
          return;
        }

        const res = await api.put(`/students/${id}`, payload);
        alert("Student updated successfully!");

        // 🔥 IMPORTANT: use backend response
        if (onSave) onSave(res.data.student, exit);
      }

    } catch (error) {
      console.error("Error saving student:", error);
      alert("Failed to save student.");
    }

  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <form ref={formRef} id="create-student-form">
        <div className="bg-white p-6 rounded-lg shadow-md border space-y-4">
          {/* HEADER */}
          <div className="flex justify-between items-center border-b pb-4 mb-4 bg-gray-100 p-4 -m-6 rounded-t-lg">
            <h2 className="text-xl font-semibold text-gray-700">
              {mode === "create"
                ? "Create New Student"
                : mode === "edit"
                  ? "Edit Student"
                  : "Student Details"}
            </h2>
            {mode === "view" && (
              <button
                type="button"
                onClick={onEdit}
                className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Edit Student
              </button>
            )}
          </div>

          <div className="md:col-span-4 border p-4 rounded-md grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white">
            <FormField
              label="Class"
              name="class"
              as="select"
              required
              value={formData.class}
              onChange={handleInputChange}
              disabled={isViewMode}
            >
              <option value="">-- Select --</option>
              {classList.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </FormField>

            <FormField
              label="Section"
              name="section"
              as="select"
              required
              value={formData.section}
              onChange={handleInputChange}
              disabled={isViewMode}
            >
              <option value="">-- Select --</option>
              {sectionList.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </FormField>

            <FormField
              label="Admission No"
              name="admissionNo"
              value={formData.admissionNo}
              onChange={handleInputChange}
              disabled={true}
            />
            <FormField
              label="Admission Date"
              name="admission_date"
              type="date"
              required
              value={formData.admission_date}
              onChange={handleInputChange}
              disabled={true}
            />
            <FormField
              label="Roll Number"
              name="Roll_Number"
              type="number"
              value={formData.Roll_Number}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Admission Category"
              name="AdmissionCategory"
              as="select"
              required
              value={formData.AdmissionCategory}
              onChange={handleInputChange}
              disabled={isViewMode}
            >
              <option value="">-- Select --</option>
              <option value="Hifz">Hifz</option>
              <option value="Nazira">Hifz+Nazira</option>
            </FormField>
            <FormField
              label="Admission Class"
              name="AdmissionClass"
              value={formData.AdmissionClass}
              required
              onChange={handleInputChange}
              disabled={isViewMode || mode === "edit" && formData.AdmissionClass}
            />
            <FormField
              label="Location"
              name="location"
              as="select"
              value={formData.location}
              onChange={handleInputChange}
              disabled={isViewMode || !canSelectLocation}
              className={(isViewMode || !canSelectLocation) ? "bg-gray-100 cursor-not-allowed" : ""}
            >
              <option value="">-- Select --</option>
              {locationOptions.map((loc) => (
                <option key={loc.code} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </FormField>
            <FormField
              label="Branch"
              name="branch"
              as="select"
              required
              value={formData.branch}
              onChange={handleInputChange}
              disabled={isViewMode || !canSelectBranch}
              className={(isViewMode || !canSelectBranch) ? "bg-gray-100 cursor-not-allowed" : ""}
            >
              <option value="">-- Select --</option>
              {branchOptions.map((b) => (
                <option key={b.branch_name} value={b.branch_name}>
                  {b.branch_name}
                </option>
              ))}
            </FormField>
            {/*<FormField
              label="Student Status"
              name="StudentStatus"
              as="select"
              value={formData.StudentStatus}
              onChange={handleInputChange}
              disabled={isViewMode}
            >
              <option value="">-- Select --</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </FormField>*/}
            <FormField
              label="Academic Year"
              name="academic_year"
              as="select"
              value={formData.academic_year}
              onChange={handleInputChange}
              disabled={true}
              className="bg-gray-100 cursor-not-allowed"
            >
              {academicYearOptions.length > 0 ? (
                academicYearOptions.map(y => (
                  <option key={y.code} value={y.name}>{y.name}</option>
                ))
              ) : (
                <option value={formData.academic_year}>{formData.academic_year}</option>
              )}
            </FormField>
          </div>

          {/* --- 2. PERSONAL DETAILS --- */}
          <CollapsibleSection
            title="Personal Details"
            defaultOpen={true}
          >
            <FormField
              label="First Name"
              name="first_name"
              required
              value={formData.first_name}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Last Name"
              name="last_name"
              required
              value={formData.last_name}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Gender"
              name="gender"
              as="select"
              required
              value={formData.gender}
              onChange={handleInputChange}
              disabled={isViewMode}
            >
              <option value="">-- Select --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </FormField>

            <FormField
              label="Date of Birth"
              name="dob"
              type="date"
              required
              value={formData.dob}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Blood Group"
              name="BloodGroup"
              value={formData.BloodGroup}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Aadhar Card No"
              name="Adharcardno"
              required
              value={formData.Adharcardno}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Religion"
              name="Religion"
              value={formData.Religion}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Mother Tongue"
              name="MotherTongue"
              value={formData.MotherTongue}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Caste"
              name="Caste"
              value={formData.Caste}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Category"
              name="Category"
              value={formData.Category}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Student Type"
              name="StudentType"
              value={formData.StudentType}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="House"
              name="House"
              value={formData.House}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Height (cm)"
              name="StudentHeight"
              type="number"
              value={formData.StudentHeight}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Weight (kg)"
              name="StudentWeight"
              type="number"
              value={formData.StudentWeight}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Samagra ID"
              name="SamagraId"
              value={formData.SamagraId}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Child ID"
              name="ChildId"
              value={formData.ChildId}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="PEN"
              name="PEN"
              value={formData.PEN}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
          </CollapsibleSection>

          {/* --- 3. CONTACT DETAILS --- */}
          <CollapsibleSection title="Contact Details">
            <FormField
              label="Phone"
              name="phone"
              required
              value={formData.phone}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <div className="md:col-span-2">
              <FormField
                label="Present Address"
                name="presentAddress"
                as="textarea"
                value={formData.presentAddress}
                onChange={handleInputChange}
                disabled={isViewMode}
              />
            </div>
            <FormField
              label="Present City"
              name="presentCity"
              value={formData.presentCity}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Present Pin"
              name="presentPin"
              value={formData.presentPin}
              onChange={handleInputChange}
              disabled={isViewMode}
            />


            <div className="md:col-span-4">
              <FormField
                label="Same as Present Address"
                name="isSameAddress"
                type="checkbox"
                checked={formData.isSameAddress}
                onChange={handleInputChange}
                disabled={isViewMode}
              />
            </div>

            <div className="md:col-span-2">
              <FormField
                label="Permanent Address"
                name="permanentAddress"
                as="textarea"
                value={formData.permanentAddress}
                onChange={handleInputChange}
                disabled={isViewMode || formData.isSameAddress}
              />
            </div>
            <FormField
              label="Permanent City"
              name="permanentCity_ui"
              value={formData.permanentCity_ui}
              onChange={handleInputChange}
              disabled={isViewMode || formData.isSameAddress}
            />
          </CollapsibleSection>

          {/* --- 4. PARENT DETAILS --- */}
          <CollapsibleSection title="Parent Details">
            <h4 className="md:col-span-4 font-medium text-gray-700 mt-2 mb-2 border-b pb-1">
              Father's Details
            </h4>
            <FormField
              label="Father Name"
              name="Fatherfirstname"
              required
              value={formData.Fatherfirstname}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="FatherPhone"
              name="FatherPhone"
              required
              value={formData.FatherPhone}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="SMS No"
              name="SmsNo"
              value={formData.SmsNo}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Email"
              name="FatherEmail"
              type="email"
              value={formData.FatherEmail}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Qualification"
              name="PrimaryQualification"
              value={formData.PrimaryQualification}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Occupation"
              name="FatherOccuption"
              value={formData.FatherOccuption}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Company"
              name="FatherCompany"
              value={formData.FatherCompany}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Designation"
              name="FatherDesignation"
              value={formData.FatherDesignation}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Aadhar No"
              name="FatherAadhar"
              value={formData.FatherAadhar}
              onChange={handleInputChange}
              disabled={isViewMode}
            />

            <h4 className="md:col-span-4 font-medium text-gray-700 mt-4 mb-2 border-b pb-1">
              Mother's Details
            </h4>
            <FormField
              label="Mother Name"
              name="Motherfirstname"
              required
              value={formData.Motherfirstname}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Phone"
              name="SecondaryPhone"
              value={formData.SecondaryPhone}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Email"
              name="SecondaryEmail"
              type="email"
              value={formData.SecondaryEmail}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Qualification"
              name="SecondaryQualification"
              value={formData.SecondaryQualification}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Occupation"
              name="SecondaryOccupation"
              value={formData.SecondaryOccupation}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Company"
              name="SecondaryCompany"
              value={formData.SecondaryCompany}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Designation"
              name="SecondaryDesignation"
              value={formData.SecondaryDesignation}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Aadhar No"
              name="MotherAadhar"
              value={formData.MotherAadhar}
              onChange={handleInputChange}
              disabled={isViewMode}
            />

            <h4 className="md:col-span-4 font-medium text-gray-700 mt-4 mb-2 border-b pb-1">
              Guardian's Details
            </h4>
            <FormField
              label="Name"
              name="GuardianName"
              value={formData.GuardianName}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Relation"
              name="GuardianRelation"
              value={formData.GuardianRelation}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Phone"
              name="GuardianContactNo"
              value={formData.GuardianContactNo}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Qualification"
              name="GuardianQualification"
              value={formData.GuardianQualification}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Occupation"
              name="GuardianOccupation"
              value={formData.GuardianOccupation}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Office Address"
              name="GuardianOfficeAddress"
              value={formData.GuardianOfficeAddress}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
          </CollapsibleSection>

          {/* --- 5. Previous School Details --- */}
          <CollapsibleSection title="Previous School Details">
            <FormField
              label="School Name"
              name="SchoolName"
              value={formData.SchoolName}
              required
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="School Class"
              name="PreviousSchoolClass"
              value={formData.PreviousSchoolClass}
              required
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="TC Number"
              name="TCNumber"
              value={formData.TCNumber}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
            <FormField
              label="Admission Number"
              name="PreviousAdmissionNumber"
              value={formData.PreviousAdmissionNumber}
              onChange={handleInputChange}
              disabled={isViewMode}
            />
          </CollapsibleSection>

          {/* --- 6. PHOTOS & DOCUMENTS --- */}
          <CollapsibleSection title="Upload Photo">
            <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <PhotoUpload
                title="Student Photo"
                photo={studentPhoto}
                onPhotoChange={(e) => handlePhotoChange(e, setStudentPhoto)}
                id="student-photo"
                isViewMode={isViewMode}
              />
              {/* <PhotoUpload
                title="Father Photo"
                photo={fatherPhoto}
                onPhotoChange={(e) => handlePhotoChange(e, setFatherPhoto)}
                id="father-photo"
                isViewMode={isViewMode}
              />
              <PhotoUpload
                title="Mother Photo"
                photo={motherPhoto}
                onPhotoChange={(e) => handlePhotoChange(e, setMotherPhoto)}
                id="mother-photo"
                isViewMode={isViewMode}
              />
              <PhotoUpload
                title="Guardian Photo"
                photo={guardianPhoto}
                onPhotoChange={(e) => handlePhotoChange(e, setGuardianPhoto)}
                id="guardian-photo"
                isViewMode={isViewMode}
              /> */}
            </div>

            {/* <div className="md:col-span-4">
              <h4 className="font-medium text-gray-700 mb-2">
                Documents Submitted
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {documentTypes.map((doc) => (
                  <FormField
                    key={doc}
                    label={doc}
                    name={doc}
                    type="checkbox"
                    checked={checkedDocuments.includes(doc)}
                    onChange={() => handleDocumentCheck(doc)}
                    disabled={isViewMode}
                  />
                ))}
              </div>
            </div> */}
          </CollapsibleSection>



          {/* Promotion History Section */}
          {(mode === 'view' || mode === 'edit') && academicHistory.length > 0 && (
            <CollapsibleSection title="Promotion History" defaultOpen={true}>
              <div className="md:col-span-4 overflow-x-auto">
                <table className="min-w-full text-sm divide-y divide-gray-200 border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Academic Year</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Class</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Section</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Roll No</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {academicHistory.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-4 py-2">{rec.academic_year}</td>
                        <td className="px-4 py-2">{rec.class}</td>
                        <td className="px-4 py-2">{rec.section}</td>
                        <td className="px-4 py-2">{rec.roll_no || '-'}</td>
                        <td className="px-4 py-2">
                          {rec.is_promoted ?
                            <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">Promoted</span> :
                            <span className="text-gray-500 bg-gray-50 px-2 py-0.5 rounded text-xs">Enrolled</span>
                          }
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">
                          {rec.promoted_date ? new Date(rec.promoted_date).toLocaleDateString() :
                            rec.created_at ? new Date(rec.created_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {/* FOOTER BUTTONS */}
          <div className="flex justify-end space-x-4 pt-4 border-t mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
            >
              {mode === "view" ? "Back" : "Cancel"}
            </button>
            {mode !== "view" && (
              <>
                <button
                  type="button"
                  onClick={handleResetClick}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveClick(false)}
                  className="px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveClick(true)}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Save & Exit
                </button>
              </>
            )}
          </div>
        </div>
      </form >
    </div >
  );
};

export default CreateStudent;

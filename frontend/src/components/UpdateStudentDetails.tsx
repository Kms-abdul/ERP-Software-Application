import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import { SearchIcon, ArrowBackIcon, UserIcon } from './icons';

interface UpdateStudentDetailsProps {
    onBack: () => void;
}

interface Student {
    student_id: number;
    id: number;
    name: string;
    admission_no: string;
    admNo: string;
    rollNo: string;
    Roll_Number: number | string;
    class: string;
    section: string;
    photo: string;
    [key: string]: any;
}

interface Column {
    key: string;
    label: string;
    type?: 'text' | 'date' | 'select' | 'number' | 'photo' | 'class_select' | 'section_select';
    options?: string[];
}

interface Category {
    id: string;
    label: string;
    columns: Column[];
}

const CATEGORIES: Category[] = [
    {
        id: 'profile_enrollment',
        label: 'Name, Class & Photo',
        columns: [
            { key: 'photo', label: 'Photo', type: 'photo' },
            { key: 'first_name', label: 'First Name' },
            { key: 'StudentMiddleName', label: 'Middle Name' },
            { key: 'last_name', label: 'Last Name' },
            { key: 'class', label: 'Class', type: 'class_select' },
            { key: 'section', label: 'Section', type: 'section_select' },
            { key: 'Roll_Number', label: 'Roll Number', type: 'number' },
        ]
    },
    {
        id: 'personal',
        label: 'Personal Details',
        columns: [
            { key: 'dob', label: 'DOB', type: 'date' },
            { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
            { key: 'BloodGroup', label: 'Blood Group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
            { key: 'Religion', label: 'Religion' },
            { key: 'Caste', label: 'Caste' },
            { key: 'Category', label: 'Student Category' },
            { key: 'MotherTongue', label: 'Mother Tongue' },
            { key: 'Hobbies', label: 'Hobbies' },
        ]
    },
    {
        id: 'contact',
        label: 'Contact & Address',
        columns: [
            { key: 'phone', label: 'Student Mobile' },
            { key: 'email', label: 'Student Email' },
            { key: 'address', label: 'Present Address' },
            { key: 'permanentCity', label: 'Permanent City' },
            { key: 'SmsNo', label: 'SMS Mobile' },
        ]
    },
    {
        id: 'academic',
        label: 'Academic Details',
        columns: [
            { key: 'Roll_Number', label: 'Roll Number', type: 'number' },
            { key: 'admission_date', label: 'Admission Date' },
            { key: 'AdmissionClass', label: 'Admission Class' },
            { key: 'AdmissionCategory', label: 'Admission Category', type: 'select', options: ['Hifz', 'Hifz+Nazira', 'Hifz Nazire'] },
            { key: 'StudentType', label: 'Student Type' },
            { key: 'House', label: 'House' },
            { key: 'SecondLanguage', label: 'Second Language' },
            { key: 'ThirdLanguage', label: 'Third Language' },
            { key: 'Stream', label: 'Stream' },
        ]
    },
    {
        id: 'physical',
        label: 'Physical & Health',
        columns: [
            { key: 'StudentHeight', label: 'Height (cm)', type: 'number' },
            { key: 'StudentWeight', label: 'Weight (kg)', type: 'number' },
        ]
    },
    {
        id: 'father',
        label: 'Father Details',
        columns: [
            { key: 'Fatherfirstname', label: 'Father First Name' },
            { key: 'FatherMiddleName', label: 'Father Middle Name' },
            { key: 'FatherLastName', label: 'Father Last Name' },
            { key: 'FatherPhone', label: 'Father Mobile' },
            { key: 'FatherEmail', label: 'Father Email' },
            { key: 'FatherAadhar', label: 'Father Aadhar' },
            { key: 'FatherOccuption', label: 'Father Occupation' },
            { key: 'FatherCompany', label: 'Father Company' },
            { key: 'FatherDesignation', label: 'Father Designation' },
            { key: 'PrimaryQualification', label: 'Qualification' },
            { key: 'primaryIncomePerYear', label: 'Annual Income', type: 'number' },
            { key: 'primaryOfficeAddress', label: 'Office Address' },
        ]
    },
    {
        id: 'mother',
        label: 'Mother Details',
        columns: [
            { key: 'Motherfirstname', label: 'Mother First Name' },
            { key: 'MothermiddleName', label: 'Mother Middle Name' },
            { key: 'Motherlastname', label: 'Mother Last Name' },
            { key: 'SecondaryPhone', label: 'Mother Mobile' },
            { key: 'SecondaryEmail', label: 'Mother Email' },
            { key: 'MotherAadhar', label: 'Mother Aadhar' },
            { key: 'SecondaryOccupation', label: 'Mother Occupation' },
            { key: 'SecondaryCompany', label: 'Mother Company' },
            { key: 'SecondaryDesignation', label: 'Mother Designation' },
            { key: 'SecondaryQualification', label: 'Qualification' },
            { key: 'secondaryIncomePerYear', label: 'Annual Income', type: 'number' },
            { key: 'secondaryOfficeAddress', label: 'Office Address' },
        ]
    },
    {
        id: 'guardian',
        label: 'Guardian Details',
        columns: [
            { key: 'GuardianName', label: 'Guardian Name' },
            { key: 'GuardianRelation', label: 'Relation' },
            { key: 'GuardianContactNo', label: 'Contact No' },
            { key: 'GuardianOccupation', label: 'Occupation' },
            { key: 'GuardianDesignation', label: 'Designation' },
            { key: 'GuardianQualification', label: 'Qualification' },
            { key: 'GuardianDepartment', label: 'Department' },
            { key: 'GuardianOfficeAddress', label: 'Office Address' },
        ]
    },
    {
        id: 'identity',
        label: 'Government & ID Details',
        columns: [
            { key: 'Adharcardno', label: 'Aadhar No' },
            { key: 'SamagraId', label: 'Samagra ID' },
            { key: 'ChildId', label: 'Child ID' },
            { key: 'PEN', label: 'PEN' },
            { key: 'ApaarId', label: 'Apaar ID' },
            { key: 'GroupUniqueId', label: 'Group Unique ID' },
            { key: 'serviceNumber', label: 'Service Number' },
        ]
    },
    {
        id: 'previous_school',
        label: 'Previous School Details',
        columns: [
            { key: 'SchoolName', label: 'School Name' },
            { key: 'PreviousSchoolClass', label: 'Previous Class' },
            { key: 'TCNumber', label: 'TC Number' },
            { key: 'AdmissionNumber', label: 'Previous Admission No' },
        ]
    }
];

const READ_ONLY_FIELDS = [
    'student_id',
    'id',
    'admission_no',
    'admNo',
    'admission_date',
    'AdmissionClass',
    'Doa',
    'name',
    'rollNo',
    'is_promoted',
    'is_locked',
];

const DISPLAY_READONLY_FIELDS = ['admission_date', 'AdmissionClass'];

const STUDENTS_PER_PAGE = 10;

const UpdateStudentDetails: React.FC<UpdateStudentDetailsProps> = ({ onBack }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0].id);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [classOptions, setClassOptions] = useState<any[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [modifiedStudents, setModifiedStudents] = useState<Record<number, Partial<Student>>>({});
    const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});
    const [saveSuccess, setSaveSuccess] = useState<Set<number>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [sectionsMap, setSectionsMap] = useState<Record<string, string[]>>({});

    const successTimeoutsRef = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const fetchSectionsForClassBranch = useCallback((className: string, branchName: string) => {
        if (!className) return;
        const academicYear = localStorage.getItem('academicYear') || '';
        const effectiveBranch = branchName === 'All' || branchName === 'All Branches' ? 'All' : (branchName || 'All');
        const key = `${effectiveBranch}_${className}`;
        
        if (sectionsMap[key] !== undefined) return;

        api.get('/sections', {
            params: {
                class: className,
                branch: effectiveBranch,
                academic_year: academicYear
            }
        })
        .then(res => {
            const list = res.data?.sections || [];
            setSectionsMap(prev => ({ ...prev, [key]: list }));
        })
        .catch(() => {
            setSectionsMap(prev => ({ ...prev, [key]: [] }));
        });
    }, [sectionsMap]);

    useEffect(() => {
        if (students.length === 0) return;
        const setKeys = new Set<string>();
        students.forEach(s => {
            const cls = s.class || s.clazz;
            const br = s.branch || localStorage.getItem('currentBranch') || 'All';
            if (cls) {
                setKeys.add(JSON.stringify({ cls, br }));
            }
        });
        setKeys.forEach(str => {
            const { cls, br } = JSON.parse(str);
            fetchSectionsForClassBranch(cls, br);
        });
    }, [students, fetchSectionsForClassBranch]);

    useEffect(() => {
        return () => {
            Object.values(successTimeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        api.get('/classes')
            .then(res => {
                const list = res.data.classes || [];
                list.sort((a: any, b: any) => a.id - b.id);
                setClassOptions(list);
            })
            .catch(err => console.error("Failed to load classes", err));
    }, []);

    useEffect(() => {
        if (!selectedClass) {
            setSectionOptions([]);
            setSelectedSection('');
            return;
        }
        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';
        api.get('/sections', {
            params: { class: selectedClass, branch, academic_year: academicYear }
        })
            .then(res => setSectionOptions(res.data.sections || []))
            .catch(() => setSectionOptions([]));
    }, [selectedClass]);

    const loadStudents = useCallback(() => {
        const trimmed = searchTerm.trim();
        // Allow loading if class is selected OR search term is typed
        if (!selectedClass && !trimmed) {
            setStudents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setModifiedStudents({});
        setSaveErrors({});
        setSaveSuccess(new Set());

        const globalBranch = localStorage.getItem('currentBranch') || '';
        const academicYear = localStorage.getItem('academicYear') || '';

        const params: Record<string, string> = {
            include_inactive: 'true',
            branch: globalBranch === "All" || globalBranch === "All Branches" ? "All" : globalBranch,
        };
        if (selectedClass) params.class = selectedClass;
        if (selectedSection) params.section = selectedSection;
        if (trimmed) {
            params.search = trimmed;
            // If searching across classes/records without a class filter, search all academic years
            if (!selectedClass) {
                params.academic_year = 'All';
            } else if (academicYear) {
                params.academic_year = academicYear;
            }
        } else if (academicYear) {
            params.academic_year = academicYear;
        }

        const headers: Record<string, string> = {};
        if (params.academic_year === 'All') {
            headers['X-Academic-Year'] = 'All';
        }

        api.get('/students', { params, headers })
            .then(res => setStudents(res.data.students || []))
            .catch(() => setStudents([]))
            .finally(() => setLoading(false));
    }, [selectedClass, selectedSection, searchTerm]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadStudents();
        }, 300);
        return () => clearTimeout(timer);
    }, [loadStudents]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory, searchTerm, selectedClass, selectedSection]);

    const handleFieldChange = (studentId: number, field: string, value: any) => {
        if (READ_ONLY_FIELDS.includes(field)) return;

        setSaveErrors(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
        });
        setSaveSuccess(prev => {
            const next = new Set(prev);
            next.delete(studentId);
            return next;
        });

        setModifiedStudents(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [field]: value
            }
        }));
    };

    const modifiedStudentIds = useMemo(() => {
        return Object.keys(modifiedStudents)
            .map(Number)
            .filter(id => Object.keys(modifiedStudents[id] || {}).length > 0);
    }, [modifiedStudents]);

    const modifiedCount = modifiedStudentIds.length;

    const resetStudentChanges = (studentId: number) => {
        setModifiedStudents(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
        });
        setSaveErrors(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
        });
    };

    const resetAllChanges = () => {
        setModifiedStudents({});
        setSaveErrors({});
    };

    const saveStudentChanges = async (studentId: number): Promise<boolean> => {
        const changes = modifiedStudents[studentId];
        if (!changes || Object.keys(changes).length === 0) return true;

        const cleanChanges: Record<string, any> = {};
        for (const [key, value] of Object.entries(changes)) {
            if (!READ_ONLY_FIELDS.includes(key)) {
                cleanChanges[key] = value;
            }
        }

        if (Object.keys(cleanChanges).length === 0) {
            setModifiedStudents(prev => {
                const next = { ...prev };
                delete next[studentId];
                return next;
            });
            return true;
        }

        setSavingIds(prev => new Set(prev).add(studentId));
        setSaveErrors(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
        });

        try {
            const currentStudent = students.find(s => (s.student_id || s.id) === studentId);
            const academicYear = localStorage.getItem('academicYear') || currentStudent?.academic_year || '';
            const payload: Record<string, any> = {
                ...cleanChanges,
                academic_year: academicYear,
            };

            if (cleanChanges.class !== undefined) {
                payload.class = cleanChanges.class;
            } else if (cleanChanges.Roll_Number !== undefined) {
                payload.class = selectedClass || currentStudent?.class || currentStudent?.clazz;
            }

            if (cleanChanges.section !== undefined) {
                payload.section = cleanChanges.section;
            } else if (cleanChanges.Roll_Number !== undefined) {
                payload.section = selectedSection || currentStudent?.section;
            }

            if (cleanChanges.photos !== undefined) {
                payload.photos = cleanChanges.photos;
            }

            const res = await api.put(`/students/${studentId}`, payload);
            const backendStudent = res.data?.student || {};

            setStudents(prev => prev.map(s => {
                const sid = s.student_id || s.id;
                if (sid === studentId) {
                    const merged = { ...s, ...cleanChanges, ...backendStudent };
                    if (cleanChanges.first_name || cleanChanges.last_name || cleanChanges.StudentMiddleName) {
                        merged.first_name = cleanChanges.first_name ?? merged.first_name;
                        merged.StudentMiddleName = cleanChanges.StudentMiddleName ?? merged.StudentMiddleName;
                        merged.last_name = cleanChanges.last_name ?? merged.last_name;
                        merged.name = [merged.first_name, merged.StudentMiddleName, merged.last_name].filter(Boolean).join(' ') || merged.name;
                    }
                    if (cleanChanges.class) {
                        merged.class = cleanChanges.class;
                        merged.clazz = cleanChanges.class;
                    }
                    if (cleanChanges.section) {
                        merged.section = cleanChanges.section;
                    }
                    if (cleanChanges.photos?.student) {
                        merged.photo = cleanChanges.photos.student;
                    }
                    return merged;
                }
                return s;
            }));

            setModifiedStudents(prev => {
                const next = { ...prev };
                delete next[studentId];
                return next;
            });

            setSaveSuccess(prev => new Set(prev).add(studentId));

            if (successTimeoutsRef.current[studentId]) {
                clearTimeout(successTimeoutsRef.current[studentId]);
            }

            successTimeoutsRef.current[studentId] = setTimeout(() => {
                setSaveSuccess(prev => {
                    const next = new Set(prev);
                    next.delete(studentId);
                    return next;
                });
                delete successTimeoutsRef.current[studentId];
            }, 3000);

            return true;
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message || "Failed to update";
            setSaveErrors(prev => ({ ...prev, [studentId]: errorMsg }));
            return false;
        } finally {
            setSavingIds(prev => {
                const next = new Set(prev);
                next.delete(studentId);
                return next;
            });
        }
    };

    const saveAllChanges = async () => {
        if (modifiedStudentIds.length === 0 || isSavingAll) return;
        setIsSavingAll(true);
        try {
            await Promise.allSettled(
                modifiedStudentIds.map(sid => saveStudentChanges(sid))
            );
        } finally {
            setIsSavingAll(false);
        }
    };

    const filteredStudents = students.filter(s => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase().trim();
        const name = (s.name || `${s.first_name || ''} ${s.last_name || ''}` || '').toLowerCase();
        const admNo = (s.admission_no || s.admNo || s.AdmissionNumber || '').toString().toLowerCase();
        const rollNo = s.Roll_Number ? s.Roll_Number.toString().toLowerCase() : '';
        const father = (s.Fatherfirstname || s.father || '').toLowerCase();
        const phone = (s.phone || s.FatherPhone || s.fatherMobile || '').toLowerCase();
        return name.includes(term) || admNo.includes(term) || rollNo.includes(term) || father.includes(term) || phone.includes(term);
    });

    const totalStudents = filteredStudents.length;
    const totalPages = Math.ceil(totalStudents / STUDENTS_PER_PAGE);
    const indexOfFirstStudent = (currentPage - 1) * STUDENTS_PER_PAGE;
    const indexOfLastStudent = Math.min(indexOfFirstStudent + STUDENTS_PER_PAGE, totalStudents);
    const currentStudents = filteredStudents.slice(indexOfFirstStudent, indexOfLastStudent);

    const activeCat = CATEGORIES.find(c => c.id === selectedCategory)!;

    // Generate page numbers to show
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 7;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white">
            {/* Top Toolbar */}
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                        title="Back"
                    >
                        <ArrowBackIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wider">
                        Update Student Details
                    </h2>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <select
                        value={selectedClass}
                        onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setSelectedSection('');
                        }}
                        className="border border-gray-300 px-3 py-2 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500 shadow-sm"
                    >
                        <option value="">-- Select Class --</option>
                        {classOptions.map(c => (
                            <option key={c.id} value={c.class_name}>{c.class_name}</option>
                        ))}
                    </select>

                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="border border-gray-300 px-3 py-2 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500 shadow-sm"
                    >
                        <option value="">-- Select Section --</option>
                        {sectionOptions.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by Adm No / Name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    loadStudents();
                                }
                            }}
                            className="border border-gray-300 px-3 py-2 pl-9 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500 shadow-sm w-64"
                        />
                        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>

                    {/* Master / Unique Save All & Reset All Buttons */}
                    <div className="flex items-center gap-2 border-l pl-3 border-gray-300">
                        <button
                            onClick={saveAllChanges}
                            disabled={modifiedCount === 0 || isSavingAll}
                            className={`px-3.5 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                                modifiedCount > 0 && !isSavingAll
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer ring-2 ring-emerald-400/40'
                                    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                            }`}
                            title={modifiedCount > 0 ? `Save all ${modifiedCount} modified students` : 'No modified students to save'}
                        >
                            {isSavingAll ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Saving All...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                    <span>Save All {modifiedCount > 0 ? `(${modifiedCount})` : ''}</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={resetAllChanges}
                            disabled={modifiedCount === 0 || isSavingAll}
                            className={`px-3 py-2 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                                modifiedCount > 0 && !isSavingAll
                                    ? 'bg-white hover:bg-red-50 text-red-600 border border-red-300 cursor-pointer shadow-sm'
                                    : 'bg-gray-50 text-gray-300 border border-gray-200 cursor-not-allowed'
                            }`}
                            title={modifiedCount > 0 ? `Discard unsaved edits for all ${modifiedCount} students` : 'No changes to reset'}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Reset All {modifiedCount > 0 ? `(${modifiedCount})` : ''}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel */}
                <div className="w-64 border-r bg-gray-50 flex-shrink-0">
                    <div className="p-4">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-4 tracking-widest">
                            Categories
                        </h3>
                        <nav className="space-y-1">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`w-full text-left px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${selectedCategory === cat.id
                                        ? 'bg-violet-600 text-white shadow-md'
                                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                                        }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Table */}
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-tight whitespace-nowrap">
                                        S.No
                                    </th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-tight whitespace-nowrap">
                                        Student Name
                                    </th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-tight whitespace-nowrap">
                                        Adm No.
                                    </th>
                                    {activeCat.columns.map(col => (
                                        <th
                                            key={col.key}
                                            className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-tight whitespace-nowrap"
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 text-center font-bold text-violet-700 uppercase tracking-tight bg-violet-50 min-w-[150px] whitespace-nowrap">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td
                                            colSpan={activeCat.columns.length + 4}
                                            className="px-4 py-10 text-center text-gray-500 italic"
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                                Loading students...
                                            </div>
                                        </td>
                                    </tr>
                                ) : currentStudents.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={activeCat.columns.length + 4}
                                            className="px-4 py-10 text-center text-gray-500 italic"
                                        >
                                            {searchTerm.trim()
                                                ? `No students found matching "${searchTerm.trim()}".`
                                                : selectedClass && selectedSection
                                                    ? 'No students found for the selected Class and Section.'
                                                    : selectedClass
                                                        ? 'Please select a Section or search by Admission Number / Name.'
                                                        : 'Please select a Class and Section, or search by Admission Number / Name.'}
                                        </td>
                                    </tr>
                                ) : (
                                    currentStudents.map((student, idx) => {
                                        const sid = student.student_id || student.id;
                                        const isModified = !!modifiedStudents[sid] &&
                                            Object.keys(modifiedStudents[sid]).length > 0;
                                        const isSaving = savingIds.has(sid);
                                        const hasError = !!saveErrors[sid];
                                        const isSuccess = saveSuccess.has(sid);

                                        return (
                                            <tr
                                                key={sid}
                                                className={`transition-colors duration-150 ${hasError
                                                    ? 'bg-red-50'
                                                    : isSuccess
                                                        ? 'bg-green-50'
                                                        : isModified
                                                            ? 'bg-yellow-50'
                                                            : 'hover:bg-violet-50'
                                                    }`}
                                            >
                                                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                    {indexOfFirstStudent + idx + 1}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        {modifiedStudents[sid]?.photos?.student || student.photo ? (
                                                            <img
                                                                src={modifiedStudents[sid]?.photos?.student || student.photo}
                                                                className={`w-9 h-9 rounded-full border shadow-sm object-cover flex-shrink-0 ${
                                                                    modifiedStudents[sid]?.photos?.student ? 'ring-2 ring-emerald-500' : ''
                                                                }`}
                                                                alt={student.name}
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).src = '';
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-9 h-9 rounded-full border bg-violet-50 flex items-center justify-center flex-shrink-0">
                                                                <UserIcon className="w-5 h-5 text-violet-400" />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-gray-900 text-sm">
                                                                {([
                                                                    modifiedStudents[sid]?.first_name ?? student.first_name,
                                                                    modifiedStudents[sid]?.StudentMiddleName ?? student.StudentMiddleName,
                                                                    modifiedStudents[sid]?.last_name ?? student.last_name
                                                                ].filter(Boolean).join(' ')) || student.name || 'Student'}
                                                            </span>
                                                            <span className="text-xs text-gray-500 font-medium">
                                                                Class {modifiedStudents[sid]?.class ?? student.class ?? student.clazz ?? '-'}-{modifiedStudents[sid]?.section ?? student.section ?? '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-gray-600 text-xs whitespace-nowrap">
                                                    {student.admission_no || student.admNo}
                                                </td>

                                                {activeCat.columns.map(col => {
                                                    const isDisplayReadOnly = DISPLAY_READONLY_FIELDS.includes(col.key);
                                                    const currentVal = modifiedStudents[sid]?.[col.key] ?? student[col.key] ?? '';
                                                    const displayVal = currentVal !== null && currentVal !== undefined
                                                        ? String(currentVal)
                                                        : '';

                                                    if (col.type === 'photo') {
                                                        const photoPreview = modifiedStudents[sid]?.photos?.student || student.photo;
                                                        const isPhotoModified = !!modifiedStudents[sid]?.photos?.student;
                                                        return (
                                                            <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="relative">
                                                                        {photoPreview ? (
                                                                            <img
                                                                                src={photoPreview}
                                                                                alt="Preview"
                                                                                className={`w-9 h-9 rounded-full object-cover border shadow-xs ${
                                                                                    isPhotoModified ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-gray-200'
                                                                                }`}
                                                                                onError={(e) => {
                                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <div className="w-9 h-9 rounded-full border bg-violet-50 flex items-center justify-center text-violet-400">
                                                                                <UserIcon className="w-5 h-5" />
                                                                            </div>
                                                                        )}
                                                                        {isPhotoModified && (
                                                                            <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[9px] font-bold px-1 rounded-full shadow">
                                                                                New
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <label
                                                                        className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-all border flex items-center gap-1 ${
                                                                            isPhotoModified
                                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                                                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-2xs'
                                                                        }`}
                                                                        title="Upload / Change student photo"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        </svg>
                                                                        <span>{isPhotoModified ? 'Change' : 'Upload'}</span>
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            className="hidden"
                                                                            disabled={isSaving}
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0];
                                                                                if (file) {
                                                                                    if (file.size > 5 * 1024 * 1024) {
                                                                                        alert("Image size should be less than 5MB");
                                                                                        return;
                                                                                    }
                                                                                    const reader = new FileReader();
                                                                                    reader.onload = () => {
                                                                                        const base64 = reader.result as string;
                                                                                        handleFieldChange(sid, 'photos', { student: base64 });
                                                                                    };
                                                                                    reader.readAsDataURL(file);
                                                                                }
                                                                            }}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    if (col.type === 'class_select') {
                                                        const studentClass = modifiedStudents[sid]?.class ?? student.class ?? student.clazz ?? '';
                                                        const studentBranch = student.branch || localStorage.getItem('currentBranch') || 'All';
                                                        return (
                                                            <td key={col.key} className="px-2 py-2 text-gray-700">
                                                                <select
                                                                    value={studentClass}
                                                                    onChange={(e) => {
                                                                        const newClass = e.target.value;
                                                                        handleFieldChange(sid, 'class', newClass);
                                                                        handleFieldChange(sid, 'section', '');
                                                                        fetchSectionsForClassBranch(newClass, studentBranch);
                                                                    }}
                                                                    disabled={isSaving}
                                                                    className={`w-full min-w-[120px] px-2 py-1.5 border rounded text-sm outline-none transition-all ${
                                                                        isSaving
                                                                            ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
                                                                            : modifiedStudents[sid]?.class !== undefined
                                                                                ? 'border-violet-400 bg-violet-50 focus:border-violet-600 focus:bg-white font-semibold text-violet-900'
                                                                                : 'border-gray-200 hover:border-gray-400 focus:border-violet-500 focus:bg-white bg-white'
                                                                    }`}
                                                                >
                                                                    <option value="">-- Select Class --</option>
                                                                    {classOptions.map(c => (
                                                                        <option key={c.id} value={c.class_name}>{c.class_name}</option>
                                                                    ))}
                                                                    {studentClass && !classOptions.some(c => c.class_name === studentClass) && (
                                                                        <option value={studentClass}>{studentClass}</option>
                                                                    )}
                                                                </select>
                                                            </td>
                                                        );
                                                    }

                                                    if (col.type === 'section_select') {
                                                        const studentClass = modifiedStudents[sid]?.class ?? student.class ?? student.clazz ?? '';
                                                        const studentSection = modifiedStudents[sid]?.section ?? student.section ?? '';
                                                        const studentBranch = student.branch || localStorage.getItem('currentBranch') || 'All';
                                                        const effectiveBranch = studentBranch === 'All Branches' ? 'All' : studentBranch;
                                                        const cacheKey = `${effectiveBranch}_${studentClass}`;
                                                        const sectionsList = studentClass ? (sectionsMap[cacheKey] || []) : [];

                                                        return (
                                                            <td key={col.key} className="px-2 py-2 text-gray-700">
                                                                <select
                                                                    value={studentSection}
                                                                    onChange={(e) => handleFieldChange(sid, 'section', e.target.value)}
                                                                    disabled={isSaving || !studentClass}
                                                                    className={`w-full min-w-[110px] px-2 py-1.5 border rounded text-sm outline-none transition-all ${
                                                                        isSaving || !studentClass
                                                                            ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
                                                                            : modifiedStudents[sid]?.section !== undefined
                                                                                ? 'border-violet-400 bg-violet-50 focus:border-violet-600 focus:bg-white font-semibold text-violet-900'
                                                                                : 'border-gray-200 hover:border-gray-400 focus:border-violet-500 focus:bg-white bg-white'
                                                                    }`}
                                                                >
                                                                    <option value="">-- Select Section --</option>
                                                                    {sectionsList.map(s => (
                                                                        <option key={s} value={s}>{s}</option>
                                                                    ))}
                                                                    {studentSection && !sectionsList.includes(studentSection) && (
                                                                        <option value={studentSection}>{studentSection}</option>
                                                                    )}
                                                                </select>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={col.key} className="px-2 py-2 text-gray-700">
                                                            {isDisplayReadOnly ? (
                                                                <span className="text-gray-400 italic text-xs px-2">
                                                                    {displayVal || '-'}
                                                                </span>
                                                            ) : col.type === 'select' && col.options ? (
                                                                <select
                                                                    value={displayVal}
                                                                    onChange={(e) => handleFieldChange(sid, col.key, e.target.value)}
                                                                    disabled={isSaving}
                                                                    className={`w-full min-w-[120px] px-2 py-1.5 border rounded text-sm outline-none transition-all ${isSaving
                                                                        ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
                                                                        : modifiedStudents[sid]?.[col.key] !== undefined
                                                                            ? 'border-violet-400 bg-violet-50 focus:border-violet-600 focus:bg-white'
                                                                            : 'border-transparent hover:border-gray-300 focus:border-violet-500 focus:bg-white bg-transparent'
                                                                        }`}
                                                                >
                                                                    <option value="">-- Select --</option>
                                                                    {col.options.map(opt => (
                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    type={col.type || 'text'}
                                                                    value={col.type === 'date' && displayVal.includes('T') ? displayVal.split('T')[0] : displayVal}
                                                                    onChange={(e) =>
                                                                        handleFieldChange(sid, col.key, e.target.value)
                                                                    }
                                                                    disabled={isSaving}
                                                                    className={`w-full min-w-[120px] px-2 py-1.5 border rounded text-sm outline-none transition-all ${isSaving
                                                                        ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'
                                                                        : modifiedStudents[sid]?.[col.key] !== undefined
                                                                            ? 'border-violet-400 bg-violet-50 focus:border-violet-600 focus:bg-white'
                                                                            : 'border-transparent hover:border-gray-300 focus:border-violet-500 focus:bg-white bg-transparent'
                                                                        }`}
                                                                />
                                                            )}
                                                        </td>
                                                    );
                                                })}

                                                <td className="px-3 py-2 bg-violet-50/50 whitespace-nowrap">
                                                    <div className="flex flex-col gap-1 items-center justify-center">
                                                        {hasError && (
                                                            <div
                                                                className="text-[11px] text-red-600 font-semibold bg-red-100 px-2 py-0.5 rounded border border-red-300 max-w-[130px] text-center leading-tight cursor-pointer"
                                                                title={saveErrors[sid]}
                                                                onClick={() => alert(`Error saving student: ${saveErrors[sid]}`)}
                                                            >
                                                                ⚠️ Error (click)
                                                            </div>
                                                        )}
                                                        {isSuccess && (
                                                            <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 font-bold flex items-center gap-1">
                                                                ✓ Saved
                                                            </span>
                                                        )}

                                                        <div className="flex items-center gap-1.5 w-full justify-center">
                                                            {/* Individual Save Button */}
                                                            <button
                                                                onClick={() => saveStudentChanges(sid)}
                                                                disabled={!isModified || isSaving}
                                                                className={`px-2.5 py-1 text-xs font-bold rounded flex items-center justify-center gap-1 transition-all ${
                                                                    isSaving
                                                                        ? 'bg-violet-600 text-white opacity-80 cursor-wait'
                                                                        : isModified
                                                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer'
                                                                            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                                                }`}
                                                                title={isModified ? "Save changes for this student" : "No changes to save"}
                                                            >
                                                                {isSaving ? (
                                                                    <>
                                                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                        <span>Saving</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                        <span>Save</span>
                                                                    </>
                                                                )}
                                                            </button>

                                                            {/* Individual Reset Button */}
                                                            <button
                                                                onClick={() => resetStudentChanges(sid)}
                                                                disabled={!isModified || isSaving}
                                                                className={`px-2 py-1 text-xs font-medium rounded flex items-center justify-center gap-1 transition-all ${
                                                                    isModified && !isSaving
                                                                        ? 'bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 shadow-xs cursor-pointer'
                                                                        : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                                                                }`}
                                                                title={isModified ? "Reset unsaved edits for this student" : "No changes to reset"}
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                </svg>
                                                                <span>Reset</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Unsaved Changes Banner */}
                    {modifiedCount > 0 && (
                        <div className="bg-amber-50 border-t border-amber-300 px-6 py-2.5 flex items-center justify-between shadow-md flex-shrink-0 animate-fadeIn">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-3 w-3 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                <span className="text-sm font-semibold text-amber-900">
                                    You have {modifiedCount} student{modifiedCount > 1 ? 's' : ''} with unsaved changes.
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={resetAllChanges}
                                    disabled={isSavingAll}
                                    className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                    Discard All Changes
                                </button>
                                <button
                                    onClick={saveAllChanges}
                                    disabled={isSavingAll}
                                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow transition-colors flex items-center gap-1.5 cursor-pointer ring-2 ring-emerald-400/40"
                                >
                                    {isSavingAll ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Saving All Students...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>Save All ({modifiedCount}) Students</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Pagination Bar - like second image */}
                    {totalStudents > 0 && (
                        <div className="border-t bg-white px-6 py-3 flex items-center justify-between flex-shrink-0">
                            {/* Left: Record info */}
                            <span className="text-sm text-gray-500 italic">
                                Showing {totalStudents === 0 ? 0 : indexOfFirstStudent + 1} to{' '}
                                {indexOfLastStudent} of {totalStudents} records
                            </span>

                            {/* Right: Pagination controls */}
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    {/* Previous */}
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className={`px-3 py-1.5 text-sm rounded border transition-colors ${currentPage === 1
                                            ? 'text-gray-300 border-gray-200 cursor-not-allowed bg-white'
                                            : 'text-gray-600 border-gray-300 hover:bg-gray-100 bg-white cursor-pointer'
                                            }`}
                                    >
                                        Previous
                                    </button>

                                    {/* Page Numbers */}
                                    {getPageNumbers().map((page, index) => (
                                        <React.Fragment key={index}>
                                            {page === '...' ? (
                                                <span className="px-2 py-1.5 text-sm text-gray-400">...</span>
                                            ) : (
                                                <button
                                                    onClick={() => setCurrentPage(page as number)}
                                                    className={`min-w-[34px] px-2 py-1.5 text-sm rounded border transition-colors ${currentPage === page
                                                        ? 'bg-violet-600 text-white border-violet-600 font-semibold'
                                                        : 'text-gray-600 border-gray-300 hover:bg-gray-100 bg-white'
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            )}
                                        </React.Fragment>
                                    ))}

                                    {/* Next */}
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className={`px-3 py-1.5 text-sm rounded border transition-colors ${currentPage === totalPages
                                            ? 'text-gray-300 border-gray-200 cursor-not-allowed bg-white'
                                            : 'text-gray-600 border-gray-300 hover:bg-gray-100 bg-white cursor-pointer'
                                            }`}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdateStudentDetails;
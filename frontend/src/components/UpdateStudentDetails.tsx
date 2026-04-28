import React, { useState, useEffect, useCallback } from 'react';
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

interface Category {
    id: string;
    label: string;
    columns: { key: string; label: string }[];
}

const CATEGORIES: Category[] = [
    {
        id: 'personal',
        label: 'Personal Details',
        columns: [
            { key: 'dob', label: 'DOB' },
            { key: 'gender', label: 'Gender' },
            { key: 'BloodGroup', label: 'Blood Group' },
            { key: 'Religion', label: 'Religion' },
            { key: 'Caste', label: 'Caste' },
            { key: 'Category', label: 'Student Category' },
            { key: 'MotherTongue', label: 'Mother Tongue' },
        ]
    },
    {
        id: 'contact',
        label: 'Contact Details',
        columns: [
            { key: 'phone', label: 'Mobile' },
            { key: 'email', label: 'Email' },
            { key: 'address', label: 'Present Address' },
            { key: 'Fatherfirstname', label: 'Father Name' },
            { key: 'FatherPhone', label: 'Father Mobile' },
        ]
    },
    {
        id: 'academic',
        label: 'Academic Details',
        columns: [
            { key: 'Roll_Number', label: 'Roll Number' },
            { key: 'admission_date', label: 'Admission Date' },
            { key: 'AdmissionClass', label: 'Admission Class' },
            { key: 'AdmissionCategory', label: 'Admission Category' },
            { key: 'StudentType', label: 'Student Type' },
            { key: 'House', label: 'House' },
        ]
    },
    {
        id: 'address',
        label: 'Address & Physical',
        columns: [
            { key: 'address', label: 'Present Address' },
            { key: 'permanentCity', label: 'Permanent City' },
            { key: 'StudentHeight', label: 'Student Height' },
            { key: 'StudentWeight', label: 'Student Weight' },
        ]
    },
    {
        id: 'parent_id',
        label: 'Parent & ID Details',
        columns: [
            { key: 'Fatherfirstname', label: 'Father Name' },
            { key: 'Motherfirstname', label: 'Mother Name' },
            { key: 'GuardianName', label: 'Guardian Name' },
            { key: 'Adharcardno', label: 'Aadhar No' },
            { key: 'SamagraId', label: 'Samagra ID' },
            { key: 'PEN', label: 'PEN' },
            { key: 'ApaarId', label: 'Apaar ID' },
        ]
    }
];

// Fields that should NEVER be sent to the update API
const READ_ONLY_FIELDS = [
    'class',
    'admission_date',
    'AdmissionClass',
    'admission_no',
    'admNo',
    'Doa',
    'section',
    'academic_year',
    'student_id',
    'id',
    'name',
    'photo',
    'admNo',
    'rollNo',
    'is_promoted',
    'is_locked',
];

// Fields that are read-only in the TABLE display (shown as text, not input)
const DISPLAY_READONLY_FIELDS = ['admission_date', 'AdmissionClass'];

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
    const [saveErrors, setSaveErrors] = useState<Record<number, string>>({});
    const [saveSuccess, setSaveSuccess] = useState<Set<number>>(new Set());

    const [currentPage, setCurrentPage] = useState(1);
    const studentsPerPage = 50;

    const successTimeoutsRef = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    // Cleanup timeouts on unmount
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
        if (!selectedClass || !selectedSection) return;

        setLoading(true);
        setModifiedStudents({});
        setSaveErrors({});
        setSaveSuccess(new Set());

        const globalBranch = localStorage.getItem('currentBranch') || '';
        const academicYear = localStorage.getItem('academicYear') || '';

        api.get('/students', {
            params: {
                class: selectedClass,
                section: selectedSection,
                branch: globalBranch === "All" || globalBranch === "All Branches" ? "All" : globalBranch,
                academic_year: academicYear
            },
            headers: { 'X-Academic-Year': academicYear }
        })
            .then(res => setStudents(res.data.students || []))
            .catch(() => setStudents([]))
            .finally(() => setLoading(false));
    }, [selectedClass, selectedSection]);

    useEffect(() => {
        loadStudents();
    }, [selectedClass, selectedSection, loadStudents]);

    // Reset page when category or search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory, searchTerm]);

    const handleFieldChange = (studentId: number, field: string, value: any) => {
        // Don't allow modification of read-only fields
        if (READ_ONLY_FIELDS.includes(field)) return;

        // Clear any previous save error/success for this student
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

    const saveStudentChanges = async (studentId: number) => {
        const changes = modifiedStudents[studentId];
        if (!changes || Object.keys(changes).length === 0) return;

        // Filter out any read-only fields that might have sneaked in
        const cleanChanges: Record<string, any> = {};
        for (const [key, value] of Object.entries(changes)) {
            if (!READ_ONLY_FIELDS.includes(key)) {
                cleanChanges[key] = value;
            }
        }

        if (Object.keys(cleanChanges).length === 0) {
            console.warn('No valid fields to update after filtering read-only fields');
            return;
        }

        setSavingIds(prev => new Set(prev).add(studentId));
        setSaveErrors(prev => {
            const next = { ...prev };
            delete next[studentId];
            return next;
        });

        try {
            const academicYear = localStorage.getItem('academicYear') || '';

            console.log('Sending update for student:', studentId, 'Fields:', cleanChanges);

            // IMPORTANT: Only send the changed fields + academic_year for context
            // Do NOT send class/section unless they are actually being changed
            // This prevents triggering the academic record update block unintentionally
            const payload: Record<string, any> = {
                ...cleanChanges,
                academic_year: academicYear,
            };

            // Only include class/section if Roll_Number is being changed
            // (backend needs class+section for roll number uniqueness check)
            if (cleanChanges.Roll_Number !== undefined) {
                payload.class = selectedClass;
                payload.section = selectedSection;
            }

            const response = await api.put(`/students/${studentId}`, payload);

            console.log('Update response:', response.data);

            // Update local student state
            setStudents(prev => prev.map(s => {
                const sid = s.student_id || s.id;
                if (sid === studentId) {
                    return { ...s, ...cleanChanges };
                }
                return s;
            }));

            // Clear modifications for this student
            setModifiedStudents(prev => {
                const next = { ...prev };
                delete next[studentId];
                return next;
            });
            // Show success indicator briefly
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

        } catch (err: any) {
            console.error('Update error:', err);
            const errorMsg = err.response?.data?.error || err.message || "Failed to update student details";
            setSaveErrors(prev => ({ ...prev, [studentId]: errorMsg }));
        } finally {
            setSavingIds(prev => {
                const next = new Set(prev);
                next.delete(studentId);
                return next;
            });
        }
    };

    const filteredStudents = students.filter(s => {
        const name = (s.name || '').toLowerCase();
        const admNo = (s.admission_no || s.admNo || '').toLowerCase();
        const rollNo = s.Roll_Number ? s.Roll_Number.toString().toLowerCase() : '';
        const term = searchTerm.toLowerCase();
        return name.includes(term) || admNo.includes(term) || rollNo.includes(term);
    });

    const indexOfLastStudent = currentPage * studentsPerPage;
    const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
    const currentStudents = filteredStudents.slice(indexOfFirstStudent, indexOfLastStudent);
    const totalPages = Math.ceil(filteredStudents.length / studentsPerPage);

    const activeCat = CATEGORIES.find(c => c.id === selectedCategory)!;

    return (
        <div className="flex flex-col h-full bg-white">
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
                            placeholder="Search students..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="border border-gray-300 px-3 py-2 pl-9 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500 shadow-sm w-64"
                        />
                        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Navigation */}
                <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
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

                {/* Right Panel: Data Table */}
                <div className="flex-1 flex flex-col overflow-hidden">
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
                                    <th className="px-4 py-3 text-left font-bold text-violet-700 uppercase tracking-tight bg-violet-50 w-28 whitespace-nowrap">
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
                                            {selectedClass && selectedSection
                                                ? 'No students found matching your filters.'
                                                : 'Please select a Class and Section to view students.'}
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
                                                        {student.photo ? (
                                                            <img
                                                                src={student.photo}
                                                                className="w-9 h-9 rounded-full border shadow-sm object-cover flex-shrink-0"
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
                                                        <span className="font-semibold text-gray-900 text-sm">
                                                            {student.name}
                                                        </span>
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

                                                    return (
                                                        <td key={col.key} className="px-2 py-2 text-gray-700">
                                                            {isDisplayReadOnly ? (
                                                                <span className="text-gray-400 italic text-xs px-2">
                                                                    {displayVal || '-'}
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    value={displayVal}
                                                                    onChange={(e) =>
                                                                        handleFieldChange(sid, col.key, e.target.value)
                                                                    }
                                                                    disabled={isSaving}
                                                                    className={`w-full min-w-[100px] px-2 py-1.5 border rounded text-sm outline-none transition-all ${isSaving
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

                                                {/* Action Column */}
                                                <td className="px-4 py-3 bg-violet-50">
                                                    <div className="flex flex-col gap-1 items-center">
                                                        {hasError && (
                                                            <div
                                                                className="text-xs text-red-600 max-w-[120px] text-center leading-tight cursor-pointer"
                                                                title={saveErrors[sid]}
                                                                onClick={() => alert(saveErrors[sid])}
                                                            >
                                                                ⚠️ Error
                                                            </div>
                                                        )}
                                                        {isSuccess && (
                                                            <span className="text-xs text-green-600 font-medium">
                                                                ✓ Saved
                                                            </span>
                                                        )}
                                                        {isModified && !isSaving && (
                                                            <button
                                                                onClick={() => saveStudentChanges(sid)}
                                                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors whitespace-nowrap w-full"
                                                            >
                                                                SAVE
                                                            </button>
                                                        )}
                                                        {isSaving && (
                                                            <div className="flex items-center gap-1 text-xs text-violet-600">
                                                                <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                                                Saving...
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                            <span className="text-sm text-gray-600">
                                Showing {indexOfFirstStudent + 1} to{' '}
                                {Math.min(indexOfLastStudent, filteredStudents.length)} of{' '}
                                {filteredStudents.length} students
                            </span>
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-100 shadow-sm"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-2 text-sm text-gray-600">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-100 shadow-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdateStudentDetails;
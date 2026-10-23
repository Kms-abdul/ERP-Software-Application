import React, { useEffect, useState } from "react";
import api from "../api";

interface Student {
    student_id: number;
    admission_no: string;
    name: string;
    roll_number: any;
    category?: string;
}

interface Subject {
    subject_id: number;
    subject_name: string;
    subject_type: string;
}

const AssignStudentSubjects: React.FC = () => {
    // Context / Filters
    const [academicYear, setAcademicYear] = useState("");
    const [branch, setBranch] = useState("");
    const [selectedClass, setSelectedClass] = useState("");
    const [selectedSection, setSelectedSection] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [subjectType, setSubjectType] = useState("Academic");

    // Options
    const [classList, setClassList] = useState<any[]>([]);
    const [sectionList, setSectionList] = useState<string[]>([]);

    // Data State
    const [students, setStudents] = useState<Student[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    // assignmentMap: student_id -> { subject_id : boolean }
    const [assignmentMap, setAssignmentMap] = useState<Record<number, Record<number, boolean>>>({});

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Initialize Context
    useEffect(() => {
        const storedYear = localStorage.getItem("academicYear") || "";
        const userStr = localStorage.getItem("user");
        let storedBranch = "All";

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                // Fix: If user is Admin or has 'All' access, prioritize the SELECTED branch from localStorage
                // Otherwise use their assigned branch.
                if (user.role === 'Director' || user.branch === 'All' || user.branch === 'AllBranches' || user.branch === 'All Branches') {
                    const selected = localStorage.getItem("currentBranch");
                    if (selected && selected !== "All" && selected !== "All Locations") {
                        storedBranch = selected;
                    }
                } else {
                    // Specific Branch User
                    storedBranch = user.branch || "All";
                }
            } catch (e) {
                console.error("Error parsing user", e);
            }
        }

        setAcademicYear(storedYear);
        setBranch(storedBranch);

        // Fetch Classes
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        try {
            const res = await api.get("/classes");
            if (res.data && res.data.classes) {
                // Sort standard numeric/roman?
                setClassList(res.data.classes);
            }
        } catch (e) {
            console.error("Failed to load classes", e);
        }
    };

    // Fetch sections when class changes
    useEffect(() => {
        setSelectedSection(""); // Reset section
        setSectionList([]);
        if (selectedClass) {
            fetchSections(selectedClass);
        }
    }, [selectedClass]);

    const fetchSections = async (cls: string) => {
        try {
            const res = await api.get(`/sections?class=${cls}`);
            if (res.data && res.data.sections) {
                setSectionList(res.data.sections);
            }
        } catch (e) {
            console.error("Failed to load sections", e);
        }
    };

    // Fetch Assignment Data
    const fetchData = async () => {
        if (!selectedClass || !academicYear || !branch) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                class_id: selectedClass,
                academic_year: academicYear,
                branch: branch,
                subject_type: subjectType
            });
            if (selectedSection) params.append("section_id", selectedSection);
            if (selectedCategory) params.append("category", selectedCategory);

            const res = await api.get(`/academics/assignment-data?${params.toString()}`);

            const { students, subjects, overrides } = res.data;

            setStudents(students);
            setSubjects(subjects);

            // CHANGED: Default to FALSE (unchecked) instead of TRUE
            // Only if an explicit override exists with status=1, then it's checked
            const initialMap: Record<number, Record<number, boolean>> = {};

            students.forEach((std: Student) => {
                initialMap[std.student_id] = {};
                subjects.forEach((sub: Subject) => {
                    // Check override
                    const studentOverrides = overrides[std.student_id];

                    let isAssigned = false; // CHANGED: Default to unchecked

                    // Check if this student has an override for this subject
                    if (studentOverrides && studentOverrides.hasOwnProperty(sub.subject_id)) {
                        // override.status is boolean/1/0
                        const status = studentOverrides[sub.subject_id];
                        // Handle 1/0/true/false nuances
                        isAssigned = status === true || status === 1;
                    }

                    initialMap[std.student_id][sub.subject_id] = isAssigned;
                });
            });

            setAssignmentMap(initialMap);

        } catch (e) {
            console.error("Failed to fetch assignment data", e);
            alert("Error fetching data");
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch when filters are ready
    useEffect(() => {
        if (selectedClass) {
            // Debounce slightly or just fetch? 
            fetchData();
        }
    }, [selectedClass, selectedSection, selectedCategory, subjectType, academicYear, branch]);


    const handleToggle = (studentId: number, subjectId: number) => {
        setAssignmentMap(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [subjectId]: !prev[studentId][subjectId]
            }
        }));
    };

    const handleSelectAllRow = (studentId: number, checked: boolean) => {
        setAssignmentMap(prev => {
            const newRow: Record<number, boolean> = {};
            subjects.forEach(s => {
                newRow[s.subject_id] = checked;
            });
            return {
                ...prev,
                [studentId]: newRow
            };
        });
    };

    const handleSelectAllColumn = (subjectId: number, checked: boolean) => {
        setAssignmentMap(prev => {
            const newMap = { ...prev };
            students.forEach(student => {
                if (!newMap[student.student_id]) {
                    newMap[student.student_id] = {};
                }
                newMap[student.student_id][subjectId] = checked;
            });
            return newMap;
        });
    };

    const handleSelectAllCheckboxes = (checked: boolean) => {
        setAssignmentMap(prev => {
            const newMap: Record<number, Record<number, boolean>> = {};
            students.forEach(student => {
                newMap[student.student_id] = {};
                subjects.forEach(sub => {
                    newMap[student.student_id][sub.subject_id] = checked;
                });
            });
            return newMap;
        });
    };

    const handleSave = async () => {
        if (!students.length) return;

        setSaving(true);
        try {
            // Prepare Payload
            const payloadData = students.map(std => {
                const subMap = assignmentMap[std.student_id];
                return {
                    student_id: std.student_id,
                    subjects: subMap // { sub_id: true/false }
                };
            });

            await api.post("/academics/save-student-subjects", {
                academic_year: academicYear,
                branch: branch,
                class_id: selectedClass,
                data: payloadData
            });

            alert("Saved successfully!");
            // Refresh to sync
            fetchData();

        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save assignments.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 bg-white min-h-screen">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Assign Student-Subjects</h2>

            {/* Top Bar / Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg shadow-sm border">
                {/* Academic Year (Read Only) */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Academic Year</label>
                    <div className="px-3 py-2 bg-gray-200 rounded text-gray-700 font-medium">
                        {academicYear}
                    </div>
                </div>

                {/* Branch (Read Only) */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Branch</label>
                    <div className="px-3 py-2 bg-gray-200 rounded text-gray-700 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                        {branch}
                    </div>
                </div>

                {/* Class Dropdown */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Class</label>
                    <select
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                    >
                        <option value="">Select Class</option>
                        {classList.map((c: any) => (
                            <option key={c.id} value={c.class_name}>{c.class_name}</option>
                        ))}
                    </select>
                </div>

                {/* Section Dropdown */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Section</label>
                    <select
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        disabled={!selectedClass}
                    >
                        <option value="">All Sections</option>
                        {sectionList.map((sec) => (
                            <option key={sec} value={sec}>{sec}</option>
                        ))}
                    </select>
                </div>

                {/* Category Dropdown */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Category</label>
                    <select
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                        <option value="">Select Category</option>
                        <option value="Hifz">Hifz</option>
                        <option value="Hifz + Nazira">Hifz + Nazira</option>
                    </select>
                </div>

                {/* Subject Type */}
                <div className="flex flex-col">
                    <label className="text-sm font-semibold text-gray-600 mb-1">Subject Type</label>
                    <div className="flex items-center space-x-4 h-full">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="radio"
                                name="subjectType"
                                className="mr-2"
                                value="Academic"
                                checked={subjectType === "Academic"}
                                onChange={(e) => setSubjectType(e.target.value)}
                            />
                            Academic
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="radio"
                                name="subjectType"
                                className="mr-2"
                                value="Hifz"
                                checked={subjectType === "Hifz"}
                                onChange={(e) => setSubjectType(e.target.value)}
                            />
                            Hifz
                        </label>
                    </div>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="text-center py-10 text-gray-500">Loading data...</div>
            ) : (
                students.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 bg-gray-50 rounded border border-dashed">
                        No students found or no class selected.
                    </div>
                ) : (
                    <div className="overflow-x-auto shadow-md rounded-lg border border-gray-200">
                        <table className="min-w-full bg-white text-sm">
                            <thead className="bg-[#1f2937] text-white">
                                <tr>
                                    <th className="py-3 px-4 text-left w-16">S.No</th>
                                    <th className="py-3 px-4 text-left w-48 sticky left-0 z-10 bg-[#1f2937]">Student Name</th>
                                    <th className="py-3 px-4 text-left w-24">Roll No</th>
                                    <th className="py-3 px-4 text-left w-32">Adm No</th>
                                    <th className="py-3 px-4 text-left min-w-[140px]">Academic Category</th>
                                    {subjects.map(sub => (
                                        <th key={sub.subject_id} className="py-3 px-4 text-center min-w-[100px]">
                                            <div className="flex flex-col items-center gap-2">
                                                <span>{sub.subject_name}</span>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-indigo-600 rounded bg-gray-700 border-gray-500 focus:ring-indigo-500"
                                                    onChange={(e) => handleSelectAllColumn(sub.subject_id, e.target.checked)}
                                                    title="Assign this subject to all shown students"
                                                />
                                            </div>
                                        </th>
                                    ))}
                                    <th className="py-3 px-4 text-center w-24">
                                        <div className="flex flex-col items-center gap-2">
                                            <span>All</span>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-green-600 rounded bg-gray-700 border-gray-500 focus:ring-green-500"
                                                onChange={(e) => handleSelectAllCheckboxes(e.target.checked)}
                                                title="Select/Deselect all checkboxes"
                                            />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-700">
                                {students.map((student, idx) => (
                                    <tr key={student.student_id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        <td className="py-2 px-4">{idx + 1}</td>
                                        <td className="py-2 px-4 font-medium sticky left-0 z-10 bg-inherit border-r">
                                            {student.name}
                                        </td>
                                        <td className="py-2 px-4">{student.roll_number}</td>
                                        <td className="py-2 px-4">{student.admission_no}</td>
                                        <td className="py-2 px-4">
                                            {student.category ? (
                                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium whitespace-nowrap">
                                                    {student.category}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>

                                        {subjects.map(sub => {
                                            const isChecked = assignmentMap[student.student_id]?.[sub.subject_id] || false;
                                            return (
                                                <td key={sub.subject_id} className="py-2 px-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                                        checked={isChecked}
                                                        onChange={() => handleToggle(student.student_id, sub.subject_id)}
                                                    />
                                                </td>
                                            );
                                        })}

                                        <td className="py-2 px-4 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer border-2 border-green-200"
                                                onChange={(e) => handleSelectAllRow(student.student_id, e.target.checked)}
                                                title="Select/Deselect All"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* Save Button */}
            {students.length > 0 && (
                <div className="mt-6 flex justify-end space-x-4">
                    <button
                        onClick={() => fetchData()}
                        disabled={saving}
                        className={`px-6 py-2 rounded text-gray-700 border transition hover:bg-gray-100 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`px-8 py-3 bg-indigo-600 text-white font-bold rounded shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {saving ? "Saving..." : "Save Assignments"}
                    </button>
                </div>
            )}

        </div>
    );
};

export default AssignStudentSubjects;
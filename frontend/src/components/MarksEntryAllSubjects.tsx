import React, { useState, useEffect } from "react";
import api from "../api";
import { Save, Edit, FileDown, Upload } from "lucide-react";
import * as XLSX from 'xlsx';

// --- Types ---
interface Student {
    student_id: number;
    admission_no: string;
    roll_number: string | number;
    name: string;
    category?: string;
}

interface Subject {
    id: number;
    subject_name: string;
    subject_type?: string;
    max_marks?: number;
}

interface MarksData {
    [studentId: number]: {
        [subjectId: number]: {
            value: string; // "34", "AB", etc.
            is_absent: boolean;
        };
    };
}

const MarksEntryAllSubjects: React.FC = () => {
    // --- State ---
    const [academicYear, setAcademicYear] = useState<string>("");
    const [branches, setBranches] = useState<any[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("");

    // Filters
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>("");
    const [sections, setSections] = useState<string[]>([]);
    const [selectedSection, setSelectedSection] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");

    const [tests, setTests] = useState<any[]>([]);
    const [selectedTestId, setSelectedTestId] = useState<string>("");

    const [selectedSubjectType, setSelectedSubjectType] = useState<string>("All");

    // Data
    const [subjects, setSubjects] = useState<Subject[]>([]);
    // Metadata map for filtering if subject objects don't have type directly (fetched separately)
    const [allSubjectsMeta, setAllSubjectsMeta] = useState<{ [id: number]: { type: string, name: string } }>({});
    const [subjectMaxMarks, setSubjectMaxMarks] = useState<{ [id: number]: number }>({});
    const [subjectClassTestIds, setSubjectClassTestIds] = useState<{ [key: number]: number }>({});

    const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [marksData, setMarksData] = useState<MarksData>({});

    // UI State
    const [loading, setLoading] = useState(false);
    const [editingRows, setEditingRows] = useState<Set<number>>(new Set()); // Per-row editing
    const [rowSaving, setRowSaving] = useState<Set<number>>(new Set()); // Per-row saving
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // --- Init ---
    useEffect(() => {
        const storedYear = localStorage.getItem("academicYear") || "";
        const userStr = localStorage.getItem("user");
        let storedBranch = "All";

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user.role === 'Director' || user.branch === 'All' || user.branch === 'AllBranches' || user.branch === 'All Branches') {
                    const selected = localStorage.getItem("currentBranch");
                    if (selected && selected !== "All" && selected !== "All Locations") {
                        storedBranch = selected;
                    }
                } else {
                    storedBranch = user.branch || "All";
                }
            } catch (e) { console.error(e); }
        }

        setAcademicYear(storedYear);
        setSelectedBranch(storedBranch);
        setBranches([{ branch_name: storedBranch, branch_code: storedBranch }]);

        // Load Subject Metadata (for Types)
        api.get("/academic/subjects", { params: { academic_year: storedYear } })
            .then(res => {
                const meta: { [id: number]: { type: string, name: string } } = {};
                res.data.forEach((s: any) => {
                    meta[s.id] = { type: s.subject_type || 'Academic', name: s.subject_name };
                });
                setAllSubjectsMeta(meta);
            })
            .catch(console.error);
    }, []);

    // --- Fetch Classes ---
    useEffect(() => {
        if (!selectedBranch) return;
        api.get(`/classes?branch=${selectedBranch}`)
            .then(res => setClasses(res.data.classes || res.data))
            .catch(err => console.error(err));
    }, [selectedBranch]);

    // --- Fetch Sections ---
    useEffect(() => {
        const clsObj = classes.find(c => c.id == selectedClass);
        if (!clsObj) { setSections([]); return; }
        api.get(`/sections?class=${clsObj.class_name}`)
            .then(res => setSections(res.data.sections || []))
            .catch(err => setSections([]));
    }, [selectedClass, classes]);

    // --- Fetch Tests & Subjects ---
    useEffect(() => {
        if (!selectedClass || !academicYear) return;
        api.get(`/class-tests/list`, {
            params: { academic_year: academicYear, branch: selectedBranch, class_id: selectedClass }
        })
            .then(res => setTests(res.data))
            .catch(console.error);
    }, [selectedClass, academicYear, selectedBranch]);

    // Update Subjects when Test changes
    useEffect(() => {
        const test = tests.find(t => t.test_id == selectedTestId);
        if (test && test.subjects) {
            setSubjects(test.subjects);
            // Default select all subject IDs initially
            // But we will filter them in the render/fetch logic based on type
            setSelectedSubjectIds(test.subjects.map((s: any) => s.id));
        } else {
            setSubjects([]);
            setSelectedSubjectIds([]);
        }
    }, [selectedTestId, tests]);



    // --- Filtering Logic ---
    const getFilteredSubjects = () => {
        if (!subjects || subjects.length === 0) return [];
        if (selectedSubjectType === "All") return subjects;

        return subjects.filter(s => {
            const sId = s.id;
            const meta = allSubjectsMeta[sId];
            const type = meta ? (meta.type || "Academic") : "Academic";
            return type.toLowerCase() === selectedSubjectType.toLowerCase();
        });
    };

    const filteredSubjects = getFilteredSubjects();

    // Auto-select filtered subjects when type changes
    useEffect(() => {
        const ids = filteredSubjects.map(s => s.id);
        setSelectedSubjectIds(ids);
    }, [selectedSubjectType, subjects, allSubjectsMeta]); // Re-run if meta loads later

    // --- Fetch Data (Students + Marks) ---
    const handleGetData = async () => {
        if (!selectedTestId || subjects.length === 0) {
            setMessage({ type: 'error', text: "Please select a test with subjects." });
            return;
        }

        setLoading(true);
        setMessage(null);
        setEditingRows(new Set()); // Reset editing
        setMarksData({});
        setSubjectClassTestIds({}); // Reset
        setSubjectMaxMarks({});

        try {
            // 1. Fetch Students
            const clsObj = classes.find(c => c.id == selectedClass);
            const studentsRes = await api.get('/students', {
                params: {
                    branch: selectedBranch,
                    class: clsObj?.class_name,
                    section: selectedSection,
                    academic_year: academicYear,
                    category: selectedCategory
                }
            });
            let studentsList = studentsRes.data.students || studentsRes.data || [];
            if (selectedCategory) {
                const target = selectedCategory === "Hifz + Nazira" ? ["Hifz + Nazira", "Hifz+Nazira"] : [selectedCategory];
                studentsList = studentsList.filter((s: any) => {
                    const cat = s.category || s.AdmissionCategory || s.admission_category;
                    return !cat || target.includes(cat);
                });
            }
            if (studentsList.length === 0) {
                setMessage({ type: 'error', text: "No students found." });
                setLoading(false);
                return;
            }
            // Sort
            studentsList.sort((a: any, b: any) => parseInt(a.roll_number || 0) - parseInt(b.roll_number || 0));
            setStudents(studentsList);

            // 2. Identify subjects to fetch (based on selection)
            const subjectsToFetch = subjects.filter(s => selectedSubjectIds.includes(s.id));

            // 3. Fetch Marks for EACH (filtered) subject
            const newMarksData: MarksData = {};
            const newSubjectClassTestIds: { [key: number]: number } = {};
            const newSubjectMaxMarks: { [key: number]: number } = {};

            // Init marks container
            studentsList.forEach((s: any) => {
                newMarksData[s.student_id || (s as any).id] = {};
            });

            // Parallel requests
            const subjectPromises = subjectsToFetch.map(async (subj) => {
                try {
                    const res = await api.get(`/marks/entry/subject`, {
                        params: {
                            academic_year: academicYear,
                            branch: selectedBranch,
                            class_id: selectedClass,
                            section: selectedSection,
                            test_id: selectedTestId,
                            subject_id: subj.id,
                            category: selectedCategory
                        }
                    });

                    if (res.data.class_test_id) {
                        newSubjectClassTestIds[subj.id] = res.data.class_test_id;
                    }

                    if (res.data.subject_total_marks) {
                        newSubjectMaxMarks[subj.id] = res.data.subject_total_marks;
                    }

                    // Map students
                    res.data.students.forEach((sMeta: any) => {
                        const sId = sMeta.student_id;
                        if (newMarksData[sId]) {
                            newMarksData[sId][subj.id] = {
                                value: sMeta.is_absent ? "AB" : (sMeta.marks_obtained !== null ? String(sMeta.marks_obtained).split('.')[0] : ""),
                                is_absent: sMeta.is_absent
                            };
                        }
                    });
                } catch (err) {
                    console.error(`Failed to fetch marks for subject ${subj.id}`, err);
                }
            });

            await Promise.all(subjectPromises);
            setMarksData(newMarksData);
            setSubjectClassTestIds(newSubjectClassTestIds);
            setSubjectMaxMarks(newSubjectMaxMarks);

        } catch (err: any) {
            console.error(err);
            setMessage({ type: 'error', text: "Failed to load data. Please check connection." });
        } finally {
            setLoading(false);
        }
    };

    // --- Input Handlers ---
    const handleMarkChange = (studentId: number, subjectId: number, value: string) => {
        setMarksData(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [subjectId]: {
                    ...prev[studentId]?.[subjectId],
                    value: value,
                    is_absent: value.trim().toUpperCase() === "AB"
                }
            }
        }));
    };

    const handleMarkBlur = (studentId: number, subjectId: number) => {
        const valStr = marksData[studentId]?.[subjectId]?.value || "";
        const max = subjectMaxMarks[subjectId] || 100;

        let normalized = valStr;
        let isAbsent = false;

        if (valStr.trim().toUpperCase() === "AB") {
            normalized = "AB";
            isAbsent = true;
        } else if (valStr.trim() !== "") {
            const num = parseFloat(valStr);
            if (!isNaN(num)) {
                let rounded = Math.round(num);
                if (rounded < 0) rounded = 0;
                if (rounded > max) rounded = Math.round(max); // Clamp to max
                normalized = String(rounded);
            } else {
                normalized = ""; // clear invalid
            }
        }

        setMarksData(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [subjectId]: {
                    value: normalized,
                    is_absent: isAbsent
                }
            }
        }));
    };

    // --- Row Actions ---
    const handleEditRow = (studentId: number) => {
        setEditingRows(prev => new Set(prev).add(studentId));
    };

    const handleSaveRow = async (studentId: number) => {
        setRowSaving(prev => new Set(prev).add(studentId));

        try {
            // Save for ALL selected subjects for this student
            const promises = subjects.filter(s => selectedSubjectIds.includes(s.id)).map(async (subj) => {
                const classTestId = subjectClassTestIds[subj.id];
                if (!classTestId) return; // Skip if ID missing (maybe not part of this class/exam config)

                const m = marksData[studentId]?.[subj.id];
                // Only save if data exists or was edited.
                // Note: user might want to calculate empty strings as "clear mark".

                // If marksData entry maps to undefined but we are iterating it in the loop,
                // it implies we might never have fetched it or it's not valid.
                // But if we are here, we are only iterating visible filtered subjects.

                // Construct Payload
                const val = m?.is_absent ? "AB" : (m?.value || "");

                await api.post(`/marks/entry/subject`, {
                    class_test_id: classTestId,
                    subject_id: subj.id, // Subject ID
                    academic_year: academicYear,
                    branch: selectedBranch,
                    class_id: selectedClass,
                    section: selectedSection,
                    marks: [{
                        student_id: studentId,
                        value: val
                    }],
                    user_id: 1
                });
            });

            await Promise.all(promises);

            // Success
            const newEditing = new Set(editingRows);
            newEditing.delete(studentId);
            setEditingRows(newEditing);

            // Use toast or small checkmark? For now, nothing blocking, maybe just remove edit mode.
        } catch (err) {
            console.error("Save failed for student " + studentId, err);
            alert("Failed to save marks for this student. Please check inputs.");
        } finally {
            const newSaving = new Set(rowSaving);
            newSaving.delete(studentId);
            setRowSaving(newSaving);
        }
    };

    // --- Helper for Excel Download ---
    const handleDownload = () => {
        // Logic to download current view
        if (students.length === 0) return;

        const tableData = students.map((std: any) => {
            const row: any = {
                "Roll No": std.roll_number,
                "Name": std.name,
                "Admission No": std.admission_no,
                "Category": std.category || std.AdmissionCategory || '-'
            };
            subjects.filter(s => selectedSubjectIds.includes(s.id)).forEach(s => {
                const m = marksData[std.student_id || std.id]?.[s.id];
                row[s.subject_name] = m?.is_absent ? "AB" : m?.value || "";
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(tableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Marks");
        XLSX.writeFile(wb, "Marks_Export.xlsx");
    };

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">Enter All Subject Marks</h2>

            {/* --- FILTERS --- */}
            <div className="bg-white p-4 rounded shadow-sm mb-6 grid grid-cols-1 md:grid-cols-6 gap-4">
                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Class</label>
                    <select
                        value={selectedClass}
                        onChange={e => setSelectedClass(e.target.value)}
                        className="mt-1 block w-full rounded-md border p-2 border-gray-300 shadow-sm"
                    >
                        <option value="">Select Class</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Section</label>
                    <select
                        value={selectedSection}
                        onChange={e => setSelectedSection(e.target.value)}
                        className="mt-1 block w-full rounded-md border p-2 border-gray-300 shadow-sm"
                    >
                        <option value="">Select Section</option>
                        {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                {/* Category */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="mt-1 block w-full rounded-md border p-2 border-gray-300 shadow-sm"
                    >
                        <option value="">Select Category</option>
                        <option value="Hifz">Hifz</option>
                        <option value="Hifz + Nazira">Hifz + Nazira</option>
                    </select>
                </div>

                {/* Subject Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Subject Type</label>
                    <select
                        value={selectedSubjectType}
                        onChange={e => setSelectedSubjectType(e.target.value)}
                        className="mt-1 block w-full rounded-md border p-2 border-gray-300 shadow-sm"
                    >
                        <option value="All">All Types</option>
                        <option value="Academic">Academic</option>
                        <option value="Hifz">Hifz</option>
                        {/* Dynamic types? Maybe in future */}
                    </select>
                </div>

                {/* Exam Type / Test */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Exam Type</label>
                    <select
                        value={selectedTestId}
                        onChange={e => setSelectedTestId(e.target.value)}
                        className="mt-1 block w-full rounded-md border p-2 border-gray-300 shadow-sm"
                    >
                        <option value="">Select Exam</option>
                        {tests.map(t => <option key={t.test_id} value={t.test_id}>{t.test_name}</option>)}
                    </select>
                </div>

                {/* Select Subjects (Multiple) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Select Subjects</label>
                    <div className="relative group">
                        <button className="mt-1 block w-full text-left rounded-md border p-2 border-gray-300 shadow-sm bg-white overflow-hidden text-ellipsis whitespace-nowrap">
                            {selectedSubjectIds.length === filteredSubjects.length && filteredSubjects.length > 0 ? `All ${selectedSubjectType === 'All' ? '' : selectedSubjectType} Subjects` : `${selectedSubjectIds.length} Selected`}
                        </button>
                        {/* Simple Dropdown for Multi-select */}
                        <div className="absolute hidden group-hover:block z-10 w-full bg-white border shadow-lg max-h-60 overflow-y-auto p-2">
                            {filteredSubjects.map(s => (
                                <label key={s.id} className="flex items-center space-x-2 p-1 hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedSubjectIds.includes(s.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedSubjectIds(prev => [...prev, s.id]);
                                            } else {
                                                setSelectedSubjectIds(prev => prev.filter(id => id !== s.id));
                                            }
                                        }}
                                        className="rounded text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">{s.subject_name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

            </div>

            <div className="mb-6 flex justify-end">
                <button
                    onClick={handleGetData}
                    disabled={loading || !selectedTestId}
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {loading ? "Loading..." : "GET Button"}
                </button>
            </div>

            {/* --- MESSAGE --- */}
            {message && (
                <div className={`p-3 rounded mb-4 ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message.text}
                </div>
            )}

            {/* --- TABLE --- */}
            {students.length > 0 && (
                <div className="bg-white shadow rounded overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                        <div className="font-bold text-gray-700">Student Marks</div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">S.no</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-12 bg-gray-50 z-10">Student Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll No</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adm No</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>

                                    {/* Subject Columns */}
                                    {subjects.filter(s => selectedSubjectIds.includes(s.id)).map(s => {
                                        const max = subjectMaxMarks[s.id];
                                        return (
                                            <th key={s.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                                                {s.subject_name} ({max !== undefined ? max : '-'})
                                            </th>
                                        );
                                    })}

                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {students.map((student, idx) => {
                                    const sId = student.student_id || (student as any).id;
                                    const isRowEditing = editingRows.has(sId);
                                    const isRowSaving = rowSaving.has(sId);

                                    return (
                                        <tr key={sId}>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 sticky left-0 bg-white">{idx + 1}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-12 bg-white">{student.name}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{student.roll_number}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{student.admission_no}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {student.category || (student as any).AdmissionCategory ? (
                                                    <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-semibold border border-indigo-200">
                                                        {student.category || (student as any).AdmissionCategory}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </td>

                                            {/* Marks Cells */}
                                            {subjects.filter(s => selectedSubjectIds.includes(s.id)).map(s => {
                                                const cellData = marksData[sId]?.[s.id];
                                                const val = cellData?.value || "";
                                                const isAbsent = cellData?.is_absent || false;

                                                // If check failed (cellData undefined), student doesn't have this subject allocated in backend
                                                const isAssigned = cellData !== undefined;

                                                return (
                                                    <td key={s.id} className="px-2 py-2 text-center">
                                                        <div className="flex justify-center">
                                                            <input
                                                                type="text"
                                                                value={!isAssigned ? "" : val}
                                                                disabled={!isRowEditing || !isAssigned}
                                                                onChange={(e) => handleMarkChange(sId, s.id, e.target.value)}
                                                                onBlur={() => handleMarkBlur(sId, s.id)}
                                                                placeholder={!isAssigned ? "-" : ""}
                                                                className={`w-16 text-center border rounded py-1 focus:ring-2 focus:outline-none 
                                                                ${isAbsent ? 'bg-red-50 text-red-600 font-bold border-red-300' : 'border-gray-300'}
                                                                ${!isRowEditing || !isAssigned ? 'bg-gray-100' : ''}
                                                                ${!isAssigned ? 'cursor-not-allowed opacity-50 placeholder-gray-400' : ''}
                                                            `}
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}

                                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {!isRowEditing ? (
                                                    <button
                                                        onClick={() => handleEditRow(sId)}
                                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                                                    >
                                                        <Edit size={14} /> Edit
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSaveRow(sId)}
                                                        disabled={isRowSaving}
                                                        className="flex items-center gap-1 text-white bg-green-600 hover:bg-green-700 font-medium text-xs px-2 py-1 rounded shadow-sm disabled:bg-gray-400"
                                                    >
                                                        {isRowSaving ? '...' : <><Save size={14} /> Save</>}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {/* --- DOWNLOAD BUTTON --- */}
            {students.length > 0 && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        <FileDown size={16} /> Download Excel
                    </button>
                </div>
            )}
        </div>
    );
};

export default MarksEntryAllSubjects;

import React, { useState, useEffect } from "react";
import api from "../api";
import { Save, AlertCircle, CheckCircle, FileDown } from "lucide-react";
import * as XLSX from 'xlsx';



interface StudentMarkEntry {
    student_id: number;
    admission_no: string;
    roll_number: string | number;
    name: string;
    category?: string;
    marks_obtained: string | number; // Input value
    is_absent: boolean;
    grade?: string; // Display only
}

interface MarksEntryProps { }

const MarksEntry: React.FC<MarksEntryProps> = () => {
    // --- State ---
    const [academicYear, setAcademicYear] = useState<string>("");
    const [branches, setBranches] = useState<any[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("");
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>("");
    const [sections, setSections] = useState<string[]>([]);
    const [selectedSection, setSelectedSection] = useState<string>("");
    const [selectedCategory, setSelectedCategory] = useState<string>("");

    const [tests, setTests] = useState<any[]>([]);
    const [selectedTestId, setSelectedTestId] = useState<string>("");

    const [subjects, setSubjects] = useState<any[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");

    const [students, setStudents] = useState<StudentMarkEntry[]>([]);
    const [subjectTotalMarks, setSubjectTotalMarks] = useState<number>(0);
    const [gradingScale, setGradingScale] = useState<any[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // --- Init ---
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

                // Set available branches for dropdown if needed (simplified)
                if (user.role === 'Admin' || user.role === 'Director') {
                    // In a real app we might fetch all branches, but for now we set the selected one + All
                    // Or just rely on the storedBranch current value
                }
            } catch (e) {
                console.error("Error parsing user", e);
            }
        }

        setAcademicYear(storedYear);
        setSelectedBranch(storedBranch);

        // Mock/Fetch Branches list if needed for the dropdown to be useful
        // For now, we ensure selectedBranch is set correctly for filtering
        setBranches([{ branch_name: storedBranch, branch_code: storedBranch }]);

    }, []);

    // --- Fetch Classes ---
    useEffect(() => {
        if (!selectedBranch) return;
        // In a real scenario, fetch classes for branch. 
        api.get(`/classes?branch=${selectedBranch}`)
            .then(res => setClasses(res.data.classes || res.data)) // Handle potential { classes: [] } or []
            .catch(err => console.error(err));
    }, [selectedBranch]);

    // --- Fetch Sections ---
    useEffect(() => {
        // Find class name from selected ID
        const clsObj = classes.find(c => c.id == selectedClass);
        if (!clsObj) {
            setSections([]);
            return;
        }

        api.get(`/sections?class=${clsObj.class_name}`)
            .then(res => setSections(res.data.sections || []))
            .catch(err => {
                console.error(err);
                setSections([]);
            });
    }, [selectedClass, classes]);


    // --- Fetch Tests for Class ---
    useEffect(() => {
        if (!selectedClass || !academicYear) return;

        api.get(`/class-tests/list`, {
            params: {
                academic_year: academicYear,
                branch: selectedBranch,
                class_id: selectedClass // Keep sending ID as backend likely expects ID now or handles it
            }
        })
            .then(res => {
                setTests(res.data);
            })
            .catch(err => console.error(err));
    }, [selectedClass, academicYear, selectedBranch]);

    // --- Fetch Subjects for Test ---
    useEffect(() => {
        if (!selectedTestId) {
            setSubjects([]);
            return;
        }

        const selectedTest = tests.find(t => t.test_id == selectedTestId);
        if (selectedTest && selectedTest.subjects) {
            setSubjects(selectedTest.subjects);
        } else {
            setSubjects([]);
        }

    }, [selectedTestId, tests]);


    const [activeClassTestId, setActiveClassTestId] = useState<number | null>(null);

    // --- Fetch Marks Grid ---
    const handleGetMarks = () => {
        if (!selectedTestId || !selectedSubjectId) {
            setMessage({ type: 'error', text: "Please select Test and Subject" });
            return;
        }

        setLoading(true);
        setMessage(null);
        setActiveClassTestId(null);
        setStudents([]);

        api.get(`/marks/entry/subject`, {
            params: {
                academic_year: academicYear,
                branch: selectedBranch,
                class_id: selectedClass,
                section: selectedSection,
                test_id: selectedTestId,
                subject_id: selectedSubjectId,
                category: selectedCategory
            }
        })
            .then(res => {
                let fetchedStudents = res.data.students || [];
                if (selectedCategory) {
                    const target = selectedCategory === "Hifz + Nazira" ? ["Hifz + Nazira", "Hifz+Nazira"] : [selectedCategory];
                    fetchedStudents = fetchedStudents.filter((s: any) => !s.category || target.includes(s.category));
                }
                setStudents(fetchedStudents);
                setSubjectTotalMarks(res.data.subject_total_marks);
                setGradingScale(res.data.grading_scale);
                setActiveClassTestId(res.data.class_test_id); // Store for save
            })
            .catch(err => {
                console.error(err);
                setMessage({ type: 'error', text: err.response?.data?.error || "Failed to load marks" });
            })
            .finally(() => setLoading(false));
    };


    // --- Handle Input Change ---
    const handleInputChange = (studentId: number, value: string) => {
        setStudents(prev => prev.map(s => {
            if (s.student_id !== studentId) return s;
            return { ...s, marks_obtained: value };
        }));
    };

    const handleInputBlur = (studentId: number) => {
        setStudents(prev => prev.map(s => {
            if (s.student_id !== studentId) return s;

            let val = s.marks_obtained;
            let isAbsent = false;


            if (typeof val === 'string') {
                const trimmed = val.trim().toUpperCase();

                if (trimmed === 'AB') {
                    isAbsent = true;
                    val = 'AB'; // Normalize to AB
                } else if (trimmed === '') {
                    val = '';
                } else {
                    // Strict Int / Rounding Logic
                    // We allow user to type loose numbers, but we lock them to Int on blur
                    const parsed = parseFloat(trimmed);

                    if (!isNaN(parsed) && isFinite(parsed)) {
                        let num = Math.round(parsed); // Round to nearest int

                        if (num < 0) {
                            num = 0;
                        }

                        if (num > subjectTotalMarks) {
                            alert(`Marks cannot exceed ${subjectTotalMarks}`);
                            val = ''; // Clear only if out of bounds
                        } else {
                            val = String(num); // Set normalized integer string
                        }
                    } else {
                        // Truly invalid debris
                        val = '';
                    }
                }
            }

            // Calc Grade Locally
            let grade = '';
            if (isAbsent) {
                // Grade for absent? Usually empty or F. Let's leave empty.
            } else if (val !== '' && val !== null && val !== undefined) {
                const numVal = parseInt(String(val), 10); // Ensure int
                const g = gradingScale.find(g => numVal >= g.min && numVal <= g.max);
                if (g) grade = g.grade;
            }

            return { ...s, marks_obtained: val, is_absent: isAbsent, grade };
        }));
    };

    // --- Save Marks ---
    const handleSave = () => {
        if (students.length === 0) return;
        if (!activeClassTestId) {
            setMessage({ type: 'error', text: "Internal Error: Missing Class Test ID. Please reload data." });
            return;
        }

        setSaving(true);
        setMessage(null);
        const payload = {
            class_test_id: activeClassTestId, // Use the real ID
            subject_id: selectedSubjectId,
            academic_year: academicYear,
            branch: selectedBranch,
            class_id: selectedClass,
            section: selectedSection, // optional context
            user_id: 1, // TODO: Get from auth context
            marks: students.map(s => ({
                student_id: s.student_id,
                value: s.is_absent ? "AB" : s.marks_obtained
            }))
        };

        api.post(`/marks/entry/subject`, payload)
            .then(res => {
                setMessage({ type: 'success', text: "Marks saved successfully!" });
                // Optional: reload data to verify?
            })
            .catch(err => {
                console.error(err);
                setMessage({ type: 'error', text: err.response?.data?.error || "Failed to save marks" });
            })
            .finally(() => setSaving(false));
    };

    const handleCancel = () => {
        // Reload the data to reset any changes made by the user
        handleGetMarks();
    };

    const handleDownloadExcel = () => {
        if (students.length === 0) {
            setMessage({ type: 'error', text: "No data to download." });
            return;
        }

        // Get the selected class name
        const className = classes.find(c => c.id == selectedClass)?.class_name || 'Class';
        // Get the selected subject name
        const subjectName = subjects.find(s => s.id == selectedSubjectId)?.subject_name || 'Subject';
        // Get the selected test name
        const testName = tests.find(t => t.test_id == selectedTestId)?.test_name || 'Test';

        const header = ["S.No", "Roll No", "Admission No", "Student Name", "Category", "Marks", "Grade", "Status"];
        const data = students.map((student, index) => [
            index + 1,
            student.roll_number,
            student.admission_no,
            student.name,
            student.category || '-',
            student.is_absent ? 'AB' : student.marks_obtained,
            student.grade || '-',
            student.is_absent ? 'Absent' : (student.marks_obtained !== '' && student.marks_obtained !== null && student.marks_obtained !== undefined) ? 'Present' : '-'
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Marks");

        // Define a filename
        const fileName = `${className}_${subjectName}_${testName}_Marks.xlsx`;

        // Trigger the download
        XLSX.writeFile(workbook, fileName);
    };

    // Note: I missed `activeClassTestId` state in the component. 
    // I will fix this in the next edit or complete it now.
    // I will write the full component now including that state.

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">Enter Subject Marks</h2>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6 bg-white p-4 rounded shadow-sm">
                {/* Branch */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Branch</label>
                    <select
                        value={selectedBranch}
                        onChange={e => setSelectedBranch(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        disabled={branches.length <= 1}
                    >
                        {branches.map(b => <option key={b.branch_code} value={b.branch_code}>{b.branch_name}</option>)}
                    </select>
                </div>

                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Class</label>
                    <select
                        value={selectedClass}
                        onChange={e => setSelectedClass(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="">Select Category</option>
                        <option value="Hifz">Hifz</option>
                        <option value="Hifz + Nazira">Hifz + Nazira</option>
                    </select>
                </div>

                {/* Test */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Test</label>
                    <select
                        value={selectedTestId}
                        onChange={e => setSelectedTestId(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="">Select Test</option>
                        {tests.map(t => <option key={t.test_id} value={t.test_id}>{t.test_name}</option>)}
                        {/* Note: t.test_id here is the generic ID, not class_test.id */}
                    </select>
                </div>

                {/* Subject */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Subject</label>
                    <select
                        value={selectedSubjectId}
                        onChange={e => setSelectedSubjectId(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="">Select Subject</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
                    </select>
                </div>
            </div>

            <div className="mb-4">
                <button
                    type="button"
                    onClick={handleGetMarks}
                    disabled={loading || !selectedTestId || !selectedSubjectId}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {loading ? "Loading..." : "Get Marks"}
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-3 rounded mb-4 ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message.text}
                </div>
            )}

            {/* Grid */}
            {students.length > 0 && (
                <div className="bg-white shadow rounded overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                        <span className="font-semibold text-gray-700">
                            Max Marks: {subjectTotalMarks}
                        </span>
                        <div className="text-sm text-gray-500">
                            Valid inputs: 0-{subjectTotalMarks}, "AB" (Absent)
                        </div>
                    </div>

                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admission No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marks</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {students.map((student, index) => (
                                <tr key={student.student_id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.roll_number}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.admission_no}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {student.category ? (
                                            <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-semibold border border-indigo-200">
                                                {student.category}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <input
                                            type="text"
                                            value={student.is_absent ? 'AB' : (student.marks_obtained !== null && student.marks_obtained !== undefined ? String(student.marks_obtained).split('.')[0] : '')}
                                            onChange={(e) => handleInputChange(student.student_id, e.target.value)}
                                            onBlur={() => handleInputBlur(student.student_id)}
                                            className={`border rounded px-2 py-1 w-24 focus:outline-none focus:ring-2 
                                                ${student.is_absent ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'border-gray-300'}
                                            `}
                                            placeholder="-"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-bold">
                                        {student.grade || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {student.is_absent ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                Absent
                                            </span>
                                        ) : (student.marks_obtained !== '' && student.marks_obtained !== null && student.marks_obtained !== undefined) ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Present
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="p-4 bg-gray-50 border-t flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={saving}
                            className={`bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 flex items-center gap-2 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Cancel
                        </button>


                        <button
                            type="button"
                            onClick={handleDownloadExcel}
                            disabled={saving || students.length === 0}
                            className={`bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 flex items-center gap-2 ${saving || students.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <FileDown size={18} />
                            Download Excel
                        </button>

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className={`bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 flex items-center gap-2 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Save size={18} />
                            {saving ? "Saving..." : "Save Marks"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarksEntry;

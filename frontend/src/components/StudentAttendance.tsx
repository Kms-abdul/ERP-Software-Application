import React, { useState, useEffect } from 'react';
import { Page } from '../App';
import { ChevronDownIcon } from './icons';
import { Student } from '../types';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import api from '../api';

const filterClassesForUser = (classes: any[]): any[] => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.role === 'Teacher' && user?.allowed_classes && user.allowed_classes.length > 0) {
        const allowed = user.allowed_classes.map((c: any) => c.class_name || c);
        if (!allowed.includes('All')) {
            return classes.filter((c: any) => allowed.includes(c.class_name || c.name || c));
        }
    }
    return classes;
};

interface StudentAttendanceProps {
    navigateTo: (page: Page) => void;
    defaultTab?: AttendanceTab;
}

type AttendanceTab = 'take' | 'today' | 'register' | 'delete' | 'absent-report';

interface AttendanceHeaderProps {
    activeTab: AttendanceTab;
    onTabChange: (tab: AttendanceTab) => void;
    onAction: (action: string) => void;
}

const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({ activeTab, onTabChange, onAction }) => {
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const buttonStyle = "px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 font-medium transition-colors";
    const activeButtonStyle = "px-3 py-1.5 text-sm border border-transparent bg-sky-600 text-white rounded-md font-medium shadow-sm";
    const deleteActiveStyle = "px-3 py-1.5 text-sm border border-transparent bg-red-600 text-white rounded-md font-semibold shadow-sm";
    const deleteButtonStyle = "px-3 py-1.5 text-sm border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 rounded-md font-semibold transition-colors";

    const Dropdown: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
        const isOpen = openDropdown === title;
        return (
            <div className="relative inline-block text-left">
                <button
                    type="button"
                    className={`${buttonStyle} flex items-center`}
                    onClick={() => setOpenDropdown(isOpen ? null : title)}
                    onBlur={() => setTimeout(() => setOpenDropdown(null), 200)}
                >
                    {title}
                    <ChevronDownIcon className="w-4 h-4 ml-1" />
                </button>
                {isOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                        <div className="py-1" role="menu" aria-orientation="vertical">
                            {children}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const DropdownItem: React.FC<{ children: React.ReactNode, action?: string }> = ({ children, action }) => (
        <a
            href="#"
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            role="menuitem"
            onClick={(e) => {
                e.preventDefault();
                if (action) onAction(action);
            }}
        >
            {children}
        </a>
    );

    return (
        <div className="bg-white p-3 border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-gray-700">
                        STUDENT ATTENDANCE
                        <span className="text-gray-400 mx-2">/</span>
                        <span className="text-sm bg-gray-200 text-gray-600 font-medium px-2 py-1 rounded">Non Biometric</span>
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button className={activeTab === 'take' ? activeButtonStyle : buttonStyle} onClick={() => onTabChange('take')}>Take Attendance</button>
                    <button className={activeTab === 'register' ? activeButtonStyle : buttonStyle} onClick={() => onTabChange('register')}>Register View</button>
                    <button className={activeTab === 'delete' ? deleteActiveStyle : deleteButtonStyle} onClick={() => onTabChange('delete')}>
                        Delete Attendance
                    </button>
                    <Dropdown title="Reports">
                        <DropdownItem action="Absent Report">Absent Report</DropdownItem>
                        <DropdownItem action="SMS">Send SMS To All Present Students</DropdownItem>
                        <DropdownItem action="Month Report">Month Report</DropdownItem>
                    </Dropdown>
                </div>
            </div>
        </div>
    );
};


const TakeAttendanceForm: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<{ [key: number]: string }>({});
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [classOptions, setClassOptions] = useState<{ id: number, class_name: string }[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [isUpdateMode, setIsUpdateMode] = useState(false);
    const [updateCount, setUpdateCount] = useState<number>(0);
    const [lastModified, setLastModified] = useState<string | null>(null);
    const [dateBlocked, setDateBlocked] = useState<{ blocked: boolean; reason: string }>({ blocked: false, reason: '' });
    const [hasFetched, setHasFetched] = useState(false);
    const [emptyMessage, setEmptyMessage] = useState('');
    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(filterClassesForUser(res.data.classes || [])))
            .catch(err => console.error("Failed to load classes", err));
    }, []);

    useEffect(() => {
        setHasFetched(false);
        setEmptyMessage('');
        if (!selectedClass) {
            setSectionOptions([]);
            setSelectedSection('');
            return;
        }

        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';
        api.get('/sections', {
            params: {
                class: selectedClass,
                branch,
                academic_year: academicYear,
            }
        })
            .then(res => setSectionOptions(res.data.sections || []))
            .catch(err => {
                console.error("Failed to load sections", err);
                setSectionOptions([]);
            });
    }, [selectedClass]);


    const handleGetStudents = async () => {
        if (!selectedClass) {
            alert("Please select a class");
            return;
        }
        setLoading(true);
        setDateBlocked({ blocked: false, reason: '' });
        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;

            // Pre-check: Is this date a holiday or weekoff?
            try {
                const checkRes = await api.post('/config/check-date', {
                    date: attendanceDate,
                    branch_name: branchParam,
                    class_name: selectedClass,
                });
                if (checkRes.data?.is_holiday || checkRes.data?.is_weekoff) {
                    setDateBlocked({ blocked: true, reason: checkRes.data.reason || 'Holiday / Weekoff' });
                    setStudents([]);
                    setAttendance({});
                    setLoading(false);
                    return;
                }
            } catch (checkErr) {
                console.error('Date check failed, proceeding:', checkErr);
            }

            const res = await api.get('/attendance', {
                params: {
                    class: selectedClass,
                    section: selectedSection,
                    date: attendanceDate,
                    branch: branchParam
                }
            });

            const fetchedStudents = res.data.students || [];
            const existingAttendance = res.data.attendance || {};

            setHasFetched(true);
            setEmptyMessage(res.data?.message || '');
            setStudents(fetchedStudents);
            setUpdateCount(res.data.class_update_count || 0);
            setLastModified(res.data.last_modified);

            // Build attendance map
            const initialAttendance: { [key: number]: string } = {};
            fetchedStudents.forEach((s: any) => {
                const status = existingAttendance[s.student_id] || 'Present';
                initialAttendance[s.student_id] = status;
            });

            setAttendance(initialAttendance);

            // 🔥 NEW: Detect first-time or update mode
            const hasExisting = Object.keys(existingAttendance).length > 0;
            setIsUpdateMode(hasExisting);

        } catch (error) {
            console.error("Error fetching students:", error);
            alert("Failed to fetch students");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (studentId: number, status: string) => {
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const markAll = (status: string) => {
        const updated = students.reduce((acc, student) => {
            if (!(student as any).is_locked) {
                acc[student.student_id!] = status;
            } else {
                // keep old status if locked
                acc[student.student_id!] = attendance[student.student_id!];
            }
            return acc;
        }, {} as { [key: number]: string });
        setAttendance(updated);
    };

    const handleDeleteDateAttendance = async () => {
        if (!selectedClass || !attendanceDate) return;
        if (!window.confirm(`Are you sure you want to delete ALL attendance records for Class ${selectedClass}${selectedSection ? ` (Section ${selectedSection})` : ''} on ${attendanceDate}?\nThis will remove attendance for all students on this date.`)) {
            return;
        }
        setLoading(true);
        try {
            const academicYear = localStorage.getItem('academicYear') || '';
            const res = await api.delete('/attendance', {
                data: {
                    date: attendanceDate,
                    class: selectedClass,
                    section: selectedSection,
                    academic_year: academicYear
                }
            });
            alert(res.data?.message || "Attendance deleted successfully for this date.");
            handleGetStudents();
        } catch (error: any) {
            console.error("Delete attendance error", error);
            alert(`Failed to delete attendance: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const payload = {
                date: attendanceDate,
                attendance: Object.entries(attendance).map(([studentId, status]) => ({
                    student_id: parseInt(studentId),
                    date: attendanceDate,
                    status: status
                }))
            };

            await api.post('/attendance', payload);
            alert("Attendance saved successfully!");
            handleGetStudents();
        } catch (error) {
            console.error("Error saving attendance:", error);
            alert("Failed to save attendance");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <div className="bg-white rounded-lg shadow-md border">
                <div className="bg-sky-600 text-white font-semibold p-3 rounded-t-lg">
                    TAKE ATTENDANCE
                </div>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Attendance Date</label>
                            <input
                                type="date"
                                value={attendanceDate}
                                onChange={(e) => setAttendanceDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Class</label>
                            <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                            >
                                <option value="">--Select Class--</option>
                                {classOptions.map(c => (
                                    <option key={c.id} value={c.class_name}>{c.class_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Section</label>
                            <select
                                value={selectedSection}
                                onChange={e => setSelectedSection(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                            >
                                <option value="">--All Sections--</option>
                                {sectionOptions.map(section => <option key={section} value={section}>{section}</option>)}
                            </select>
                        </div>
                        <button onClick={handleGetStudents} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                            {loading ? 'Loading...' : 'Get Students'}
                        </button>
                    </div>

                    {dateBlocked.blocked && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-lg flex items-center gap-3">
                            <span className="text-red-600 text-2xl">🚫</span>
                            <div>
                                <p className="font-semibold text-red-700">Attendance Blocked</p>
                                <p className="text-red-600 text-sm">{dateBlocked.reason} — Attendance cannot be taken on this date.</p>
                            </div>
                        </div>
                    )}

                    {students.length > 0 && (
                        <div className="overflow-x-auto border rounded-lg">
                            <div className="p-2 bg-gray-50 border-b flex flex-wrap items-center gap-2">
                                <button onClick={() => markAll('Present')} className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded border border-green-200 hover:bg-green-200 font-medium">Mark All Present</button>
                                <button onClick={() => markAll('Absent')} className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded border border-red-200 hover:bg-red-200 font-medium">Mark All Absent</button>
                                <button onClick={() => markAll('')} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-200 font-medium">Clear All</button>
                                {isUpdateMode && (
                                    <button
                                        onClick={handleDeleteDateAttendance}
                                        disabled={loading}
                                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-semibold ml-auto transition-colors shadow-sm"
                                    >
                                        Delete Attendance for {attendanceDate}
                                    </button>
                                )}
                            </div>
                            <table className="min-w-full divide-y divide-gray-200 text-m">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Roll No.</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Adm No.</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Student Name</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Father Name</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Phone</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {students.map(student => (
                                        <tr key={student.student_id}>
                                            <td className="px-4 py-2 whitespace-nowrap">{student.rollNo}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{student.admNo}</td>
                                            <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{student.name}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-gray-500">{student.father}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-gray-500">{student.smsNo || student.fatherMobile}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <div className="flex items-center space-x-4">
                                                    {[
                                                        { val: 'Present', label: 'P', color: 'green' },
                                                        { val: 'Absent', label: 'A', color: 'red' },
                                                    ].map(opt => {
                                                        const colorMap: { [key: string]: { text: string; ring: string; label: string } } = {
                                                            green: { text: 'text-green-600', ring: 'focus:ring-green-500', label: 'text-green-700' },
                                                            red: { text: 'text-red-600', ring: 'focus:ring-red-500', label: 'text-red-700' },
                                                        };
                                                        const classes = colorMap[opt.color];
                                                        return (
                                                            <label key={opt.val} className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name={`status-${student.student_id}`}
                                                                    checked={attendance[student.student_id!] === opt.val}
                                                                    onChange={() => {
                                                                        if ((student as any).is_locked) {
                                                                            alert("This student record is locked for this academic year.");
                                                                        } else {
                                                                            handleStatusChange(student.student_id!, opt.val);
                                                                        }
                                                                    }}
                                                                    disabled={(student as any).is_locked}
                                                                    className={`h-5 w-5 ${classes.text} border-gray-300 ${classes.ring} ${(student as any).is_locked ? 'cursor-not-allowed opacity-50' : ''}`}
                                                                    title={(student as any).is_locked ? 'Record locked (Promoted)' : ''}
                                                                />
                                                                <span className={`ml-1 ${classes.label} font-medium`}>{opt.label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if ((student as any).is_locked) {
                                                                alert("This student record is locked for this academic year.");
                                                            } else {
                                                                handleStatusChange(student.student_id!, '');
                                                            }
                                                        }}
                                                        disabled={(student as any).is_locked}
                                                        title="Clear / Unmark"
                                                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${!attendance[student.student_id!] ? 'bg-gray-200 text-gray-800 font-bold border-gray-400' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-gray-200'}`}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="p-4 bg-gray-50 border-t flex justify-end">
                                <div className="flex flex-col items-end gap-1">
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        className={`${isUpdateMode ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"} text-white px-6 py-2 rounded-md text-sm font-semibold disabled:bg-gray-400`}
                                    >
                                        {loading
                                            ? (isUpdateMode ? "Updating..." : "Saving...")
                                            : (isUpdateMode ? `Update Attendance (Updates: ${updateCount})` : "Save Attendance")
                                        }
                                    </button>
                                    {isUpdateMode && lastModified && (
                                        <div className="text-xs text-gray-500">
                                            Last Modified: {new Date(lastModified).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {hasFetched && students.length === 0 && !loading && !dateBlocked.blocked && (
                        <div className="mt-4 p-5 bg-amber-50 border border-amber-300 rounded-lg text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 text-amber-800 font-semibold text-base mb-1">
                                <span className="text-xl">⚠️</span> No Active Students Found
                            </div>
                            <p className="text-amber-700 text-sm">
                                {emptyMessage || `No active students found in Class ${selectedClass}${selectedSection ? `, Section ${selectedSection}` : ''} for ${localStorage.getItem('currentBranch') || 'this branch'}.`}
                            </p>
                            <p className="text-xs text-amber-600 mt-2">
                                Tip: Check other classes (e.g. Class 7) or verify student active status in Student Administration.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
};

const RegisterViewTab: React.FC = () => {
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [classOptions, setClassOptions] = useState<{ id: number, class_name: string }[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [reportData, setReportData] = useState<any>(null);
    const [blockedDates, setBlockedDates] = useState<{ [date: string]: string }>({});
    const [loading, setLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [emptyMessage, setEmptyMessage] = useState('');

    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(filterClassesForUser(res.data.classes || [])))
            .catch(err => console.error("Failed to load classes", err));
    }, []);

    useEffect(() => {
        setHasFetched(false);
        setEmptyMessage('');
        if (!selectedClass) {
            setSectionOptions([]);
            setSelectedSection('');
            return;
        }

        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';
        api.get('/sections', {
            params: {
                class: selectedClass,
                branch,
                academic_year: academicYear,
            }
        })
            .then(res => setSectionOptions(res.data.sections || []))
            .catch(err => {
                console.error("Failed to load sections", err);
                setSectionOptions([]);
            });
    }, [selectedClass]);

    const handleGetReport = async () => {
        if (!selectedClass) {
            alert("Please select a class");
            return;
        }
        setLoading(true);
        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const res = await api.get('/attendance', {
                params: {
                    class: selectedClass,
                    section: selectedSection,
                    month: selectedMonth,
                    year: selectedYear,
                    branch: branchParam
                }
            });
            setReportData(res.data);
            setHasFetched(true);
            setEmptyMessage(res.data?.message || '');

            // Fetch blocked dates for this month
            try {
                const blockRes = await api.post('/config/check-month', {
                    month: selectedMonth,
                    year: selectedYear,
                    branch_name: branchParam,
                    class_name: selectedClass,
                });
                setBlockedDates(blockRes.data?.blocked_dates || {});
            } catch (blockErr) {
                console.error('Failed to fetch blocked dates:', blockErr);
                setBlockedDates({});
            }
        } catch (error) {
            console.error("Error fetching report:", error);
            alert("Failed to fetch report");
        } finally {
            setLoading(false);
        }
    };

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Present': return 'bg-green-100 text-green-800';
            case 'Absent': return 'bg-red-100 text-red-800';
            case 'Leave': return 'bg-yellow-100 text-yellow-800';
            case 'Holiday': return 'bg-gray-100 text-gray-800';
            case 'Sunday': return 'bg-pink-100 text-pink-800';
            case 'Weekoff': return 'bg-blue-100 text-blue-800';
            default: return '';
        }
    };

    const getStatusShort = (status: string) => {
        return status ? status.charAt(0) : '-';
    };
    const handleExportExcel = () => {
        if (!reportData) return;

        const sheetData: any[] = [];

        // ---- Header Row ----
        const headerRow = [
            "Student Name",
            "Admission No",
            "Roll No",
            ...daysArray.map(d => d.toString()),
            "Present",
            "Absent",
            "Total Working Days",
            "Attendance %"
        ];

        sheetData.push(headerRow);

        // ---- Student Rows ----
        reportData.students.forEach((student: any) => {
            const attendanceMap = reportData.attendance[student.student_id] || {};

            let presentCount = 0;
            let absentCount = 0;

            const dayValues = daysArray.map(d => {
                const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                // Check if date is blocked
                if (blockedDates[dateStr]) {
                    return "H";
                }

                const status = attendanceMap[dateStr];

                if (status === "Present") {
                    presentCount++;
                    return "P";
                }
                if (status === "Absent") {
                    absentCount++;
                    return "A";
                }
                return "-";
            });

            // Filter blocked dates to only include those in the current month
            const blockedDatesInMonth = Object.keys(blockedDates).filter(dateStr => {
                const dateParts = dateStr.split('-');
                const dateYear = parseInt(dateParts[0], 10);
                const dateMonth = parseInt(dateParts[1], 10);
                return dateYear === selectedYear && dateMonth === selectedMonth;
            }).length;

            const workingDays = daysInMonth - blockedDatesInMonth;
            const percentage = workingDays > 0
                ? ((presentCount / workingDays) * 100).toFixed(1)
                : "0.0";

            sheetData.push([
                student.name,
                student.admNo,
                student.rollNo || "",
                ...dayValues,
                presentCount,
                absentCount,
                workingDays,
                `${percentage}%`
            ]);
        });

        // ---- Create Workbook ----
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Register");

        // ---- Export ----
        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array"
        });

        const blob = new Blob(
            [excelBuffer],
            { type: "application/octet-stream" }
        );

        saveAs(
            blob,
            `Attendance_${selectedClass}_${selectedMonth}_${selectedYear}.xlsx`
        );
    };

    const handleDeleteStudentMonth = async (student: any) => {
        const monthName = new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' });
        if (!window.confirm(`Are you sure you want to delete ALL attendance records for ${student.name} (${student.admNo || ''}) for ${monthName} ${selectedYear}?\n\nThis will remove their attendance for this entire month.`)) {
            return;
        }
        setLoading(true);
        try {
            const res = await api.delete('/attendance', {
                data: {
                    student_id: student.student_id,
                    month: selectedMonth,
                    year: selectedYear
                }
            });
            alert(res.data?.message || `Attendance deleted for ${student.name} for ${monthName}.`);
            handleGetReport();
        } catch (error: any) {
            console.error("Failed to delete month attendance", error);
            alert(`Failed to delete attendance: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <div className="bg-white rounded-lg shadow-md border">
                <div className="bg-sky-600 text-white font-semibold p-3 rounded-t-lg">
                    ATTENDANCE REGISTER
                </div>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Class</label>
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">--Select Class--</option>
                                {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Section</label>
                            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">--All Sections--</option>
                                {sectionOptions.map(section => <option key={section} value={section}>{section}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Month</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                {Array.from({ length: 12 }, (_, i) => i + 1)
                                    .filter(m => {
                                        const now = new Date();
                                        if (selectedYear > now.getFullYear()) return false;
                                        if (selectedYear === now.getFullYear() && m > (now.getMonth() + 1)) return false;
                                        return true;
                                    })
                                    .map(m => (
                                        <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Year</label>
                            <input
                                type="number"
                                value={selectedYear}
                                max={new Date().getFullYear()}
                                onChange={e => setSelectedYear(parseInt(e.target.value))}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                        </div>
                        <button onClick={handleGetReport} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                            {loading ? 'Loading...' : 'Get Register'}
                        </button>

                    </div>

                    {reportData && reportData.students && reportData.students.length > 0 && (
                        <div className="overflow-x-auto border rounded-lg mt-4">
                            <table className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 w-48">Student</th>
                                        <th className="px-2 py-2 text-center font-medium text-gray-500 bg-gray-50 border-1 border-gray-100">Roll No</th>
                                        {daysArray.map(d => {
                                            const date = new Date(selectedYear, selectedMonth - 1, d);
                                            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                                            const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const isBlocked = !!blockedDates[dateStr];
                                            return (
                                                <th key={d} className={`px-1 py-2 text-center font-medium w-8 border-l border-gray-100 ${isBlocked ? 'bg-gray-300 text-gray-600' : 'text-gray-500'}`}
                                                    title={isBlocked ? blockedDates[dateStr] : undefined}
                                                >
                                                    <div className="flex flex-col items-center justify-center leading-tight">
                                                        <span>{d}</span>
                                                        <span className="text-[10px] font-normal">{isBlocked ? 'H' : dayName}</span>
                                                    </div>

                                                </th>

                                            );
                                        })}
                                        <th className="px-2 py-2 text-center font-medium text-gray-700 bg-blue-50 border-l border-blue-100">Present</th>
                                        <th className="px-2 py-2 text-center font-medium text-gray-700 bg-blue-50">Absent</th>
                                        <th className="px-2 py-2 text-center font-medium text-gray-700 bg-blue-50">Total Working Days</th>
                                        <th className="px-2 py-2 text-center font-medium text-gray-700 bg-blue-50">Attendance %</th>
                                        <th className="px-2 py-2 text-center font-medium text-red-700 bg-red-50 border-l border-red-100">Action</th>
                                    </tr>

                                </thead>

                                <tbody className="bg-white divide-y divide-gray-200">
                                    {reportData.students.map((student: any) => {
                                        const studentAttendance = reportData.attendance[student.student_id] || {};

                                        // Calculate Stats
                                        let presentCount = 0;
                                        let absentCount = 0;

                                        daysArray.forEach(d => {
                                            const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            if (blockedDates[dateStr]) return; // Skip blocked dates
                                            const status = studentAttendance[dateStr];
                                            if (status === 'Present') presentCount++;
                                            if (status === 'Absent') absentCount++;
                                        });

                                        const blockedCount = Object.keys(blockedDates).filter(dateStr => {
                                            const [year, month] = dateStr.split('-').map(Number);
                                            return year === selectedYear && month === selectedMonth;
                                        }).length;
                                        const workingDays = daysInMonth - blockedCount;
                                        const percentage = workingDays > 0 ? ((presentCount / workingDays) * 100).toFixed(1) : '0.0';

                                        return (
                                            <tr key={student.student_id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                    <div>{student.name}</div>
                                                    <div className="text-[10px] text-gray-500">{student.admNo}</div>
                                                </td>
                                                <td className="px-2 py-1 text-center font-medium text-gray-700 bg-white border-l border-gray-100">
                                                    {student.rollNo || "-"}
                                                </td>

                                                {daysArray.map(d => {
                                                    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                    const isBlocked = !!blockedDates[dateStr];

                                                    if (isBlocked) {
                                                        return (
                                                            <td key={d} className="px-1 py-1 text-center border-l border-gray-100 bg-gray-200 text-gray-500"
                                                                title={blockedDates[dateStr]}
                                                            >
                                                                H
                                                            </td>
                                                        );
                                                    }

                                                    const status = studentAttendance[dateStr];
                                                    return (
                                                        <td key={d} className={`px-1 py-1 text-center border-l border-gray-100 ${getStatusColor(status)}`}>
                                                            {getStatusShort(status)}
                                                        </td>
                                                    );
                                                })}

                                                <td className="px-2 py-1 text-center font-bold text-green-700 bg-blue-50 border-l border-blue-100">{presentCount}</td>
                                                <td className="px-2 py-1 text-center font-bold text-red-700 bg-blue-50">{absentCount}</td>
                                                <td className="px-2 py-1 text-center font-semibold text-gray-700 bg-blue-50">{workingDays}</td>
                                                <td className="px-2 py-1 text-center font-bold text-blue-700 bg-blue-50">{percentage}%</td>
                                                <td className="px-2 py-1 text-center bg-white border-l border-gray-100">
                                                    <button
                                                        onClick={() => handleDeleteStudentMonth(student)}
                                                        title={`Delete all attendance for ${student.name} in ${new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })}`}
                                                        className="text-[11px] bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 border border-red-200 px-2 py-0.5 rounded font-medium transition-colors"
                                                    >
                                                        Clear Month
                                                    </button>
                                                </td>

                                            </tr>

                                        );

                                    })}

                                </tbody>
                            </table>
                            <div className="right p-2 mt-2">
                                <button onClick={handleExportExcel} disabled={!reportData} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm disabled:bg-gray-400">
                                    Export Excel</button> </div>
                        </div>
                    )}

                    {hasFetched && reportData && reportData.students && reportData.students.length === 0 && !loading && (
                        <div className="mt-4 p-5 bg-amber-50 border border-amber-300 rounded-lg text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 text-amber-800 font-semibold text-base mb-1">
                                <span className="text-xl">⚠️</span> No Active Students Found
                            </div>
                            <p className="text-amber-700 text-sm">
                                {emptyMessage || `No active students found in Class ${selectedClass}${selectedSection ? `, Section ${selectedSection}` : ''} for ${localStorage.getItem('currentBranch') || 'this branch'} in academic year ${localStorage.getItem('academicYear') || '2026-2027'}.`}
                            </p>
                            <p className="text-xs text-amber-600 mt-2">
                                Tip: Check other classes (e.g. Class 7) or verify student active status in Student Administration.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};

const MonthlyAttendanceEntryTab: React.FC = () => {
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [classOptions, setClassOptions] = useState<{ id: number, class_name: string }[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [attendanceData, setAttendanceData] = useState<{ [key: string]: string }>({});
    const [originalData, setOriginalData] = useState<{ [key: string]: string }>({});
    const [blockedDates, setBlockedDates] = useState<{ [date: string]: string }>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [emptyMessage, setEmptyMessage] = useState('');

    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(filterClassesForUser(res.data.classes || [])))
            .catch(err => console.error("Failed to load classes", err));
    }, []);

    useEffect(() => {
        setHasFetched(false);
        setEmptyMessage('');
        if (!selectedClass) {
            setSectionOptions([]);
            setSelectedSection('');
            return;
        }

        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';
        api.get('/sections', {
            params: {
                class: selectedClass,
                branch,
                academic_year: academicYear,
            }
        })
            .then(res => setSectionOptions(res.data.sections || []))
            .catch(err => {
                console.error("Failed to load sections", err);
                setSectionOptions([]);
            });
    }, [selectedClass]);

    const handleGetStudents = async () => {
        if (!selectedClass) {
            alert("Please select a class");
            return;
        }
        setLoading(true);
        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const res = await api.get('/attendance', {
                params: {
                    class: selectedClass,
                    section: selectedSection,
                    month: selectedMonth,
                    year: selectedYear,
                    branch: branchParam
                }
            });

            setStudents(res.data.students || []);
            setHasFetched(true);
            setEmptyMessage(res.data?.message || '');

            // Flatten attendance data for easier editing: "studentId-date" -> status
            const flatAttendance: { [key: string]: string } = {};
            const fetchedAttendance = res.data.attendance || {};

            Object.keys(fetchedAttendance).forEach(studentId => {
                const dates = fetchedAttendance[studentId];
                Object.keys(dates).forEach(date => {
                    flatAttendance[`${studentId}_${date}`] = dates[date];
                });
            });

            setAttendanceData(flatAttendance);
            setOriginalData({ ...flatAttendance }); // Deep copy for comparison

            // Fetch blocked dates for this month
            try {
                const blockRes = await api.post('/config/check-month', {
                    month: selectedMonth,
                    year: selectedYear,
                    branch_name: branchParam,
                    class_name: selectedClass,
                });
                setBlockedDates(blockRes.data?.blocked_dates || {});
            } catch (blockErr) {
                console.error('Failed to fetch blocked dates:', blockErr);
                setBlockedDates({});
            }

        } catch (error) {
            console.error("Error fetching data:", error);
            alert("Failed to fetch data");
        } finally {
            setLoading(false);
        }
    };

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const toggleStatus = (studentId: number, day: number) => {
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Block toggling on holiday/weekoff dates
        if (blockedDates[dateStr]) {
            alert(`Cannot mark attendance: ${blockedDates[dateStr]}`);
            return;
        }

        const key = `${studentId}_${dateStr}`;
        const currentStatus = attendanceData[key];

        // Cycle: Present -> Absent -> Clear ('') -> Present
        let newStatus = 'Present';
        if (currentStatus === 'Present') newStatus = 'Absent';
        else if (currentStatus === 'Absent') newStatus = '';
        else newStatus = 'Present';

        setAttendanceData(prev => ({
            ...prev,
            [key]: newStatus
        }));
    };

    const handleClearStudentMonth = async (student: any) => {
        const monthName = new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' });
        if (!window.confirm(`Are you sure you want to delete ALL attendance records for ${student.name} (${student.admNo || ''}) for ${monthName} ${selectedYear}?\n\nThis will remove their attendance records for this entire month.`)) {
            return;
        }
        setSaving(true);
        try {
            const res = await api.delete('/attendance', {
                data: {
                    student_id: student.student_id,
                    month: selectedMonth,
                    year: selectedYear
                }
            });
            alert(res.data?.message || `Attendance deleted for ${student.name}.`);
            handleGetStudents();
        } catch (error: any) {
            console.error("Failed to clear student month", error);
            alert(`Failed to delete attendance: ${error.response?.data?.error || error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (window.confirm("Are you sure you want to discard all unsaved changes?")) {
            setAttendanceData({ ...originalData });
        }
    };

    const handleDownloadTemplate = async () => {
        if (!selectedClass) return alert("Select a class first");

        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const academicYear = localStorage.getItem('academicYear') || '';

            // We can download directly using window.open but that might lack Auth headers
            // Better to use axios with blob response type
            const res = await api.get('/attendance/template', {
                params: {
                    class: selectedClass,
                    section: selectedSection,
                    month: selectedMonth,
                    year: selectedYear,
                    branch: branchParam,
                    academic_year: academicYear
                },
                responseType: 'blob'
            });

            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Attendance_Template_${selectedClass}_${selectedMonth}_${selectedYear}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {
            console.error("Download failed", error);
            alert("Failed to download template");
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('month', selectedMonth.toString());
        formData.append('year', selectedYear.toString());

        setLoading(true);
        try {
            await api.post('/attendance/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert("Upload Successful!");
            handleGetStudents(); // Refresh data
        } catch (error: any) {
            console.error("Upload failed", error);
            alert(`Upload failed: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
            // Reset input
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (Object.keys(attendanceData).length === 0) return;
        setSaving(true);
        try {
            // Transform flat map back to API payload
            // We need to send ALL data or just changes? 
            // The API supports a list of {student_id, date, status}
            // We will send all non-empty entries to be safe/simple

            const attendanceList = Object.entries(attendanceData)
                .filter(([key, status]) => {
                    // Only include if status CHANGED from original
                    return status !== originalData[key];
                })
                .map(([key, status]) => {
                    // Key format: "123_2023-10-01"
                    const parts = key.split('_');
                    if (parts.length !== 2) return null; // Should not happen

                    const sId = parts[0];
                    const dStr = parts[1];

                    return {
                        student_id: parseInt(sId),
                        date: dStr,
                        status: status
                    };
                })
                .filter(item => item !== null);

            // Fallback: If attendanceList is empty, do nothing
            if (attendanceList.length === 0) {
                alert("No changes allowed to save.");
                setSaving(false);
                return;
            }

            // Use the date from the first item as a default fallback date 
            // to satisfy backend checks if they are strict or running old code
            const sampleDate = attendanceList[0]?.date || new Date().toISOString().split('T')[0];

            const res = await api.post('/attendance', {
                date: sampleDate, // Added global date as fallback
                attendance: attendanceList
            });

            if (res.data && res.data.stats) {
                let msg = `Attendance saved! Added: ${res.data.stats.added}, Updated: ${res.data.stats.updated}, Skipped: ${res.data.stats.skipped}`;
                if (res.data.stats.skipped > 0 && res.data.stats.skip_details) {
                    msg += `\nReasons: ${res.data.stats.skip_details.join(", ")}`;
                }
                alert(msg);
            } else {
                alert("Monthly attendance saved successfully!");
            }

            handleGetStudents(); // Refresh data

        } catch (error: any) {
            console.error("Error saving attendance:", error);
            if (error.response && error.response.data) {
                alert(`Failed to save attendance: ${JSON.stringify(error.response.data)}`);
            } else {
                alert(`Failed to save attendance: ${error.message}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Present': return 'bg-green-100 text-green-800 hover:bg-green-200';
            case 'Absent': return 'bg-red-100 text-red-800 hover:bg-red-200';
            case 'Leave': return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
            case 'Holiday': return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
            case 'Sunday': return 'bg-pink-100 text-pink-800 hover:bg-pink-200';
            default: return 'bg-gray-50 text-gray-400 hover:bg-gray-200';
        }
    };

    return (
        <div className="p-4">
            <div className="bg-white rounded-lg shadow-md border">
                <div className="bg-sky-600 text-white font-semibold p-3 rounded-t-lg">
                    MONTHLY ATTENDANCE ENTRY
                </div>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Class</label>
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">--Select Class--</option>
                                {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Section</label>
                            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                <option value="">--All Sections--</option>
                                {sectionOptions.map(section => <option key={section} value={section}>{section}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Month</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                                {Array.from({ length: 12 }, (_, i) => i + 1)
                                    .filter(m => {
                                        const now = new Date();
                                        if (selectedYear > now.getFullYear()) return false;
                                        if (selectedYear === now.getFullYear() && m > (now.getMonth() + 1)) return false;
                                        return true;
                                    })
                                    .map(m => (
                                        <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Year</label>
                            <input
                                type="number"
                                value={selectedYear}
                                max={new Date().getFullYear()}
                                onChange={e => setSelectedYear(parseInt(e.target.value))}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                        </div>
                        <button onClick={handleGetStudents} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                            {loading ? 'Loading...' : 'Get Register'}
                        </button>
                    </div>
                    {/*
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={handleDownloadTemplate}
                            disabled={loading || students.length === 0}
                            className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-200 text-sm flex items-center gap-2"
                        >
                            <span>Download Template</span>
                        </button>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleUpload}
                                className="hidden"
                                id="excel-upload"
                                disabled={loading}
                            />
                            <label
                                htmlFor="excel-upload"
                                className={`cursor-pointer bg-blue-100 text-blue-700 border border-blue-300 px-3 py-1.5 rounded-md hover:bg-blue-200 text-sm flex items-center gap-2 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span>Upload Excel</span>
                            </label>
                        </div>
                    </div>
                    */}
                    {students.length > 0 && (
                        <div className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-600">
                                    💡 Click a cell to toggle: <span className="font-semibold text-green-700">Present (P)</span> → <span className="font-semibold text-red-700">Absent (A)</span> → <span className="font-semibold text-gray-500">Clear (-)</span>. Or click <span className="font-semibold text-red-600">Clear Month</span> on any student.
                                </span>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReset}
                                            disabled={loading || Object.keys(attendanceData).length === 0}
                                            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-md text-sm font-semibold disabled:bg-gray-400"
                                        >
                                            Reset Changes
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={loading || students.every((s: any) => s.is_locked)}
                                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md text-sm font-semibold disabled:bg-gray-400 disabled:opacity-50"
                                        >
                                            {saving ? "Saving..." : "Save All Changes"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto border rounded-lg max-h-[70vh]">
                                <table className="min-w-full divide-y divide-gray-200 text-xs relative">
                                    <thead className="bg-gray-50 sticky top-0 z-20">
                                        <tr>
                                            <th className="px-2 py-2 text-center font-medium text-gray-500 sticky left-0 bg-gray-50 z-30 w-16 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">Roll No</th>
                                            <th className="px-2 py-2 text-center font-medium text-gray-500 sticky left-16 bg-gray-50 z-30 w-24 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">Adm No</th>
                                            <th className="px-2 py-2 text-left font-medium text-gray-500 sticky left-40 bg-gray-50 z-30 w-48 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">Student Name</th>
                                            {daysArray.map(d => {
                                                const date = new Date(selectedYear, selectedMonth - 1, d);
                                                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                                                const isSunday = date.getDay() === 0;
                                                return (
                                                    <th key={d} className={`px-1 py-1 text-center font-medium w-8 border-l border-gray-100 ${isSunday ? 'bg-red-50 text-red-600' : 'text-gray-500'}`}>
                                                        <div className="flex flex-col items-center justify-center leading-tight">
                                                            <span>{d}</span>
                                                            <span className="text-[10px] font-normal">{dayName}</span>
                                                        </div>
                                                    </th>
                                                );
                                            })}
                                            <th className="px-2 py-1 text-center font-medium text-red-700 bg-red-50 border-l border-red-200">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {students.map((student: any) => (
                                            <tr key={student.student_id} className="hover:bg-gray-50">
                                                <td className="px-2 py-1 text-center whitespace-nowrap text-gray-700 sticky left-0 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                    {student.rollNo || "-"}
                                                </td>
                                                <td className="px-2 py-1 text-center whitespace-nowrap text-gray-500 sticky left-16 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                    {student.admNo}
                                                </td>
                                                <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-40 bg-white z-10 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                    {student.name}
                                                </td>
                                                {daysArray.map(d => {
                                                    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                    const isBlocked = !!blockedDates[dateStr];
                                                    const status = attendanceData[`${student.student_id}_${dateStr}`];

                                                    if (isBlocked) {
                                                        return (
                                                            <td
                                                                key={d}
                                                                title={blockedDates[dateStr]}
                                                                className="px-1 py-1 text-center border-l border-gray-100 bg-gray-200 text-gray-500 cursor-not-allowed"
                                                            >
                                                                H
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td
                                                            key={d}
                                                            onClick={() => toggleStatus(student.student_id, d)}
                                                            className={`px-1 py-1 text-center border-l border-gray-100 cursor-pointer ${getStatusColor(status)}`}
                                                        >
                                                            {status ? status.charAt(0) : '-'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-2 py-1 text-center border-l border-gray-200">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleClearStudentMonth(student)}
                                                        className="text-[11px] bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 border border-red-200 px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap"
                                                        title={`Delete all attendance records for ${student.name} in this month`}
                                                    >
                                                        Clear Month
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {hasFetched && students.length === 0 && !loading && (
                        <div className="mt-4 p-5 bg-amber-50 border border-amber-300 rounded-lg text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 text-amber-800 font-semibold text-base mb-1">
                                <span className="text-xl">⚠️</span> No Active Students Found
                            </div>
                            <p className="text-amber-700 text-sm">
                                {emptyMessage || `No active students found in Class ${selectedClass}${selectedSection ? `, Section ${selectedSection}` : ''} for ${localStorage.getItem('currentBranch') || 'this branch'} in academic year ${localStorage.getItem('academicYear') || '2026-2027'}.`}
                            </p>
                            <p className="text-xs text-amber-600 mt-2">
                                Tip: Check other classes (e.g. Class 7) or verify student active status in Student Administration.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const RegisterView: React.FC = () => {
    const [subTab, setSubTab] = useState<'view' | 'entry'>('view');

    return (
        <div className="space-y-4">
            {/* Sub Tabs */}
            <div className="flex justify-center bg-gray-100 p-2 rounded-lg mx-4 mt-2">
                <div className="bg-white p-1 rounded-md shadow-sm flex space-x-1">
                    <button
                        onClick={() => setSubTab('view')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${subTab === 'view' ? 'bg-sky-100 text-sky-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Attendance Register Query
                    </button>
                    <button
                        onClick={() => setSubTab('entry')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${subTab === 'entry' ? 'bg-sky-100 text-sky-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Monthly Attendance Entry
                    </button>
                </div>
            </div>

            {subTab === 'view' ? <RegisterViewTab /> : <MonthlyAttendanceEntryTab />}
        </div>
    );
};
const AbsentReport: React.FC = () => {
    const [reportType, setReportType] = useState<'today' | 'student'>('today');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [classOptions, setClassOptions] = useState<{ id: number, class_name: string }[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);

    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(filterClassesForUser(res.data.classes || [])))
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
            params: {
                class: selectedClass,
                branch,
                academic_year: academicYear,
            }
        })
            .then(res => setSectionOptions(res.data.sections || []))
            .catch(err => {
                console.error("Failed to load sections", err);
                setSectionOptions([]);
            });
    }, [selectedClass]);

    const handleSearchStudent = async () => {
        if (!searchQuery) {
            alert("Please enter a search term");
            return;
        }
        setLoading(true);
        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const res = await api.get('/students', { params: { search: searchQuery, branch: branchParam } });
            const students = res.data.students || [];
            if (students.length === 0) {
                alert("No students found");
                setSearchResults([]);
            } else if (students.length === 1) {
                setSearchResults([]);
                handleSelectStudent(students[0]);
            } else {
                setSearchResults(students);
                setSelectedStudent(null);
            }
        } catch (error) {
            console.error("Error searching students:", error);
            alert("Failed to search students");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectStudent = (student: any) => {
        setSelectedStudent(student);
        setSearchResults([]);
        fetchStudentReport(student.student_id);
    };

    const fetchStudentReport = async (studentId: number) => {
        setLoading(true);
        try {
            const res = await api.get('/attendance', { params: { student_id: studentId } });
            const attendanceData = res.data.attendance || {};
            const records: any[] = [];
            if (attendanceData[studentId]) {
                Object.entries(attendanceData[studentId]).forEach(([d, status]) => {
                    records.push({ date: d, status: status });
                });
            }
            records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setResults(records);
        } catch (error) {
            console.error("Error fetching report:", error);
            alert("Failed to fetch report");
        } finally {
            setLoading(false);
        }
    };

    const handleGetTodayReport = async () => {
        setLoading(true);
        setResults([]);
        try {
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const params: any = { date: date, branch: branchParam };
            if (selectedClass) params.class = selectedClass;

            const res = await api.get('/attendance', { params });
            const students = res.data.students || [];
            const attendance = res.data.attendance || {};

            const absentStudents = students.filter((s: any) => {
                const status = attendance[s.student_id];
                return status === 'Absent' || status === 'Leave';
            }).map((s: any) => ({
                ...s,
                status: attendance[s.student_id]
            }));

            setResults(absentStudents);
        } catch (error) {
            console.error("Error fetching report:", error);
            alert("Failed to fetch report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <div className="bg-white rounded-lg shadow-md border">
                <div className="bg-sky-600 text-white font-semibold p-3 rounded-t-lg flex justify-between items-center">
                    <span>ABSENT REPORT</span>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => { setReportType('today'); setResults([]); setSelectedStudent(null); }}
                            className={`px-3 py-1 text-xs rounded ${reportType === 'today' ? 'bg-white text-sky-600' : 'bg-sky-700 text-white'}`}
                        >
                            Today's Absentees
                        </button>
                        <button
                            onClick={() => { setReportType('student'); setResults([]); }}
                            className={`px-3 py-1 text-xs rounded ${reportType === 'student' ? 'bg-white text-sky-600' : 'bg-sky-700 text-white'}`}
                        >
                            Student Report
                        </button>
                    </div>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-4 items-end">
                        {reportType === 'today' ? (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Date</label>
                                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Class (Optional)</label>
                                    <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm w-40">
                                        <option value="">All Classes</option>
                                        {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                                    </select>
                                </div>
                                <button onClick={handleGetTodayReport} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                                    {loading ? 'Searching...' : 'Search'}
                                </button>
                            </>
                        ) : (
                            <div className="w-full space-y-4">
                                <div className="bg-gray-50 p-3 rounded-md border">
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">Find Student by Class & Section</h4>
                                    <div className="flex flex-wrap gap-4 items-end">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Class</label>
                                            <select
                                                value={selectedClass}
                                                onChange={e => {
                                                    setSelectedClass(e.target.value);
                                                    // Trigger search if section is already selected or just fetch all class students
                                                    // For now, let's wait for explicit "Get Students" or just use the existing search logic adapted
                                                }}
                                                className="mt-1 w-40 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                            >
                                                <option value="">--Select--</option>
                                                {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Section</label>
                                            <select
                                                value={selectedSection}
                                                onChange={e => setSelectedSection(e.target.value)}
                                                className="mt-1 w-40 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                            >
                                                <option value="">--Select--</option>
                                                {sectionOptions.map(section => <option key={section} value={section}>{section}</option>)}
                                            </select>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!selectedClass) {
                                                    alert("Please select a class");
                                                    return;
                                                }
                                                setLoading(true);
                                                try {
                                                    const globalBranch = localStorage.getItem('currentBranch') || 'All';
                                                    const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
                                                    const params: any = { class: selectedClass, branch: branchParam };
                                                    if (selectedSection) params.section = selectedSection;
                                                    const res = await api.get('/students', { params });
                                                    setSearchResults(res.data.students || []);
                                                    setSelectedStudent(null);
                                                } catch (e) {
                                                    console.error(e);
                                                    alert("Error fetching students");
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            disabled={loading}
                                            className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400"
                                        >
                                            Get Students
                                        </button>
                                    </div>
                                </div>

                                <div className="relative flex items-center py-2">
                                    <div className="flex-grow border-t border-gray-300"></div>
                                    <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">OR SEARCH BY DETAILS</span>
                                    <div className="flex-grow border-t border-gray-300"></div>
                                </div>

                                <div className="flex gap-2 items-end">
                                    <div className="flex-grow">
                                        <label className="block text-sm font-medium text-gray-700">Search Student (Name, Adm No, Phone)</label>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Enter Name, Admission No, or Phone"
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                                        />
                                    </div>
                                    <button onClick={handleSearchStudent} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                                        Find
                                    </button>
                                </div>

                                {searchResults.length > 0 && (
                                    <div className="mt-2 border rounded-md max-h-40 overflow-y-auto bg-gray-50">
                                        {searchResults.map(s => (
                                            <div
                                                key={s.student_id}
                                                onClick={() => handleSelectStudent(s)}
                                                className="p-2 hover:bg-violet-100 cursor-pointer border-b last:border-b-0 text-sm"
                                            >
                                                <span className="font-semibold">{s.first_name} {s.last_name}</span>
                                                <span className="text-gray-500 ml-2">({s.admission_no}) - Class {s.class} {s.section ? `- Sec ${s.section}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedStudent && (
                                    <div className="mt-6 bg-white border rounded-lg shadow-sm overflow-hidden">
                                        <div className="bg-violet-50 px-4 py-3 border-b border-violet-100 flex justify-between items-center">
                                            <h3 className="text-lg font-semibold text-violet-800">Student Profile</h3>
                                            <button onClick={() => setSelectedStudent(null)} className="text-sm text-violet-600 hover:text-violet-800 hover:underline">
                                                Change Student
                                            </button>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-6">
                                            {/* Photo & Basic Info */}
                                            <div className="md:col-span-1 flex flex-col items-center text-center">
                                                <div className="w-24 h-24 bg-gray-200 rounded-full mb-3 flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                                                    {selectedStudent.photo ? (
                                                        <img src={selectedStudent.photo} alt={selectedStudent.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-3xl text-gray-400">👤</span>
                                                    )}
                                                </div>
                                                <h2 className="text-xl font-bold text-gray-800">{selectedStudent.name}</h2>
                                                <p className="text-sm text-gray-500">{selectedStudent.admNo}</p>
                                                <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    Active
                                                </div>
                                            </div>

                                            {/* Detailed Info */}
                                            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <h4 className="font-semibold text-gray-500 mb-2 uppercase text-xs tracking-wider">Academic Details</h4>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">Class & Section:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.class} - {selectedStudent.section || 'N/A'}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">Roll Number:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.rollNo || '-'}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">Admission Date:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.admission_date || '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="font-semibold text-gray-500 mb-2 uppercase text-xs tracking-wider">Personal Details</h4>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">Father Name:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.father || '-'}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">Mobile:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.smsNo || selectedStudent.fatherMobile || '-'}</span>
                                                        </div>
                                                        <div className="flex justify-between border-b border-gray-100 py-1">
                                                            <span className="text-gray-600">DOB:</span>
                                                            <span className="font-medium text-gray-900">{selectedStudent.dob || '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="sm:col-span-2 mt-2">
                                                    <h4 className="font-semibold text-gray-500 mb-1 uppercase text-xs tracking-wider">Address</h4>
                                                    <p className="text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                                                        {selectedStudent.address || 'No address provided'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Attendance Stats */}
                                        {results.length > 0 && (
                                            <div className="bg-gray-50 border-t px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
                                                <div className="bg-white p-2 rounded border shadow-sm">
                                                    <div className="text-xs text-gray-500 uppercase font-semibold">Total Days</div>
                                                    <div className="text-xl font-bold text-gray-800">{results.length}</div>
                                                </div>
                                                <div className="bg-white p-2 rounded border shadow-sm">
                                                    <div className="text-xs text-green-600 uppercase font-semibold">Present</div>
                                                    <div className="text-xl font-bold text-green-700">{results.filter(r => r.status === 'Present').length}</div>
                                                </div>
                                                <div className="bg-white p-2 rounded border shadow-sm">
                                                    <div className="text-xs text-red-600 uppercase font-semibold">Absent</div>
                                                    <div className="text-xl font-bold text-red-700">{results.filter(r => r.status === 'Absent').length}</div>
                                                </div>
                                                <div className="bg-white p-2 rounded border shadow-sm">
                                                    <div className="text-xs text-yellow-600 uppercase font-semibold">Leave</div>
                                                    <div className="text-xl font-bold text-yellow-700">{results.filter(r => r.status === 'Leave').length}</div>
                                                </div>
                                                <div className="bg-white p-2 rounded border shadow-sm">
                                                    <div className="text-xs text-blue-600 uppercase font-semibold">Percentage</div>
                                                    <div className="text-xl font-bold text-blue-700">
                                                        {results.length > 0
                                                            ? Math.round((results.filter(r => r.status === 'Present').length / results.length) * 100)
                                                            : 0}%
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {results.length > 0 ? (
                        <div className="overflow-x-auto border rounded-lg mt-4">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {reportType === 'today' ? (
                                            <>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Class</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Roll No</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Adm No</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Father Name</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Phone</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                                                <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {results.map((item, idx) => (
                                        <tr key={idx}>
                                            {reportType === 'today' ? (
                                                <>
                                                    <td className="px-4 py-2 whitespace-nowrap">{item.class}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{item.rollNo}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{item.admNo}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap font-medium">{item.name}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{item.father}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{item.smsNo || item.fatherMobile}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'Absent' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-2 whitespace-nowrap">{item.date}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'Present' ? 'bg-green-100 text-green-800' :
                                                            item.status === 'Absent' ? 'bg-red-100 text-red-800' :
                                                                item.status === 'Leave' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        !loading && (reportType === 'today' || selectedStudent) && <div className="text-center text-gray-500 mt-4">No records found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DeleteAttendanceTab: React.FC = () => {
    // Mode: 'student' | 'class'
    const [deleteMode, setDeleteMode] = useState<'student' | 'class'>('student');

    // Class & Section
    const [classOptions, setClassOptions] = useState<{ id: number; class_name: string }[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [selectedSection, setSelectedSection] = useState('');

    // Students
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<number | ''>('');
    const [studentSearch, setStudentSearch] = useState('');

    // Student Attendance Months
    const [studentMonths, setStudentMonths] = useState<{
        month: number;
        year: number;
        month_name: string;
        total: number;
        present: number;
        absent: number;
    }[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
    const [loadingMonths, setLoadingMonths] = useState(false);

    // Sub-mode for student deletion: 'months' | 'range'
    const [studentDeleteMode, setStudentDeleteMode] = useState<'months' | 'range'>('months');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Class deletion
    const [classDeleteType, setClassDeleteType] = useState<'month' | 'date'>('month');
    const [classMonth, setClassMonth] = useState(new Date().getMonth() + 1);
    const [classYear, setClassYear] = useState(new Date().getFullYear());
    const [classDate, setClassDate] = useState(new Date().toISOString().split('T')[0]);

    // Loading & feedback
    const [loading, setLoading] = useState(false);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load classes
    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(filterClassesForUser(res.data.classes || [])))
            .catch(err => console.error("Failed to load classes", err));
    }, []);

    // Load sections when class changes
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
            .catch(err => {
                console.error("Failed to load sections", err);
                setSectionOptions([]);
            });
    }, [selectedClass]);

    // Load students whenever class or section changes
    useEffect(() => {
        setSelectedStudentId('');
        setStudentMonths([]);
        setSelectedMonths([]);
        setNotification(null);

        if (selectedClass) {
            fetchStudents();
        } else {
            setStudents([]);
        }
    }, [selectedClass, selectedSection]);

    const fetchStudents = async () => {
        if (!selectedClass) return;
        setLoadingStudents(true);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = branch === "All Branches" || branch === "All" ? "All" : branch;
            const academicYear = localStorage.getItem('academicYear') || '';
            const params: any = { class: selectedClass, branch: branchParam, academic_year: academicYear };
            if (selectedSection) params.section = selectedSection;

            // 1. Try /attendance endpoint (standard source for attendance students)
            let fetched: any[] = [];
            try {
                const resAtt = await api.get('/attendance', { params });
                fetched = resAtt.data?.students || [];
            } catch (attErr) {
                console.error("Attendance endpoint error", attErr);
            }

            // 2. If empty, fallback to /students endpoint
            if (fetched.length === 0) {
                try {
                    const resStd = await api.get('/students', { params });
                    fetched = resStd.data?.students || [];
                } catch (stdErr) {
                    console.error("Students endpoint error", stdErr);
                }
            }

            setStudents(fetched);
        } catch (err) {
            console.error("Failed to load students", err);
            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleSearchGlobalStudents = async () => {
        if (!studentSearch.trim()) return;
        setLoadingStudents(true);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const branchParam = branch === "All Branches" || branch === "All" ? "All" : branch;
            const res = await api.get('/students', {
                params: {
                    search: studentSearch.trim(),
                    branch: branchParam
                }
            });
            const list = res.data?.students || [];
            setStudents(list);
            if (list.length === 1) {
                setSelectedStudentId(list[0].student_id);
            } else if (list.length === 0) {
                alert(`No students found matching "${studentSearch}".`);
            }
        } catch (err) {
            console.error("Search failed", err);
        } finally {
            setLoadingStudents(false);
        }
    };

    // Load attendance months when student is selected
    useEffect(() => {
        if (!selectedStudentId) {
            setStudentMonths([]);
            setSelectedMonths([]);
            return;
        }
        loadStudentMonths(selectedStudentId);
    }, [selectedStudentId]);

    const loadStudentMonths = async (studentId: number | string) => {
        setLoadingMonths(true);
        setSelectedMonths([]);
        try {
            const res = await api.get('/attendance/student-months', {
                params: { student_id: studentId }
            });
            setStudentMonths(res.data || []);
        } catch (err: any) {
            console.error("Failed to fetch student attendance months", err);
            setStudentMonths([]);
        } finally {
            setLoadingMonths(false);
        }
    };

    const selectedStudent = students.find(s => s.student_id === Number(selectedStudentId));

    // Shortcut: Select June, July, August (Months 6, 7, 8)
    const selectJuneJulyAugust = () => {
        const jja = [6, 7, 8];
        const match = studentMonths.filter(m => jja.includes(m.month)).map(m => m.month);
        setSelectedMonths(match);
        if (match.length === 0) {
            alert("No attendance records found for June, July, or August for this student.");
        }
    };

    const toggleMonthSelection = (m: number) => {
        setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    };

    const selectAllMonths = () => {
        setSelectedMonths(studentMonths.map(m => m.month));
    };

    const deselectAllMonths = () => {
        setSelectedMonths([]);
    };

    // Delete student selected months
    const handleDeleteStudentMonths = async () => {
        if (!selectedStudentId || selectedMonths.length === 0) {
            alert("Please select at least one month to delete.");
            return;
        }

        const monthNames = selectedMonths
            .map(m => studentMonths.find(sm => sm.month === m)?.month_name || `Month ${m}`)
            .join(', ');

        const targetYear = studentMonths.find(sm => selectedMonths.includes(sm.month))?.year || new Date().getFullYear();

        const msg = `⚠️ PERMANENT ATTENDANCE DELETION\n\nStudent: ${selectedStudent?.name || `ID ${selectedStudentId}`} (${selectedStudent?.admNo || ''})\nMonths to Delete: ${monthNames}\nYear: ${targetYear}\n\nAre you sure you want to permanently delete all attendance records for these months?`;
        if (!window.confirm(msg)) return;

        setLoading(true);
        setNotification(null);
        try {
            const res = await api.delete('/attendance', {
                data: {
                    student_id: selectedStudentId,
                    months: selectedMonths,
                    year: targetYear
                }
            });
            setNotification({
                type: 'success',
                text: res.data?.message || `Successfully deleted attendance for ${monthNames}.`
            });
            loadStudentMonths(selectedStudentId);
        } catch (err: any) {
            console.error("Failed to delete attendance months", err);
            setNotification({
                type: 'error',
                text: `Delete failed: ${err.response?.data?.error || err.message}`
            });
        } finally {
            setLoading(false);
        }
    };

    // Delete student date range
    const handleDeleteDateRange = async () => {
        if (!selectedStudentId) {
            alert("Please select a student.");
            return;
        }
        if (!fromDate || !toDate) {
            alert("Please select both From Date and To Date.");
            return;
        }
        if (fromDate > toDate) {
            alert("From Date cannot be later than To Date.");
            return;
        }

        const msg = `⚠️ PERMANENT ATTENDANCE DELETION\n\nStudent: ${selectedStudent?.name || `ID ${selectedStudentId}`}\nDate Range: ${fromDate} to ${toDate}\n\nAre you sure you want to permanently delete all attendance records in this range?`;
        if (!window.confirm(msg)) return;

        setLoading(true);
        setNotification(null);
        try {
            const res = await api.delete('/attendance', {
                data: {
                    student_id: selectedStudentId,
                    from_date: fromDate,
                    to_date: toDate
                }
            });
            setNotification({
                type: 'success',
                text: res.data?.message || `Successfully deleted attendance from ${fromDate} to ${toDate}.`
            });
            loadStudentMonths(selectedStudentId);
        } catch (err: any) {
            console.error("Failed to delete date range", err);
            setNotification({
                type: 'error',
                text: `Delete failed: ${err.response?.data?.error || err.message}`
            });
        } finally {
            setLoading(false);
        }
    };

    // Delete entire class attendance
    const handleDeleteClassAttendance = async () => {
        if (!selectedClass) {
            alert("Please select a class.");
            return;
        }

        if (classDeleteType === 'date') {
            if (!classDate) return alert("Please select a date.");
            const msg = `⚠️ PERMANENT ATTENDANCE DELETION\n\nClass: ${selectedClass}${selectedSection ? ` (${selectedSection})` : ''}\nDate: ${classDate}\n\nAre you sure you want to permanently delete attendance for ALL students in this class on ${classDate}?`;
            if (!window.confirm(msg)) return;

            setLoading(true);
            setNotification(null);
            try {
                const res = await api.delete('/attendance', {
                    data: {
                        class: selectedClass,
                        section: selectedSection,
                        date: classDate
                    }
                });
                setNotification({
                    type: 'success',
                    text: res.data?.message || `Successfully deleted class attendance for ${classDate}.`
                });
            } catch (err: any) {
                console.error("Failed to delete class attendance", err);
                setNotification({
                    type: 'error',
                    text: `Delete failed: ${err.response?.data?.error || err.message}`
                });
            } finally {
                setLoading(false);
            }
        } else {
            const monthName = new Date(0, classMonth - 1).toLocaleString('default', { month: 'long' });
            const msg = `⚠️ PERMANENT ATTENDANCE DELETION\n\nClass: ${selectedClass}${selectedSection ? ` (${selectedSection})` : ''}\nMonth: ${monthName} ${classYear}\n\nAre you sure you want to permanently delete attendance for ALL students in this class for the entire month of ${monthName} ${classYear}?`;
            if (!window.confirm(msg)) return;

            setLoading(true);
            setNotification(null);
            try {
                const res = await api.delete('/attendance', {
                    data: {
                        class: selectedClass,
                        section: selectedSection,
                        month: classMonth,
                        year: classYear
                    }
                });
                setNotification({
                    type: 'success',
                    text: res.data?.message || `Successfully deleted class attendance for ${monthName} ${classYear}.`
                });
            } catch (err: any) {
                console.error("Failed to delete class month attendance", err);
                setNotification({
                    type: 'error',
                    text: `Delete failed: ${err.response?.data?.error || err.message}`
                });
            } finally {
                setLoading(false);
            }
        }
    };

    const handleCleanupHolidayAttendance = async () => {
        if (!selectedClass) return alert("Please select a class first.");
        const monthName = new Date(0, classMonth - 1).toLocaleString('default', { month: 'long' });
        if (!window.confirm(`⚠️ CLEANUP ATTENDANCE ON HOLIDAYS\n\nThis will scan Class ${selectedClass}${selectedSection ? ` (${selectedSection})` : ''} for ${monthName} ${classYear} and delete any attendance records that were marked on dates currently declared as holidays or weekly offs.\n\nProceed?`)) {
            return;
        }
        setLoading(true);
        setNotification(null);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const res = await api.post('/attendance/cleanup-holidays', {
                class: selectedClass,
                section: selectedSection,
                month: classMonth,
                year: classYear,
                branch: branch === "All Branches" || branch === "All" ? "All" : branch
            });
            setNotification({
                type: 'success',
                text: res.data?.message || `Cleanup complete: deleted ${res.data?.deleted_count || 0} records.`
            });
        } catch (err: any) {
            console.error("Cleanup holiday attendance error", err);
            setNotification({
                type: 'error',
                text: `Cleanup failed: ${err.response?.data?.error || err.message}`
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = students.filter(s => {
        if (!studentSearch.trim()) return true;
        const q = studentSearch.toLowerCase();
        return (
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.admNo && String(s.admNo).toLowerCase().includes(q)) ||
            (s.rollNo && String(s.rollNo).toLowerCase().includes(q))
        );
    });

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <div className="bg-white rounded-lg shadow-md border border-red-200 overflow-hidden">
                <div className="bg-red-600 text-white font-semibold p-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🗑️</span>
                        <div>
                            <h3 className="text-base font-bold">DELETE ATTENDANCE</h3>
                            <p className="text-xs text-red-100 font-normal">Remove mistaken or unjoined attendance records (e.g. for students who joined in September)</p>
                        </div>
                    </div>
                    <div className="flex bg-red-700/80 p-1 rounded-md text-xs">
                        <button
                            type="button"
                            onClick={() => { setDeleteMode('student'); setNotification(null); }}
                            className={`px-3 py-1.5 rounded font-medium transition-colors ${deleteMode === 'student' ? 'bg-white text-red-700 shadow-sm' : 'text-white hover:bg-red-600'}`}
                        >
                            Delete by Student
                        </button>
                        <button
                            type="button"
                            onClick={() => { setDeleteMode('class'); setNotification(null); }}
                            className={`px-3 py-1.5 rounded font-medium transition-colors ${deleteMode === 'class' ? 'bg-white text-red-700 shadow-sm' : 'text-white hover:bg-red-600'}`}
                        >
                            Delete by Entire Class
                        </button>
                    </div>
                </div>

                {notification && (
                    <div className={`p-3 text-sm flex items-center justify-between ${notification.type === 'success' ? 'bg-green-50 text-green-800 border-b border-green-200' : 'bg-red-50 text-red-800 border-b border-red-200'}`}>
                        <span>{notification.text}</span>
                        <button onClick={() => setNotification(null)} className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/5">✕</button>
                    </div>
                )}

                <div className="p-5 space-y-5">
                    {/* Filter Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Class *</label>
                            <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                            >
                                <option value="">-- Select Class --</option>
                                {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Section</label>
                            <select
                                value={selectedSection}
                                onChange={e => setSelectedSection(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                            >
                                <option value="">-- All Sections --</option>
                                {sectionOptions.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                            </select>
                        </div>

                        {deleteMode === 'student' && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                                    Select Student * {students.length > 0 && <span className="text-gray-500 font-normal">({students.length} found)</span>}
                                </label>
                                <select
                                    value={selectedStudentId}
                                    onChange={e => setSelectedStudentId(e.target.value ? Number(e.target.value) : '')}
                                    disabled={!selectedClass || loadingStudents}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                                >
                                    <option value="">
                                        {loadingStudents
                                            ? '-- Loading students... --'
                                            : !selectedClass
                                                ? '-- First Select Class --'
                                                : students.length === 0
                                                    ? '-- No Students Found in this Class/Section --'
                                                    : '-- Select Student --'}
                                    </option>
                                    {students.map(s => {
                                        const adm = s.admNo || s.admission_no || '';
                                        const roll = s.rollNo || s.Roll_Number || '';
                                        return (
                                            <option key={s.student_id} value={s.student_id}>
                                                {s.name} {adm ? `(Adm: ${adm})` : ''} {roll ? `[Roll: ${roll}]` : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Quick Search Student by Name / Adm No */}
                    {deleteMode === 'student' && (
                        <div className="flex flex-wrap items-center gap-2 bg-gray-50 p-2.5 rounded-md border border-gray-200">
                            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">🔍 Quick Search Any Student:</span>
                            <input
                                type="text"
                                placeholder="Type Student Name or Admission Number..."
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleSearchGlobalStudents();
                                }}
                                className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-red-500"
                            />
                            <button
                                type="button"
                                onClick={handleSearchGlobalStudents}
                                disabled={loadingStudents}
                                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-semibold shadow-sm transition-colors whitespace-nowrap disabled:bg-gray-400"
                            >
                                {loadingStudents ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    )}

                    {/* STUDENT DELETION VIEW */}
                    {deleteMode === 'student' && selectedStudent && (
                        <div className="border border-red-200 rounded-lg p-4 bg-red-50/30 space-y-4">
                            {/* Student Profile Card */}
                            <div className="bg-white p-3 rounded-md border border-gray-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                                <div>
                                    <span className="text-base font-bold text-gray-900">{selectedStudent.name}</span>
                                    <div className="text-xs text-gray-500 flex flex-wrap gap-4 mt-0.5">
                                        <span>Admission No: <strong className="text-gray-700">{selectedStudent.admNo || selectedStudent.admission_no || '-'}</strong></span>
                                        <span>Roll No: <strong className="text-gray-700">{selectedStudent.rollNo || selectedStudent.Roll_Number || '-'}</strong></span>
                                        <span>Father: <strong className="text-gray-700">{selectedStudent.father || selectedStudent.Fatherfirstname || '-'}</strong></span>
                                        <span>Class: <strong className="text-gray-700">{selectedStudent.class || selectedClass} {selectedStudent.section || selectedSection ? `(${selectedStudent.section || selectedSection})` : ''}</strong></span>
                                    </div>
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-md text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setStudentDeleteMode('months')}
                                        className={`px-3 py-1 rounded font-medium ${studentDeleteMode === 'months' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                    >
                                        Delete by Month(s)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStudentDeleteMode('range')}
                                        className={`px-3 py-1 rounded font-medium ${studentDeleteMode === 'range' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                    >
                                        Delete by Date Range
                                    </button>
                                </div>
                            </div>

                            {/* Sub Mode 1: By Month(s) */}
                            {studentDeleteMode === 'months' && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-sm font-semibold text-gray-800">
                                            Recorded Attendance Months for this Academic Year:
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={selectJuneJulyAugust}
                                                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold px-2.5 py-1 rounded border border-amber-300 transition-colors shadow-sm"
                                                title="Select June, July, and August"
                                            >
                                                ⚡ Select June, July, August
                                            </button>
                                            <button
                                                type="button"
                                                onClick={selectAllMonths}
                                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-300"
                                            >
                                                Select All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={deselectAllMonths}
                                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-300"
                                            >
                                                Deselect All
                                            </button>
                                        </div>
                                    </div>

                                    {loadingMonths ? (
                                        <div className="p-8 text-center text-gray-500">Loading attendance records...</div>
                                    ) : studentMonths.length === 0 ? (
                                        <div className="p-6 text-center bg-white border rounded-lg text-gray-500 text-sm">
                                            No attendance records found for this student in this academic year.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {studentMonths.map(m => {
                                                const isSelected = selectedMonths.includes(m.month);
                                                return (
                                                    <div
                                                        key={`${m.year}-${m.month}`}
                                                        onClick={() => toggleMonthSelection(m.month)}
                                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? 'border-red-500 bg-red-50/80 shadow-sm' : 'border-gray-200 bg-white hover:border-red-200'}`}
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-bold text-gray-900 text-sm">{m.month_name} {m.year}</span>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => { }} // Handled by card click
                                                                className="h-4 w-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                                            />
                                                        </div>
                                                        <div className="text-xs text-gray-600 flex justify-between mt-2 pt-2 border-t border-gray-100">
                                                            <span>Total: <strong className="text-gray-900">{m.total}</strong></span>
                                                            <span className="text-green-700">P: {m.present}</span>
                                                            <span className="text-red-700">A: {m.absent}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {studentMonths.length > 0 && (
                                        <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                                            <span className="text-xs text-gray-600">
                                                Selected: <strong>{selectedMonths.length}</strong> month(s)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleDeleteStudentMonths}
                                                disabled={loading || selectedMonths.length === 0}
                                                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-md text-sm disabled:bg-gray-300 disabled:cursor-not-allowed shadow transition-colors flex items-center gap-2"
                                            >
                                                <span>🗑️</span>
                                                <span>{loading ? "Deleting..." : `Delete Attendance for ${selectedMonths.length} Selected Month(s)`}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sub Mode 2: By Date Range */}
                            {studentDeleteMode === 'range' && (
                                <div className="space-y-4 bg-white p-4 rounded-lg border border-gray-200">
                                    <div className="text-sm font-semibold text-gray-800">
                                        Delete attendance within a specific date range:
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">From Date *</label>
                                            <input
                                                type="date"
                                                value={fromDate}
                                                onChange={e => setFromDate(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">To Date *</label>
                                            <input
                                                type="date"
                                                value={toDate}
                                                onChange={e => setToDate(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const curYear = new Date().getFullYear();
                                                    setFromDate(`${curYear}-06-01`);
                                                    setToDate(`${curYear}-08-31`);
                                                }}
                                                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded font-medium"
                                            >
                                                ⚡ Quick Preset: June 1 – August 31
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleDeleteDateRange}
                                            disabled={loading || !fromDate || !toDate}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-md text-sm disabled:bg-gray-300 disabled:cursor-not-allowed shadow transition-colors flex items-center gap-2"
                                        >
                                            <span>🗑️</span>
                                            <span>{loading ? "Deleting..." : "Delete Date Range Attendance"}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CLASS LEVEL DELETION VIEW */}
                    {deleteMode === 'class' && (
                        <div className="border border-red-200 rounded-lg p-4 bg-red-50/30 space-y-4">
                            <div className="bg-white p-3 rounded-md border border-gray-200 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                                <div>
                                    <span className="text-base font-bold text-gray-900">Entire Class Attendance Deletion</span>
                                    <p className="text-xs text-gray-500 mt-0.5">Delete attendance for all students in {selectedClass ? `Class ${selectedClass}` : 'the selected class'}.</p>
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-md text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setClassDeleteType('month')}
                                        className={`px-3 py-1 rounded font-medium ${classDeleteType === 'month' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                    >
                                        Entire Month
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setClassDeleteType('date')}
                                        className={`px-3 py-1 rounded font-medium ${classDeleteType === 'date' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                    >
                                        Specific Date
                                    </button>
                                </div>
                            </div>

                            {classDeleteType === 'month' ? (
                                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Month *</label>
                                            <select
                                                value={classMonth}
                                                onChange={e => setClassMonth(parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Year *</label>
                                            <input
                                                type="number"
                                                value={classYear}
                                                onChange={e => setClassYear(parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={handleCleanupHolidayAttendance}
                                            disabled={loading || !selectedClass}
                                            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-2 rounded-md font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                            title="Scan and delete attendance records marked on dates that were later declared as holidays or weekly offs"
                                        >
                                            <span>🧹</span>
                                            <span>Clean Attendance on Declared Holidays ({new Date(0, classMonth - 1).toLocaleString('default', { month: 'short' })})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteClassAttendance}
                                            disabled={loading || !selectedClass}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-md text-sm disabled:bg-gray-300 disabled:cursor-not-allowed shadow transition-colors flex items-center gap-2"
                                        >
                                            <span>🗑️</span>
                                            <span>{loading ? "Deleting..." : `Delete Entire Class Attendance for ${new Date(0, classMonth - 1).toLocaleString('default', { month: 'long' })} ${classYear}`}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Date *</label>
                                        <input
                                            type="date"
                                            value={classDate}
                                            onChange={e => setClassDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500"
                                        />
                                    </div>
                                    <div className="flex justify-end pt-2">
                                        <button
                                            type="button"
                                            onClick={handleDeleteClassAttendance}
                                            disabled={loading || !selectedClass || !classDate}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-md text-sm disabled:bg-gray-300 disabled:cursor-not-allowed shadow transition-colors flex items-center gap-2"
                                        >
                                            <span>🗑️</span>
                                            <span>{loading ? "Deleting..." : `Delete Entire Class Attendance for ${classDate}`}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StudentAttendance: React.FC<StudentAttendanceProps> = ({ defaultTab = 'take' }) => {
    const [activeTab, setActiveTab] = useState<AttendanceTab>(defaultTab);

    // Handle dropdown actions
    const handleDropdownAction = (action: string) => {
        if (action === 'Absent Report') {
            setActiveTab('absent-report' as any);
        } else if (action === 'Month Report') {
            setActiveTab('register');
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'take':
                return <TakeAttendanceForm />;
            case 'register':
                return <RegisterView />;
            case 'delete':
                return <DeleteAttendanceTab />;
            case 'absent-report' as any:
                return <AbsentReport />;
            case 'today':
                return <div className="p-4 text-center text-gray-500">Today's Report Coming Soon</div>;
            default:
                return <TakeAttendanceForm />;
        }
    };

    // Enhanced DropdownItem to handle clicks
    const ActionDropdownItem: React.FC<{ children: React.ReactNode, onClick: () => void }> = ({ children, onClick }) => (
        <a href="#" onClick={(e) => { e.preventDefault(); onClick(); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
            {children}
        </a>
    );

    return (
        <div className="h-full overflow-y-auto bg-gray-100">
            <AttendanceHeader
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAction={handleDropdownAction}
            />
            {renderContent()}
        </div>
    );
};

export default StudentAttendance;


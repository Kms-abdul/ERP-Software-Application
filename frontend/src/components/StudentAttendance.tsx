import React, { useState, useEffect } from 'react';
import { Page } from '../App';
import { ChevronDownIcon } from './icons';
import { Student } from '../types';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import api from '../api';


interface StudentAttendanceProps {
    navigateTo: (page: Page) => void;
    defaultTab?: AttendanceTab;
}

type AttendanceTab = 'take' | 'today' | 'register' | 'absent-report';

interface AttendanceHeaderProps {
    activeTab: AttendanceTab;
    onTabChange: (tab: AttendanceTab) => void;
    onAction: (action: string) => void;
}

const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({ activeTab, onTabChange, onAction }) => {
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const buttonStyle = "px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500";
    const activeButtonStyle = "px-3 py-1.5 text-sm border border-transparent bg-sky-600 text-white rounded-md";

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
    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(res.data.classes || []))
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
                            <div className="p-2 bg-gray-50 border-b flex gap-2">
                                <button onClick={() => markAll('Present')} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-200">Mark All Present</button>
                                <button onClick={() => markAll('Absent')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-200">Mark All Absent</button>
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
                                                <div className="flex items-center space-x-5">
                                                    {[
                                                        { val: 'Present', label: 'P', color: 'green' },
                                                        { val: 'Absent', label: 'A', color: 'red' },
                                                    ].map(opt => (
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
                                                                className={`h-5 w-5 text-${opt.color}-600 border-gray-300 focus:ring-${opt.color}-500 ${(student as any).is_locked ? 'cursor-not-allowed opacity-50' : ''}`}
                                                                title={(student as any).is_locked ? 'Record locked (Promoted)' : ''}
                                                            />
                                                            <span className={`ml-1 text-${opt.color}-700 font-medium`}>{opt.label}</span>
                                                        </label>
                                                    ))}
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

    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(res.data.classes || []))
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
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Year</label>
                            <input type="number" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                        </div>
                        <button onClick={handleGetReport} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 text-sm disabled:bg-gray-400">
                            {loading ? 'Loading...' : 'Get Register'}
                        </button>

                    </div>

                    {reportData && (
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

                                        const blockedCount = Object.keys(blockedDates).length;
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

    useEffect(() => {
        api.get('/classes')
            .then(res => setClassOptions(res.data.classes || []))
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

        // STRICT Toggle: Present <-> Absent only (per user request)
        let newStatus = 'Present';
        if (currentStatus === 'Present') newStatus = 'Absent';
        else if (currentStatus === 'Absent') newStatus = 'Present';
        else newStatus = 'Present'; // Fallback for any other status to Present

        setAttendanceData(prev => ({
            ...prev,
            [key]: newStatus
        }));
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
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Year</label>
                            <input type="number" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
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
                                <span className="text-sm text-gray-500">Click on a cell to toggle Present/Absent</span>
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
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
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
            .then(res => setClassOptions(res.data.classes || []))
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


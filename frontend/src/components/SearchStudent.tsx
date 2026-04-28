import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { UserIcon } from './icons';

interface ClassItem {
    id: number;
    class_name: string;
}

interface StudentRecord {
    student_id: number;
    name: string;
    first_name?: string;
    last_name?: string;
    admNo?: string;
    admission_no?: string;
    rollNo?: number | string;
    class?: string;
    section?: string;
    status?: string;
    branch?: string;
    father?: string;
    fatherMobile?: string;
    photo?: string;
    gender?: string;
    dob?: string;
    admission_date?: string;
    BloodGroup?: string;
    Fatherfirstname?: string;
    FatherPhone?: string;
    FatherEmail?: string;
    Motherfirstname?: string;
    SecondaryPhone?: string;
    SecondaryEmail?: string;
    address?: string;
    Category?: string;
}

interface FeeInstallmentRow {
    sr: number;
    title: string;
    payable: number;
    paidAmount: number;
    dueAmount: number;
    concession: number;
    status: string;
    month?: string;
}

interface MonthlySummaryRow {
    key: string;
    label: string;
    sortValue: number;
    feePayable: number;
    feePaid: number;
    feeDue: number;
    feeConcession: number;
    installmentCount: number;
    attendanceTotal: number;
    attendancePresent: number;
    attendanceAbsent: number;
    attendanceOther: number;
}

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const MONTH_LOOKUP = MONTHS.reduce<Record<string, number>>((acc, month, index) => {
    acc[month.toLowerCase()] = index;
    acc[month.slice(0, 3).toLowerCase()] = index;
    return acc;
}, {});

const SEARCH_FIELD_OPTIONS = [
    { value: 'name', label: 'Student Name' },
    { value: 'admission', label: 'Admission No' },
    { value: 'father', label: 'Father Name' },
];

const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value || 0);

const extractMonthInfo = (installment: FeeInstallmentRow) => {
    const rawMonth = (installment.month || '').trim();
    if (rawMonth && rawMonth.toLowerCase() !== 'one-time') {
        const monthIndex = MONTH_LOOKUP[rawMonth.toLowerCase()];
        if (monthIndex !== undefined) {
            return {
                key: MONTHS[monthIndex],
                label: MONTHS[monthIndex],
                sortValue: monthIndex,
            };
        }
    }

    const title = installment.title || '';
    const matchedMonth = MONTHS.find((month) =>
        title.toLowerCase().includes(month.toLowerCase())
    );
    if (matchedMonth) {
        return {
            key: matchedMonth,
            label: matchedMonth,
            sortValue: MONTH_LOOKUP[matchedMonth.toLowerCase()],
        };
    }

    return {
        key: 'one-time',
        label: 'One-Time / Other',
        sortValue: 99,
    };
};

const SearchStudent: React.FC = () => {
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sections, setSections] = useState<string[]>([]);
    const [students, setStudents] = useState<StudentRecord[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
    const [feeInstallments, setFeeInstallments] = useState<FeeInstallmentRow[]>([]);
    const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('Active');
    const [searchField, setSearchField] = useState('name');
    const [searchValue, setSearchValue] = useState('');

    useEffect(() => {
        api.get('/classes')
            .then((res) => setClasses(res.data.classes || []))
            .catch(() => setClasses([]));
    }, []);

    useEffect(() => {
        if (!selectedClass) {
            setSections([]);
            setSelectedSection('');
            return;
        }

        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';

        api.get('/sections', {
            params: {
                class: selectedClass,
                branch: branch === 'All Branches' ? 'All' : branch,
                academic_year: academicYear,
            },
        })
            .then((res) => setSections(res.data.sections || []))
            .catch(() => setSections([]));
    }, [selectedClass]);

    const loadStudentDetails = async (student: StudentRecord) => {
        setSelectedStudent(student);
        setLoadingDetails(true);

        try {
            const [feeRes, attendanceRes] = await Promise.all([
                api.get(`/fees/student-details/${student.student_id}`),
                api.get('/attendance', {
                    params: { student_id: student.student_id },
                }),
            ]);

            const installments = (feeRes.data.installments || []).map((item: any) => ({
                sr: Number(item.sr || 0),
                title: item.title || '-',
                payable: Number(item.payable || 0),
                paidAmount: Number(item.paidAmount || 0),
                dueAmount: Number(item.dueAmount || 0),
                concession: Number(item.concession || 0),
                status: item.status || 'Pending',
                month: item.month || '',
            }));

            const rawAttendance = attendanceRes.data.attendance || {};
            const studentAttendance = rawAttendance[String(student.student_id)] || rawAttendance[student.student_id] || {};

            setFeeInstallments(installments);
            setAttendanceMap(studentAttendance);
        } catch (error) {
            console.error('Failed to load student detail', error);
            setFeeInstallments([]);
            setAttendanceMap({});
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleSearch = async () => {
        setLoadingStudents(true);
        setHasSearched(true);
        setSelectedStudent(null);
        setFeeInstallments([]);
        setAttendanceMap({});

        const params: Record<string, string> = {
            include_inactive: 'true',
        };

        if (selectedClass) params.class = selectedClass;
        if (selectedSection) params.section = selectedSection;
        if (searchValue.trim()) params.search = searchValue.trim();

        try {
            const res = await api.get('/students', { params });
            let result: StudentRecord[] = res.data.students || [];

            if (selectedStatus !== 'All') {
                result = result.filter((student) => (student.status || '').toLowerCase() === selectedStatus.toLowerCase());
            }

            if (searchValue.trim()) {
                const needle = searchValue.trim().toLowerCase();
                result = result.filter((student) => {
                    if (searchField === 'admission') {
                        return `${student.admNo || student.admission_no || ''}`.toLowerCase().includes(needle);
                    }
                    if (searchField === 'father') {
                        return `${student.father || student.Fatherfirstname || ''}`.toLowerCase().includes(needle);
                    }
                    return `${student.name || ''}`.toLowerCase().includes(needle);
                });
            }

            setStudents(result);

            if (result.length > 0) {
                await loadStudentDetails(result[0]);
            }
        } catch (error) {
            console.error('Failed to search students', error);
            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    const monthlySummary = useMemo<MonthlySummaryRow[]>(() => {
        const rows = new Map<string, MonthlySummaryRow>();

        feeInstallments.forEach((installment) => {
            const monthInfo = extractMonthInfo(installment);
            const existing = rows.get(monthInfo.key) || {
                key: monthInfo.key,
                label: monthInfo.label,
                sortValue: monthInfo.sortValue,
                feePayable: 0,
                feePaid: 0,
                feeDue: 0,
                feeConcession: 0,
                installmentCount: 0,
                attendanceTotal: 0,
                attendancePresent: 0,
                attendanceAbsent: 0,
                attendanceOther: 0,
            };

            existing.feePayable += installment.payable || 0;
            existing.feePaid += installment.paidAmount || 0;
            existing.feeDue += installment.dueAmount || 0;
            existing.feeConcession += installment.concession || 0;
            existing.installmentCount += 1;

            rows.set(monthInfo.key, existing);
        });

        Object.entries(attendanceMap).forEach(([dateString, status]) => {
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) return;

            const monthIndex = date.getMonth();
            const key = MONTHS[monthIndex];
            const existing = rows.get(key) || {
                key,
                label: key,
                sortValue: monthIndex,
                feePayable: 0,
                feePaid: 0,
                feeDue: 0,
                feeConcession: 0,
                installmentCount: 0,
                attendanceTotal: 0,
                attendancePresent: 0,
                attendanceAbsent: 0,
                attendanceOther: 0,
            };

            const normalizedStatus = (status || '').toLowerCase();
            existing.attendanceTotal += 1;
            if (['present', 'p'].includes(normalizedStatus)) {
                existing.attendancePresent += 1;
            } else if (['absent', 'a'].includes(normalizedStatus)) {
                existing.attendanceAbsent += 1;
            } else {
                existing.attendanceOther += 1;
            }

            rows.set(key, existing);
        });

        return Array.from(rows.values()).sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label));
    }, [attendanceMap, feeInstallments]);

    const feeTotals = useMemo(() => {
        return feeInstallments.reduce(
            (acc, row) => {
                acc.payable += row.payable || 0;
                acc.paid += row.paidAmount || 0;
                acc.due += row.dueAmount || 0;
                acc.concession += row.concession || 0;
                return acc;
            },
            { payable: 0, paid: 0, due: 0, concession: 0 }
        );
    }, [feeInstallments]);

    const attendanceTotals = useMemo(() => {
        return monthlySummary.reduce(
            (acc, row) => {
                acc.total += row.attendanceTotal;
                acc.present += row.attendancePresent;
                acc.absent += row.attendanceAbsent;
                acc.other += row.attendanceOther;
                return acc;
            },
            { total: 0, present: 0, absent: 0, other: 0 }
        );
    }, [monthlySummary]);

    return (
        <div className="p-6 space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                    <h3 className="text-xl font-semibold text-gray-800">Search Student</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        View complete student details with month-wise fee and attendance summary.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-6">
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="">All Classes</option>
                        {classes.map((item) => (
                            <option key={item.id} value={item.class_name}>
                                {item.class_name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="">All Sections</option>
                        {sections.map((section) => (
                            <option key={section} value={section}>
                                {section}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="TC">TC</option>
                        <option value="All">All</option>
                    </select>

                    <select
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                        {SEARCH_FIELD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <input
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        placeholder="Search student"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                    />
                </div>

                <div className="px-6 pb-6">
                    <button
                        onClick={handleSearch}
                        className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-5 py-4">
                        <h4 className="font-semibold text-gray-800">Students</h4>
                        <p className="mt-1 text-xs text-gray-500">
                            {loadingStudents ? 'Searching students...' : `${students.length} result(s) found`}
                        </p>
                    </div>

                    <div className="max-h-[780px] overflow-y-auto">
                        {loadingStudents && (
                            <div className="px-5 py-8 text-center text-sm text-gray-500">Loading students...</div>
                        )}

                        {!loadingStudents && students.map((student) => (
                            <button
                                key={student.student_id}
                                onClick={() => loadStudentDetails(student)}
                                className={`flex w-full items-start gap-3 border-b border-gray-100 px-5 py-4 text-left transition ${selectedStudent?.student_id === student.student_id ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
                            >
                                {student.photo ? (
                                    <img
                                        src={student.photo}
                                        alt={student.name}
                                        className="h-14 w-14 rounded-full border border-gray-200 object-cover"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-gray-50'); }}
                                    />
                                ) : (
                                    <div className="h-14 w-14 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center">
                                        <UserIcon className="h-8 w-8 text-gray-400" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold text-gray-900">{student.name}</div>
                                    <div className="mt-1 text-xs text-gray-500">
                                        {student.class || '-'} {student.section || ''}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-500">
                                        Adm No: {student.admNo || student.admission_no || '-'}
                                    </div>
                                    <div className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                                        {student.status || 'Unknown'}
                                    </div>
                                </div>
                            </button>
                        ))}

                        {!loadingStudents && hasSearched && students.length === 0 && (
                            <div className="px-5 py-8 text-center text-sm text-gray-500">No students found for the selected filters.</div>
                        )}

                        {!loadingStudents && !hasSearched && (
                            <div className="px-5 py-8 text-center text-sm text-gray-500">Run a search to load students.</div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {!selectedStudent && (
                        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white text-center shadow-sm">
                            <div>
                                <h4 className="text-2xl font-semibold text-gray-700">Student details will appear here</h4>
                                <p className="mt-2 text-sm text-gray-500">
                                    Search and choose a student to view the monthly fee and attendance summary.
                                </p>
                            </div>
                        </div>
                    )}

                    {selectedStudent && (
                        <>
                            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                                <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[220px_repeat(4,minmax(0,1fr))]">
                                    <div className="border-b border-gray-100 pb-5 text-center lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                                        {selectedStudent.photo ? (
                                            <img
                                                src={selectedStudent.photo}
                                                alt={selectedStudent.name}
                                                className="mx-auto h-28 w-28 rounded-full border-4 border-amber-300 object-cover"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-gray-50'); }}
                                            />
                                        ) : (
                                            <div className="mx-auto h-28 w-28 rounded-full border-4 border-amber-300 bg-gray-50 flex items-center justify-center">
                                                <UserIcon className="h-16 w-16 text-gray-300" />
                                            </div>
                                        )}
                                        <h3 className="mt-4 text-xl font-semibold text-gray-900">{selectedStudent.name}</h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            {selectedStudent.class || '-'} / {selectedStudent.section || '-'}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-500">{selectedStudent.branch || '-'}</p>
                                        <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                            {selectedStudent.status || 'Unknown'}
                                        </div>
                                    </div>

                                    <div className="space-y-4 border-b border-gray-100 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                                        <DetailRow label="Admission No" value={selectedStudent.admNo || selectedStudent.admission_no} />
                                        <DetailRow label="Roll No" value={selectedStudent.rollNo} />
                                        <DetailRow label="Gender" value={selectedStudent.gender} />
                                        <DetailRow label="Date of Birth" value={formatDate(selectedStudent.dob)} />
                                        <DetailRow label="Admission Date" value={formatDate(selectedStudent.admission_date)} />
                                        <DetailRow label="Category" value={selectedStudent.Category} />
                                    </div>

                                    <div className="space-y-4 border-b border-gray-100 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                                        <DetailRow label="Father Name" value={selectedStudent.Fatherfirstname || selectedStudent.father} />
                                        <DetailRow label="Father Mobile" value={selectedStudent.FatherPhone || selectedStudent.fatherMobile} />
                                        <DetailRow label="Father Email" value={selectedStudent.FatherEmail} />
                                        <DetailRow label="Blood Group" value={selectedStudent.BloodGroup} />
                                    </div>

                                    <div className="space-y-4 border-b border-gray-100 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                                        <DetailRow label="Mother Name" value={selectedStudent.Motherfirstname} />
                                        <DetailRow label="Mother Mobile" value={selectedStudent.SecondaryPhone} />
                                        <DetailRow label="Mother Email" value={selectedStudent.SecondaryEmail} />
                                        <DetailRow label="Address" value={selectedStudent.address} />
                                    </div>

                                    <div className="grid content-start gap-4">
                                        <MiniStat label="Fee Payable" value={`Rs ${formatCurrency(feeTotals.payable)}`} tone="violet" />
                                        <MiniStat label="Fee Due" value={`Rs ${formatCurrency(feeTotals.due)}`} tone="rose" />
                                        <MiniStat label="Attendance Present" value={`${attendanceTotals.present}/${attendanceTotals.total || 0}`} tone="emerald" />
                                        <MiniStat label="Attendance Absent" value={`${attendanceTotals.absent}`} tone="amber" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                                <div className="border-b border-gray-100 px-6 py-4">
                                    <h4 className="font-semibold text-gray-800">Monthly Fee and Attendance Summary</h4>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Month-wise snapshot for the selected student.
                                    </p>
                                </div>

                                {loadingDetails ? (
                                    <div className="px-6 py-10 text-center text-sm text-gray-500">Loading student summary...</div>
                                ) : monthlySummary.length === 0 ? (
                                    <div className="px-6 py-10 text-center text-sm text-gray-500">No fee or attendance records available for this student.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-gray-50">
                                                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                    <th className="px-4 py-3">Month</th>
                                                    <th className="px-4 py-3">Fee Payable</th>
                                                    <th className="px-4 py-3">Fee Paid</th>
                                                    <th className="px-4 py-3">Fee Due</th>
                                                    <th className="px-4 py-3">Concession</th>
                                                    <th className="px-4 py-3">Installments</th>
                                                    <th className="px-4 py-3">Attendance Days</th>
                                                    <th className="px-4 py-3">Present</th>
                                                    <th className="px-4 py-3">Absent</th>
                                                    <th className="px-4 py-3">Other</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {monthlySummary.map((row) => (
                                                    <tr key={row.key} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-semibold text-gray-900">{row.label}</td>
                                                        <td className="px-4 py-3">Rs {formatCurrency(row.feePayable)}</td>
                                                        <td className="px-4 py-3 text-emerald-700">Rs {formatCurrency(row.feePaid)}</td>
                                                        <td className="px-4 py-3 text-rose-700">Rs {formatCurrency(row.feeDue)}</td>
                                                        <td className="px-4 py-3">Rs {formatCurrency(row.feeConcession)}</td>
                                                        <td className="px-4 py-3">{row.installmentCount}</td>
                                                        <td className="px-4 py-3">{row.attendanceTotal}</td>
                                                        <td className="px-4 py-3">{row.attendancePresent}</td>
                                                        <td className="px-4 py-3">{row.attendanceAbsent}</td>
                                                        <td className="px-4 py-3">{row.attendanceOther}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 text-sm font-semibold text-gray-800">
                                                <tr>
                                                    <td className="px-4 py-3">Total</td>
                                                    <td className="px-4 py-3">Rs {formatCurrency(feeTotals.payable)}</td>
                                                    <td className="px-4 py-3">Rs {formatCurrency(feeTotals.paid)}</td>
                                                    <td className="px-4 py-3">Rs {formatCurrency(feeTotals.due)}</td>
                                                    <td className="px-4 py-3">Rs {formatCurrency(feeTotals.concession)}</td>
                                                    <td className="px-4 py-3">{feeInstallments.length}</td>
                                                    <td className="px-4 py-3">{attendanceTotals.total}</td>
                                                    <td className="px-4 py-3">{attendanceTotals.present}</td>
                                                    <td className="px-4 py-3">{attendanceTotals.absent}</td>
                                                    <td className="px-4 py-3">{attendanceTotals.other}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const DetailRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => (
    <div>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
        <div className="mt-1 text-sm font-medium text-gray-800">{value || '-'}</div>
    </div>
);

const MiniStat: React.FC<{ label: string; value: string; tone: 'violet' | 'rose' | 'emerald' | 'amber' }> = ({ label, value, tone }) => {
    const toneMap = {
        violet: 'bg-violet-50 text-violet-700',
        rose: 'bg-rose-50 text-rose-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
    };

    return (
        <div className={`rounded-xl px-4 py-3 ${toneMap[tone]}`}>
            <div className="text-xs font-medium uppercase tracking-wide">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
    );
};

export default SearchStudent;

import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { ChevronDownIcon, PrinterIcon, EyeIcon } from './icons';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Types 
export interface Receipt {
    receipt_no: string;
    student_name: string;
    admission_no?: string;
    class?: string;
    section?: string;
    branch?: string;
    amount: number;
    amount_paid?: number;
    due_amount?: number;
    gross_amount?: number;
    concession?: number;
    net_payable?: number;
    mode?: string;
    fee_type_str?: string;
    note?: string;
    collected_by?: string;
    date?: string;
    time?: string;
}

interface ReportProps {
    onViewReceipt: (receiptNo: string) => void;
}

// --------------------------------------------------------------------------
// Shared Components
// --------------------------------------------------------------------------

const StatCard = ({ label, value, color = 'blue' }: any) => {
    const colors: any = {
        blue: 'bg-blue-50 text-blue-800 border-blue-200',
        green: 'bg-green-50 text-green-800 border-green-200',
        red: 'bg-red-50 text-red-800 border-red-200',
        purple: 'bg-purple-50 text-purple-800 border-purple-200',
        orange: 'bg-orange-50 text-orange-800 border-orange-200',
    };
    const c = colors[color] || colors.blue;

    return (
        <div className={`p-4 rounded-lg border ${c} shadow-sm`}>
            <p className="text-xs opacity-80 uppercase tracking-wide font-semibold">{label}</p>
            <p className="text-xl font-bold mt-1">
                {typeof value === 'number' ? `₹${value.toLocaleString('en-IN')}` : value}
            </p>
        </div>
    );
};

// Reusable Filter Wrapper
const FilterContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white p-4 rounded shadow-sm border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {children}
        </div>
    </div>
);

// Reusable Pagination Component
const Pagination = ({ currentPage, totalPages, onPageChange, totalRecords, perPage }: any) => {
    if (totalPages <= 1) return null;

    const visiblePages = 3;
    const startPage = Math.max(1, Math.min(currentPage, totalPages - visiblePages + 1));
    const endPage = Math.min(totalPages, startPage + visiblePages - 1);
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
    const showLastPage = endPage < totalPages;

    return (
        <div className="p-4 border-t bg-gray-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span className="text-sm text-gray-500 italic">
                Showing {((currentPage - 1) * perPage) + 1} to {Math.min(currentPage * perPage, totalRecords)} of {totalRecords} records
            </span>
            <div className="flex items-center gap-1 flex-wrap">
                <button
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    className="px-2 py-1 text-sm font-medium text-gray-600 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-600 mr-2"
                >
                    Previous
                </button>

                {pages.map(p => (
                    <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={`min-w-[28px] px-1.5 py-0.5 text-sm font-semibold transition-colors ${currentPage === p
                            ? 'text-indigo-700 underline underline-offset-4'
                            : 'text-gray-500 hover:text-gray-800'
                            }`}
                    >
                        {p}
                    </button>
                ))}

                {showLastPage && (
                    <>
                        <span className="px-1 text-sm text-gray-400">...</span>
                        <button
                            onClick={() => onPageChange(totalPages)}
                            className={`min-w-[28px] px-1.5 py-0.5 text-sm font-semibold transition-colors ${currentPage === totalPages
                                ? 'text-indigo-700 underline underline-offset-4'
                                : 'text-gray-500 hover:text-gray-800'
                                }`}
                        >
                            {totalPages}
                        </button>
                    </>
                )}

                <button
                    disabled={currentPage === totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    className="px-2 py-1 text-sm font-medium text-gray-600 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-600 ml-2"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

// HOOK: Dynamic Sections based on Class
const useClassSections = (selectedClass: string) => {
    const [sections, setSections] = useState<string[]>(['All']);

    useEffect(() => {
        if (!selectedClass || selectedClass === 'All') {
            setSections(['All']);
            return;
        }

        const fetchSections = async () => {
            try {
                const res = await api.get(`/sections?class=${selectedClass}`);
                const secs = res.data.sections || [];
                setSections(['All', ...secs]);
            } catch (err) {
                console.error("Failed to fetch sections", err);
                setSections(['All']);
            }
        };
        fetchSections();
    }, [selectedClass]);

    return sections;
};

// Logic Helpers
// Logic Helpers
const filterData = (data: any[], filters: any) => {
    if (!data) return [];
    return data.filter(r => {
        if (filters.class && filters.class !== 'All' && r.class !== filters.class) return false;
        if (filters.section && filters.section !== 'All' && r.section !== filters.section) return false;
        if (filters.feeType && filters.feeType !== 'All' && !r.fee_type_str?.includes(filters.feeType)) return false;
        if (filters.mode && filters.mode !== 'All' && r.mode !== filters.mode) return false;
        if (filters.collector && filters.collector !== 'All' && r.collected_by !== filters.collector) return false;
        return true;
    });
};

const calculateSummary = (receipts: any[]) => {
    const total = receipts.reduce((sum, r) => sum + Number(r.amount_paid || r.amount || 0), 0);
    const modeMap: Record<string, number> = {};
    // Key will be "user|branch" to ensure accurate multi-branch reporting
    const userMap: Record<string, { user: string, count: number, amount: number, branch: string }> = {};

    receipts.forEach(r => {
        const amt = Number(r.amount_paid || r.amount || 0);
        const m = r.mode || 'Unknown';
        modeMap[m] = (modeMap[m] || 0) + amt;

        const u = r.collected_by || 'Unknown';
        const b = r.branch || '-';
        const key = `${u}|${b}`;

        if (!userMap[key]) {
            userMap[key] = { user: u, count: 0, amount: 0, branch: b };
        }
        userMap[key].count += 1;
        userMap[key].amount += amt;
    });

    const collectedBySummary = Object.values(userMap);
    return { total, modeMap, collectedBySummary };
};

// Reusable Summary Tables Component
const SummaryTables = ({ modeSummary, collectedBySummary, totalCollection }: {
    modeSummary: Record<string, number>;
    collectedBySummary: any[];
    totalCollection: number;
}) => (
    <div className="flex flex-col md:flex-row gap-6 mt-4 px-4 pb-6">
        {/* Payment Mode Table */}
        <div className="flex-1">
            <h4 className="font-semibold text-gray-700 mb-2">Payment Mode Summary</h4>
            <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-4 py-2 text-left font-semibold">Payment Mode</th>
                        <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {Object.entries(modeSummary || {}).map(([mode, amt]: any) => (
                        <tr key={mode}>
                            <td className="px-4 py-2">{mode}</td>
                            <td className="px-4 py-2 text-right font-medium">₹{Number(amt).toLocaleString()}</td>
                        </tr>
                    ))}
                    <tr className="bg-blue-50 font-bold">
                        <td className="px-4 py-2">Total</td>
                        <td className="px-4 py-2 text-right">₹{totalCollection.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        {/* Collected By Table */}
        <div className="flex-1">
            <h4 className="font-semibold text-gray-700 mb-2">Collected By Summary</h4>
            <table className="w-full border text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-4 py-2 text-left font-semibold">Collected By</th>
                        <th className="px-4 py-2 text-left font-semibold">Branch</th>
                        <th className="px-4 py-2 text-center font-semibold">Count</th>
                        <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {Array.isArray(collectedBySummary) && collectedBySummary.map((row: any, idx: number) => (
                        <tr key={idx}>
                            <td className="px-4 py-2">{row.user}</td>
                            <td className="px-4 py-2">{row.branch}</td>
                            <td className="px-4 py-2 text-center">{row.count}</td>
                            <td className="px-4 py-2 text-right font-medium">₹{Number(row.amount).toLocaleString()}</td>
                        </tr>
                    ))}
                    <tr className="bg-blue-50 font-bold">
                        <td colSpan={3} className="px-4 py-2 text-right">Total</td>
                        <td className="px-4 py-2 text-right">₹{totalCollection.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
);

// Full Featured Receipts Table
const FullReceiptsTable: React.FC<{
    receipts: any[];
    onViewReceipt: (id: string) => void;
    showAllColumns?: boolean;
}> = ({ receipts, onViewReceipt, showAllColumns = true }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 5;

    // Reset page when receipts change
    useEffect(() => {
        setCurrentPage(1);
    }, [receipts]);

    if (!receipts || receipts.length === 0) {
        return (
            <div className="bg-red-50 text-red-500 text-center py-8 border rounded mt-4 font-medium">
                No Records Found
            </div>
        );
    }

    const totalPages = Math.ceil(receipts.length / rowsPerPage);
    const currentReceipts = receipts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    return (
        <div className="bg-white border rounded shadow-sm overflow-x-auto mt-4 mx-4">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-700">
                    <tr>
                        <th className="px-3 py-2 text-left font-semibold">S.No</th>
                        <th className="px-3 py-2 text-left font-semibold">Student Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Adm No.</th>
                        <th className="px-3 py-2 text-left font-semibold">Class</th>
                        <th className="px-3 py-2 text-left font-semibold">Branch</th>
                        <th className="px-3 py-2 text-left font-semibold">Rcpt No</th>
                        {showAllColumns && <th className="px-3 py-2 text-left font-semibold">Fee Type</th>}
                        {showAllColumns && <th className="px-3 py-2 text-right font-semibold">Tot.Amt</th>}
                        {showAllColumns && <th className="px-3 py-2 text-right font-semibold">Concession</th>}
                        {showAllColumns && <th className="px-3 py-2 text-right font-semibold">Pay Amt</th>}
                        <th className="px-3 py-2 text-right font-semibold">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold">Due</th>
                        <th className="px-3 py-2 text-left font-semibold">Mode</th>
                        {showAllColumns && <th className="px-3 py-2 text-left font-semibold">Note</th>}
                        <th className="px-3 py-2 text-left font-semibold">Date/Time</th>
                        <th className="px-3 py-2 text-left font-semibold">Taken By</th>
                        <th className="px-3 py-2 text-center font-semibold">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {currentReceipts.map((r: any, idx: number) => {
                        const sNo = ((currentPage - 1) * rowsPerPage) + idx + 1;
                        return (
                            <tr key={idx} className="hover:bg-gray-50 h-[45px]">
                                <td className="px-3 py-2 text-gray-500 font-medium">{sNo}</td>
                                <td className="px-3 py-2 font-medium">{r.student_name}</td>
                                <td className="px-3 py-2 text-blue-600">{r.admission_no}</td>
                                <td className="px-3 py-2">{r.class} {r.section}</td>
                                <td className="px-3 py-2 text-gray-600">{r.branch}</td>
                                <td className="px-3 py-2">{r.receipt_no}</td>
                                {showAllColumns && <td className="px-3 py-2 max-w-[200px] truncate" title={r.fee_type_str}>{r.fee_type_str || '-'}</td>}
                                {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.gross_amount || 0).toLocaleString()}</td>}
                                {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.concession || 0).toLocaleString()}</td>}
                                {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.net_payable || 0).toLocaleString()}</td>}
                                <td className="px-3 py-2 text-right font-bold text-gray-800">₹{(r.amount_paid || r.amount || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-red-500">₹{(r.due_amount || 0).toLocaleString()}</td>
                                <td className="px-3 py-2">{r.mode}</td>
                                {showAllColumns && <td className="px-3 py-2 text-xs truncate max-w-[150px]" title={r.note}>{r.note || '-'}</td>}
                                <td className="px-3 py-2 text-xs text-gray-500">
                                    {r.date} <br /> {r.time}
                                </td>
                                <td className="px-3 py-2">{r.collected_by}</td>
                                <td className="px-3 py-2 text-center">
                                    <button
                                        onClick={() => onViewReceipt(r.receipt_no)}
                                        className="text-white bg-violet-600 hover:bg-violet-700 px-3 py-1 rounded text-xs"
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    {/* Add empty rows to maintain height */}
                    {currentReceipts.length < rowsPerPage && Array.from({ length: rowsPerPage - currentReceipts.length }).map((_, i) => (
                        <tr key={`empty-${i}`} className="h-[45px]">
                            <td colSpan={17}>&nbsp;</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalRecords={receipts.length}
                perPage={rowsPerPage}
            />
        </div>
    );
};

// --------------------------------------------------------------------------
// Download Utilities
// --------------------------------------------------------------------------

const downloadExcelReport = (receipts: any[], filename: string) => {
    if (!receipts?.length) return;

    const excelData = receipts.map((r: any, idx: number) => ({
        "S.No": idx + 1,
        Student: r.student_name,
        AdmissionNo: r.admission_no,
        Class: `${r.class} ${r.section || ''}`,
        Branch: r.branch,
        ReceiptNo: r.receipt_no,
        FeeType: r.fee_type_str,
        TotalAmount: r.gross_amount || r.amount,
        Concession: r.concession || 0,
        Payable: r.net_payable || r.amount,
        Paid: r.amount_paid || r.amount,
        Due: r.due_amount || 0,
        Mode: r.mode,
        Note: r.note,
        Date: r.date,
        Time: r.time,
        TakenBy: r.collected_by
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    saveAs(blob, `${filename}.xlsx`);
};

const downloadPDFReport = (receipts: any[], title: string, filename: string) => {
    if (!receipts?.length) return;

    const doc = new jsPDF("l", "mm", "a4");
    doc.text(title, 14, 15);

    const tableColumn = [
        "Student", "Adm No", "Class", "Branch", "Receipt",
        "Fee Type", "Paid", "Due", "Mode", "Date", "Taken By"
    ];

    const tableRows = receipts.map((r: any) => ([
        r.student_name,
        r.admission_no,
        `${r.class} ${r.section || ''}`,
        r.branch,
        r.receipt_no,
        r.fee_type_str || '-',
        r.amount_paid || r.amount,
        r.due_amount || 0,
        r.mode,
        `${r.date} ${r.time}`,
        r.collected_by
    ]));

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 20,
        styles: { fontSize: 8 }
    });

    doc.save(`${filename}.pdf`);
};

// --------------------------------------------------------------------------
// Today's Collection (ENHANCED)
// --------------------------------------------------------------------------
export const TodayCollection: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [rawData, setRawData] = useState<any>(null); // Store API response
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [classList, setClassList] = useState<string[]>([]);
    const [feeTypes, setFeeTypes] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [selectedFeeType, setSelectedFeeType] = useState('All');
    const [selectedMode, setSelectedMode] = useState('All');
    const [selectedCollector, setSelectedCollector] = useState('All');
    const [collectors, setCollectors] = useState<string[]>([]);

    const sections = useClassSections(selectedClass);
    const paymentModes = ["All", "Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    // Load initial data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Classes
                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);

                // Fee Types
                const resTypes = await api.get('/fee-types');
                const allTypes = Array.isArray(resTypes.data) ? resTypes.data : resTypes.data.fee_types || [];
                setFeeTypes(allTypes);

                // Collectors (users)
                try {
                    const resUsers = await api.get('/users');
                    const users = resUsers.data.users || resUsers.data || [];
                    setCollectors(["All", ...users.map((u: any) => u.name || u.username)]);
                } catch {
                    setCollectors(["All"]);
                }

                // Fetch Data Immediately
                fetchReport();
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        loadInitialData();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            // Fetch BROAD data (All) and filter locally as requested
            const params = new URLSearchParams({
                class: 'All',
                fee_type: 'All',
                section: 'All',
                mode: 'All',
                collected_by: 'All'
            });
            const res = await api.get(`/reports/fees/today?${params.toString()}`);
            setRawData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch report');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        fetchReport();
    };

    // Derived State: Filtered Data
    const filteredReceipts = useMemo(() => {
        if (!rawData?.receipts) return [];
        return filterData(rawData.receipts, {
            class: selectedClass,
            section: selectedSection,
            feeType: selectedFeeType,
            mode: selectedMode,
            collector: selectedCollector
        });
    }, [rawData, selectedClass, selectedSection, selectedFeeType, selectedMode, selectedCollector]);

    // Derived State: Summary based on Filtered Data
    const summary = useMemo(() => calculateSummary(filteredReceipts), [filteredReceipts]);

    if (loading) return <div className="p-4">Loading today's collection...</div>;
    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-4 font-sans">
            {/* Filter Bar Grid */}
            <FilterContainer>
                {/* Fee Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                    <select
                        value={selectedFeeType}
                        onChange={(e) => setSelectedFeeType(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="All">All Fee Types</option>
                        {feeTypes.map(ft => (
                            <option key={ft.id} value={ft.fee_type}>{ft.fee_type}</option>
                        ))}
                    </select>
                </div>

                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {paymentModes.map(m => (
                            <option key={m} value={m}>{m === 'All' ? 'All Modes' : m}</option>
                        ))}
                    </select>
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={handleRefresh}
                    className="bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    REFRESH DATA
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, 'Today_Collection')}
                    className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 flex items-center gap-2"
                >
                    Download Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, "Today's Collection Report", 'Today_Collection')}
                    className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 flex items-center gap-2"
                >
                    Download PDF
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4">
                <StatCard label="Total Collection" value={summary.total} color="green" />
                {Object.entries(summary.modeMap || {}).map(([mode, amount]: any) => (
                    <StatCard key={mode} label={mode} value={Number(amount)} color="blue" />
                ))}
            </div>

            {/* Full Table */}
            <FullReceiptsTable receipts={filteredReceipts} onViewReceipt={onViewReceipt} />

            {/* Summary Tables */}
            <SummaryTables
                modeSummary={summary.modeMap || {}}
                collectedBySummary={summary.collectedBySummary || []}
                totalCollection={summary.total}
            />
        </div>
    );
};

// --------------------------------------------------------------------------
// Daily Report (ENHANCED)
// --------------------------------------------------------------------------
export const DailyReport: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [rawData, setRawData] = useState<any>(null); // Store API response
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Filters
    const [classList, setClassList] = useState<string[]>([]);
    const [feeTypes, setFeeTypes] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [selectedFeeType, setSelectedFeeType] = useState('All');
    const [selectedMode, setSelectedMode] = useState('All');
    const [selectedCollector, setSelectedCollector] = useState('All');
    const [collectors, setCollectors] = useState<string[]>([]);

    const sections = useClassSections(selectedClass);
    const paymentModes = ["All", "Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    useEffect(() => {
        const loadData = async () => {
            try {
                const resTypes = await api.get('/fee-types');
                const allTypes = Array.isArray(resTypes.data) ? resTypes.data : resTypes.data.fee_types || [];
                const currentBranch = localStorage.getItem('currentBranch') || 'All';
                let filteredTypes = allTypes;
                if (currentBranch !== 'All' && currentBranch !== 'All Branches') {
                    filteredTypes = allTypes.filter((ft: any) =>
                        !ft.branch || ft.branch === 'All' || ft.branch === currentBranch
                    );
                }
                setFeeTypes(filteredTypes);

                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);

                try {
                    const resUsers = await api.get('/users');
                    const users = resUsers.data.users || resUsers.data || [];
                    setCollectors(["All", ...users.map((u: any) => u.name || u.username)]);
                } catch {
                    setCollectors(["All"]);
                }
                fetchReport(); // Load initially
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        loadData();
    }, []);

    const fetchReport = async () => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 365) {
            alert("Date range cannot exceed 1 year.");
            return;
        }
        try {
            setLoading(true);
            setError('');
            // Fetch BROAD data and filter locally
            const params = new URLSearchParams({
                start_date: startDate,
                end_date: endDate,
                class: 'All',
                section: 'All',
                fee_type: 'All',
                mode: 'All',
                collected_by: 'All'
            });
            const res = await api.get(`/reports/fees/daily?${params.toString()}`);
            setRawData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch report');
            setRawData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        fetchReport();
    };

    // Derived State: Filtered Data
    const filteredReceipts = useMemo(() => {
        if (!rawData?.receipts) return [];
        return filterData(rawData.receipts, {
            class: selectedClass,
            section: selectedSection,
            feeType: selectedFeeType,
            mode: selectedMode,
            collector: selectedCollector
        });
    }, [rawData, selectedClass, selectedSection, selectedFeeType, selectedMode, selectedCollector]);

    // Derived State: Summary based on Filtered Data
    const summary = useMemo(() => calculateSummary(filteredReceipts), [filteredReceipts]);

    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Date Selection */}
                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                    </div>
                </div>

                {/* Fee Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                    <select
                        value={selectedFeeType}
                        onChange={(e) => setSelectedFeeType(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="All">All Fee Types</option>
                        {feeTypes.map(ft => (
                            <option key={ft.id} value={ft.fee_type}>{ft.fee_type}</option>
                        ))}
                    </select>
                </div>

                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {paymentModes.map(m => (
                            <option key={m} value={m}>{m === 'All' ? 'All Modes' : m}</option>
                        ))}
                    </select>
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={handleSearch}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, 'Daily_Fee_Report')}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, 'Daily Fee Report', 'Daily_Fee_Report')}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading report...</div>}
            {error && <div className="text-center text-red-500 py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 px-4">
                        <StatCard label="Total Collection" value={summary.total} color="green" />
                        {Object.entries(summary.modeMap || {}).map(([mode, amount]: any) => (
                            <StatCard key={mode} label={mode} value={Number(amount)} color="blue" />
                        ))}
                    </div>

                    <FullReceiptsTable receipts={filteredReceipts} onViewReceipt={onViewReceipt} />
                    <SummaryTables
                        modeSummary={summary.modeMap || {}}
                        collectedBySummary={summary.collectedBySummary || []}
                        totalCollection={summary.total}
                    />
                </>
            )}
        </div>
    );
};

// --------------------------------------------------------------------------
// Monthly Report (ENHANCED)
// --------------------------------------------------------------------------
export const MonthlyReport: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
    const [year, setYear] = useState<string>(String(new Date().getFullYear()));
    const [rawData, setRawData] = useState<any>(null); // Store API response
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Filters
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [selectedFeeType, setSelectedFeeType] = useState('All');
    const [selectedMode, setSelectedMode] = useState('All');
    const [selectedCollector, setSelectedCollector] = useState('All');
    const [feeTypes, setFeeTypes] = useState<any[]>([]);
    const [classList, setClassList] = useState<string[]>([]);
    const [collectors, setCollectors] = useState<string[]>([]);

    const sections = useClassSections(selectedClass);
    const paymentModes = ["All", "Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    const academicYear = localStorage.getItem("academicYear") || "";
    const [startYear, endYear] = academicYear.split("-");
    const years: string[] = startYear && endYear ? [startYear, endYear] : [String(new Date().getFullYear())];

    useEffect(() => {
        const loadData = async () => {
            try {
                const resTypes = await api.get('/fee-types');
                const allTypes = Array.isArray(resTypes.data) ? resTypes.data : resTypes.data.fee_types || [];
                setFeeTypes(allTypes);

                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);

                try {
                    const resUsers = await api.get('/users');
                    const users = resUsers.data.users || resUsers.data || [];
                    setCollectors(["All", ...users.map((u: any) => u.name || u.username)]);
                } catch {
                    setCollectors(["All"]);
                }

                // Fetch initial
                fetchReport();
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        loadData();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            setError('');
            // Fetch BROAD data and filter locally
            const params = new URLSearchParams({
                month,
                year,
                class: 'All',
                section: 'All',
                fee_type: 'All',
                mode: 'All',
                collected_by: 'All'
            });
            const res = await api.get(`/reports/fees/monthly?${params.toString()}`);
            setRawData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch report');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        fetchReport();
    };

    const monthName = new Date(0, Number(month) - 1).toLocaleString('default', { month: 'long' });

    // Derived State: Filtered Data
    const filteredReceipts = useMemo(() => {
        if (!rawData?.receipts) return [];
        return filterData(rawData.receipts, {
            class: selectedClass,
            section: selectedSection,
            feeType: selectedFeeType,
            mode: selectedMode,
            collector: selectedCollector
        });
    }, [rawData, selectedClass, selectedSection, selectedFeeType, selectedMode, selectedCollector]);

    // Derived State: Summary based on Filtered Data
    const summary = useMemo(() => calculateSummary(filteredReceipts), [filteredReceipts]);


    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Month & Year Selection */}
                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>
                                    {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Fee Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                    <select
                        value={selectedFeeType}
                        onChange={(e) => setSelectedFeeType(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="All">All Fee Types</option>
                        {feeTypes.map(ft => (
                            <option key={ft.id} value={ft.fee_type}>{ft.fee_type}</option>
                        ))}
                    </select>
                </div>

                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>
                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {paymentModes.map(m => (
                            <option key={m} value={m}>{m === 'All' ? 'All Modes' : m}</option>
                        ))}
                    </select>
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={handleSearch}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `Monthly_Report_${monthName}_${year}`)}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `Monthly Report - ${monthName} ${year}`, `Monthly_Report_${monthName}_${year}`)}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading report...</div>}
            {error && <div className="text-center text-red-500 py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 px-4">
                        <StatCard label="Total Collection" value={summary.total} color="green" />
                        {Object.entries(summary.modeMap || {}).map(([mode, amount]: any) => (
                            <StatCard key={mode} label={mode} value={Number(amount)} color="blue" />
                        ))}
                    </div>

                    <FullReceiptsTable receipts={filteredReceipts} onViewReceipt={onViewReceipt} />
                    <SummaryTables
                        modeSummary={summary.modeMap || {}}
                        collectedBySummary={summary.collectedBySummary || []}
                        totalCollection={summary.total}
                    />
                </>
            )}
        </div>
    );
};


// --------------------------------------------------------------------------
// Class Wise Report (ENHANCED)
// --------------------------------------------------------------------------
export const ClassWiseReport: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [classList, setClassList] = useState<string[]>([]);
    const [className, setClassName] = useState('');
    const [selectedSection, setSelectedSection] = useState('All');
    const [selectedFeeType, setSelectedFeeType] = useState('All');
    const [selectedMode, setSelectedMode] = useState('All');
    const [selectedCollector, setSelectedCollector] = useState('All');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [feeTypes, setFeeTypes] = useState<any[]>([]);
    const [collectors, setCollectors] = useState<string[]>([]);
    const [rawData, setRawData] = useState<any>(null); // Store API response
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const sections = useClassSections(className);
    const paymentModes = ["All", "Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    useEffect(() => {
        const loadData = async () => {
            try {
                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                const names = classesData.map((c: any) => c.class_name);
                setClassList(names);
                if (names.length > 0) setClassName(names[0]);

                const resTypes = await api.get('/fee-types');
                const allTypes = Array.isArray(resTypes.data) ? resTypes.data : resTypes.data.fee_types || [];
                setFeeTypes(allTypes);

                try {
                    const resUsers = await api.get('/users');
                    const users = resUsers.data.users || resUsers.data || [];
                    setCollectors(["All", ...users.map((u: any) => u.name || u.username)]);
                } catch {
                    setCollectors(["All"]);
                }
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        loadData();
    }, []);

    const fetchReport = async () => {
        if (!className) return;
        try {
            setLoading(true);
            setError('');
            // Fetch BROAD data for the class and filter locally
            const params = new URLSearchParams({
                class: className,
                section: 'All', // Fetch all sections
                fee_type: 'All', // Fetch all types
                mode: 'All', // Fetch all modes
                collected_by: 'All', // Fetch all collectors
                ...(startDate && { start_date: startDate }),
                ...(endDate && { end_date: endDate })
            });
            const res = await api.get(`/reports/fees/class-wise?${params.toString()}`);
            setRawData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error fetching report');
            setRawData(null);
        } finally {
            setLoading(false);
        }
    };

    // Derived State: Filtered Data
    const filteredReceipts = useMemo(() => {
        if (!rawData?.receipts) return [];
        return filterData(rawData.receipts, {
            class: className, // Ensure class matches (though API should have filtered it)
            section: selectedSection,
            feeType: selectedFeeType,
            mode: selectedMode,
            collector: selectedCollector
        });
    }, [rawData, className, selectedSection, selectedFeeType, selectedMode, selectedCollector]);

    // Derived State: Summary based on Filtered Data
    // Note: ClassWiseReport API returns specific summary fields (total_fee, collected, due).
    // If we filter locally, we should probably recalculate these summaries based on filtered receipts,
    // OR trust the helper `calculateSummary` for at least the collection part.
    // However, "Total Demand" (total_fee) and "Due" might be specific to the class student list, 
    // which might not be fully available in just 'receipts'. 
    // BUT, for a Receipt Report, we care about what was COLLECTED.
    // The original code showed `data.total_fee`, `data.collected`, `data.due`.
    // If we filter by "Cash" mode, "Total Demand" shouldn't change, but "Collected" should.
    // So we should recalculate "Collected" from filtered receipts.
    // "Total Demand" and "Due" might be misleading if we filter by Payment Mode (as due is not mode-specific).
    // I will use `calculateSummary` for the collection stats.
    // For Demand/Due, I'll keep the raw API data BUT maybe hide them if actively filtering by Mode/Type?
    // Actually, users usually want to see "Of the Cash collected, how much is it?".
    // So `summary.total` will be the filtered collection.

    const summary = useMemo(() => calculateSummary(filteredReceipts), [filteredReceipts]);

    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={className}
                        onChange={e => setClassName(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Fee Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                    <select
                        value={selectedFeeType}
                        onChange={(e) => setSelectedFeeType(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="All">All Fee Types</option>
                        {feeTypes.map(ft => (
                            <option key={ft.id} value={ft.fee_type}>{ft.fee_type}</option>
                        ))}
                    </select>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {paymentModes.map(m => (
                            <option key={m} value={m}>{m === 'All' ? 'All Modes' : m}</option>
                        ))}
                    </select>
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={fetchReport}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `ClassWise_Report_${className}`)}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `Class ${className} Fee Report`, `ClassWise_Report_${className}`)}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4">
                        {/* Show raw demand/due only if no strict filter that invalidates them? 
                           Actually, if we filter by 'Cash', Total Demand is still the class's total demand.
                           Collected is the 'Cash' collected.
                           Due is still 'Total Demand - All Collected'.
                           So rawData.collected is 'Total All Modes'.
                           filteredCollected (summary.total) is 'Total Filtered Mode'.
                           Showing 'Due' from rawData is okay.
                           Showing 'Collected' from summary.total is correct for the view.
                        */}
                        <StatCard label="Total Demand" value={rawData.total_fee} color="blue" />
                        <StatCard label="Collected (Filtered)" value={summary.total} color="green" />
                        <StatCard label="Due Amount" value={rawData.due} color="red" />
                        <StatCard label="Collection %" value={`${rawData.total_fee ? ((summary.total / rawData.total_fee) * 100).toFixed(1) : 0}%`} color="purple" />
                    </div>

                    {/* Full Table */}
                    <FullReceiptsTable receipts={filteredReceipts} onViewReceipt={onViewReceipt} />

                    {/* Summary Tables */}
                    <SummaryTables
                        modeSummary={summary.modeMap || {}}
                        collectedBySummary={summary.collectedBySummary || []}
                        totalCollection={summary.total}
                    />
                </>
            )}
        </div>
    );
};

// --------------------------------------------------------------------------
// Installment Wise Report (ENHANCED)
// --------------------------------------------------------------------------
export const InstallmentWiseReport: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [installment, setInstallment] = useState('');
    const [feeTypes, setFeeTypes] = useState<any[]>([]);
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [selectedMode, setSelectedMode] = useState('All');
    const [selectedCollector, setSelectedCollector] = useState('All');
    const [classList, setClassList] = useState<string[]>([]);
    const [collectors, setCollectors] = useState<string[]>([]);
    const [rawData, setRawData] = useState<any>(null); // Store API response
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const sections = useClassSections(selectedClass);
    const paymentModes = ["All", "Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch Installments for the "Fee Head" dropdown
                // This ensures we match 'StudentFee.month' which stores installment titles (e.g. "June Fee")
                const resInst = await api.get('/installment-schedule');
                const installmentsData = resInst.data.installments || [];

                // Also fetch Fee Types for One-Time fees if needed, 
                // but primarily we need Installment Titles.
                // Let's combine unique titles from Installments.
                const uniqueTitles = Array.from(new Set(installmentsData.map((i: any) => i.title)));

                // If we also want to support "One-Time" or direct Fee Type matches that might be stored in 'month' column (rare but possible)
                // we could fetch fee types, but normally 'month' column aligns with Installment Title.

                setFeeTypes(uniqueTitles.map((t, idx) => ({ id: idx, fee_type: t }))); // Map to expected shape { fee_type: string }
                if (uniqueTitles.length > 0) setInstallment(uniqueTitles[0] as string);

                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);

                try {
                    const resUsers = await api.get('/users');
                    const users = resUsers.data.users || resUsers.data || [];
                    setCollectors(["All", ...users.map((u: any) => u.name || u.username)]);
                } catch {
                    setCollectors(["All"]);
                }
            } catch (err) {
                console.error("Failed to load initial data", err);
            }
        };
        loadData();
    }, []);

    const fetchReport = async () => {
        if (!installment) return;
        try {
            setLoading(true);
            setError('');
            // Fetch BROAD data for the installment
            const params = new URLSearchParams({
                installment,
                class: 'All',
                section: 'All',
                mode: 'All',
                collected_by: 'All'
            });
            const res = await api.get(`/reports/fees/installment-wise?${params.toString()}`);
            setRawData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error fetching report');
            setRawData(null);
        } finally {
            setLoading(false);
        }
    };

    // Derived State: Filtered Data
    const filteredReceipts = useMemo(() => {
        if (!rawData?.receipts) return [];
        return filterData(rawData.receipts, {
            class: selectedClass,
            section: selectedSection,
            feeType: 'All', // Already filtered by installment
            mode: selectedMode,
            collector: selectedCollector
        });
    }, [rawData, selectedClass, selectedSection, selectedMode, selectedCollector]);

    const summary = useMemo(() => calculateSummary(filteredReceipts), [filteredReceipts]);

    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Fee Type / Installment */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Head</label>
                    <select
                        value={installment}
                        onChange={e => setInstallment(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        <option value="">Select Fee Type</option>
                        {feeTypes.map(ft => (
                            <option key={ft.id} value={ft.fee_type}>{ft.fee_type}</option>
                        ))}
                    </select>
                </div>

                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Payment Mode */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                    <select
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {paymentModes.map(m => (
                            <option key={m} value={m}>{m === 'All' ? 'All Modes' : m}</option>
                        ))}
                    </select>
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={fetchReport}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `Installment_Report_${installment}`)}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `${installment} - Fee Report`, `Installment_Report_${installment}`)}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 px-4">
                        <StatCard label="Total Demand" value={rawData.total_demand} color="blue" />
                        <StatCard label="Collected (Filtered)" value={summary.total} color="green" />
                        <StatCard label="Due Amount" value={rawData.due} color="red" />
                        <StatCard label="Paid Students" value={`${rawData.paid_students} / ${rawData.total_students}`} color="purple" />
                        <StatCard label="Collection %" value={`${rawData.total_demand ? ((summary.total / rawData.total_demand) * 100).toFixed(1) : 0}%`} color="orange" />
                    </div>

                    {/* Full Table */}
                    <FullReceiptsTable receipts={filteredReceipts} onViewReceipt={onViewReceipt} />

                    {/* Summary Tables */}
                    <SummaryTables
                        modeSummary={summary.modeMap || {}}
                        collectedBySummary={summary.collectedBySummary || []}
                        totalCollection={summary.total}
                    />
                </>
            )}
        </div>
    );
};

// --------------------------------------------------------------------------
// Due Report (ENHANCED)
// --------------------------------------------------------------------------
export const DueReport: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Filters
    const [classList, setClassList] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [minDueAmount, setMinDueAmount] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 5;

    const sections = useClassSections(selectedClass);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredData]);

    useEffect(() => {
        const loadClasses = async () => {
            try {
                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);
            } catch (err) {
                console.error("Failed to load classes", err);
            }
        };
        loadClasses();
        // Initial fetch
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            setError('');
            const params = new URLSearchParams({
                class: selectedClass === 'All' ? '' : selectedClass, // Handle 'All' correctly if backend expects empty or 'All'
                section: selectedSection === 'All' ? '' : selectedSection,
                ...(minDueAmount && { min_due: minDueAmount })
            });

            // If backend expects 'All' literally, keep it. 
            // Original code sent selectedClass directly. 
            // I'll stick to sending 'All' if simpler, or check logic.
            // If I look at DailyReport refactor, I sent 'All'.
            // Here due report might be different. 
            // But let's assume 'All' is handled or I can filter locally if I fetch everything?
            // Due report for "All" classes is huge.
            // I will send the params. 
            // But if params are passed as 'All', does backend handle it?
            // Usually yes if I wrote it or if it was there.
            // I'll stick to matching the previous logic: `class: selectedClass`.

            const params2 = new URLSearchParams();
            if (selectedClass !== 'All') params2.append('class', selectedClass);
            if (selectedSection !== 'All') params2.append('section', selectedSection);
            if (minDueAmount) params2.append('min_due', minDueAmount);

            const res = await api.get(`/reports/fees/due?${params2.toString()}`);
            setData(res.data);
            setFilteredData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error fetching report');
        } finally {
            setLoading(false);
        }
    };

    // Derived State: Local Filtering (Search + maybe class/section if we fetched all)
    // Derived State: Filtered Data (Robust Client-Side Filtering)
    useEffect(() => {
        if (!data) return;
        let res = data;

        // 1. Strict Class Filter (if not All)
        if (selectedClass !== 'All') {
            res = res.filter(s => s.class === selectedClass);
        }

        // 2. Strict Section Filter (if not All)
        if (selectedSection !== 'All') {
            res = res.filter(s => s.section === selectedSection);
        }

        // 3. Search Filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            res = res.filter(s =>
                (s.name?.toLowerCase() || '').includes(term) ||
                (s.admission_no?.toLowerCase() || '').includes(term) ||
                (s.adm_no?.toLowerCase() || '').includes(term) || // Fallback
                (s.father_mobile?.includes(term))
            );
        }
        setFilteredData(res);
    }, [searchTerm, data, selectedClass, selectedSection]);

    const totalDue = filteredData.reduce((sum, s) => sum + (s.due_amount || 0), 0);
    const totalFee = filteredData.reduce((sum, s) => sum + (s.total_fee || 0), 0);

    const downloadExcel = () => {
        if (!filteredData.length) return;
        const excelData = filteredData.map((s: any) => ({
            StudentName: s.name,
            AdmissionNo: s.admission_no || s.adm_no || s.admissionNo || '-',
            Class: `${s.class} ${s.section || ''}`,
            FatherName: s.father_name || s.father || s.parent_name || '-',
            FatherMobile: s.father_mobile,
            TotalFee: s.total_fee,
            PaidAmount: s.paid_amount || (s.total_fee - s.due_amount),
            DueAmount: s.due_amount
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Due Report");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const blob = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        saveAs(blob, `Due_Report.xlsx`);
    };

    const downloadPDF = () => {
        if (!filteredData.length) return;
        const doc = new jsPDF("l", "mm", "a4");
        doc.text("Due Fee Report", 14, 15);

        const tableColumn = [
            "Student", "Adm No", "Class", "Father Name", "Mobile", "Total Fee", "Paid", "Due"
        ];

        const tableRows = filteredData.map((s: any) => ([
            s.name,
            s.admission_no || s.adm_no || s.admissionNo || '-',
            `${s.class} ${s.section || ''}`,
            s.father_name || s.father || s.parent_name || '-',
            s.father_mobile,
            s.total_fee,
            s.paid_amount || (s.total_fee - s.due_amount),
            s.due_amount
        ]));

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 20,
            styles: { fontSize: 8 }
        });

        doc.save("Due_Report.pdf");
    };

    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Search */}
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
                    <input
                        type="text"
                        placeholder="Name, admission no, mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    />
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={fetchReport}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={downloadExcel}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={downloadPDF}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4">
                <StatCard label="Total Students with Dues" value={filteredData.length} color="blue" />
                <StatCard label="Total Fee Demand" value={totalFee} color="purple" />
                <StatCard label="Total Due Amount" value={totalDue} color="red" />
                <StatCard label="Avg Due per Student" value={filteredData.length ? Math.round(totalDue / filteredData.length) : 0} color="orange" />
            </div>

            {/* Due Table */}
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm mx-4">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">S.No</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Student Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Adm No.</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Class</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Father Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Mobile</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total Fee</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Paid</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Due Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="bg-green-50 text-green-600 text-center py-8 font-medium">
                                    🎉 No students with pending dues!
                                </td>
                            </tr>
                        ) : (
                            <>
                                {filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((s, idx) => {
                                    const sNo = ((currentPage - 1) * rowsPerPage) + idx + 1;
                                    return (
                                        <tr key={s.student_id || idx} className="hover:bg-gray-50 h-[45px]">
                                            <td className="px-4 py-3 text-gray-500">{sNo}</td>
                                            <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                                            <td className="px-4 py-3 text-blue-600">{s.admission_no || s.adm_no || s.admissionNo || '-'}</td>
                                            <td className="px-4 py-3">{s.class} {s.section}</td>
                                            <td className="px-4 py-3 text-gray-600">{s.father_name || s.father || s.parent_name || '-'}</td>
                                            <td className="px-4 py-3">
                                                <a href={`tel:${s.father_mobile}`} className="text-blue-600 hover:underline">
                                                    {s.father_mobile}
                                                </a>
                                            </td>
                                            <td className="px-4 py-3 text-right">₹{s.total_fee?.toLocaleString('en-IN')}</td>
                                            <td className="px-4 py-3 text-right text-green-600">
                                                ₹{(s.paid_amount || (s.total_fee - s.due_amount))?.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-red-600">
                                                ₹{s.due_amount?.toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {/* Empty rows for stability */}
                                {Array.from({ length: rowsPerPage - (filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-[45px]">
                                        <td colSpan={9}>&nbsp;</td>
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                    {filteredData.length > 0 && (
                        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-200">
                            <tr>
                                <td colSpan={6} className="px-4 py-3 text-right">Total:</td>
                                <td className="px-4 py-3 text-right">₹{totalFee.toLocaleString('en-IN')}</td>
                                <td className="px-4 py-3 text-right text-green-600">
                                    ₹{(totalFee - totalDue).toLocaleString('en-IN')}
                                </td>
                                <td className="px-4 py-3 text-right text-red-600">
                                    ₹{totalDue.toLocaleString('en-IN')}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(filteredData.length / rowsPerPage)}
                    onPageChange={setCurrentPage}
                    totalRecords={filteredData.length}
                    perPage={rowsPerPage}
                />
            </div>

            {/* Class-wise Due Summary */}
            {filteredData.length > 0 && (
                <div className="bg-white p-4 rounded-lg border mt-4 mx-4 mb-6">
                    <h4 className="font-semibold mb-3 text-gray-700">Class-wise Due Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {Object.entries(
                            filteredData.reduce((acc: any, s) => {
                                const key = `${s.class} ${s.section || ''}`;
                                acc[key] = (acc[key] || 0) + (s.due_amount || 0);
                                return acc;
                            }, {})
                        ).map(([cls, amt]: any) => (
                            <div key={cls} className="bg-red-50 p-3 rounded border border-red-100">
                                <p className="text-xs text-gray-500">{cls}</p>
                                <p className="font-bold text-red-600">₹{Number(amt).toLocaleString('en-IN')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const LateFeeDueReport: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [filteredData, setFilteredData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Filters
    const [classList, setClassList] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState('All');
    const [selectedSection, setSelectedSection] = useState('All');
    const [minDueAmount, setMinDueAmount] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 5;

    const sections = useClassSections(selectedClass);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredData]);

    useEffect(() => {
        const loadClasses = async () => {
            try {
                const resClasses = await api.get('/classes');
                const classesData = resClasses.data.classes || [];
                setClassList(["All", ...classesData.map((c: any) => c.class_name)]);
            } catch (err) {
                console.error("Failed to load classes", err);
            }
        };
        loadClasses();
        // Initial fetch
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            setError('');
            const params = new URLSearchParams({
                class: selectedClass === 'All' ? '' : selectedClass, // Handle 'All' correctly if backend expects empty or 'All'
                section: selectedSection === 'All' ? '' : selectedSection,
                ...(minDueAmount && { min_due: minDueAmount })
            });

            // If backend expects 'All' literally, keep it. 
            // Original code sent selectedClass directly. 
            // I'll stick to sending 'All' if simpler, or check logic.
            // If I look at DailyReport refactor, I sent 'All'.
            // Here due report might be different. 
            // But let's assume 'All' is handled or I can filter locally if I fetch everything?
            // Due report for "All" classes is huge.
            // I will send the params. 
            // But if params are passed as 'All', does backend handle it?
            // Usually yes if I wrote it or if it was there.
            // I'll stick to matching the previous logic: `class: selectedClass`.

            const params2 = new URLSearchParams();
            if (selectedClass !== 'All') params2.append('class', selectedClass);
            if (selectedSection !== 'All') params2.append('section', selectedSection);
            if (minDueAmount) params2.append('min_due', minDueAmount);

            const res = await api.get(`/reports/fees/late-due?${params2.toString()}`);
            setData(res.data);
            setFilteredData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error fetching report');
        } finally {
            setLoading(false);
        }
    };

    // Derived State: Local Filtering (Search + maybe class/section if we fetched all)
    // Derived State: Filtered Data (Robust Client-Side Filtering)
    useEffect(() => {
        if (!data) return;
        let res = data;

        // 1. Strict Class Filter (if not All)
        if (selectedClass !== 'All') {
            res = res.filter(s => s.class === selectedClass);
        }

        // 2. Strict Section Filter (if not All)
        if (selectedSection !== 'All') {
            res = res.filter(s => s.section === selectedSection);
        }

        // 3. Search Filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            res = res.filter(s =>
                (s.name?.toLowerCase() || '').includes(term) ||
                (s.admission_no?.toLowerCase() || '').includes(term) ||
                (s.adm_no?.toLowerCase() || '').includes(term) || // Fallback
                (s.father_mobile?.includes(term))
            );
        }
        setFilteredData(res);
    }, [searchTerm, data, selectedClass, selectedSection]);

    const totalDue = filteredData.reduce((sum, s) => sum + (s.due_amount || 0), 0);
    const totalFee = filteredData.reduce((sum, s) => sum + (s.total_fee || 0), 0);

    const downloadExcel = () => {
        if (!filteredData.length) return;
        const excelData = filteredData.map((s: any) => ({
            StudentName: s.name,
            AdmissionNo: s.admission_no || s.adm_no || s.admissionNo || '-',
            Class: `${s.class} ${s.section || ''}`,
            FatherName: s.father_name || s.father || s.parent_name || '-',
            FatherMobile: s.father_mobile,
            TotalFee: s.total_fee,
            PaidAmount: s.paid_amount || (s.total_fee - s.due_amount),
            DueAmount: s.due_amount
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Late Fee Due Report");
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const blob = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        saveAs(blob, `Late_Fee_Due_Report.xlsx`);
    };

    const downloadPDF = () => {
        if (!filteredData.length) return;
        const doc = new jsPDF("l", "mm", "a4");
        doc.text("Late Fee Due Report", 14, 15);

        const tableColumn = [
            "Student", "Adm No", "Class", "Father Name", "Mobile", "Total Fee", "Paid", "Due"
        ];

        const tableRows = filteredData.map((s: any) => ([
            s.name,
            s.admission_no || s.adm_no || s.admissionNo || '-',
            `${s.class} ${s.section || ''}`,
            s.father_name || s.father || s.parent_name || '-',
            s.father_mobile,
            s.total_fee,
            s.paid_amount || (s.total_fee - s.due_amount),
            s.due_amount
        ]));

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 20,
            styles: { fontSize: 8 }
        });

        doc.save("Late_Fee_Due_Report.pdf");
    };

    return (
        <div className="space-y-4 font-sans">
            <FilterContainer>
                {/* Class */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {classList.map(c => (
                            <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
                        ))}
                    </select>
                </div>

                {/* Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    >
                        {sections.map(s => (
                            <option key={s} value={s}>{s === 'All' ? 'All Sections' : s}</option>
                        ))}
                    </select>
                </div>

                {/* Search */}
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
                    <input
                        type="text"
                        placeholder="Name, admission no, mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                    />
                </div>
            </FilterContainer>

            {/* Actions Row */}
            <div className="flex gap-2 mb-4 px-4">
                <button
                    onClick={fetchReport}
                    className="bg-indigo-700 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-800 flex items-center gap-2"
                >
                    🔍 Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={downloadExcel}
                    className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
                >
                    📊 Excel
                </button>
                <button
                    onClick={downloadPDF}
                    className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                    📄 PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4">
                <StatCard label="Total Students with Dues" value={filteredData.length} color="blue" />
                <StatCard label="Total Fee Demand" value={totalFee} color="purple" />
                <StatCard label="Total Due Amount" value={totalDue} color="red" />
                <StatCard label="Avg Due per Student" value={filteredData.length ? Math.round(totalDue / filteredData.length) : 0} color="orange" />
            </div>

            {/* Late Fee Due Table */}
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm mx-4">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">S.No</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Student Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Adm No.</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Class</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Father Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Mobile</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Total Fee</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Paid</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700">Due Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="bg-green-50 text-green-600 text-center py-8 font-medium">
                                    🎉 No students with pending dues!
                                </td>
                            </tr>
                        ) : (
                            <>
                                {filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((s, idx) => {
                                    const sNo = ((currentPage - 1) * rowsPerPage) + idx + 1;
                                    return (
                                        <tr key={s.student_id || idx} className="hover:bg-gray-50 h-[45px]">
                                            <td className="px-4 py-3 text-gray-500">{sNo}</td>
                                            <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                                            <td className="px-4 py-3 text-blue-600">{s.admission_no || s.adm_no || s.admissionNo || '-'}</td>
                                            <td className="px-4 py-3">{s.class} {s.section}</td>
                                            <td className="px-4 py-3 text-gray-600">{s.father_name || s.father || s.parent_name || '-'}</td>
                                            <td className="px-4 py-3">
                                                <a href={`tel:${s.father_mobile}`} className="text-blue-600 hover:underline">
                                                    {s.father_mobile}
                                                </a>
                                            </td>
                                            <td className="px-4 py-3 text-right">₹{s.total_fee?.toLocaleString('en-IN')}</td>
                                            <td className="px-4 py-3 text-right text-green-600">
                                                ₹{(s.paid_amount || (s.total_fee - s.due_amount))?.toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-red-600">
                                                ₹{s.due_amount?.toLocaleString('en-IN')}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {/* Empty rows for stability */}
                                {Array.from({ length: rowsPerPage - (filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-[45px]">
                                        <td colSpan={9}>&nbsp;</td>
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                    {filteredData.length > 0 && (
                        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-200">
                            <tr>
                                <td colSpan={6} className="px-4 py-3 text-right">Total:</td>
                                <td className="px-4 py-3 text-right">₹{totalFee.toLocaleString('en-IN')}</td>
                                <td className="px-4 py-3 text-right text-green-600">
                                    ₹{(totalFee - totalDue).toLocaleString('en-IN')}
                                </td>
                                <td className="px-4 py-3 text-right text-red-600">
                                    ₹{totalDue.toLocaleString('en-IN')}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(filteredData.length / rowsPerPage)}
                    onPageChange={setCurrentPage}
                    totalRecords={filteredData.length}
                    perPage={rowsPerPage}
                />
            </div>

            {/* Class-wise Due Summary */}
            {filteredData.length > 0 && (
                <div className="bg-white p-4 rounded-lg border mt-4 mx-4 mb-6">
                    <h4 className="font-semibold mb-3 text-gray-700">Class-wise Due Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {Object.entries(
                            filteredData.reduce((acc: any, s) => {
                                const key = `${s.class} ${s.section || ''}`;
                                acc[key] = (acc[key] || 0) + (s.due_amount || 0);
                                return acc;
                            }, {})
                        ).map(([cls, amt]: any) => (
                            <div key={cls} className="bg-red-50 p-3 rounded border border-red-100">
                                <p className="text-xs text-gray-500">{cls}</p>
                                <p className="font-bold text-red-600">₹{Number(amt).toLocaleString('en-IN')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


export default {
    TodayCollection,
    DailyReport,
    MonthlyReport,
    ClassWiseReport,
    InstallmentWiseReport,
    DueReport,
    LateFeeDueReport
};
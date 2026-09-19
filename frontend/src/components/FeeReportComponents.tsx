import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { ChevronDownIcon, PrinterIcon, EyeIcon } from './icons';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatReportBranch, getReportHeaderBranch } from '../utils/branchHelper';

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
    transaction_id?: string;
}

interface ReportProps {
    onViewReceipt: (receiptNo: string, branch?: string, studentId?: number) => void;
    forcedStatus?: 'A' | 'I' | 'All';
    forcedConcession?: boolean;
    singleDayOnly?: boolean;
}
// --------------------------------------------------------------------------
// Date Formatting Helper
// --------------------------------------------------------------------------
const formatDateDDMMYYYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return '-';

    try {
        // Handle if already in DD-MM-YYYY format
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            return dateStr;
        }

        // Handle YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const datePart = dateStr.split('T')[0]; // Remove time part if present
            const [year, month, day] = datePart.split('-');
            return `${day}-${month}-${year}`;
        }

        // Handle other formats via Date object
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        }

        return dateStr; // Return as-is if can't parse
    } catch {
        return dateStr || '-';
    }
};
// --------------------------------------------------------------------------
// Shared Components
// --------------------------------------------------------------------------

const StatCard = ({ label, value, subtext }: any) => {
    return (
        <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-full opacity-50"></div>
            <p className="text-sm text-slate-500 font-medium mb-1 z-10">{label}</p>
            <p className="text-3xl font-bold text-slate-800 z-10">
                {typeof value === 'number' && (label.toLowerCase().includes('amount') || label.toLowerCase().includes('total')) ? `₹${value.toLocaleString('en-IN')}` : value}
            </p>            {subtext && <p className="text-xs text-slate-400 mt-2 z-10">{subtext}</p>}
        </div>
    );
};

// Reusable Filter Wrapper
const FilterContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm mx-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
    const filtered = data.filter(r => {
        if (filters.class && filters.class !== 'All' && r.class !== filters.class) return false;
        if (filters.section && filters.section !== 'All' && r.section !== filters.section) return false;
        if (filters.feeType && filters.feeType !== 'All' && !r.fee_type_str?.includes(filters.feeType)) return false;
        if (filters.mode && filters.mode !== 'All' && r.mode !== filters.mode) return false;
        if (filters.collector && filters.collector !== 'All' && r.collected_by !== filters.collector) return false;
        return true;
    });
    if (filters.feeType && filters.feeType !== 'All') {
        return filtered.map(r => {
            if (!r.line_items || !Array.isArray(r.line_items)) return r;

            const matchingItems = r.line_items.filter((item: any) => item.fee_type_str?.includes(filters.feeType));
            if (matchingItems.length === 0) return r; // Fallback

            const newAmountPaid = matchingItems.reduce((sum: number, item: any) => sum + (Number(item.amount_paid) || 0), 0);
            const newGross = matchingItems.reduce((sum: number, item: any) => sum + (Number(item.gross_amount) || 0), 0);
            const newConcession = matchingItems.reduce((sum: number, item: any) => sum + (Number(item.concession) || 0), 0);
            const newDue = matchingItems.reduce((sum: number, item: any) => sum + (Number(item.due_amount) || 0), 0);
            const newNet = matchingItems.reduce((sum: number, item: any) => sum + (Number(item.net_payable) || 0), 0);

            const uniqueFeeTypes = Array.from(new Set(matchingItems.map((item: any) => item.fee_type_str))).join(", ");

            return {
                ...r,
                amount_paid: newAmountPaid,
                amount: newAmountPaid,
                gross_amount: newGross,
                concession: newConcession,
                due_amount: newDue,
                net_payable: newNet,
                fee_type_str: uniqueFeeTypes
            };
        });
    }

    return filtered;
};


const calculateSummary = (receipts: any[]) => {
    const total = receipts.reduce((sum, r) => sum + Number(r.amount_paid || r.amount || 0), 0);
    const modeMap: Record<string, number> = {};
    const modeCount: Record<string, number> = {};
    const userMap: Record<string, { user: string, count: number, amount: number, branch: string }> = {};

    let cashTransactionsCount = 0;
    let digitalTransactionsCount = 0;

    receipts.forEach(r => {
        const amt = Number(r.amount_paid || r.amount || 0);
        const m = r.mode || 'Unknown';
        modeMap[m] = (modeMap[m] || 0) + amt;
        modeCount[m] = (modeCount[m] || 0) + 1;

        if (m.toLowerCase() === 'cash') {
            cashTransactionsCount++;
        } else if (['upi', 'card', 'bank transfer', 'online'].includes(m.toLowerCase())) {
            digitalTransactionsCount++;
        }

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
    return { total, modeMap, modeCount, cashTransactionsCount, digitalTransactionsCount, collectedBySummary };
};

const SummaryTables = ({ modeSummary, collectedBySummary, totalCollection }: {
    modeSummary: Record<string, number>;
    collectedBySummary: any[];
    totalCollection: number;
}) => (
    <div className="flex flex-col lg:flex-row gap-6 mt-8 px-4 pb-6">
        {/* Payment Mode Table */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                <h4 className="font-bold text-slate-800">Payment Mode Summary</h4>
            </div>
            <div className="p-0">
                <table className="w-full text-sm">
                    <thead className="bg-white">
                        <tr className="text-slate-500 border-b border-slate-100">
                            <th className="px-6 py-3 text-left font-semibold">Payment Mode</th>
                            <th className="px-6 py-3 text-right font-semibold">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {Object.entries(modeSummary || {}).map(([mode, amt]: any) => (
                            <tr key={mode} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-700">{mode}</td>
                                <td className="px-6 py-4 text-right text-slate-600">₹{Number(amt).toLocaleString()}</td>
                            </tr>
                        ))}
                        <tr className="bg-slate-50/50">
                            <td className="px-6 py-4 font-bold text-slate-800">Total</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-800 text-lg">₹{totalCollection.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        {/* Collected By Table */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                <h4 className="font-bold text-slate-800">Collected By Summary</h4>
            </div>
            <div className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-white">
                        <tr className="text-slate-500 border-b border-slate-100">
                            <th className="px-6 py-3 text-left font-semibold">Collected By</th>
                            <th className="px-6 py-3 text-left font-semibold">Branch</th>
                            <th className="px-6 py-3 text-center font-semibold">Count</th>
                            <th className="px-6 py-3 text-right font-semibold">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {Array.isArray(collectedBySummary) && collectedBySummary.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-700">{row.user}</td>
                                <td className="px-6 py-4 text-slate-600">{formatReportBranch(row.branch)}</td>
                                <td className="px-6 py-4 text-center text-slate-600">
                                    <span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-semibold">{row.count}</span>
                                </td>
                                <td className="px-6 py-4 text-right text-slate-600">₹{Number(row.amount).toLocaleString()}</td>
                            </tr>
                        ))}
                        <tr className="bg-slate-50/50">
                            <td colSpan={3} className="px-6 py-4 text-right font-bold text-slate-800">Total</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-800 text-lg">₹{totalCollection.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

// Full Featured Receipts Table
const FullReceiptsTable: React.FC<{
    receipts: any[];
    onViewReceipt: (id: string, branch?: string, studentId?: number) => void;
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
            <div className="bg-white text-center py-16 border border-slate-100 rounded-2xl mt-4 mx-4 shadow-sm flex flex-col items-center justify-center">
                <div className="bg-slate-50 p-4 rounded-full mb-4">
                    <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1">No collections recorded yet.</h3>
                <p className="text-slate-500 text-sm">Try changing the filters or collect a new fee.</p>
            </div>
        );
    }

    const totalPages = Math.ceil(receipts.length / rowsPerPage);
    const currentReceipts = receipts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mx-4 mt-6">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
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
                            <th className="px-3 py-2 text-left font-semibold">Trans ID</th>
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
                                    <td className="px-3 py-2 text-gray-600">{formatReportBranch(r.branch)}</td>
                                    <td className="px-3 py-2">{r.receipt_no}</td>
                                    {showAllColumns && <td className="px-3 py-2 max-w-[200px] truncate" title={r.fee_type_str}>{r.fee_type_str || '-'}</td>}
                                    {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.gross_amount || 0).toLocaleString()}</td>}
                                    {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.concession || 0).toLocaleString()}</td>}
                                    {showAllColumns && <td className="px-3 py-2 text-right">₹{(r.net_payable || 0).toLocaleString()}</td>}
                                    <td className="px-3 py-2 text-right font-bold text-gray-800">₹{(r.amount_paid || r.amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-red-500">₹{(r.due_amount || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2">{r.mode}</td>
                                    <td className="px-3 py-2 text-xs max-w-[150px]">
                                        {r.mode === 'Cheque' ? (
                                            <div className="truncate" title={`Chq: ${r.cheque_no || '-'} | ${r.bank_name || '-'} | ${r.cheque_date || '-'}`}>
                                                <div>{r.cheque_no || '-'}</div>
                                                <div className="text-gray-400">{r.bank_name || '-'}</div>
                                                <div className="text-gray-400">{r.cheque_date || '-'}</div>
                                            </div>
                                        ) : (
                                            <div className="truncate" title={r.transaction_id}>{r.transaction_id || '-'}</div>
                                        )}
                                    </td>                                {showAllColumns && <td className="px-3 py-2 text-xs truncate max-w-[150px]" title={r.note}>{r.note || '-'}</td>}
                                    <td className="px-3 py-2 text-xs text-gray-500">
                                        {r.date} <br /> {r.time}
                                    </td>
                                    <td className="px-3 py-2">{r.collected_by}</td>
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => onViewReceipt(r.receipt_no, r.branch, r.student_id)}
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
                                <td colSpan={18}>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
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
        Branch: formatReportBranch(r.branch),
        ReceiptNo: r.receipt_no,
        FeeType: r.fee_type_str,
        TotalAmount: r.gross_amount || r.amount,
        Concession: r.concession || 0,
        Payable: r.net_payable || r.amount,
        Paid: r.amount_paid || r.amount,
        Due: r.due_amount || 0,
        Mode: r.mode,
        TransactionID: r.mode === 'Cheque' ? `Chq: ${r.cheque_no || '-'} | ${r.bank_name || '-'} | ${r.cheque_date || '-'}` : (r.transaction_id || '-'),
        Date: formatDateDDMMYYYY(r.date),
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
    doc.text(`${getReportHeaderBranch()} - ${title}`, 14, 15);

    const tableColumn = [
        "Student", "Adm No", "Class", "Branch", "Receipt",
        "Fee Type", "Paid", "Due", "Mode", "Trans ID", "Date", "Taken By"
    ];

    const tableRows = receipts.map((r: any) => ([
        r.student_name,
        r.admission_no,
        `${r.class} ${r.section || ''}`,
        formatReportBranch(r.branch),
        r.receipt_no,
        r.fee_type_str || '-',
        r.amount_paid || r.amount,
        r.due_amount || 0,
        r.mode,
        r.mode === 'Cheque'
            ? `Chq: ${r.cheque_no || '-'} | ${r.bank_name || '-'} | ${formatDateDDMMYYYY(r.cheque_date)}`
            : (r.transaction_id || '-'),
        `${formatDateDDMMYYYY(r.date)} ${r.time || ''}`,
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={handleRefresh}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Refresh
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, 'Today_Collection')}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, "Today's Collection Report", 'Today_Collection')}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4 mb-8">
                <StatCard label="Total Collected Today" value={summary.total} />
                <StatCard label="Cash Transactions" value={summary.cashTransactionsCount || 0} subtext="Total count" />
                <StatCard label="Digital/Online Transactions" value={summary.digitalTransactionsCount || 0} subtext="Total count" />
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
export const DailyReport: React.FC<ReportProps> = ({ onViewReceipt, forcedStatus, forcedConcession, singleDayOnly }) => {
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
            if (forcedStatus) params.append('status', forcedStatus);
            if (forcedConcession) params.append('has_concession', 'true');
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
                {singleDayOnly ? (
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setEndDate(e.target.value);
                            }}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                    </div>
                ) : (
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
                )}

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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={handleSearch}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, 'Daily_Fee_Report')}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, 'Daily Fee Report', 'Daily_Fee_Report')}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading report...</div>}
            {error && <div className="text-center text-red-500 py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 px-4">
                        <StatCard label="Total Collection" value={summary.total} />
                        <StatCard label="Cash Transactions" value={summary.cashTransactionsCount || 0} subtext="Total count" />
                        <StatCard label="Digital/Online Transactions" value={summary.digitalTransactionsCount || 0} subtext="Total count" />
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={handleSearch}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `Monthly_Report_${monthName}_${year}`)}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `Monthly Report - ${monthName} ${year}`, `Monthly_Report_${monthName}_${year}`)}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading report...</div>}
            {error && <div className="text-center text-red-500 py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 px-4">
                        <StatCard label="Total Collection" value={summary.total} />
                        <StatCard label="Cash Transactions" value={summary.cashTransactionsCount || 0} subtext="Total count" />
                        <StatCard label="Digital/Online Transactions" value={summary.digitalTransactionsCount || 0} subtext="Total count" />
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={fetchReport}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `ClassWise_Report_${className}`)}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `Class ${className} Fee Report`, `ClassWise_Report_${className}`)}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 mb-8">
                        <StatCard label="Total Demand" value={rawData.total_fee} />
                        <StatCard label="Collected (Filtered)" value={summary.total} />
                        <StatCard label="Due Amount" value={rawData.due} />
                        <StatCard label="Collection %" value={`${rawData.total_fee ? ((summary.total / rawData.total_fee) * 100).toFixed(1) : 0}%`} />
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={fetchReport}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={() => downloadExcelReport(filteredReceipts, `Installment_Report_${installment}`)}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={() => downloadPDFReport(filteredReceipts, `${installment} - Fee Report`, `Installment_Report_${installment}`)}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {rawData && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 px-4 mb-8">
                        <StatCard label="Total Demand" value={rawData.total_demand} />
                        <StatCard label="Collected (Filtered)" value={summary.total} />
                        <StatCard label="Due Amount" value={rawData.due} />
                        <StatCard label="Paid Students" value={`${rawData.paid_students} / ${rawData.total_students}`} />
                        <StatCard label="Collection %" value={`${rawData.total_demand ? ((summary.total / rawData.total_demand) * 100).toFixed(1) : 0}%`} />
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
            Branch: formatReportBranch(s.branch),
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
        doc.text(`${getReportHeaderBranch()} - Due Fee Report`, 14, 15);

        const tableColumn = [
            "Student", "Adm No", "Class", "Branch", "Father Name", "Mobile", "Total Fee", "Paid", "Due"
        ];

        const tableRows = filteredData.map((s: any) => ([
            s.name,
            s.admission_no || s.adm_no || s.admissionNo || '-',
            `${s.class} ${s.section || ''}`,
            formatReportBranch(s.branch),
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={fetchReport}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={downloadExcel}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={downloadPDF}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 mb-8">
                <StatCard label="Total Students with Dues" value={String(filteredData.length)} />
                <StatCard label="Total Fee Demand" value={totalFee} />
                <StatCard label="Total Due Amount" value={totalDue} />
                <StatCard
                    label="Avg Due per Student"
                    value={`₹${(filteredData.length ? Math.round(totalDue / filteredData.length) : 0).toLocaleString('en-IN')}`}
                />
            </div>

            {/* Due Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mx-4 mb-6">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
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
                </div>
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
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm mt-4 mx-4 mb-6">
                    <h4 className="font-semibold mb-4 text-slate-800">Class-wise Due Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {Object.entries(
                            filteredData.reduce((acc: any, s) => {
                                const key = `${s.class} ${s.section || ''}`;
                                acc[key] = (acc[key] || 0) + (s.due_amount || 0);
                                return acc;
                            }, {})
                        ).map(([cls, amt]: any) => (
                            <div key={cls} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-xs text-slate-500 font-medium mb-1">{cls}</p>
                                <p className="font-bold text-red-600 text-lg">₹{Number(amt).toLocaleString('en-IN')}</p>
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
            Branch: formatReportBranch(s.branch),
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
        doc.text(`${getReportHeaderBranch()} - Late Fee Due Report`, 14, 15);

        const tableColumn = [
            "Student", "Adm No", "Class", "Branch", "Father Name", "Mobile", "Total Fee", "Paid", "Due"
        ];

        const tableRows = filteredData.map((s: any) => ([
            s.name,
            s.admission_no || s.adm_no || s.admissionNo || '-',
            `${s.class} ${s.section || ''}`,
            formatReportBranch(s.branch),
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
            <div className="flex flex-wrap gap-3 mb-6 px-4 items-center">
                <button
                    onClick={fetchReport}
                    className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Search Report
                </button>
                <div className="flex-grow"></div>
                <button
                    onClick={downloadExcel}
                    className="bg-white border border-slate-200 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Excel
                </button>
                <button
                    onClick={downloadPDF}
                    className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2 shadow-sm transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Export PDF
                </button>
            </div>

            {loading && <div className="text-center py-4">Loading...</div>}
            {error && <div className="text-red-500 text-center py-4">{error}</div>}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4 mb-8">
                <StatCard label="Total Students with Dues" value={String(filteredData.length)} />
                <StatCard label="Total Fee Demand" value={totalFee} />
                <StatCard label="Total Due Amount" value={totalDue} />
                <StatCard
                    label="Avg Due per Student"
                    value={`₹${(filteredData.length ? Math.round(totalDue / filteredData.length) : 0).toLocaleString('en-IN')}`}
                />
            </div>

            {/* Late Fee Due Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mx-4 mb-6">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-600">
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
                </div>
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
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm mt-4 mx-4 mb-6">
                    <h4 className="font-semibold mb-4 text-slate-800">Class-wise Due Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {Object.entries(
                            filteredData.reduce((acc: any, s) => {
                                const key = `${s.class} ${s.section || ''}`;
                                acc[key] = (acc[key] || 0) + (s.due_amount || 0);
                                return acc;
                            }, {})
                        ).map(([cls, amt]: any) => (
                            <div key={cls} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-xs text-slate-500 font-medium mb-1">{cls}</p>
                                <p className="font-bold text-red-600 text-lg">₹{Number(amt).toLocaleString('en-IN')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );


};
// --------------------------------------------------------------------------
// Search Student Report (NEW)
// --------------------------------------------------------------------------
export const SearchStudentReport: React.FC<ReportProps> = ({ onViewReceipt }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'name' | 'admission'>('admission');
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');

    // Edit Modal State
    const [editingReceipt, setEditingReceipt] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        mode: '',
        transaction_id: '',
        cheque_no: '',
        bank_name: '',
        cheque_date: '',
        date: ''
    });
    const [saving, setSaving] = useState(false);

    // Check admin role
    // NEW (Robust Detection)
    const getUserRole = (): string => {
        // Check direct keys
        const directRole = localStorage.getItem('userRole') ||
            localStorage.getItem('role') ||
            localStorage.getItem('user_role');
        if (directRole) return directRole.toLowerCase();

        // Check JSON user objects
        const possibleKeys = ['user', 'currentUser', 'authUser', 'userData', 'loggedInUser'];
        for (const key of possibleKeys) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    const role = parsed?.role || parsed?.userRole || parsed?.user_role;
                    if (role) return String(role).toLowerCase();
                }
            } catch {
                // Not JSON, skip
            }
        }

        // Try to decode JWT token
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('access_token') || localStorage.getItem('authToken');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const role = payload?.role || payload?.user_role;
                if (role) return String(role).toLowerCase();
            }
        } catch {
            // Invalid token
        }

        return '';
    };

    const userRole = getUserRole();
    const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin';

    // DEBUG: Remove after testing
    console.log('Detected user role:', userRole, '| isAdmin:', isAdmin);

    const paymentModes = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

    const currentBranch = localStorage.getItem('currentBranch') || '';
    const isAllBranches = !currentBranch ||
        currentBranch === 'All' ||
        currentBranch === 'All Branches' ||
        currentBranch === 'AllBranches' ||
        currentBranch.toLowerCase() === 'all' ||
        currentBranch.toLowerCase() === 'all branches';

    useEffect(() => {
        setStudents([]);
        setSelectedStudent(null);
        setReceipts([]);
        setError('');
    }, [currentBranch]);

    // Search students by name or admission no
    const handleSearch = async () => {
        const reqBranch = currentBranch;
        if (isAllBranches) {
            setError('Please select a specific branch. This screen won\'t work on All Branches level.');
            return;
        }
        if (!searchTerm.trim()) {
            alert('Please enter a search term');
            return;
        }
        try {
            setSearching(true);
            setError('');
            setStudents([]);
            setSelectedStudent(null);
            setReceipts([]);

            const params = new URLSearchParams({
                q: searchTerm.trim(),
                type: searchType
            });
            const res = await api.get(`/students/search?${params.toString()}`);
            if (reqBranch !== (localStorage.getItem('currentBranch') || '')) return;
            const list = res.data.students || res.data || [];
            setStudents(list);

            // Auto-select if exact match (admission no)
            if (list.length === 1) {
                handleSelectStudent(list[0]);
            } else if (list.length === 0) {
                setError('No students found');
            }
        } catch (err: any) {
            if (reqBranch !== (localStorage.getItem('currentBranch') || '')) return;
            setError(err.response?.data?.error || 'Failed to search students');
        } finally {
            if (reqBranch === (localStorage.getItem('currentBranch') || '')) {
                setSearching(false);
            }
        }
    };

    // Fetch receipts for selected student
    const handleSelectStudent = async (student: any) => {
        const reqBranch = currentBranch;
        try {
            setLoading(true);
            setSelectedStudent(student);
            setError('');

            const studentId = student.id || student.student_id;
            const res = await api.get(`/reports/fees/student-receipts/${studentId}`);
            if (reqBranch !== (localStorage.getItem('currentBranch') || '')) return;
            setReceipts(res.data.receipts || []);
        } catch (err: any) {
            if (reqBranch !== (localStorage.getItem('currentBranch') || '')) return;
            setError(err.response?.data?.error || 'Failed to fetch receipts');
            setReceipts([]);
        } finally {
            if (reqBranch === (localStorage.getItem('currentBranch') || '')) {
                setLoading(false);
            }
        }
    };

    // Open edit modal (admin only)
    const handleEditReceipt = (receipt: any) => {
        if (!isAdmin) {
            alert('Only admin can edit receipt details');
            return;
        }
        setEditingReceipt(receipt);
        setEditForm({
            mode: receipt.mode || 'Cash',
            transaction_id: receipt.transaction_id || '',
            cheque_no: receipt.cheque_no || '',
            bank_name: receipt.bank_name || '',
            cheque_date: receipt.cheque_date || '',
            date: receipt.date || ''
        });
    };

    // Save edited receipt
    const handleSaveEdit = async () => {
        if (!editingReceipt) return;
        try {
            setSaving(true);
            const targetStudentId = selectedStudent?.student_id || selectedStudent?.id || editingReceipt.student_id;
            const targetBranch = editingReceipt.branch || selectedStudent?.branch || currentBranch;
            const targetYear = editingReceipt.academic_year || localStorage.getItem('academicYear');
            const targetAdmNo = selectedStudent?.admission_no || selectedStudent?.adm_no || editingReceipt.admission_no;

            const payload: any = {
                mode: editForm.mode,
                date: editForm.date,
                student_id: targetStudentId,
                branch: targetBranch,
                academic_year: targetYear,
                admission_no: targetAdmNo
            };
            if (editForm.mode === 'Cheque') {
                payload.cheque_no = editForm.cheque_no;
                payload.bank_name = editForm.bank_name;
                payload.cheque_date = editForm.cheque_date;
                payload.transaction_id = '';
            } else if (editForm.mode === 'Cash') {
                payload.transaction_id = '';
            } else {
                payload.transaction_id = editForm.transaction_id;
            }

            await api.put(`/reports/fees/receipt/${editingReceipt.receipt_no}`, payload);

            // Refresh receipts
            if (selectedStudent) {
                await handleSelectStudent(selectedStudent);
            }
            setEditingReceipt(null);
            alert('Receipt updated successfully');
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update receipt');
        } finally {
            setSaving(false);
        }
    };

    const totalCollected = receipts.reduce((sum, r) => sum + Number(r.amount_paid || r.amount || 0), 0);

    return (
        <div className="space-y-4 font-sans">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded shadow-sm border border-gray-200 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Search By</label>
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value as 'name' | 'admission')}
                            disabled={isAllBranches}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                            <option value="admission">Admission Number</option>
                            <option value="name">Student Name</option>
                        </select>
                    </div>
                    <div className="md:col-span-7">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {searchType === 'admission' ? 'Admission Number' : 'Student Name'}
                        </label>
                        <input
                            type="text"
                            placeholder={isAllBranches ? 'Please select a specific branch from header first...' : (searchType === 'admission' ? 'e.g. HARG0001' : 'Enter student name...')}
                            value={searchTerm}
                            disabled={isAllBranches}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !isAllBranches && handleSearch()}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <button
                            onClick={handleSearch}
                            disabled={searching || isAllBranches}
                            className="w-full bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {searching ? 'Searching...' : '🔍 Search'}
                        </button>
                    </div>
                </div>

                {/* Warning banner when All Branches is selected */}
                {isAllBranches && (
                    <div className="mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <span className="font-semibold text-amber-900">Please select a specific branch:</span>{' '}
                            This screen won't work on "All Branches" level. Please select a specific branch from the header dropdown above to search students.
                        </div>
                    </div>
                )}
            </div>

            {error && <div className="text-red-500 text-center py-2 px-4">{error}</div>}

            {/* Student List (when multiple results) */}
            {students.length > 1 && !selectedStudent && (
                <div className="bg-white border rounded shadow-sm mx-4">
                    <h4 className="font-semibold p-3 border-b bg-gray-50">Select a Student ({students.length} found)</h4>
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-left">Adm No.</th>
                                <th className="px-3 py-2 text-left">Student Name</th>
                                <th className="px-3 py-2 text-left">Class</th>
                                <th className="px-3 py-2 text-left">Father Name</th>
                                <th className="px-3 py-2 text-left">Mobile</th>
                                <th className="px-3 py-2 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {students.map((s: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-blue-600 font-medium">{s.admission_no || s.adm_no}</td>
                                    <td className="px-3 py-2 font-medium">{s.name}</td>
                                    <td className="px-3 py-2">{s.class} {s.section}</td>
                                    <td className="px-3 py-2">{s.father_name || s.father || '-'}</td>
                                    <td className="px-3 py-2">{s.father_mobile || '-'}</td>
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => handleSelectStudent(s)}
                                            className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded text-xs"
                                        >
                                            View Receipts
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Selected Student Info */}
            {selectedStudent && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mx-4">
                    <div className="flex justify-between items-start">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
                            <div>
                                <p className="text-xs text-gray-500">Student Name</p>
                                <p className="font-semibold">{selectedStudent.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Admission No.</p>
                                <p className="font-semibold text-blue-700">{selectedStudent.admission_no || selectedStudent.adm_no}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Class</p>
                                <p className="font-semibold">{selectedStudent.class} {selectedStudent.section}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Father Name</p>
                                <p className="font-semibold">{selectedStudent.father_name || selectedStudent.father || '-'}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setSelectedStudent(null); setReceipts([]); }}
                            className="text-gray-500 hover:text-gray-700 ml-4"
                        >
                            ✕ Clear
                        </button>
                    </div>
                </div>
            )}

            {loading && <div className="text-center py-4">Loading receipts...</div>}

            {/* Receipts Summary */}
            {selectedStudent && !loading && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4">
                        <StatCard label="Total Receipts" value={receipts.length} color="blue" />
                        <StatCard label="Total Collected" value={totalCollected} color="green" />
                        <StatCard label="Edit Access" value={isAdmin ? 'Admin (Allowed)' : 'View Only'} color={isAdmin ? 'green' : 'orange'} />
                    </div>

                    {/* Receipts Table - Custom with Edit Button */}
                    {receipts.length === 0 ? (
                        <div className="bg-red-50 text-red-500 text-center py-8 border rounded mt-4 mx-4 font-medium">
                            No receipts found for this student
                        </div>
                    ) : (
                        <div className="bg-white border rounded shadow-sm overflow-x-auto mt-4 mx-4">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-gray-700">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">S.No</th>
                                        <th className="px-3 py-2 text-left font-semibold">Rcpt No</th>
                                        <th className="px-3 py-2 text-left font-semibold">Date/Time</th>
                                        <th className="px-3 py-2 text-left font-semibold">Fee Type</th>
                                        <th className="px-3 py-2 text-right font-semibold">Paid</th>
                                        <th className="px-3 py-2 text-right font-semibold">Due</th>
                                        <th className="px-3 py-2 text-left font-semibold">Mode</th>
                                        <th className="px-3 py-2 text-left font-semibold">Trans/Cheque</th>
                                        <th className="px-3 py-2 text-left font-semibold">Taken By</th>
                                        <th className="px-3 py-2 text-center font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {receipts.map((r: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                            <td className="px-3 py-2 font-medium text-blue-700">{r.receipt_no}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">
                                                {formatDateDDMMYYYY(r.date)}<br />
                                                <span className="text-gray-400">{r.time}</span>
                                            </td>
                                            <td className="px-3 py-2 max-w-[200px] truncate" title={r.fee_type_str}>{r.fee_type_str || '-'}</td>
                                            <td className="px-3 py-2 text-right font-bold">₹{(r.amount_paid || r.amount || 0).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-red-500">₹{(r.due_amount || 0).toLocaleString()}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${r.mode === 'Cash' ? 'bg-green-100 text-green-700' :
                                                    r.mode === 'UPI' ? 'bg-purple-100 text-purple-700' :
                                                        r.mode === 'Cheque' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {r.mode}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-xs max-w-[180px]">
                                                {r.mode === 'Cheque' ? (
                                                    <div>
                                                        <div>{r.cheque_no || '-'}</div>
                                                        <div className="text-gray-400">{r.bank_name || '-'}</div>
                                                    </div>
                                                ) : (
                                                    <div className="truncate" title={r.transaction_id}>{r.transaction_id || '-'}</div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">{r.collected_by}</td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex gap-1 justify-center">
                                                    <button
                                                        onClick={() => onViewReceipt(r.receipt_no, r.branch || selectedStudent?.branch, r.student_id || selectedStudent?.id || selectedStudent?.student_id)}
                                                        className="text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded text-xs"
                                                    >
                                                        View
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleEditReceipt(r)}
                                                            className="text-white bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded text-xs"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-100 font-bold">
                                    <tr>
                                        <td colSpan={4} className="px-3 py-2 text-right">Total:</td>
                                        <td className="px-3 py-2 text-right">₹{totalCollected.toLocaleString()}</td>
                                        <td colSpan={5}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Edit Modal */}
            {editingReceipt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">
                                Edit Receipt: {editingReceipt.receipt_no}
                            </h3>
                            <button
                                onClick={() => setEditingReceipt(null)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Read-only info */}
                            <div className="bg-gray-50 p-3 rounded text-sm border">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-gray-500">Student:</span>
                                        <p className="font-semibold">{selectedStudent?.name}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Amount Paid:</span>
                                        <p className="font-semibold text-green-700">
                                            ₹{(editingReceipt.amount_paid || editingReceipt.amount || 0).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Editable: Date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Payment Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={editForm.date ? (
                                        /^\d{2}-\d{2}-\d{4}$/.test(editForm.date)
                                            ? editForm.date.split('-').reverse().join('-')
                                            : editForm.date.split('T')[0]
                                    ) : ''}
                                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                    className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                />
                            </div>

                            {/* Editable: Mode */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Payment Mode <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={editForm.mode}
                                    onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
                                    className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                >
                                    {paymentModes.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Conditional fields based on mode */}
                            {editForm.mode === 'Cheque' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cheque No.</label>
                                        <input
                                            type="text"
                                            value={editForm.cheque_no}
                                            onChange={(e) => setEditForm({ ...editForm, cheque_no: e.target.value })}
                                            className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                                        <input
                                            type="text"
                                            value={editForm.bank_name}
                                            onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}
                                            className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Cheque Date</label>
                                        <input
                                            type="date"
                                            value={editForm.cheque_date ? (
                                                /^\d{2}-\d{2}-\d{4}$/.test(editForm.cheque_date)
                                                    ? editForm.cheque_date.split('-').reverse().join('-')
                                                    : editForm.cheque_date.split('T')[0]
                                            ) : ''}
                                            onChange={(e) => setEditForm({ ...editForm, cheque_date: e.target.value })}
                                            className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                        />
                                    </div>
                                </>
                            ) : editForm.mode !== 'Cash' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
                                    <input
                                        type="text"
                                        value={editForm.transaction_id}
                                        onChange={(e) => setEditForm({ ...editForm, transaction_id: e.target.value })}
                                        className="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                    />
                                </div>
                            ) : null}

                            <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-xs text-yellow-800">
                                ⚠️ Only Payment Date, Mode, and Transaction/Cheque details can be edited. Amount, Fee Type, and Student details are non-editable.
                            </div>
                        </div>

                        <div className="p-4 border-t flex gap-2 justify-end bg-gray-50">
                            <button
                                onClick={() => setEditingReceipt(null)}
                                disabled={saving}
                                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="px-4 py-2 text-sm bg-indigo-700 text-white rounded hover:bg-indigo-800 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
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
    LateFeeDueReport,
    SearchStudentReport
};
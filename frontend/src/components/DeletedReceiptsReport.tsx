import React, { useState, useEffect } from 'react';
import api from '../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatReportBranch, getReportHeaderBranch } from '../utils/branchHelper';

const formatDateDDMMYYYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return '-';
    try {
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const datePart = dateStr.split('T')[0];
            const [year, month, day] = datePart.split('-');
            return `${day}-${month}-${year}`;
        }
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        }
        return dateStr;
    } catch {
        return dateStr || '-';
    }
};

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

const DeletedReceiptsReport: React.FC = () => {
    const [receipts, setReceipts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(15);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/reports/fees/deleted-receipts`);
            setReceipts(res.data.receipts || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load deleted receipts');
        } finally {
            setLoading(false);
        }
    };

    const filteredReceipts = receipts.filter(r =>
        (r.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.admission_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.receipt_no || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
    const paginatedReceipts = filteredReceipts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );


    const exportToExcel = () => {
        if (filteredReceipts.length === 0) return alert('No data to export');
        const data = filteredReceipts.map((r, idx) => ({
            'S.No': idx + 1,
            'Student Name': r.student_name,
            'Adm No.': r.admission_no,
            'Class': `${r.class} ${r.section}`,
            'Branch': formatReportBranch(r.branch),
            'Rcpt No': r.receipt_no,
            'Fee Type': r.fee_type_str,
            'Amount': r.amount_paid,
            'Mode': r.mode,
            'Payment Date': formatDateDDMMYYYY(r.date || r.payment_date),
            'Created Date': formatDateDDMMYYYY(r.created_date || r.created_at),
            'Deleted By': r.deleted_by,
            'Deleted At': r.deleted_at,
            'Cancel Reason': r.cancel_reason
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Deleted_Receipts");
        XLSX.writeFile(wb, "Deleted_Receipts_Report.xlsx");
    };

    const exportToPDF = () => {
        if (filteredReceipts.length === 0) return alert('No data to export');
        const doc = new jsPDF("l", "mm", "a4");
        doc.setFontSize(16);
        doc.text(`${getReportHeaderBranch()} - Deleted Receipts Report`, 14, 15);

        const tableColumn = ["S.No", "Student Name", "Adm No.", "Class", "Branch", "Rcpt No", "Fee Type", "Amount", "Mode", "Payment Date", "Created Date", "Deleted By", "Deleted At", "Reason"];
        const tableRows = filteredReceipts.map((r, idx) => [
            idx + 1,
            r.student_name,
            r.admission_no,
            `${r.class} ${r.section}`,
            formatReportBranch(r.branch),
            r.receipt_no,
            r.fee_type_str,
            r.amount_paid,
            r.mode,
            formatDateDDMMYYYY(r.date || r.payment_date),
            formatDateDDMMYYYY(r.created_date || r.created_at),
            r.deleted_by,
            r.deleted_at,
            r.cancel_reason
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 7 }
        });
        doc.save("Deleted_Receipts_Report.pdf");
    };

    return (
        <div className="container mx-auto p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <span className="bg-red-100 text-red-600 p-2 rounded mr-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </span>
                Deleted Receipts Report
            </h2>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-4">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                    <div className="w-full md:w-1/3">
                        <input
                            type="text"
                            placeholder="Search by Student, Adm No, Receipt No..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex gap-2 mt-2 md:mt-0">
                        <button onClick={exportToExcel} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Excel
                        </button>
                        <button onClick={exportToPDF} className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            PDF
                        </button>
                        <button onClick={fetchReport} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                            Refresh
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading deleted receipts...</div>
                ) : error ? (
                    <div className="text-center py-8 text-red-500">{error}</div>
                ) : filteredReceipts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No deleted receipts found.</div>
                ) : (
                    <div className="w-full">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-gray-700">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">S.No</th>
                                        <th className="px-3 py-2 text-left font-semibold">Student Name</th>
                                        <th className="px-3 py-2 text-left font-semibold">Adm No.</th>
                                        <th className="px-3 py-2 text-left font-semibold">Class</th>
                                        <th className="px-3 py-2 text-left font-semibold">Branch</th>
                                        <th className="px-3 py-2 text-left font-semibold">Rcpt No</th>
                                        <th className="px-3 py-2 text-left font-semibold">Fee Type</th>
                                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                                        <th className="px-3 py-2 text-left font-semibold">Mode</th>
                                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Payment Date</th>
                                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Created Date</th>
                                        <th className="px-3 py-2 text-left font-semibold">Deleted By</th>
                                        <th className="px-3 py-2 text-left font-semibold">Deleted At</th>
                                        <th className="px-3 py-2 text-left font-semibold">Cancel Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedReceipts.map((r, idx) => {
                                        const sNo = ((currentPage - 1) * itemsPerPage) + idx + 1;
                                        return (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{sNo}</td>
                                                <td className="px-3 py-2 font-medium">{r.student_name}</td>
                                                <td className="px-3 py-2 text-blue-600">{r.admission_no}</td>
                                                <td className="px-3 py-2">{r.class} {r.section}</td>
                                                <td className="px-3 py-2 text-gray-600">{formatReportBranch(r.branch)}</td>
                                                <td className="px-3 py-2">{r.receipt_no}</td>
                                                <td className="px-3 py-2 truncate max-w-[150px]" title={r.fee_type_str}>{r.fee_type_str || '-'}</td>
                                                <td className="px-3 py-2 text-right font-medium text-gray-800">₹{(r.amount_paid || 0).toLocaleString()}</td>
                                                <td className="px-3 py-2">{r.mode}</td>
                                                <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{formatDateDDMMYYYY(r.date || r.payment_date)}</td>
                                                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDateDDMMYYYY(r.created_date || r.created_at)}</td>
                                                <td className="px-3 py-2 font-semibold text-red-600">{r.deleted_by}</td>
                                                <td className="px-3 py-2 text-xs text-gray-500">{r.deleted_at}</td>
                                                <td className="px-3 py-2 text-xs truncate max-w-[200px] text-gray-600" title={r.cancel_reason}>{r.cancel_reason}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            totalRecords={filteredReceipts.length}
                            perPage={itemsPerPage}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeletedReceiptsReport;

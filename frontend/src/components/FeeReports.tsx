import React, { useState } from 'react';
import {
    TodayCollection,
    DailyReport,
    MonthlyReport,
    ClassWiseReport,
    InstallmentWiseReport,
    DueReport,
    LateFeeDueReport,
    SearchStudentReport
} from './FeeReportComponents';
import FeeReceipt from './FeeReceipt';
import api from '../api';

interface FeeReportsProps {
    singleDailyMode?: boolean;
}

const FeeReports: React.FC<FeeReportsProps> = ({ singleDailyMode }) => {
    const [activeTab, setActiveTab] = useState(singleDailyMode ? 'daily' : 'today');
    const [receiptData, setReceiptData] = useState<any>(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);
    const [error, setError] = useState('');

    const handleViewReceipt = async (receiptNo: string, branch?: string, studentIdParam?: number) => {
        try {
            setLoadingReceipt(true);
            setError('');

            // 1. Fetch the raw receipt data (flat list of payments)
            const params: any = {};
            if (branch && branch !== 'All' && branch !== 'All Branches' && branch !== 'All Locations') {
                params.branch = branch;
            }
            if (studentIdParam) {
                params.student_id = studentIdParam;
            }
            const res = await api.get(`/reports/fees/receipt/${receiptNo}`, { params });
            const payments = res.data.items || [];

            if (payments.length === 0) {
                alert("No items found in this receipt.");
                return;
            }

            const studentId = payments[0].student_id;

            // 2. Fetch Student Installments to get SR mapping (Critical for grouping)
            // We need this to know that "April Fee" is SR 1, "May Fee" is SR 2, etc.
            let installments = [];
            try {
                // Determine branch from local storage or cached student data if possible. 
                // For reports, we might not know the student's current branch easily if they transferred.
                // However, the payment record has branch info.
                const branch = payments[0].branch || 'All';
                const branchParam = branch === "All Branches" || branch === "All" ? "All" : branch;

                const instRes = await api.get(`/fees/student-details/${studentId}?branch=${branchParam}`);
                installments = instRes.data.installments || [];
            } catch (instErr) {
                console.error("Failed to fetch student installments for grouping:", instErr);
                // Fallback: Code will run with SR=0 and result in individual lines (safe degradation)
            }

            // 3. Enrich Payments with SR
            const enrichedPayments = payments.map((p: any) => {
                // Match by title (flexible match for "March" vs "March Fee")
                const match = installments.find((i: any) => i.title === p.installment || i.title === `${p.installment} Fee`);
                return {
                    ...p,
                    sr: match ? match.sr : 0
                };
            });

            // 4. Group Items
            const groupedItems = groupInstallments(enrichedPayments);

            // 5. Calculate Totals based on the raw payments to ensure accuracy
            const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount_paid), 0);
            const totalConcession = payments.reduce((sum: number, p: any) => sum + parseFloat(p.concession_amount), 0);
            const totalGross = payments.reduce((sum: number, p: any) => sum + parseFloat(p.gross_amount || 0), 0) || (totalPaid + totalConcession);

            // For historical receipts, "due" matches the snapshot at that time usually, or 0 if paid. 
            // The receipt displays the CURRENT due for the student usually, or the due for those specific items?
            // In TakeFee, 'due' is the remaining balance on the receipt items? No, usually total student due.
            // Let's stick to the Receipt Data's total due if available, or 0.
            const totalDue = payments.reduce((sum: number, p: any) => sum + parseFloat(p.due_amount || 0), 0);

            // 6. Construct Receipt Data object
            const formattedData = {
                studentName: res.data.studentName || payments[0]?.name, // Prefer API root property
                fatherName: res.data.fatherName || payments[0]?.fatherName,
                fatherPhone: res.data.fatherPhone || payments[0]?.fatherPhone,
                admissionNo: res.data.admissionNo || payments[0]?.admNo,
                branch: res.data.branch || payments[0]?.branch,
                className: res.data.className || payments[0]?.class,
                receiptNo: receiptNo,
                paymentDate: res.data.paymentDate || payments[0]?.payment_date,
                paymentMode: res.data.paymentMode || payments[0]?.mode,
                paymentNote: res.data.paymentNote || "",
                items: groupedItems.map((g, i) => ({
                    title: g.title,
                    payable: g.payable
                })),
                amount: totalGross,
                concession: totalConcession,
                payable: totalGross - totalConcession,
                paid: totalPaid,
                due: totalDue
            };

            setReceiptData(formattedData);
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.error || 'Failed to load receipt');
        } finally {
            setLoadingReceipt(false);
        }
    };

    const tabs = [
        { id: 'today', label: "Today's Collection" },
        { id: 'daily', label: 'Daily Report' },
        { id: 'monthly', label: 'Monthly Report' },
        { id: 'class', label: 'Class Wise' },
        { id: 'installment', label: 'Installment Wise' },
        { id: 'due', label: 'Due Report' },
        { id: 'late-due', label: 'Late Fee Due' },
        { id: 'search', label: 'Search Student' }

    ];

    return (
        <div className="container mx-auto p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <span className="bg-violet-100 text-violet-600 p-2 rounded mr-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </span>
                {singleDailyMode ? 'Daily Report' : 'Fee Reports'}
            </h2>

            {/* Tabs */}
            {!singleDailyMode && (
                <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab.id
                                ? 'bg-violet-600 text-white shadow-md'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="bg-white rounded-lg shadow-sm min-h-[400px]">
                {singleDailyMode ? (
                    <DailyReport onViewReceipt={handleViewReceipt} singleDayOnly={true} />
                ) : (
                    <>
                        {activeTab === 'today' && <TodayCollection onViewReceipt={handleViewReceipt} />}
                        {activeTab === 'daily' && <DailyReport onViewReceipt={handleViewReceipt} />}
                        {activeTab === 'monthly' && <MonthlyReport onViewReceipt={handleViewReceipt} />}
                        {activeTab === 'class' && <ClassWiseReport onViewReceipt={handleViewReceipt} />}
                        {activeTab === 'installment' && <InstallmentWiseReport onViewReceipt={handleViewReceipt} />}
                        {activeTab === 'due' && <DueReport />}
                        {activeTab === 'late-due' && <LateFeeDueReport />}
                        {activeTab === 'search' && <SearchStudentReport onViewReceipt={handleViewReceipt} />}
                    </>
                )}
            </div>

            {/* Receipt Modal */}
            {loadingReceipt && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
                    <div className="bg-white p-4 rounded shadow">Loading Receipt...</div>
                </div>
            )}

            {receiptData && (
                <FeeReceipt
                    receiptData={receiptData}
                    onClose={() => setReceiptData(null)}
                />
            )}
        </div>
    );
};

// --- Helper Functions (Duplicated from TakeFee.tsx for consistency) ---

const groupInstallments = (items: any[]) => {
    const installmentFees = items.filter(i => i.installment && i.installment !== "One-Time" && i.installment !== "None");
    const otherFees = items.filter(i => !i.installment || i.installment === "One-Time" || i.installment === "None");

    const groups: any[] = [];
    const byType: Record<string, any[]> = {};

    installmentFees.forEach(i => {
        const type = i.fee_type || "Tuition Fee";
        if (!byType[type]) byType[type] = [];
        byType[type].push(i);
    });

    Object.keys(byType).forEach(type => {
        // Sort by sr
        const sorted = byType[type].sort((a, b) => (a.sr || 0) - (b.sr || 0));
        if (sorted.length === 0) return;

        let currentGroup = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prev = currentGroup[currentGroup.length - 1];
            const curr = sorted[i];
            const prevSr = prev.sr || 0;
            const currSr = curr.sr || 0;

            if (prevSr > 0 && currSr > 0 && currSr === prevSr + 1) {
                currentGroup.push(curr);
            } else {
                groups.push(createGroupedItem(type, currentGroup));
                currentGroup = [curr];
            }
        }
        if (currentGroup.length > 0) {
            groups.push(createGroupedItem(type, currentGroup));
        }
    });

    otherFees.forEach(f => {
        groups.push({
            title: f.fee_type === "General" ? "One-Time Fee" : f.fee_type,
            amount: parseFloat(f.amount_paid),
            payable: parseFloat(f.gross_amount || f.amount_paid),
            originalItems: [f]
        });
    });

    return groups;
};

const createGroupedItem = (type: string, items: any[]) => {
    const start = items[0].installment.replace(" Fee", "");
    const end = items[items.length - 1].installment.replace(" Fee", "");

    let title = `${type} - ${start} Fee`;
    if (items.length > 1) {
        title = `Payment for ${start} Fee to ${end} Fee`;
    }

    const totalPaid = items.reduce((sum: number, i: any) => sum + parseFloat(i.amount_paid), 0);
    const totalGross = items.reduce((sum: number, i: any) => sum + parseFloat(i.gross_amount || i.amount_paid), 0);

    return {
        title,
        amount: totalPaid,
        payable: totalGross,
        originalItems: items
    };
};

export default FeeReports;

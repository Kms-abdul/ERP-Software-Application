import React, { useState } from 'react';
import { DailyReport } from './FeeReportComponents';
import FeeReceipt from './FeeReceipt';
import api from '../api';

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

const AdjustFeeReport: React.FC = () => {
    const [receiptData, setReceiptData] = useState<any>(null);
    const [loadingReceipt, setLoadingReceipt] = useState(false);

    const handleViewReceipt = async (receiptNo: string, branch?: string, studentIdParam?: number) => {
        try {
            setLoadingReceipt(true);
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
            let installments = [];
            try {
                const branch = payments[0].branch || 'All';
                const branchParam = branch === "All Branches" || branch === "All" ? "All" : branch;
                const instRes = await api.get(`/fees/student-details/${studentId}?branch=${branchParam}`);
                installments = instRes.data.installments || [];
            } catch (instErr) {
                console.error("Failed to fetch student installments for grouping:", instErr);
            }

            const enrichedPayments = payments.map((p: any) => {
                const match = installments.find((i: any) => i.title === p.installment || i.title === `${p.installment} Fee`);
                return {
                    ...p,
                    sr: match ? match.sr : 0
                };
            });

            const groupedItems = groupInstallments(enrichedPayments);

            const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount_paid), 0);
            const totalConcession = payments.reduce((sum: number, p: any) => sum + parseFloat(p.concession_amount), 0);
            const totalGross = payments.reduce((sum: number, p: any) => sum + parseFloat(p.gross_amount || 0), 0) || (totalPaid + totalConcession);
            const totalDue = payments.reduce((sum: number, p: any) => sum + parseFloat(p.due_amount || 0), 0);

            const formattedData = {
                studentName: res.data.studentName || payments[0]?.name,
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

    return (
        <div className="container mx-auto p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <span className="bg-blue-100 text-blue-600 p-2 rounded mr-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                </span>
                Adjust Fee Report
            </h2>

            <div className="bg-white rounded-lg shadow-sm min-h-[400px] p-8 text-center text-gray-500 flex items-center justify-center">
                <div>
                    <h3 className="text-xl font-medium mb-2">Adjust Fee Report</h3>
                    <p>This report will display fee adjustment records. (Pending explicit backend data mapping)</p>
                </div>
            </div>

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

export default AdjustFeeReport;

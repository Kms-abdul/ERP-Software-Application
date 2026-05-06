import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { TrashIcon, PrinterIcon } from './icons';
import FeeReceipt from './FeeReceipt';
import { Page } from '../App';

// Removed monthOrder in favor of Sr based dynamic grouping

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
            concession: parseFloat(f.concession_amount),
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
    const totalConcession = items.reduce((sum: number, i: any) => sum + parseFloat(i.concession_amount), 0);
    const totalGross = items.reduce((sum: number, i: any) => sum + parseFloat(i.gross_amount || i.amount_paid), 0);

    return {
        title,
        amount: totalPaid,
        concession: totalConcession,
        payable: totalGross,
        originalItems: items
    };
};

interface FeeStudent {
    student_id: number;
    name: string;
    admNo: string;
    class: string;
    section: string;
    total_fee: number;
    paid_amount: number;
    concession: number;
    balance: number;
    status: string;
    fatherName: string;
    fatherPhone: string | number;
    branch: string;
}

interface FeeInstallment {
    sr: number;
    title: string;
    payable: number;
    paid: boolean;
    paidAmount?: number;
    dueAmount?: number;
    paymentDate?: string;
    student_fee_id?: number;
    fee_type_id?: number;
    month?: string;
    concession?: number;
    due_date?: string;
}

interface ConcessionItem {
    fee_type_id: number;
    fee_type_name: string;
    percentage: number;
}

interface Concession {
    title: string;
    description: string;
    academic_year: string;
    is_percentage: boolean;
    show_in_payment?: boolean;
    items: ConcessionItem[];
}

const InfoCard: React.FC<{
    title: string;
    value: string;
    bgColor: string;
    textColor: string;
    icon: React.ReactNode;
}> = ({ title, value, bgColor, textColor, icon }) => (
    <div className={`p-2 rounded-lg text-center ${bgColor}`}>
        <p className={`text-xs font-semibold ${textColor}`}>{title}</p>
        <div className="flex items-center justify-center space-x-1">
            {icon}
            <p className={`font-bold text-lg ${textColor}`}>{value}</p>
        </div>
    </div>
);

const InstallmentRow: React.FC<{
    installment: FeeInstallment;
    isSelected: boolean;
    onSelect: (sr: number) => void;
    isDisabled: boolean;
}> = ({ installment, isSelected, onSelect, isDisabled }) => {
    const { sr, title, payable, paid, paidAmount, dueAmount, concession } = installment;

    const due = dueAmount !== undefined ? dueAmount : (payable - (paidAmount || 0));
    const isPartial = !paid && (paidAmount || 0) > 0;
    const isFullyPaid = paid || due <= 0;

    let details = `Payable = ${payable}`;
    if (concession && concession > 0) {
        details += `, Concession = ${concession}`;
    }

    let rowClass = "bg-white hover:bg-gray-50";

    if (isFullyPaid) {
        details = `Payable = ${payable}`;
        if (concession && concession > 0) details += `, Concession = ${concession}`;
        details += `, Paid = ${paidAmount || (payable - (concession || 0))}, Due = 0`;
        rowClass = "bg-green-100 text-green-800 hover:bg-green-200";
    } else if (isPartial) {
        details = `Payable = ${payable}`;
        if (concession && concession > 0) details += `, Concession = ${concession}`;
        details += `, Paid = ${paidAmount}, Due = ${due}`;
        rowClass = "bg-red-50 text-red-800 hover:bg-red-100";
    } else if (due > 0) {
        details = `Payable = ${payable}`;
        if (concession && concession > 0) details += `, Concession = ${concession}`;
        details += `, Due = ${due}`;
        rowClass = "bg-red-50 text-red-800 hover:bg-red-100";
    }

    if (isSelected) {
        rowClass += " bg-violet-100";
    }

    if (isDisabled) {
        rowClass += " opacity-50 cursor-not-allowed";
    }

    return (
        <tr className={rowClass}>
            <td className="border px-2 py-2 text-center">
                {isFullyPaid ? (
                    <span className="text-green-600 font-bold">✔</span>
                ) : (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => !isDisabled && onSelect(sr)}
                        disabled={isDisabled}
                        className="h-4 w-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                )}
            </td>
            <td className="border px-2 py-2 text-center text-sm text-gray-600">{sr}</td>
            <td className="border px-2 py-2 text-sm text-gray-800">{title}</td>
            <td className="border px-2 py-2 text-xs text-gray-500">{details}</td>
        </tr>
    );
};

const TakeFee: React.FC<{ navigateTo?: (page: Page) => void }> = () => {
    const [students, setStudents] = useState<FeeStudent[]>([]);
    const [classes, setClasses] = useState<string[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // ─── Role-Based Access Control ───────────────────────────────────────────────
    // Reads the user role from localStorage (set during login).
    // Only users with role "admin" can cancel/delete receipts.
    let isAdmin = false;
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        isAdmin = user.role === 'Admin';
    } catch {
        // Malformed JSON in localStorage; default to non-admin
    }
    // ─────────────────────────────────────────────────────────────────────────────
    const selectedStudent = useMemo(
        () => students.find(s => s.student_id === selectedStudentId),
        [students, selectedStudentId]
    );

    const [installments, setInstallments] = useState<FeeInstallment[]>([]);
    const [summary, setSummary] = useState({ totalPaids: 0, totalDue: 0, currentDue: 0 });

    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedConcession, setSelectedConcession] = useState('0');
    const [appliedConcession, setAppliedConcession] = useState(0);
    const [itemConcessions, setItemConcessions] = useState<Record<number, number>>({});
    const [paidInput, setPaidInput] = useState('0');

    const [concessions, setConcessions] = useState<Concession[]>([]);
    const [feeTypes, setFeeTypes] = useState<{ id: number; fee_type: string }[]>([]);
    const [selectedFeeType, setSelectedFeeType] = useState('');

    const [showHistory, setShowHistory] = useState(false);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
    const [showCancelled, setShowCancelled] = useState(false);

    const fetchPaymentHistory = async () => {
        if (!selectedStudent) return;
        try {
            const response = await api.get(
                `/fees/payments/${selectedStudent.student_id}?show_cancelled=${showCancelled}`
            );
            setPaymentHistory(response.data);
            setShowHistory(true);
        } catch (error) {
            console.error("Error fetching payment history:", error);
            alert("Failed to fetch payment history.");
        }
    };

    useEffect(() => {
        if (showHistory) {
            fetchPaymentHistory();
        }
    }, [showCancelled]);

    const handleDeleteReceipt = async (receiptNo: string) => {
        // Guard: only admins can cancel receipts
        if (!isAdmin) {
            alert("Access Denied: Only administrators are allowed to cancel receipts.");
            return;
        }

        if (
            !window.confirm(
                "Are you sure you want to cancel this ENTIRE RECEIPT? This will revert all associated fee payments."
            )
        )
            return;

        const reason = prompt("Please enter a valid reason for cancellation:");
        if (!reason || reason.trim() === "") {
            alert("Cancellation aborted. Reason is required.");
            return;
        }

        const paymentsToDelete = paymentHistory.filter(p => p.receipt_no === receiptNo);

        try {
            for (const p of paymentsToDelete) {
                await api.delete(`/fees/payment/${p.payment_id}`, {
                    data: { reason }
                });
            }

            alert("Receipt cancelled successfully.");
            fetchPaymentHistory();

            if (selectedStudent) {
                const globalBranch = localStorage.getItem('currentBranch') || 'All';
                const branchParam =
                    globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
                const response = await api.get(
                    `/fees/student-details/${selectedStudent.student_id}?branch=${branchParam}`
                );
                setInstallments(response.data.installments || []);
            }
        } catch (error: any) {
            console.error("Error deleting receipt:", error);
            alert(error.response?.data?.error || "Failed to delete receipt.");
        }
    };

    const handlePrintHistoryReceipt = (receiptNo: string) => {
        const payments = paymentHistory.filter(p => p.receipt_no === receiptNo);
        if (payments.length === 0) return;

        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
        const totalConcession = payments.reduce((sum, p) => sum + parseFloat(p.concession_amount), 0);
        const totalGross =
            payments.reduce((sum, p) => sum + parseFloat(p.gross_amount || 0), 0) ||
            totalPaid + totalConcession;
        const totalDue = payments.reduce((sum, p) => sum + parseFloat(p.due_amount || 0), 0);
        const netPayable = totalGross - totalConcession;

        const enrichedPayments = payments.map(p => {
            const match = installments.find(
                i => i.title === p.installment || i.title === `${p.installment} Fee`
            );
            return { ...p, sr: match ? match.sr : 0 };
        });

        const groupedItems = groupInstallments(enrichedPayments);

        const items = groupedItems.map((g, index) => ({
            sr: index + 1,
            title: g.title,
            payable: g.payable,
            dueAmount: 0,
            paidAmount: g.amount,
            concession: g.concession,
            paid: true
        }));

        const data = {
            studentName: selectedStudent?.name,
            fatherName: selectedStudent?.fatherName,
            fatherPhone: selectedStudent?.fatherPhone,
            admissionNo: selectedStudent?.admNo,
            branch: selectedStudent?.branch,
            className: selectedStudent?.class,
            receiptNo: receiptNo,
            paymentDate: payments[0].payment_date,
            paymentMode: payments[0].mode,
            paymentNote: "",
            items,
            amount: totalGross,
            concession: totalConcession,
            payable: netPayable,
            paid: totalPaid,
            due: totalDue
        };

        setReceiptData(data);
        setShowReceipt(true);
    };

    const filteredInstallments = useMemo(() => {
        if (!selectedFeeType) return [];
        return installments.filter(i => i.fee_type_id === Number(selectedFeeType));
    }, [installments, selectedFeeType]);

    useEffect(() => {
        const fetchFeeTypes = async () => {
            try {
                const response = await api.get('/fee-types');
                const data = response.data.fee_types || response.data;
                setFeeTypes(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("Error fetching fee types:", error);
            }
        };
        fetchFeeTypes();
    }, []);

    const handleFeeTypeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const feeTypeIdStr = e.target.value;
        setSelectedFeeType(feeTypeIdStr);

        if (!feeTypeIdStr || !selectedStudent) return;

        const feeTypeId = Number(feeTypeIdStr);
        const exists = installments.some(i => i.fee_type_id === feeTypeId);
        if (exists) return;

        alert("This fee type is not assigned to the student.");
    };
    useEffect(() => {
        const fetchConcessions = async () => {
            try {
                const response = await api.get('/concessions');
                setConcessions(response.data.concessions);
            } catch (error) {
                console.error('Error fetching concessions:', error);
            }
        };
        fetchConcessions();
    }, []);

    const [showReceipt, setShowReceipt] = useState(false);
    const [receiptData, setReceiptData] = useState<any>(null);
    const [schoolReceiptNo, setSchoolReceiptNo] = useState('');
    const [paymentNote, setPaymentNote] = useState('');
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [transactionId, setTransactionId] = useState('');
    const [transactionIdDescription, setTransactionIdDescription] = useState('');
    const [chequeNo, setChequeNo] = useState('');
    const [bankName, setBankName] = useState('');
    const [chequeDate, setChequeDate] = useState('');

    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const response = await api.get('/classes');
                const classNames: string[] = response.data.classes.map((c: any) => String(c.class_name));
                setClasses([...new Set(classNames)]);
            } catch (error) {
                console.error('Error fetching classes:', error);
            }
        };
        fetchClasses();
    }, []);

    useEffect(() => {
        const fetchSections = async () => {
            if (!selectedClass) {
                setSectionOptions([]);
                setSelectedSection('');
                return;
            }
            try {
                const branch = localStorage.getItem('currentBranch') || 'All';
                const academicYear = localStorage.getItem('academicYear') || '';
                const response = await api.get('/sections', {
                    params: { class: selectedClass, branch, academic_year: academicYear }
                });
                setSectionOptions(response.data.sections || []);
            } catch (error) {
                console.error('Error fetching sections:', error);
                setSectionOptions([]);
            }
        };
        fetchSections();
    }, [selectedClass]);

    useEffect(() => {
        const fetchStudents = async () => {
            try {
                const params = new URLSearchParams();
                if (selectedClass) params.append('class', selectedClass);
                if (selectedSection) params.append('section', selectedSection);
                if (searchTerm) params.append('search', searchTerm);

                const globalBranch = localStorage.getItem('currentBranch') || 'All';
                params.append(
                    "branch",
                    globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch
                );
                const response = await api.get(`/fees/students?${params.toString()}`);
                const { data } = response;
                setStudents(Array.isArray(data) ? data : data.students || []);
            } catch (error) {
                console.error('Error fetching students:', error);
                setStudents([]);
            }
        };
        fetchStudents();
    }, [selectedClass, selectedSection, searchTerm]);

    useEffect(() => {
        const fetchInstallments = async () => {
            if (selectedStudent) {
                try {
                    const globalBranch = localStorage.getItem('currentBranch') || 'All';
                    const branchParam =
                        globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
                    const response = await api.get(
                        `/fees/student-details/${selectedStudent.student_id}?branch=${branchParam}`
                    );
                    setInstallments(response.data.installments || []);
                } catch (error) {
                    console.error('Error fetching installments:', error);
                    setInstallments([]);
                }
            } else {
                setInstallments([]);
            }
            handleReset();
            setSelectedConcession('0');
            setAppliedConcession(0);
            setItemConcessions({});
            setShowCancelled(false);
        };
        fetchInstallments();
    }, [selectedStudent]);

    useEffect(() => {
        if (!installments || installments.length === 0) {
            setSummary({ totalPaids: 0, totalDue: 0, currentDue: 0 });
            return;
        }
        const paids = installments
            .filter(i => i.paid)
            .reduce((sum, i) => sum + (i.paidAmount || i.payable), 0);
        const dues = installments.filter(i => !i.paid);
        const totalDue = dues.reduce((sum, i) => sum + i.payable, 0);
        const currentDue = dues.length > 0 ? dues[0].payable : 0;
        setSummary({ totalPaids: paids, totalDue, currentDue });
    }, [installments]);

    const handleSelect = (sr: number) => {
        setSelectedIds(prev => {
            const isCurrentlySelected = prev.includes(sr);
            if (isCurrentlySelected) {
                return prev.filter(id => id < sr);
            } else {
                return [...prev, sr].sort((a, b) => a - b);
            }
        });
    };

    const handleApplyConcession = () => {
        if (selectedConcession === '0') {
            setAppliedConcession(0);
            setItemConcessions({});
            return;
        }

        const concession = concessions.find(c => c.title === selectedConcession);
        if (!concession) {
            setAppliedConcession(0);
            setItemConcessions({});
            return;
        }

        let totalDiscount = 0;
        const newItemConcessions: Record<number, number> = {};
        const selectedItemsList = installments.filter(i => selectedIds.includes(i.sr));
        const skippedItems: string[] = [];

        for (const item of selectedItemsList) {
            const rule = concession.items.find(i => i.fee_type_id === item.fee_type_id);
            if (rule) {
                if ((item.concession || 0) > 0) continue;
                if (item.due_date && paymentDate > item.due_date) {
                    skippedItems.push(`${item.title} (Due: ${item.due_date})`);
                    continue;
                }
                const amountToPay =
                    item.dueAmount !== undefined && item.dueAmount > 0 ? item.dueAmount : item.payable;
                let discount = 0;
                if (concession.is_percentage) {
                    discount = amountToPay * (rule.percentage / 100);
                } else {
                    discount = Math.min(amountToPay, rule.percentage);
                }
                discount = Math.round(discount);
                newItemConcessions[item.sr] = discount;
                totalDiscount += discount;
            }
        }

        setItemConcessions(newItemConcessions);
        setAppliedConcession(totalDiscount);

        if (skippedItems.length > 0) {
            alert(
                `Concession was NOT applied to the following installments because the Payment Date (${paymentDate}) is after the Due Date:\n\n- ${skippedItems.join('\n- ')}`
            );
        }
    };

    const selectedItems = installments.filter(i => selectedIds.includes(i.sr));

    const amount = selectedItems.reduce((sum, item) => {
        const amountToPay =
            item.dueAmount !== undefined && item.dueAmount > 0 ? item.dueAmount : item.payable;
        return sum + amountToPay;
    }, 0);

    const payable = amount - appliedConcession;
    const due = payable - Number(paidInput);

    useEffect(() => {
        setPaidInput(String(payable > 0 ? payable : 0));
    }, [payable, selectedIds]);

    const handleReset = () => {
        setSelectedIds([]);
        setSelectedConcession('0');
        setAppliedConcession(0);
        setItemConcessions({});
        setPaidInput('0');
        setSchoolReceiptNo('');
        setPaymentNote('');
        setPaymentMode('Cash');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setTransactionId('');
        setTransactionIdDescription('');
        setChequeNo('');
        setBankName('');
        setChequeDate('');
    };

    const handleTakeFee = async () => {
        if (!selectedStudent || selectedItems.length === 0) {
            alert('Please select a student and at least one installment to pay.');
            return;
        }

        try {
            let remainingAmount = Number(paidInput);

            const feeAllocations = selectedItems.map((item: FeeInstallment) => {
                const currentConcession = itemConcessions[item.sr] || 0;
                let grossAmountNeeded =
                    item.dueAmount !== undefined && item.dueAmount > 0 ? item.dueAmount : item.payable;
                const amountNeeded = Math.max(0, grossAmountNeeded - currentConcession);
                const allocatedAmount = Math.min(amountNeeded, remainingAmount);
                remainingAmount -= allocatedAmount;
                return {
                    student_fee_id: item.student_fee_id,
                    amount: allocatedAmount,
                    concession_amount: currentConcession
                };
            });

            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const branchParam =
                globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            const response = await api.post(`/fees/payment?branch=${branchParam}`, {
                student_id: selectedStudent.student_id,
                amount_paid: Number(paidInput),
                payment_mode: paymentMode,
                payment_date: paymentDate,
                note: paymentNote,
                receipt_no: schoolReceiptNo,
                transaction_id: transactionId,
                transaction_id_description: transactionIdDescription,
                cheque_no: chequeNo,
                bank_name: bankName,
                cheque_date: chequeDate,
                fee_allocations: feeAllocations
            });

            const realReceiptNo = response.data.receipt_no;

            const receiptLineItemsRaw = selectedItems.map((item: FeeInstallment, index: number) => {
                const alloc = feeAllocations[index];
                const feeTypeMatch = feeTypes.find(ft => ft.id === item.fee_type_id);
                return {
                    installment: item.title,
                    fee_type: feeTypeMatch?.fee_type || "Tuition Fee",
                    sr: item.sr,
                    amount_paid: alloc.amount,
                    concession_amount: alloc.concession_amount,
                    gross_amount:
                        item.dueAmount !== undefined && item.dueAmount > 0 ? item.dueAmount : item.payable
                };
            });
            const groupedReceiptItems = groupInstallments(receiptLineItemsRaw);

            const data = {
                studentName: selectedStudent.name,
                fatherName: selectedStudent.fatherName,
                fatherPhone: selectedStudent.fatherPhone,
                admissionNo: selectedStudent.admNo,
                branch: selectedStudent.branch,
                className: selectedStudent.class,
                receiptNo: realReceiptNo,
                paymentDate,
                paymentMode,
                paymentNote,
                chequeNo,
                bankName,
                chequeDate,
                items: groupedReceiptItems,
                amount,
                concession: appliedConcession,
                payable,
                paid: Number(paidInput),
                due
            };
            setReceiptData(data);
            setShowReceipt(true);

            const params = new URLSearchParams();
            if (selectedClass) params.append('class', selectedClass);
            if (selectedSection) params.append('section', selectedSection);
            params.append("branch", branchParam);

            const stResponse = await api.get(`/fees/students?${params}`);
            const stData = stResponse.data;
            setStudents(Array.isArray(stData) ? stData : stData.students || []);

            const instResponse = await api.get(
                `/fees/student-details/${selectedStudent.student_id}?branch=${branchParam}`
            );
            setInstallments(instResponse.data.installments || []);
        } catch (error: any) {
            console.error('Error recording payment:', error);
            alert(error.response?.data?.error || "Failed to record payment");
        }
    };

    const handleCloseReceipt = () => {
        setShowReceipt(false);
        setReceiptData(null);
        handleReset();
    };

    const RupeeIcon = () => <span className="font-sans">₹</span>;

    return (
        <div className="container-fluid mx-auto bg-gray-50">
            <div className="p-4">
                <div className="bg-white rounded-lg shadow-lg p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {/* Left Column */}
                        <div className="lg:col-span-3 space-y-4">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                                <RupeeIcon />&nbsp;Take Fee
                            </h3>

                            <div className="p-4 border rounded-lg shadow-sm bg-violet-50/50 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Search Adm No or Name..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    />
                                    <select
                                        value={selectedClass}
                                        onChange={e => {
                                            setSelectedClass(e.target.value);
                                            setSelectedSection('');
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    >
                                        <option value="">-- Select Class --</option>
                                        {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <select
                                        value={selectedSection}
                                        onChange={e => setSelectedSection(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    >
                                        <option value="">-- Select Section --</option>
                                        {sectionOptions.map(section => (
                                            <option key={section} value={section}>{section}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={selectedFeeType}
                                        onChange={handleFeeTypeChange}
                                        disabled={!selectedStudent}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    >
                                        <option value="">-- Select Fee Type --</option>
                                        {feeTypes.map(ft => (
                                            <option key={ft.id} value={ft.id}>{ft.fee_type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <select
                                        value={selectedStudentId || ''}
                                        onChange={e => setSelectedStudentId(Number(e.target.value) || null)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    >
                                        <option value="">-- Select Student --</option>
                                        {students.map(s => (
                                            <option key={s.student_id} value={s.student_id}>
                                                {s.name} ({s.admNo})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button className="text-sm px-3 py-1.5 border rounded-md hover:bg-gray-100">
                                        Download QR
                                    </button>
                                    <button className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                                        Student
                                    </button>
                                </div>
                            </div>

                            {selectedStudent && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    <InfoCard
                                        title="Total Paids"
                                        value={summary.totalPaids.toLocaleString()}
                                        bgColor="bg-green-100"
                                        textColor="text-green-800"
                                        icon={<RupeeIcon />}
                                    />
                                    <InfoCard
                                        title="Current Due"
                                        value={summary.currentDue.toLocaleString()}
                                        bgColor="bg-blue-100"
                                        textColor="text-blue-800"
                                        icon={<RupeeIcon />}
                                    />
                                    <InfoCard
                                        title="Total Due"
                                        value={summary.totalDue.toLocaleString()}
                                        bgColor="bg-orange-100"
                                        textColor="text-orange-800"
                                        icon={<RupeeIcon />}
                                    />
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-gray-700">
                                    Details{' '}
                                    <span className="text-sm text-black-500 font-normal ml-3">
                                        {selectedStudent
                                            ? `Student Name: ${selectedStudent.name} || FatherName: ${selectedStudent.fatherName} || Adm No: ${selectedStudent.admNo} || Phone: ${selectedStudent.fatherPhone}`
                                            : 'Details : N/A'}
                                    </span>
                                </h4>
                            </div>

                            <div className="border rounded-lg overflow-hidden shadow-sm">
                                <div className="bg-blue-500 text-white px-4 py-2 flex justify-between items-center">
                                    <h4 className="font-semibold relative">
                                        Installment
                                        {installments.length > 0 && (
                                            <span className="absolute -top-2 -right-5 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                                {installments.length}
                                            </span>
                                        )}
                                    </h4>
                                    <button
                                        onClick={fetchPaymentHistory}
                                        className="bg-orange-400 text-white px-3 py-1 text-sm rounded-md hover:bg-orange-500"
                                    >
                                        Print / Cancel
                                    </button>
                                </div>
                                <div className="overflow-x-auto max-h-96">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr className="bg-gray-100 sticky top-0">
                                                <th className="px-2 py-2 border w-12"></th>
                                                <th className="px-2 py-2 border w-12">Sr.</th>
                                                <th className="px-2 py-2 border text-left">Title</th>
                                                <th className="px-2 py-2 border text-left">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedStudent ? (
                                                filteredInstallments.length > 0 ? (
                                                    filteredInstallments.map((inst, index) => {
                                                        const isPaid = inst.paid;
                                                        let isDisabled = false;
                                                        if (!isPaid) {
                                                            const allPreviousCleared = filteredInstallments
                                                                .slice(0, index)
                                                                .every(p => p.paid || selectedIds.includes(p.sr));
                                                            if (!allPreviousCleared) isDisabled = true;
                                                        }
                                                        return (
                                                            <InstallmentRow
                                                                key={inst.sr}
                                                                installment={inst}
                                                                isSelected={selectedIds.includes(inst.sr)}
                                                                onSelect={handleSelect}
                                                                isDisabled={isDisabled}
                                                            />
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan={4} className="text-center p-4 text-gray-500">
                                                            No installments found for this fee type.
                                                        </td>
                                                    </tr>
                                                )
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="text-center p-4 text-gray-500">
                                                        Please select a student to view installments.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="border rounded-lg p-4 space-y-3 bg-gray-50/50 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-800">
                                        Fee Structure{' '}
                                        <a href="#" className="text-blue-500 text-sm font-normal hover:underline">
                                            Get Help
                                        </a>
                                    </h3>
                                    <div className="flex items-center">
                                        <select
                                            value={selectedConcession}
                                            onChange={e => setSelectedConcession(e.target.value)}
                                            className="text-sm border rounded-l-md p-1.5 focus:ring-violet-500 focus:border-violet-500"
                                            disabled={!selectedStudent}
                                        >
                                            <option value="0">Select Concession</option>
                                            {concessions
                                                .filter(c => c.show_in_payment)
                                                .map((c, idx) => (
                                                    <option key={idx} value={c.title}>{c.title}</option>
                                                ))}
                                        </select>
                                        <button
                                            onClick={handleApplyConcession}
                                            className="bg-green-500 text-white px-3 py-1.5 text-sm rounded-r-md hover:bg-green-600"
                                            disabled={!selectedStudent}
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm bg-white">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border p-2 w-10">
                                                    <button className="w-6 h-6 bg-green-500 text-white rounded hover:bg-green-600 flex items-center justify-center text-sm">
                                                        +
                                                    </button>
                                                </th>
                                                <th className="border p-2 text-left font-medium text-gray-600">Title</th>
                                                <th className="border p-2 text-right font-medium text-gray-600">Payable</th>
                                                <th className="border p-2 text-right font-medium text-gray-600">Paid</th>
                                                <th className="border p-2 text-right font-medium text-gray-600">Due</th>
                                                <th className="border p-2 w-32 font-medium text-gray-600">+ Extra Charge</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedItems.length > 0 ? (
                                                selectedItems.map(item => {
                                                    const displayAmount =
                                                        item.dueAmount !== undefined && item.dueAmount > 0
                                                            ? item.dueAmount
                                                            : item.payable;
                                                    const paidAlready = item.paidAmount || 0;
                                                    const dueRemaining = item.dueAmount || 0;
                                                    return (
                                                        <tr key={item.sr}>
                                                            <td className="border p-2"></td>
                                                            <td className="border p-2">{item.title}</td>
                                                            <td className="border p-2 text-right">{displayAmount.toFixed(0)}</td>
                                                            <td className="border p-2 text-right">{paidAlready.toFixed(0)}</td>
                                                            <td className="border p-2 text-right">{dueRemaining.toFixed(0)}</td>
                                                            <td className="border p-2"></td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td className="border p-2 h-8 text-center text-gray-400" colSpan={6}>
                                                        Select installments to pay
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="space-y-2 pt-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">Amount</span>
                                        <span className="font-semibold text-gray-800">{amount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600">Concession</span>
                                        <span className="font-semibold text-gray-800">
                                            {appliedConcession.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-semibold border-t pt-2">
                                        <span className="text-gray-800">Payable(Amount - Concession)</span>
                                        <span className="font-semibold text-gray-800">{payable.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm border-t pt-2">
                                        <span className="text-gray-600">Paid</span>
                                        <div className="flex items-center">
                                            <input
                                                type="text"
                                                value={paidInput}
                                                onChange={e => setPaidInput(e.target.value)}
                                                className="w-24 px-2 py-1 border border-gray-300 rounded-md shadow-sm text-right focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                            />
                                            <button className="ml-2 px-3 py-1 bg-green-500 text-white rounded-md text-lg font-bold hover:bg-green-600">
                                                =
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-semibold text-red-600 border-t pt-2">
                                        <span>Due (Payable - Paid)</span>
                                        <span>{due.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg p-4 space-y-4 bg-gray-50/50 shadow-sm">
                                <div className="text-center text-sm text-orange-600 bg-orange-100 p-2 rounded-md">
                                    Hit "ENTER" or Equal(=) button after entering "Paid" amount
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Payment Mode*</label>
                                        <select
                                            value={paymentMode}
                                            onChange={e => setPaymentMode(e.target.value)}
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                        >
                                            <option>Cash</option>
                                            <option>CardSwap</option>
                                            <option>Online</option>
                                            <option>UPI</option>
                                            <option>Cheque</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Payment Date*</label>
                                        <input
                                            type="date"
                                            value={paymentDate}
                                            disabled={true}
                                            onChange={e => setPaymentDate(e.target.value)}
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            School Receipt No
                                        </label>
                                        <input
                                            type="text"
                                            value={schoolReceiptNo}
                                            onChange={e => setSchoolReceiptNo(e.target.value)}
                                            disabled={true}
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Payment Note</label>
                                        <input
                                            type="text"
                                            value={paymentNote}
                                            maxLength={25}
                                            onChange={e => setPaymentNote(e.target.value)}
                                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                        />
                                    </div>
                                    {(paymentMode === 'CardSwap' || paymentMode === 'UPI') && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">
                                                    UPI/Card Transaction ID*
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transactionId}
                                                    onChange={e => setTransactionId(e.target.value)}
                                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                                    placeholder="Enter UPI/Card transaction ID"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">
                                                    UPI/Card Description*
                                                </label>
                                                <input
                                                    type="text"
                                                    value={transactionIdDescription}
                                                    required
                                                    onChange={e => setTransactionIdDescription(e.target.value)}
                                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                                    placeholder="Enter UPI/Card description"
                                                />
                                            </div>
                                        </>
                                    )}
                                    {(paymentMode === 'Cheque') && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Cheque No*</label>
                                                <input type="text" value={chequeNo} onChange={e => setChequeNo(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500" placeholder="Enter Cheque No" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Bank Name*</label>
                                                <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500" placeholder="Enter Bank Name" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Cheque Date*</label>
                                                <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500" />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    <input
                                        id="keep-details"
                                        type="checkbox"
                                        className="h-4 w-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                                    />
                                    <label htmlFor="keep-details" className="ml-2 block text-sm text-gray-900">
                                        Keep same payment detail for the next fee payment
                                    </label>
                                </div>
                                <div className="flex justify-end space-x-2 pt-2">
                                    <button
                                        onClick={handleTakeFee}
                                        className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                                        disabled={!selectedStudent}
                                    >
                                        Take Fee
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showReceipt && receiptData && (
                <FeeReceipt onClose={handleCloseReceipt} receiptData={receiptData} />
            )}

            {showHistory && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">
                                Payment History - {selectedStudent?.name} ({localStorage.getItem('academicYear')})
                            </h2>
                            <div className="flex items-center space-x-4">
                                <label className="flex items-center space-x-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={showCancelled}
                                        onChange={e => setShowCancelled(e.target.checked)}
                                        className="h-4 w-4 text-violet-600 rounded border-gray-300"
                                    />
                                    <span>Show Cancelled</span>
                                </label>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* ── Admin-only notice banner ─────────────────────────────── */}
                        {!isAdmin && (
                            <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4 shrink-0"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                Receipt cancellation is restricted to <strong className="mx-1">Administrators</strong> only.
                            </div>
                        )}
                        {/* ────────────────────────────────────────────────────────── */}

                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="p-2">Receipt No</th>
                                    <th className="p-2">Academic Year</th>
                                    <th className="p-2">Date</th>
                                    <th className="p-2" colSpan={2}>Title</th>
                                    <th className="p-2 text-right">Amount</th>
                                    <th className="p-2 text-right">Concession</th>
                                    <th className="p-2">Mode</th>
                                    <th className="p-2">Status</th>
                                    <th className="p-2 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.values(
                                    paymentHistory.reduce((acc: any, curr) => {
                                        if (!acc[curr.receipt_no]) acc[curr.receipt_no] = [];
                                        acc[curr.receipt_no].push(curr);
                                        return acc;
                                    }, {})
                                ).map((group: any) => {
                                    const first = group[0];

                                    const enrichedGroup = group.map((p: any) => {
                                        const match = installments.find(
                                            i => i.title === p.installment || i.title === `${p.installment} Fee`
                                        );
                                        return { ...p, sr: match ? match.sr : 0 };
                                    });

                                    const groupedDetails = groupInstallments(enrichedGroup);
                                    const totalAmount = group.reduce(
                                        (sum: number, p: any) => sum + parseFloat(p.amount_paid),
                                        0
                                    );
                                    const totalConcession = group.reduce(
                                        (sum: number, p: any) => sum + parseFloat(p.concession_amount),
                                        0
                                    );

                                    const isCancelled = first.status === 'I';

                                    return (
                                        <tr
                                            key={first.receipt_no}
                                            className={`border-b hover:bg-gray-50 align-top ${isCancelled ? 'bg-red-50' : ''}`}
                                        >
                                            <td className="p-2">{first.receipt_no}</td>
                                            <td className="p-2">{first.academic_year}</td>
                                            <td className="p-2">{first.payment_date}</td>
                                            <td className="p-2" colSpan={2}>
                                                <div className="space-y-1">
                                                    {groupedDetails.map((g: any, i: number) => (
                                                        <div key={i} className="font-medium">{g.title}</div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-2 text-right">₹{totalAmount.toLocaleString('en-IN')}</td>
                                            <td className="p-2 text-right">
                                                ₹{totalConcession.toLocaleString('en-IN')}
                                            </td>
                                            <td className="p-2">{first.mode}</td>
                                            <td className="p-2">
                                                {isCancelled ? (
                                                    <div className="text-red-600 font-semibold text-xs">
                                                        Cancelled
                                                        {first.cancel_reason && (
                                                            <div className="text-gray-500 font-normal italic">
                                                                {first.cancel_reason}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-green-600 font-semibold text-xs">Active</span>
                                                )}
                                            </td>
                                            <td className="p-2">
                                                <div className="flex justify-center space-x-2">
                                                    {/* Print – visible to everyone */}
                                                    <button
                                                        onClick={() => handlePrintHistoryReceipt(first.receipt_no)}
                                                        title="Print Receipt"
                                                        className="text-blue-600 hover:text-blue-800"
                                                    >
                                                        <PrinterIcon className="w-5 h-5" />
                                                    </button>

                                                    {/* ── Cancel – ADMIN ONLY ─────────────────────────── */}
                                                    {!isCancelled && (
                                                        isAdmin ? (
                                                            // Admin: active red trash button
                                                            <button
                                                                onClick={() => handleDeleteReceipt(first.receipt_no)}
                                                                title="Cancel Receipt"
                                                                className="text-red-600 hover:text-red-800"
                                                            >
                                                                <TrashIcon className="w-5 h-5" />
                                                            </button>
                                                        ) : (
                                                            // Non-admin: greyed-out, non-interactive icon with tooltip
                                                            <span
                                                                title="Only administrators can cancel receipts"
                                                                className="text-gray-300 cursor-not-allowed"
                                                            >
                                                                <TrashIcon className="w-5 h-5" />
                                                            </span>
                                                        )
                                                    )}
                                                    {/* ────────────────────────────────────────────────── */}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {paymentHistory.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="p-4 text-center text-gray-500">
                                            No payments found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setShowHistory(false)}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TakeFee;
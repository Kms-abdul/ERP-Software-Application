import React, { useState, useEffect } from 'react';
import api from '../api';
import { PencilIcon, TrashIcon, RefreshIcon } from './icons';

interface FeeInstallment {
    sr: number;
    student_fee_id: number;
    title: string;
    payable: number;
    paid: boolean;
    paidAmount: number;
    dueAmount: number;
    concession: number;
    month: string;
    status: string;
    fee_type_id: number;
}

interface Student {
    student_id: number;
    name: string;
    admNo: string;
    class: string;
    section: string;
    branch: string;
}

interface FeeType {
    id: number;
    fee_type: string;
    type: string;
    fee_type_group?: string;
}

const UpdateStudentFeeStructure: React.FC = () => {
    // State
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState('');

    // const [selectedBranch, setSelectedBranch] = useState('All'); // Removed
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

    // Data
    const [students, setStudents] = useState<Student[]>([]);
    const [installments, setInstallments] = useState<FeeInstallment[]>([]);
    const [classes, setClasses] = useState<string[]>([]);
    const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);

    // UI State
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingFee, setEditingFee] = useState<FeeInstallment | null>(null);


    const [showAssignStandardModal, setShowAssignStandardModal] = useState(false);

    // No need to set branch state, we read from localStorage

    useEffect(() => {
        fetchClasses();
        fetchFeeTypes();
    }, []);

    const computeGlobalBranch = (): string => {
        let user: Record<string, any> = {};
        try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }
        const storedBranch = localStorage.getItem('currentBranch') || 'All';
        if (user.role !== 'Admin' && user.branch) return user.branch;
        return storedBranch;
    };

    // Fetch Students on filter change
    useEffect(() => {
        if (selectedClass || searchTerm) {
            fetchStudents();
        }
    }, [selectedClass, searchTerm]); // Removed selectedBranch dependency

    // Fetch Installments when student selected
    useEffect(() => {
        if (selectedStudentId) {
            fetchInstallments();
        } else {
            setInstallments([]);
        }
    }, [selectedStudentId]);

    const fetchClasses = async () => {
        try {
            const response = await api.get('/classes');
            const classNames = response.data.classes.map((c: any) => c.class_name);
            setClasses(classNames);
        } catch (error) {
            console.error('Error fetching classes:', error);
        }
    };

    const fetchFeeTypes = async () => {
        try {
            const response = await api.get('/fee-types');
            setFeeTypes(response.data.fee_types || []);
        } catch (error) {
            console.error('Error fetching fee types:', error);
        }
    };

    const fetchStudents = async () => {
        try {
            const params = new URLSearchParams();
            if (selectedClass) params.append('class', selectedClass);
            if (searchTerm) params.append('search', searchTerm);

            const globalBranch = computeGlobalBranch();
            const branchParam = globalBranch === "All Branches" || globalBranch === "All" ? "All" : globalBranch;
            params.append('branch', branchParam);

            const response = await api.get(`/fees/students?${params.toString()}`);
            setStudents(Array.isArray(response.data) ? response.data : response.data.students || []);
        } catch (error) {
            console.error('Error fetching students:', error);
        }
    };

    const fetchInstallments = async () => {
        if (!selectedStudentId) return;
        try {
            const response = await api.get(`/fees/student-details/${selectedStudentId}`);
            setInstallments(response.data.installments || []);
        } catch (error) {
            console.error('Error fetching installments:', error);
        }
    };

    const handleUpdateFee = async (id: number, totalFee: number, concession: number) => {
        try {
            await api.put(`/fees/student-fee/${id}`, {
                total_fee: totalFee,
                concession: concession
            });
            fetchInstallments();
            setEditingFee(null);
            alert('Fee updated successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to update fee');
        }
    };

    const handleDeleteFee = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this fee?')) return;
        try {
            await api.delete(`/fees/student-fee/${id}`);
            fetchInstallments();
            alert('Fee deleted successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete fee');
        }
    };

    const handleAddFee = async (feeTypeId: number, amount: number, month: string) => {
        if (!selectedStudentId) return;
        try {
            await api.post('/fees/student-fee/add', {
                student_id: selectedStudentId,
                fee_type_id: feeTypeId,
                amount: amount,
                month: month
            });
            fetchInstallments();
            setShowAddModal(false);
            alert('Fee added successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to add fee');
        }
    };

    const handleAssignStandardFee = async (feeTypeIds: number[]) => {
        if (!selectedStudentId || feeTypeIds.length === 0) return;
        try {
            await Promise.all(feeTypeIds.map(feeTypeId =>
                api.post('/fees/assign-fee-type', {
                    student_id: selectedStudentId,
                    fee_type_id: feeTypeId
                })
            ));
            fetchInstallments();
            setShowAssignStandardModal(false);
            alert('Standard fees assigned successfully');
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to assign standard fees');
        }
    };

    const selectedStudent = students.find(s => s.student_id === selectedStudentId);

    return (
        <div className="container-fluid mx-auto p-4 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6 flex justify-between items-center rounded-r shadow-sm">
                <div className="flex items-center">
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span>📋</span> Update student fee structure
                    </h2>
                </div>

                {/* Filters */}
                <div className="flex gap-2 items-center">
                    {(() => {
                        const displayBranch = computeGlobalBranch();

                        return (
                            <input
                                type="text"
                                value={displayBranch}
                                readOnly
                                className="border rounded px-2 py-1 text-sm outline-none bg-gray-100 cursor-not-allowed w-32 focus:ring-2 ring-indigo-300"
                                title="Current Branch"
                            />
                        );
                    })()}
                    <input
                        type="text"
                        placeholder="Search Name/AdmNo"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="border rounded px-3 py-1 text-sm outline-none w-40 focus:ring-2 ring-indigo-300"
                    />
                    <select
                        value={selectedClass}
                        onChange={e => setSelectedClass(e.target.value)}
                        className="border rounded px-2 py-1 text-sm outline-none w-24 focus:ring-2 ring-indigo-300"
                    >
                        <option value="">Class</option>
                        {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                        value={selectedStudentId || ''}
                        onChange={e => setSelectedStudentId(Number(e.target.value) || null)}
                        className="border rounded px-2 py-1 text-sm outline-none w-64 focus:ring-2 ring-indigo-300"
                    >
                        <option value="">Select Student</option>
                        {students.map(s => (
                            <option key={s.student_id} value={s.student_id}>
                                {s.name} ({s.admNo})
                            </option>
                        ))}
                    </select>


                </div>
            </div>

            {/* Content */}
            {selectedStudentId ? (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium text-gray-700">
                            Fee Installments for <span className="text-indigo-600 font-bold">{selectedStudent?.name}</span>
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowAssignStandardModal(true)}
                                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 shadow-sm flex items-center gap-1"
                            >
                                <RefreshIcon className="w-4 h-4" />
                                Assign Standard Fee
                            </button>
                        </div>
                    </div>

                    {installments.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">No installments found for this student.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {installments.map((inst) => (
                                <InstallmentCard
                                    key={inst.sr}
                                    installment={inst}
                                    onEdit={() => setEditingFee(inst)}
                                    onDelete={() => handleDeleteFee(inst.student_fee_id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-20 text-gray-400">
                    Please select a student to view and update fee structure.
                </div>
            )}

            {/* Edit Modal */}
            {editingFee && (
                <EditFeeModal
                    fee={editingFee}
                    onClose={() => setEditingFee(null)}
                    onSave={handleUpdateFee}
                />
            )}

            {/* Add Modal */}
            {showAddModal && (
                <AddFeeModal
                    feeTypes={feeTypes}
                    onClose={() => setShowAddModal(false)}
                    onSave={handleAddFee}
                />
            )}

            {/* Assign Standard Fee Modal */}
            {showAssignStandardModal && (
                <AssignStandardFeeModal
                    feeTypes={feeTypes}
                    onClose={() => setShowAssignStandardModal(false)}
                    onSave={handleAssignStandardFee}
                />
            )}
        </div>
    );
};

// Sub-components

const InstallmentCard: React.FC<{
    installment: FeeInstallment;
    onEdit: () => void;
    onDelete: () => void;
}> = ({ installment, onEdit, onDelete }) => {
    const isPaid = installment.status === 'Paid';
    const isPartial = installment.status === 'Partial';

    // Status Badge Color
    const badgeColor = isPaid
        ? 'bg-green-600 text-white'
        : isPartial
            ? 'bg-orange-500 text-white'
            : 'bg-orange-500 text-white'; // Image shows orange for Unpaid too

    // Card Header Color
    const headerColor = isPaid ? 'bg-green-50' : 'bg-orange-50';

    return (
        <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
            <div className={`px-4 py-2 flex justify-between items-center ${headerColor}`}>
                <span className="font-semibold text-gray-700 text-sm">{installment.title}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>{installment.status}</span>
            </div>
            <div className="p-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-600">Tuition Fee</span>
                    <span className="text-sm font-bold text-gray-800">{installment.payable}</span>
                </div>

                {/* Calculation view matching screenshot: 3500 - 250 = 3250 */}
                <div className="text-xs text-gray-500 text-right mb-2">
                    {installment.payable} - {installment.concession} = {installment.payable - installment.concession}
                </div>

                <div className="border-t pt-2 flex justify-between items-center">
                    <span className="text-xs text-gray-400">Total</span>
                    <span className="font-bold text-gray-800">
                        ₹ {installment.payable - installment.concession}
                    </span>
                </div>

                {/* Actions */}
                {!isPaid && (
                    <div className="mt-3 flex justify-end gap-2">
                        <button
                            onClick={onEdit}
                            className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                            title="Edit"
                        >
                            <PencilIcon className="w-4 h-4" />
                        </button>
                        {installment.paidAmount === 0 && (
                            <button
                                onClick={onDelete}
                                className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                title="Delete"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const EditFeeModal: React.FC<{
    fee: FeeInstallment;
    onClose: () => void;
    onSave: (id: number, total: number, concession: number) => void;
}> = ({ fee, onClose, onSave }) => {
    const [total, setTotal] = useState(fee.payable);
    const [concession, setConcession] = useState(fee.concession);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
                <h3 className="text-lg font-bold mb-4">Edit Fee: {fee.title}</h3>

                <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">Total Amount</label>
                    <input
                        type="number"
                        value={total}
                        onChange={e => setTotal(parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-3 py-2"
                        disabled={fee.paidAmount > 0} // Can't edit total if partially paid usually
                    />
                    {fee.paidAmount > 0 && <p className="text-xs text-red-500 mt-1">Cannot change total amount for partially paid fees.</p>}
                </div>

                <div className="mb-6">
                    <label className="block text-sm text-gray-600 mb-1">Concession</label>
                    <input
                        type="number"
                        value={concession}
                        onChange={e => setConcession(parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
                    <button
                        onClick={() => onSave(fee.student_fee_id, total, concession)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};


const AddFeeModal: React.FC<{
    feeTypes: FeeType[];
    onClose: () => void;
    onSave: (feeTypeId: number, amount: number, month: string) => void;
}> = ({ feeTypes, onClose, onSave }) => {
    const [feeTypeId, setFeeTypeId] = useState<number | ''>('');
    const [amount, setAmount] = useState<number | ''>('');
    const [month, setMonth] = useState('One-Time');

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "One-Time"];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
                <h3 className="text-lg font-bold mb-4">Add Student Fee</h3>

                <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">Fee Type</label>
                    <select
                        value={feeTypeId}
                        onChange={e => setFeeTypeId(Number(e.target.value))}
                        className="w-full border rounded px-3 py-2"
                    >
                        <option value="">Select Fee Type</option>
                        {feeTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.fee_type}</option>)}
                    </select>
                </div>

                <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">Month / Label</label>
                    <select
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                    >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                <div className="mb-6">
                    <label className="block text-sm text-gray-600 mb-1">Amount</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(parseFloat(e.target.value))}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
                    <button
                        onClick={() => feeTypeId && amount && onSave(feeTypeId as number, amount as number, month)}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        disabled={!feeTypeId || !amount}
                    >
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
};

const AssignStandardFeeModal: React.FC<{
    feeTypes: FeeType[];
    onClose: () => void;
    onSave: (feeTypeIds: number[]) => void;
}> = ({ feeTypes, onClose, onSave }) => {
    const [selectedFeeTypeIds, setSelectedFeeTypeIds] = useState<number[]>([]);
    const standardFeeTypes = feeTypes.filter(ft => ft.fee_type_group === 'Standard');

    const handleCheckboxChange = (id: number, isChecked: boolean) => {
        if (isChecked) {
            setSelectedFeeTypeIds(prev => [...prev, id]);
        } else {
            setSelectedFeeTypeIds(prev => prev.filter(fId => fId !== id));
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg w-96">
                <h3 className="text-lg font-bold mb-4">Assign Standard Fees</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Select standard fees to assign. The amounts will be automatically determined from the class fee structure.
                </p>

                <div className="mb-6 max-h-60 overflow-y-auto">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Standard Fee Types</label>
                    {standardFeeTypes.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No standard fee types available.</p>
                    ) : (
                        <div className="space-y-2">
                            {standardFeeTypes.map(ft => (
                                <label key={ft.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-50 rounded">
                                    <input
                                        type="checkbox"
                                        checked={selectedFeeTypeIds.includes(ft.id)}
                                        onChange={e => handleCheckboxChange(ft.id, e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-gray-700">{ft.fee_type}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
                    <button
                        onClick={() => selectedFeeTypeIds.length > 0 && onSave(selectedFeeTypeIds)}
                        className={`px-4 py-2 text-white rounded ${selectedFeeTypeIds.length > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-green-300 cursor-not-allowed'}`}
                        disabled={selectedFeeTypeIds.length === 0}
                    >
                        Assign
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdateStudentFeeStructure;

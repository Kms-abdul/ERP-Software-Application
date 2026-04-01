import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

interface FeeType {
    id: number;
    fee_type: string;
    type: string;
    branch?: string;
}

interface Installment {
    id?: number;
    installment_no: number;
    title: string;
    start_date: string;
    end_date: string;
    last_pay_date: string;
    is_admission: boolean;
    description?: string;
    fee_type_id?: number | null;
    fee_type_name?: string;
    branch?: string;
    location?: string;
    academic_year?: string;
}

interface BranchOption {
    id: number | string;
    name: string;
    location_name: string;
}

interface BulkConfig {
    fee_type_id: string;
    count: number;
    start_month_idx: number;
    year: number;
    start_installment_no: number;
    branch: string;
    location: string;
    academic_year: string;
    cutoff_day: number;
}

// ─── Bulk Preview Component ───────────────────────────────────────────────────
const BulkPreview: React.FC<{ bulkConfig: BulkConfig; MONTHS: string[] }> = ({ bulkConfig, MONTHS }) => {
    const count = parseInt(bulkConfig.count.toString()) || 0;
    const startIdx = parseInt(bulkConfig.start_month_idx.toString()) || 0;
    const year = parseInt(bulkConfig.year.toString()) || new Date().getFullYear();
    const cutoffDay = parseInt((bulkConfig.cutoff_day ?? 5).toString());

    if (!count || count < 1) return null;

    const preview = [];
    for (let i = 0; i < Math.min(count, 6); i++) {
        const monthIdx = (startIdx + i) % 12;
        const calMonth = (monthIdx + 3) % 12;
        const yearOffset = Math.floor((startIdx + 3 + i) / 12);
        const actualYear = year + yearOffset - Math.floor((startIdx + 3) / 12);
        const lastDay = new Date(actualYear, calMonth + 1, 0).getDate();
        const safeCutoff = Math.min(cutoffDay, lastDay);

        preview.push({
            title: `${MONTHS[monthIdx]} Fee`,
            start: `01/${String(calMonth + 1).padStart(2, '0')}/${actualYear}`,
            end: `${String(lastDay).padStart(2, '0')}/${String(calMonth + 1).padStart(2, '0')}/${actualYear}`,
            cutoff: `${String(safeCutoff).padStart(2, '0')}/${String(calMonth + 1).padStart(2, '0')}/${actualYear}`
        });
    }

    return (
        <div className="mt-4 bg-white rounded-md border border-violet-200 overflow-hidden">
            <div className="px-4 py-2 bg-violet-100 text-sm font-medium text-violet-800">
                Preview — first {Math.min(count, 6)} of {count} installments
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                            <th className="px-4 py-2 text-left">Title</th>
                            <th className="px-4 py-2 text-left">Start</th>
                            <th className="px-4 py-2 text-left">End</th>
                            <th className="px-4 py-2 text-left">Cut-off</th>
                        </tr>
                    </thead>
                    <tbody>
                        {preview.map((p, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-4 py-2 font-medium text-gray-800">{p.title}</td>
                                <td className="px-4 py-2 text-gray-600">{p.start}</td>
                                <td className="px-4 py-2 text-gray-600">{p.end}</td>
                                <td className="px-4 py-2 text-violet-700 font-medium">{p.cutoff}</td>
                            </tr>
                        ))}
                        {count > 6 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-2 text-center text-gray-400 text-xs">
                                    + {count - 6} more months…
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const FeeInstallments: React.FC = () => {
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
    const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);

    const [formData, setFormData] = useState<Installment>({
        installment_no: 1,
        title: '',
        start_date: '',
        end_date: '',
        last_pay_date: '',
        is_admission: false,
        description: '',
        fee_type_id: null,
        branch: '',
        location: '',
        academic_year: ''
    });

    // Bulk Generation State
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkConfig, setBulkConfig] = useState<BulkConfig>({
        fee_type_id: '',
        count: 12,
        start_month_idx: 1,
        year: new Date().getFullYear() + 1,
        start_installment_no: 3,
        branch: '',
        location: '',
        academic_year: '',
        cutoff_day: 5
    });

    const [editingId, setEditingId] = useState<number | null>(null);


    const MONTHS = [
        'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December', 'January', 'February', 'March'
    ];

    const [selectedLocation, setSelectedLocation] = useState('All');

    // Copy Feature State
    const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
    const [sourceBranchId, setSourceBranchId] = useState<string | number>('');
    const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copying, setCopying] = useState(false);
    const [selectedCopyFeeTypeId, setSelectedCopyFeeTypeId] = useState<number | string>('');
    const copyDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdminUser = user.role === 'Admin';

        let globalBranch = localStorage.getItem('currentBranch') || 'All';
        if (!isAdminUser && user.branch && user.branch !== 'All' && user.branch !== 'All Branches') {
            globalBranch = user.branch;
        }

        const storedLocation = localStorage.getItem('currentLocation');
        const initialLocation = user.location || 'Hyderabad';
        const isGlobal = globalBranch === 'All' || globalBranch === 'All Branches';
        let viewLoc = 'All';

        if (isGlobal) {
            viewLoc = (storedLocation && storedLocation !== 'All') ? storedLocation : 'All';
        } else {
            viewLoc = initialLocation;
        }

        setSelectedLocation(viewLoc);

        const currentAcademicYear = localStorage.getItem('academicYear') || '';

        setFormData(prev => ({
            ...prev,
            branch: globalBranch,
            location: viewLoc === 'All' ? 'Hyderabad' : viewLoc,
            academic_year: currentAcademicYear
        }));
        setBulkConfig(prev => ({
            ...prev,
            branch: globalBranch,
            location: viewLoc === 'All' ? 'Hyderabad' : viewLoc,
            academic_year: currentAcademicYear
        }));

        if (!isGlobal) {
            api.get('/branches').then(res => {
                const branchList = res.data.branches || [];
                const mappedBranches = branchList.map((b: any) => ({
                    id: b.id,
                    name: b.branch_name,
                    location_name: b.location_name || 'Unknown Location'
                }));
                setAllBranches(mappedBranches);

                const b = branchList.find(
                    (br: any) => br.branch_name.toLowerCase() === globalBranch.toLowerCase()
                );
                if (b) {
                    const locMap: { [key: string]: string } = { HYD: 'Hyderabad', MUM: 'Mumbai' };
                    const code = (b.location_code || '').toUpperCase();
                    const resolvedLoc = locMap[code] || initialLocation;
                    setSelectedLocation(resolvedLoc);
                    setFormData(prev => ({ ...prev, location: resolvedLoc }));
                    setSourceBranchId(b.id);
                }
            }).catch(err => console.error('Error fetching branch info:', err));
        } else {
            setSelectedLocation('All');
            setFormData(prev => ({ ...prev, location: 'All' }));
            setBulkConfig(prev => ({ ...prev, location: 'All' }));
        }
    }, []);

    useEffect(() => { fetchInstallments(); }, [selectedLocation]);
    useEffect(() => { fetchFeeTypes(); fetchAcademicYears(); }, []);

    // Auto-update installment number in add mode
    useEffect(() => {
        if (!editingId) {
            setFormData(prev => ({ ...prev, installment_no: installments.length + 1 }));
        }
    }, [installments, editingId]);

    // ── Fetchers ────────────────────────────────────────────────────────────────
    const fetchAcademicYears = async () => {
        try {
            const res = await api.get('/org/academic-years');
            const years = res.data.academic_years?.map((y: any) => y.name) || [];
            setAcademicYearOptions(years);
        } catch (error) {
            console.error('Error fetching academic years:', error);
            setAcademicYearOptions([]);
        }
    };

    const fetchInstallments = async () => {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            let globalBranch = localStorage.getItem('currentBranch') || 'All';
            if (user.role !== 'Admin' && user.branch && user.branch !== 'All' && user.branch !== 'All Branches') {
                globalBranch = user.branch;
            }
            const branchParam = globalBranch === 'All Branches' || globalBranch === 'All' ? 'All' : globalBranch;
            const response = await api.get('/installment-schedule', {
                params: { branch: branchParam, location: selectedLocation }
            });
            setInstallments(response.data.installments || []);
        } catch (error) {
            console.error('Error fetching installments:', error);
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

    // ── Handlers ────────────────────────────────────────────────────────────────
    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target;
        const { checked } = e.target as HTMLInputElement;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleBulkChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericFields = ['count', 'start_month_idx', 'year', 'start_installment_no', 'cutoff_day'];
        const coercedValue = numericFields.includes(name) ? (parseInt(value) || 0) : value;
        setBulkConfig(prev => ({ ...prev, [name]: coercedValue }));
    };

    // ── Date helper ─────────────────────────────────────────────────────────────
    const formatDate = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // ── Bulk Generate ───────────────────────────────────────────────────────────
    const generateBulkInstallments = async () => {
        if (!bulkConfig.fee_type_id) {
            alert('Please select a Fee Type');
            return;
        }

        const count = parseInt(bulkConfig.count.toString());
        const startIdx = parseInt(bulkConfig.start_month_idx.toString());
        const year = parseInt(bulkConfig.year.toString());
        const startNo = parseInt(bulkConfig.start_installment_no.toString());
        const cutoffDay = parseInt((bulkConfig.cutoff_day ?? 5).toString());
        const globalBranch = localStorage.getItem('currentBranch') || 'All';

        const newInstallments = [];

        for (let i = 0; i < count; i++) {
            // MONTHS: April=0 … March=11; map to JS calendar month (Jan=0)
            const monthIdx = (startIdx + i) % 12;
            const monthName = MONTHS[monthIdx];
            const calMonth = (monthIdx + 3) % 12; // 0-based JS month

            // Correct year rollover for any starting month
            const yearOffset = Math.floor((startIdx + 3 + i) / 12);
            const actualYear = year + yearOffset - Math.floor((startIdx + 3) / 12);

            const startDate = new Date(actualYear, calMonth, 1);
            const endDate = new Date(actualYear, calMonth + 1, 0); // last day of month

            // Clamp cutoff day to actual last day of that month (e.g. Feb 28/29)
            const safeCutoff = Math.min(cutoffDay, endDate.getDate());
            const cutoffDate = new Date(actualYear, calMonth, safeCutoff);

            newInstallments.push({
                installment_no: startNo + i,
                title: `${monthName} Fee`,
                start_date: formatDate(startDate),
                end_date: formatDate(endDate),
                last_pay_date: formatDate(cutoffDate),
                is_admission: false,
                description: `Monthly installment for ${monthName}`,
                fee_type_id: parseInt(bulkConfig.fee_type_id),
                branch: bulkConfig.branch || globalBranch || 'All',
                location: bulkConfig.location || 'Hyderabad',
                academic_year: bulkConfig.academic_year || ''
            });
        }

        try {
            await api.post('/installment-schedule', newInstallments);
            alert(`Successfully generated ${count} installments!`);
            fetchInstallments();
            setBulkMode(false);
        } catch (error) {
            console.error('Error generating bulk installments:', error);
            alert('Failed to generate installments');
        }
    };

    // ── Single Form Submit ───────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title || !formData.start_date || !formData.end_date || !formData.last_pay_date) {
            alert('Please fill all required fields');
            return;
        }

        const globalBranch = localStorage.getItem('currentBranch') || 'All';
        const payload = {
            ...formData,
            installment_no: parseInt(formData.installment_no.toString()),
            fee_type_id: formData.fee_type_id ? parseInt(formData.fee_type_id.toString()) : null,
            branch: formData.branch || globalBranch || 'All',
            location: formData.location || 'Hyderabad',
            academic_year: formData.academic_year || ''
        };

        try {
            if (editingId) {
                await api.put(`/installment-schedule/${editingId}`, payload);
                alert('Installment updated successfully!');
            } else {
                await api.post('/installment-schedule', payload);
                alert('Installment created successfully!');
            }
            fetchInstallments();
            handleReset();
        } catch (error) {
            console.error('Error saving installment:', error);
            alert('Failed to save installment');
        }
    };

    const handleEdit = (installment: Installment) => {
        setFormData({
            installment_no: installment.installment_no,
            title: installment.title,
            start_date: installment.start_date,
            end_date: installment.end_date,
            last_pay_date: installment.last_pay_date,
            is_admission: installment.is_admission,
            description: installment.description || '',
            fee_type_id: installment.fee_type_id || null,
            branch: installment.branch || 'All',
            location: installment.location || 'Hyderabad',
            academic_year: installment.academic_year || ''
        });
        setEditingId(installment.id || null);
        setBulkMode(false);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this installment?')) return;
        try {
            await api.delete(`/installment-schedule/${id}`);
            alert('Installment deleted successfully!');
            fetchInstallments();
        } catch (error) {
            console.error('Error deleting installment:', error);
            alert('Failed to delete installment');
        }
    };

    const handleReset = () => {
        setFormData({
            installment_no: installments.length + 1,
            title: '',
            start_date: '',
            end_date: '',
            last_pay_date: '',
            is_admission: false,
            description: '',
            fee_type_id: null,
            branch: localStorage.getItem('currentBranch') || 'All',
            location: 'Hyderabad',
            academic_year: ''
        });
        setEditingId(null);
    };

    // ── Copy Logic ──────────────────────────────────────────────────────────────
    const toggleCopyTarget = (branchId: string) => {
        const newTargets = new Set(copyTargets);
        if (newTargets.has(branchId)) newTargets.delete(branchId);
        else newTargets.add(branchId);
        setCopyTargets(newTargets);
    };

    const handleCopy = async () => {
        if (copyTargets.size === 0) {
            alert('Please select at least one branch to copy to.');
            return;
        }
        if (!selectedCopyFeeTypeId) {
            alert('Please select a Fee Type to copy installments for.');
            return;
        }
        if (!confirm(`Are you sure you want to copy installments for the selected fee type to ${copyTargets.size} branches?`)) return;

        setCopying(true);
        try {
            await api.post('/fees/copy-installments', {
                source_branch_id: sourceBranchId,
                target_branch_ids: Array.from(copyTargets),
                source_fee_type_id: selectedCopyFeeTypeId,
                academic_year: localStorage.getItem('academicYear') || ''
            });
            alert('Installments copied successfully!');
            setCopyTargets(new Set());
            setSelectedCopyFeeTypeId('');
            setIsCopyDropdownOpen(false);
        } catch (error: any) {
            console.error('Copy failed', error);
            alert(error.response?.data?.error || 'Failed to copy installments.');
        } finally {
            setCopying(false);
        }
    };

    // ── Derived Values ──────────────────────────────────────────────────────────
    const currentBranch = localStorage.getItem('currentBranch');
    const isSpecificBranch = currentBranch && currentBranch !== 'All' && currentBranch !== 'All Branches';

    const availableBranches = allBranches.filter(
        b => String(b.id) !== String(sourceBranchId) && b.name !== 'All Branches' && b.name !== 'All'
    );
    const branchesByLocation: { [key: string]: BranchOption[] } = {};
    availableBranches.forEach(b => {
        if (!branchesByLocation[b.location_name]) branchesByLocation[b.location_name] = [];
        branchesByLocation[b.location_name].push(b);
    });

    const copyableFeeTypes = feeTypes.filter(ft => ft.branch === 'All' || ft.branch === currentBranch);

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="container mx-auto p-6 bg-gray-50 min-h-screen">
            <div className="bg-white rounded-lg shadow-md p-6">

                {/* ── Header ── */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">Fee Installments</h2>

                    {/* Copy to Branches Button */}
                    {isSpecificBranch && (
                        <div className="relative" ref={copyDropdownRef}>
                            <button
                                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2 shadow-sm"
                                onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                            >
                                <span>Copy to Branches</span>
                                <span className="text-xs">▼</span>
                            </button>

                            {isCopyDropdownOpen && (
                                <div className="absolute top-12 right-0 w-80 bg-white border shadow-xl rounded z-50 p-2 max-h-96 overflow-y-auto">
                                    <div className="mb-2 p-2 border-b bg-gray-50">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">
                                            Select Fee Type to Copy:
                                        </label>
                                        <select
                                            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                                            value={selectedCopyFeeTypeId}
                                            onChange={e => setSelectedCopyFeeTypeId(e.target.value)}
                                        >
                                            <option value="">-- Select Fee Type --</option>
                                            {copyableFeeTypes.map(ft => (
                                                <option key={ft.id} value={ft.id}>{ft.fee_type} ({ft.type})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="mb-2 text-sm font-semibold text-gray-700 pb-2 border-b px-2">
                                        Select Target Branches
                                    </div>

                                    {Object.keys(branchesByLocation).length === 0 ? (
                                        <div className="text-gray-500 text-sm p-4 text-center">No other branches available</div>
                                    ) : (
                                        Object.keys(branchesByLocation).map(loc => (
                                            <div key={loc} className="mb-1">
                                                <div className="text-sm font-bold text-gray-900 px-3 py-2 bg-gray-50 border-b border-gray-100">{loc}</div>
                                                <div className="py-1">
                                                    {branchesByLocation[loc].map(b => (
                                                        <label key={b.id} className="flex items-center gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors pl-6">
                                                            <input
                                                                type="checkbox"
                                                                checked={copyTargets.has(String(b.id))}
                                                                onChange={() => toggleCopyTarget(String(b.id))}
                                                                className="w-4 h-4 accent-blue-600 rounded border-gray-300"
                                                            />
                                                            <span className="text-sm text-gray-700">{b.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}

                                    <div className="mt-2 pt-2 border-t flex justify-between items-center sticky bottom-0 bg-white p-1">
                                        <span className="text-xs text-gray-500">{copyTargets.size} selected</span>
                                        <button
                                            onClick={handleCopy}
                                            disabled={copying || copyTargets.size === 0 || !selectedCopyFeeTypeId}
                                            className={`px-3 py-1 text-xs text-white rounded ${copying || copyTargets.size === 0 || !selectedCopyFeeTypeId ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                                        >
                                            {copying ? 'Copying...' : 'Confirm Copy'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Single Installment Form ── */}
                <div className="mb-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        {editingId ? 'Edit Installment' : 'Add New Installment'}
                    </h3>

                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                                <select
                                    name="fee_type_id"
                                    value={formData.fee_type_id || ''}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                >
                                    <option value="">Select FeeType</option>
                                    {feeTypes
                                        .filter(ft => {
                                            const cb = formData.branch || localStorage.getItem('currentBranch') || 'All';
                                            return !ft.branch || ft.branch === 'All' || ft.branch === cb;
                                        })
                                        .map(ft => (
                                            <option key={ft.id} value={ft.id}>{ft.fee_type}</option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Installment No *</label>
                                <input
                                    type="number"
                                    name="installment_no"
                                    value={formData.installment_no}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    placeholder="e.g., April Fee"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                                <input
                                    type="date"
                                    name="start_date"
                                    value={formData.start_date}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                                <input
                                    type="date"
                                    name="end_date"
                                    value={formData.end_date}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cut Off Date *</label>
                                <input
                                    type="date"
                                    name="last_pay_date"
                                    value={formData.last_pay_date}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div className="md:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                                    <select
                                        name="academic_year"
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        value={formData.academic_year}
                                        onChange={handleInputChange}
                                    >
                                        <option value="">Select Year</option>
                                        {academicYearOptions.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                placeholder="Optional description"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                className="px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                {editingId ? 'Update' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none"
                            >
                                Reset
                            </button>
                        </div>
                    </form>
                </div>

                {/* ── Bulk Generation Panel ── */}
                <div className="mb-6 bg-violet-50 p-6 rounded-lg border border-violet-200">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-violet-800">Bulk Generate Installments</h3>
                            <p className="text-sm text-violet-600 mt-0.5">Generate up to 12 installments in one click with automatic year rollover</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setBulkMode(!bulkMode)}
                            className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 text-sm font-medium"
                        >
                            {bulkMode ? '✕ Cancel' : '+ Bulk Generate'}
                        </button>
                    </div>

                    {bulkMode && (
                        <div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">

                                {/* Fee Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type *</label>
                                    <select
                                        name="fee_type_id"
                                        value={bulkConfig.fee_type_id}
                                        onChange={handleBulkChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="">Select Fee Type</option>
                                        {feeTypes
                                            .filter(ft => {
                                                const cb = bulkConfig.branch || localStorage.getItem('currentBranch') || 'All';
                                                return !ft.branch || ft.branch === 'All' || ft.branch === cb;
                                            })
                                            .map(ft => (
                                                <option key={ft.id} value={ft.id}>{ft.fee_type}</option>
                                            ))}
                                    </select>
                                </div>

                                {/* Starting Month */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Starting Month *</label>
                                    <select
                                        name="start_month_idx"
                                        value={bulkConfig.start_month_idx}
                                        onChange={handleBulkChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        {MONTHS.map((m, i) => (
                                            <option key={m} value={i}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Starting Year */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Starting Year *</label>
                                    <input
                                        type="number"
                                        name="year"
                                        value={bulkConfig.year}
                                        onChange={handleBulkChange}
                                        min={2020}
                                        max={2100}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                </div>

                                {/* Number of Installments */}
                                <div className="lg:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Number of Installments *
                                        <span className="ml-1 text-xs text-gray-400">(max 12)</span>
                                    </label>
                                    <div className="flex gap-2">
                                        {[3, 6, 12].map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setBulkConfig(prev => ({ ...prev, count: n }))}
                                                className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${bulkConfig.count === n
                                                    ? 'bg-violet-600 text-white border-violet-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:border-violet-400'
                                                    }`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                        <input
                                            type="number"
                                            name="count"
                                            value={bulkConfig.count}
                                            onChange={e => {
                                                const val = parseInt(e.target.value);
                                                if (isNaN(val)) return;
                                                if (val > 12) {
                                                    alert('Number of installments cannot exceed 12');
                                                    setBulkConfig(prev => ({ ...prev, count: 12 }));
                                                    return;
                                                }
                                                if (val < 1) {
                                                    setBulkConfig(prev => ({ ...prev, count: 1 }));
                                                    return;
                                                }
                                                setBulkConfig(prev => ({ ...prev, count: val }));
                                            }}
                                            min={1}
                                            max={12}
                                            placeholder="Custom"
                                            className={`w-24 px-2 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${bulkConfig.count > 12
                                                ? 'border-red-400 bg-red-50'
                                                : 'border-gray-300'
                                                }`}
                                        />
                                    </div>
                                    {bulkConfig.count > 12 && (
                                        <p className="text-xs text-red-500 mt-1">Maximum 12 installments allowed</p>
                                    )}
                                </div>

                                {/* Cut-off Day */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Cut-off Day of Month *
                                        <span className="ml-1 text-xs text-gray-400">(1–28, e.g. 5 = every 5th)</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="cutoff_day"
                                        value={bulkConfig.cutoff_day}
                                        onChange={handleBulkChange}
                                        min={1}
                                        max={28}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    />
                                </div>

                                {/* Academic Year */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                                    <select
                                        name="academic_year"
                                        value={bulkConfig.academic_year}
                                        onChange={handleBulkChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="">Select Year</option>
                                        {academicYearOptions.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Live Preview */}
                            <BulkPreview bulkConfig={bulkConfig} MONTHS={MONTHS} />

                            <div className="flex gap-3 mt-4">
                                <button
                                    type="button"
                                    onClick={generateBulkInstallments}
                                    disabled={bulkConfig.count > 12 || bulkConfig.count < 1}
                                    className={`px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium text-white ${bulkConfig.count > 12 || bulkConfig.count < 1
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-violet-600 hover:bg-violet-700'
                                        }`}
                                >
                                    Generate {bulkConfig.count} Installments
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBulkMode(false)}
                                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>


                {/* ── Installments Table ── */}
                <div className="overflow-x-auto">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Fee Installments</h3>
                    <table className="min-w-full bg-white border border-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                {/*<th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">No.</th>*/}
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Fee Type</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Title</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Start Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">End Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Last Pay Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Branch</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {installments.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                        No installments added yet
                                    </td>
                                </tr>
                            ) : (
                                installments.map(installment => (
                                    <tr key={installment.id} className="hover:bg-gray-50">
                                        {/*<td className="px-4 py-3 text-sm text-gray-800 border-b">{installment.installment_no}</td>*/}
                                        <td className="px-4 py-3 text-sm text-gray-600 border-b">{installment.fee_type_name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-800 border-b">
                                            {installment.title}
                                            {installment.is_admission && (
                                                <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Admission</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 border-b">
                                            {new Date(installment.start_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 border-b">
                                            {new Date(installment.end_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 border-b">
                                            {new Date(installment.last_pay_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 border-b">{installment.branch || 'All'}</td>
                                        <td className="px-4 py-3 text-center border-b">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(installment)}
                                                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(installment.id!)}
                                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                                >
                                                    🗑️ Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
};

export default FeeInstallments; 

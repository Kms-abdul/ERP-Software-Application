import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

interface FeeType {
    id: number;
    fee_type: string;
    category: string;
}

interface ConcessionItem {
    id: number;
    fee_type_id: number;
    fee_type_name: string;
    percentage: number;
}

interface ConcessionGroup {
    title: string;
    description: string;
    academic_year: string;
    is_percentage: boolean;
    show_in_payment: boolean;
    items: ConcessionItem[];
    branch?: string;
}

interface BranchOption {
    id: number | string;
    name: string;
    location_name: string;
}

const ConcessionMaster: React.FC = () => {
    const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
    const [concessions, setConcessions] = useState<ConcessionGroup[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [academicYear, setAcademicYear] = useState(localStorage.getItem('academicYear') || '');
    const [branch, setBranch] = useState('All');
    const [showInPayment, setShowInPayment] = useState(false);
    const [globalAmount, setGlobalAmount] = useState('');
    const [concessionItems, setConcessionItems] = useState<Record<number, number | string>>({});

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);

    const [originalTitle, setOriginalTitle] = useState('');
    const [originalYear, setOriginalYear] = useState('');

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    // Copy Feature State
    const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
    const [sourceBranchId, setSourceBranchId] = useState<string | number>('');
    const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copying, setCopying] = useState(false);
    const copyDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);


    // Fetch Data on load
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isBranchUser = user.role !== 'Admin';

        let initialBranch = "All";
        if (isBranchUser && user.branch) {
            initialBranch = user.branch;
        } else {
            initialBranch = localStorage.getItem('currentBranch') || 'All';
        }


        setBranch(initialBranch);

        // Fetch Branches for Copy Feature
        if (initialBranch !== 'All' && initialBranch !== 'All Branches') {

            api.get('/branches').then(res => {
                const branchList = res.data.branches || [];
                const mappedBranches = branchList.map((b: any) => ({
                    id: b.id,
                    name: b.branch_name,
                    location_name: b.location_name || 'Unknown Location'
                }));
                setAllBranches(mappedBranches);

                const b = branchList.find((br: any) => br.branch_name.toLowerCase() === initialBranch.toLowerCase());
                if (b) {
                    setSourceBranchId(b.id);
                }
            }).catch(err => console.error("Error fetching branch info:", err));
        }

        fetchFeeTypes();
        fetchConcessions();
    }, []);

    const fetchFeeTypes = async () => {
        try {

            const response = await api.get('/fee-types');
            setFeeTypes(response.data.fee_types);
            resetItems(response.data.fee_types);
        } catch (error) {
            console.error("Error fetching fee types:", error);
        }
    };

    const fetchConcessions = async () => {
        try {

            const response = await api.get('/concessions');

            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const allConcessions = response.data.concessions;

            // Filter by branch
            // If Admin: Filter by globalBranch (selected in header)
            // If User: Show all returned (Backend filters strictly)

            let filtered = allConcessions;
            if (user.role === 'Admin') {
                filtered = globalBranch === 'All' || globalBranch === 'All Branches'
                    ? allConcessions
                    : allConcessions.filter((c: ConcessionGroup) => c.branch === globalBranch || c.branch === 'All');
            } else {
                // For Branch User, just show what backend returned (which is their branch + All)
                filtered = allConcessions;
            }

            setConcessions(filtered);
        } catch (error) {
            console.error("Error fetching concessions:", error);
        }
    };

    const resetItems = (types: FeeType[]) => {
        const initialItems: Record<number, number | string> = {};
        types.forEach(ft => {
            initialItems[ft.id] = '';
        });
        setConcessionItems(initialItems);
    };

    // Copy Logic
    const toggleCopyTarget = (branchId: string) => {
        const newTargets = new Set(copyTargets);
        if (newTargets.has(branchId)) {
            newTargets.delete(branchId);
        } else {
            newTargets.add(branchId);
        }
        setCopyTargets(newTargets);
    };

    const handleCopyConcessions = async () => {
        if (copyTargets.size === 0) {
            alert("Please select at least one branch to copy to.");
            return;
        }

        if (!confirm(`Are you sure you want to copy all concessions to ${copyTargets.size} branches? Duplicates will be skipped.`)) {
            return;
        }

        setCopying(true);
        try {

            await api.post('/fees/copy-concessions', {
                source_branch_id: sourceBranchId,
                target_branch_ids: Array.from(copyTargets),
                academic_year: academicYear
            });
            alert("Concessions copied successfully!");
            setCopyTargets(new Set());
            setIsCopyDropdownOpen(false);
        } catch (error: any) {
            console.error("Copy failed", error);
            alert(error.response?.data?.error || "Failed to copy concessions.");
        } finally {
            setCopying(false);
        }
    };

    const handleCopy = () => {
        if (!globalAmount) return;
        const val = parseFloat(globalAmount);
        if (isNaN(val)) return;

        const newItems = { ...concessionItems };
        feeTypes.forEach(ft => {
            newItems[ft.id] = val;
        });
        setConcessionItems(newItems);
    };

    const handleItemChange = (id: number, val: string) => {
        if (val === '') {
            setConcessionItems(prev => ({ ...prev, [id]: '' }));
            return;
        }
        setConcessionItems(prev => ({ ...prev, [id]: val }));
    };

    const handleEdit = (concession: ConcessionGroup) => {
        setTitle(concession.title);
        setDescription(concession.description || '');
        setAcademicYear(concession.academic_year);
        setBranch(concession.branch || 'All');
        setShowInPayment(concession.show_in_payment || false);

        // Populate items
        const newItems: Record<number, number | string> = {};
        // First reset to ''
        feeTypes.forEach(ft => newItems[ft.id] = '');
        // Then fill with existing data
        concession.items.forEach(item => {
            newItems[item.fee_type_id] = item.percentage;
        });
        setConcessionItems(newItems);

        // Set Edit Mode
        setIsEditing(true);
        setOriginalTitle(concession.title);
        setOriginalYear(concession.academic_year);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setMessage("Editing mode enabled. Make changes and click Update.");
    };

    const handleDelete = async (title: string, year: string) => {
        if (!window.confirm(`Are you sure you want to delete "${title}" for ${year}?`)) return;

        try {

            await api.delete(`/concessions/${encodeURIComponent(title)}/${encodeURIComponent(year)}`);
            setMessage("Concession deleted successfully");
            fetchConcessions();
        } catch (error: any) {
            console.error("Error deleting concession:", error);
            alert("Student record exist for this concession,Cannot delete");
        }
    };

    const handleSave = async () => {
        if (!title || !academicYear) {
            alert("Please fill Title and Academic Year");
            return;
        }

        setLoading(true);
        setMessage('');

        try {


            const items = Object.keys(concessionItems).map(key => ({
                fee_type_id: parseInt(key),
                percentage: parseFloat(concessionItems[parseInt(key)] as string) || 0
            }));

            const payload = {
                title,
                description,
                academic_year: academicYear,
                branch,
                is_percentage: false,
                show_in_payment: showInPayment,
                items
            };

            if (isEditing) {
                // UPDATE
                await api.put(`/concessions/${encodeURIComponent(originalTitle)}/${encodeURIComponent(originalYear)}`, payload);
                setMessage("Concession updated successfully!");
            } else {
                // CREATE
                await api.post('/concessions', payload);
                setMessage("Concession created successfully!");
            }

            // Reset form
            handleReset();
            fetchConcessions();

        } catch (error: any) {
            console.error("Error saving concession:", error);
            setMessage(`Error: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setTitle('');
        setDescription('');
        setGlobalAmount('');
        setAcademicYear(localStorage.getItem('academicYear') || '');

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.role !== 'Admin' && user.branch) {
            setBranch(user.branch);
        } else {
            setBranch(localStorage.getItem('currentBranch') || 'All');
        }

        setShowInPayment(false);
        setIsEditing(false);
        setOriginalTitle('');
        setOriginalYear('');
        resetItems(feeTypes);
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* FORM SECTION */}
                <div className="bg-white rounded-lg shadow-md border p-6">
                    <div className="flex items-center space-x-2 mb-6 border-b pb-4">
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <h2 className="text-xl font-semibold text-gray-800">
                            {isEditing ? 'Edit Concession Type' : 'Add Concession Type'}
                        </h2>
                    </div>

                    {/* Copy Button */}
                    {allBranches.length > 0 && sourceBranchId && (
                        <div className="flex justify-end mb-4 relative" ref={copyDropdownRef}>
                            <button
                                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-2 shadow-sm bottom-10"
                                onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                            >
                                <span>Copy to Branches</span>
                                <span className="text-xs">▼</span>
                            </button>
                            {isCopyDropdownOpen && (
                                <div className="absolute top-12 right-0 w-80 bg-white border shadow-xl rounded z-50 p-2 max-h-96 overflow-y-auto">
                                    <div className="mb-2 text-sm font-semibold text-gray-700 pb-2 border-b px-2">
                                        Select Target Branches
                                    </div>
                                    {/* Copy Grouping Logic Inline or we can compute above. Let's compute inline to save lines in helper */}
                                    {(() => {
                                        const availableBranches = allBranches.filter(b => String(b.id) !== String(sourceBranchId) && b.name !== 'All Branches' && b.name !== 'All');
                                        const branchesByLocation: { [key: string]: BranchOption[] } = {};
                                        availableBranches.forEach(b => {
                                            if (!branchesByLocation[b.location_name]) {
                                                branchesByLocation[b.location_name] = [];
                                            }
                                            branchesByLocation[b.location_name].push(b);
                                        });

                                        if (Object.keys(branchesByLocation).length === 0) {
                                            return <div className="text-gray-500 text-sm p-4 text-center">No other branches available</div>
                                        }
                                        return Object.keys(branchesByLocation).map(loc => (
                                            <div key={loc} className="mb-1">
                                                <div className="text-sm font-bold text-gray-900 px-3 py-2 bg-gray-50 border-b border-gray-100">
                                                    {loc}
                                                </div>
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
                                        ));
                                    })()}

                                    <div className="mt-2 pt-2 border-t flex justify-between items-center sticky bottom-0 bg-white p-1">
                                        <span className="text-xs text-gray-500">{copyTargets.size} selected</span>
                                        <button
                                            onClick={handleCopyConcessions}
                                            disabled={copying || copyTargets.size === 0}
                                            className={`px-3 py-1 text-xs text-white rounded ${copying || copyTargets.size === 0 ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                                        >
                                            {copying ? "Copying..." : "Confirm Copy"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title*</label>
                            <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-violet-500 focus:border-violet-500"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Sibling Discount"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-violet-500 focus:border-violet-500"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                                    value={academicYear}
                                    readOnly
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                                    value={branch}
                                    readOnly
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-pink-50 p-4 rounded-md border border-pink-100 mb-6">
                            <span className="text-gray-700 font-medium">Set Global Concession Amount</span>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="number"
                                    className="border border-gray-300 rounded-md px-3 py-2 w-40"
                                    placeholder="Enter Amount"
                                    value={globalAmount}
                                    onChange={e => setGlobalAmount(e.target.value)}
                                />
                                <button
                                    onClick={handleCopy}
                                    className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 font-medium"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 mb-4">
                            <input
                                type="checkbox"
                                id="showInPayment"
                                className="form-checkbox h-5 w-5 text-violet-600 rounded"
                                checked={showInPayment}
                                onChange={e => setShowInPayment(e.target.checked)}
                            />
                            <label htmlFor="showInPayment" className="text-gray-700 font-medium cursor-pointer">
                                Show in Fee Payment Dropdown?
                            </label>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="border rounded-md overflow-hidden mb-6">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded"
                                            checked={feeTypes.length > 0 && feeTypes.every(ft => selectedIds.has(ft.id))}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    setSelectedIds(new Set(feeTypes.map(ft => ft.id)));
                                                } else {
                                                    setSelectedIds(new Set());
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Fee Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Concession Amount
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {feeTypes.map(ft => (
                                    <tr key={ft.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                className="rounded"
                                                checked={selectedIds.has(ft.id)}
                                                onChange={e => {
                                                    const next = new Set(selectedIds);
                                                    if (e.target.checked) next.add(ft.id);
                                                    else next.delete(ft.id);
                                                    setSelectedIds(next);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {ft.fee_type}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="number"
                                                className="border border-gray-300 rounded-md px-3 py-1 w-full focus:ring-violet-500 focus:border-violet-500"
                                                value={concessionItems[ft.id] !== undefined ? concessionItems[ft.id] : ''}
                                                onChange={e => handleItemChange(ft.id, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {message && (
                        <div className={`p-4 mb-4 rounded-md ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {message}
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 border-t pt-4">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                            {isEditing ? 'Cancel Edit' : 'Reset'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : (isEditing ? 'Update Concession' : 'Save Concession')}
                        </button>
                    </div>
                </div>

                {/* LIST SECTION */}
                <div className="bg-white rounded-lg shadow-md border p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Existing Concessions</h3>

                    {concessions.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No concessions found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Academic Year</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Show in Payment</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {concessions.map((c, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{c.title}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">{c.academic_year}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                <span className={`px-2 py-1 rounded-full text-xs ${!c.branch || c.branch === 'All' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                    {c.branch || 'All'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                {c.show_in_payment ? (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Yes</span>
                                                ) : (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">No</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">{c.description}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleEdit(c)}
                                                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(c.title, c.academic_year)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ConcessionMaster;

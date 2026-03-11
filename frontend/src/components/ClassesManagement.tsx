import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

interface Branch {
    id: number;
    branch_name: string;
    branch_code: string;
    location_name?: string;
}

interface SectionDetail {
    id: number;
    name: string;
    strength: number;
    branch_id: number;
}

interface ClassData {
    id: number;
    class_name: string;
    class_teacher?: string;
    class_monitor?: string;
    total_students?: number;
    section?: string;
    sections?: SectionDetail[];
}

interface SectionData {
    id: number;
    name: string;
    studentStrength: string;
}

interface ClassesManagementProps {
    navigateTo?: (page: any) => void;
}

const ClassesManagement: React.FC<ClassesManagementProps> = ({ navigateTo }) => {
    const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
    const [selectedClass, setSelectedClass] = useState<string>('all');
    const [selectedSection, setSelectedSection] = useState<string>('all');
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [newClassName, setNewClassName] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [classSummary, setClassSummary] = useState<ClassData[]>([]); // For Create View Summary
    const [branches, setBranches] = useState<Branch[]>([]);
    const [masterClasses, setMasterClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Form State
    const [sections, setSections] = useState<SectionData[]>([{ id: 1, name: '', studentStrength: '' }]);

    // Copy Feature State
    const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const copyDropdownRef = useRef<HTMLDivElement>(null);
    const [copying, setCopying] = useState(false);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Mock data for list view
    const mockClasses: ClassData[] = [

    ];


    useEffect(() => {
        setClasses(mockClasses);
        fetchBranches();
        fetchMasterClasses();
    }, []);

    // Effect to set default branch from localStorage and fetch summary
    useEffect(() => {
        if (branches.length > 0) {
            const storedBranchName = localStorage.getItem('currentBranch');
            if (storedBranchName && storedBranchName !== 'All') {
                const matchingBranch = branches.find(b => b.branch_name === storedBranchName);
                if (matchingBranch) {
                    setSelectedBranch(matchingBranch.id.toString());
                    fetchClassSummary(matchingBranch.id.toString());
                } else {
                    fetchClassSummary(); // Fetch all if active branch mapping fails
                }
            } else {
                fetchClassSummary(); // Fetch all
            }
        }
    }, [branches]);


    const fetchMasterClasses = async () => {
        try {
            const res = await api.get('/classes');
            if (res.data && res.data.classes) {
                setMasterClasses(res.data.classes);
            }
        } catch (error) {
            console.error("Failed to fetch master classes", error);
        }
    };

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            if (res.data && res.data.branches) {
                setBranches(res.data.branches);
            }
        } catch (error) {
            console.error("Failed to fetch branches", error);
        }
    };

    const fetchClassSummary = async (branchId?: string) => {
        try {
            setLoading(true);
            const academicYear = localStorage.getItem('academicYear') || "2025-2026";
            let url = `/classes/summary?academic_year=${academicYear}`;

            // If branchId is passed, use it. Otherwise use state or default.
            // Note: State might not be updated yet if called from effect, so prefer arg.
            const bid = branchId || selectedBranch;
            if (bid) {
                url += `&branch_id=${bid}`;
            }

            const res = await api.get(url);
            if (res.data) {
                setClassSummary(res.data);
            }
        } catch (error) {
            console.error("Failed to fetch class summary", error);
        } finally {
            setLoading(false);
        }
    };


    const filteredClasses = classes.filter(cls => {
        const classMatch = selectedClass === 'all' || cls.class_name.includes(selectedClass);
        const sectionMatch = selectedSection === 'all' || cls.section === selectedSection;
        return classMatch && sectionMatch;
    });

    const addSection = () => {
        const newSection: SectionData = {
            id: sections.length + 1,
            name: '',
            studentStrength: ''
        };
        setSections([...sections, newSection]);
    };

    const removeSection = (id: number) => {
        if (sections.length > 1) {
            setSections(sections.filter(section => section.id !== id));
        }
    };

    const updateSection = (id: number, field: 'name' | 'studentStrength', value: string) => {
        setSections(sections.map(section =>
            section.id === id ? { ...section, [field]: value } : section
        ));
    };

    const handleSaveClass = async () => {
        if (!newClassName.trim()) {
            alert("Class Name is required");
            return;
        }
        if (!selectedBranch) {
            alert("Please select a branch");
            return;
        }

        const sectionsPayload = sections.map(s => ({
            name: s.name,
            strength: parseInt(s.studentStrength) || 0
        })).filter(s => s.name && s.strength > 0);

        if (sectionsPayload.length === 0) {
            alert("Please add at least one valid section with strength");
            return;
        }

        const payload = {
            class_name: newClassName,
            branch_id: parseInt(selectedBranch),
            academic_year: localStorage.getItem('academicYear') || "2025-26",
            sections: sectionsPayload
        };

        try {
            await api.post('/classes/create_with_sections', payload);
            alert("Class saved successfully!");
            handleReset();
            // Refresh summary with current selection
            fetchClassSummary();
        } catch (error: any) {
            console.error("Save failed", error);
            alert(error.response?.data?.error || "Failed to save class");
        }
    };

    const handleReset = () => {
        setNewClassName('');
        //setSelectedBranch('');
        setSections([{ id: 1, name: '', studentStrength: '' }]);
    };

    const handleEditClass = (cls: ClassData) => {
        setNewClassName(cls.class_name);
        if (cls.sections && cls.sections.length > 0) {
            const formSections: SectionData[] = cls.sections.map((s, index) => ({
                id: index + 1,
                name: s.name,
                studentStrength: s.strength.toString()
            }));
            setSections(formSections);

            if (cls.sections[0].branch_id) {
                setSelectedBranch(cls.sections[0].branch_id.toString());
            }
        } else {
            setSections([{ id: 1, name: '', studentStrength: '' }]);
        }
    };

    // Copy Targets Logic
    const toggleCopyTarget = (branchId: string) => {
        const newTargets = new Set(copyTargets);
        if (newTargets.has(branchId)) {
            newTargets.delete(branchId);
        } else {
            newTargets.add(branchId);
        }
        setCopyTargets(newTargets);
    };

    const handleCopyBranchStructure = async () => {
        if (!selectedBranch || selectedBranch === 'all' || selectedBranch === '') {
            alert("Please select a specific Source Branch first (not 'All').");
            return;
        }

        if (copyTargets.size === 0) {
            alert("Please select at least one target branch.");
            return;
        }

        if (!confirm(`Are you sure you want to copy ALL classes and sections from the current branch to ${copyTargets.size} other branches?`)) {
            return;
        }

        setCopying(true);
        try {
            const payload = {
                source_branch_id: selectedBranch,
                target_branch_ids: Array.from(copyTargets),
                academic_year: localStorage.getItem('academicYear') || "2025-2026"
            };

            const res = await api.post('/classes/copy_branch_structure', payload);
            alert(`Copy Successful!\nCopied Sections: ${res.data.copied_sections}\nSkipped (Existing): ${res.data.skipped_sections}`);
            setCopyTargets(new Set());
            setIsCopyDropdownOpen(false);
            // Refresh to show changes if we copied to a branch we might switch to? 
            // Doesn't affect current view much unless we switch.
        } catch (error: any) {
            console.error("Copy failed", error);
            alert(error.response?.data?.error || "Failed to copy branch structure");
        } finally {
            setCopying(false);
        }
    };

    // Group Branches for Copy Dropdown
    const availableBranches = branches.filter(b => String(b.id) !== selectedBranch && String(b.id) !== 'All'); // Exclude current and 'All'
    const branchesByLocation: { [key: string]: Branch[] } = {};
    availableBranches.forEach(b => {
        const loc = b.location_name || "Other";
        if (!branchesByLocation[loc]) {
            branchesByLocation[loc] = [];
        }
        branchesByLocation[loc].push(b);
    });


    // Check Role Access
    const userRole = JSON.parse(localStorage.getItem('user') || '{}').role;
    if (userRole !== 'Admin') {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh]">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Restricted</h2>
                    <p className="text-gray-600 mb-6">Only Administrators can access Classes Management.</p>
                    {navigateTo && (
                        <button
                            onClick={() => navigateTo('dashboard')}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // List View - First screen
    if (viewMode === 'list') {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="w-full">
                    {/* Header Section */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-purple-600 text-white p-2 rounded-lg">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-800">Classes</h1>
                            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                Get Help
                            </button>
                        </div>
                        <div className="flex gap-3">
                            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-md">
                                Assign Class Teachers
                            </button>
                            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-md">
                                Assign Display Order
                            </button>
                            <button
                                onClick={() => setViewMode('create')}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-md flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add/Edit Class
                            </button>
                        </div>
                    </div>

                    {/* Filters Section */}
                    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Class Selection
                                </label>
                                <select
                                    value={selectedClass}
                                    onChange={(e) => setSelectedClass(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                >
                                    <option value="all">All classes</option>

                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Section Selection
                                </label>
                                <select
                                    value={selectedSection}
                                    onChange={(e) => setSelectedSection(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                >
                                    <option value="all">Class Group</option>

                                </select>
                            </div>
                            <div className="flex items-end">
                                <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-purple-600 text-white">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Class Name</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Class Teacher</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Class Monitor</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Total Students</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredClasses.map((cls, index) => (
                                        <tr
                                            key={cls.id}
                                            className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                                        >
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{cls.class_name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {cls.class_teacher || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {cls.class_monitor || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 font-medium">{cls.total_students}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2">
                                                    <button className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors">
                                                        Assign Roll No
                                                    </button>
                                                    <button className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors">
                                                        Assign Subject Teacher
                                                    </button>
                                                    <button className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors">
                                                        Assign Class Monitor
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredClasses.length === 0 && (
                            <div className="text-center py-12">
                                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No classes found</h3>
                                <p className="mt-1 text-sm text-gray-500">Get started by adding a new class.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Create/Edit View - Second screen
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                    </svg>
                    <h1 className="text-xl font-bold text-gray-800">CREATE CLASS AND SECTION /</h1>
                    <button
                        onClick={() => setViewMode('list')}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                        Back
                    </button>
                </div>
            </div>

            {/* Main Content - Two Column Layout */}
            <div className="p-6">
                <div className="grid grid-cols-2 gap-6">
                    {/* Left Column - Class Summary */}
                    <div className="bg-white rounded-lg shadow-md">
                        <div className="p-4 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                                </svg>
                                <h2 className="font-semibold text-gray-800">Class Summary</h2>
                            </div>
                            <div className="flex items-center gap-2">

                                {/* Copy Structure Button (Header) */}
                                <div className="relative" ref={copyDropdownRef}>
                                    <button
                                        onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                                        className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                                        title="Copy all classes to other branches"
                                    >
                                        <span>Copy Structure</span>
                                        <svg className={`w-4 h-4 transition-transform ${isCopyDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {isCopyDropdownOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-72 bg-white border shadow-xl rounded z-50 max-h-80 overflow-y-auto">
                                            <div className="sticky top-0 bg-gray-50 px-3 py-2 border-b text-xs font-semibold text-gray-700 uppercase">
                                                Target Branches
                                            </div>

                                            {Object.keys(branchesByLocation).length === 0 ? (
                                                <div className="p-3 text-center text-sm text-gray-500">
                                                    {(selectedBranch === 'all' || !selectedBranch)
                                                        ? "Please select a source branch first."
                                                        : "No other branches available"}
                                                </div>
                                            ) : (
                                                Object.keys(branchesByLocation).map(loc => (
                                                    <div key={loc}>
                                                        <div className="px-3 py-1 bg-gray-100 text-xs font-bold text-gray-600">
                                                            {loc}
                                                        </div>
                                                        {branchesByLocation[loc].map(b => (
                                                            <label key={b.id} className="flex items-center gap-2 px-4 py-2 hover:bg-purple-50 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={copyTargets.has(String(b.id))}
                                                                    onChange={() => toggleCopyTarget(String(b.id))}
                                                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                                />
                                                                <span className="text-sm text-gray-700">{b.branch_name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                ))
                                            )}

                                            <div className="sticky bottom-0 bg-white border-t p-2 flex justify-between items-center">
                                                <span className="text-xs text-gray-500">{copyTargets.size} selected</span>
                                                <button
                                                    onClick={handleCopyBranchStructure}
                                                    disabled={copying || copyTargets.size === 0}
                                                    className={`px-3 py-1 text-xs text-white rounded ${copying || copyTargets.size === 0 ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                                                >
                                                    {copying ? "Copying..." : "Confirm Copy"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Class</th>
                                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Section</th>
                                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                                <div className="flex justify-center items-center">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                                                    <span className="ml-2">Loading classes...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : classSummary.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                                No classes found for this branch/year.
                                            </td>
                                        </tr>
                                    ) : (
                                        classSummary.map((cls) => (
                                            <tr key={cls.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-900">{cls.class_name}</td>
                                                <td className="px-4 py-3 text-sm text-gray-700">
                                                    {cls.sections?.map(s => s.name).join(', ') || '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditClass(cls)}
                                                            className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                            </svg>
                                                        </button>

                                                    </div>
                                                </td>
                                            </tr>
                                        )))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Column - Create Class Form */}
                    <div className="bg-white rounded-lg shadow-md">
                        <div className="p-4 border-b flex items-center gap-2">
                            <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" />
                            </svg>
                            <h2 className="font-semibold text-gray-800">Create Class</h2>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Class Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Class<span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    list="master-classes-list"
                                    value={newClassName}
                                    onChange={(e) => setNewClassName(e.target.value)}
                                    placeholder="5"
                                    className="w-full px-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                                <datalist id="master-classes-list">
                                    {masterClasses.map((c) => (
                                        <option key={c.id} value={c.class_name} />
                                    ))}
                                </datalist>
                            </div>


                            {/* Section Management */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <label className="text-sm font-medium text-gray-700">Section</label>
                                    <button
                                        onClick={addSection}
                                        className="bg-blue-500 text-white w-6 h-6 rounded flex items-center justify-center hover:bg-blue-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>

                                </div>

                                <div className="border rounded overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Section Name</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Student Strength</th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {sections.map((section) => (
                                                <tr key={section.id} className="bg-white">
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            value={section.name}
                                                            onChange={(e) => updateSection(section.id, 'name', e.target.value)}
                                                            placeholder="Section Name"
                                                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            value={section.studentStrength}
                                                            onChange={(e) => updateSection(section.id, 'studentStrength', e.target.value)}
                                                            placeholder="Student Strength"
                                                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            onClick={() => removeSection(section.id)}
                                                            disabled={sections.length === 1}
                                                            className={`bg-red-500 text-white w-7 h-7 rounded flex items-center justify-center hover:bg-red-600 transition-colors ${sections.length === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* Branch Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Assign to the Branch<span className="text-red-500">*</span>
                                </label>
                                <select
                                    disabled // This makes it read-only
                                    value={selectedBranch}
                                    className="w-full px-4 py-2 border border-gray-300 rounded bg-gray-100 cursor-not-allowed appearance-none"
                                >
                                    <option value="">- Select-Branch -</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.branch_name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={handleReset}
                                    className="px-5 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Reset
                                </button>
                                <button
                                    onClick={handleSaveClass}
                                    className="px-5 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
                                >
                                    Save
                                </button>
                            </div>

                            {/* Copy logic moved to Header */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClassesManagement;

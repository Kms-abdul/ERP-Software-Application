import React, { useState, useEffect } from 'react';
import api from '../api';
import { Student } from '../types';

interface PromoteStudentsProps {
    onBack?: () => void;
}

const PromoteStudents: React.FC<PromoteStudentsProps> = ({ onBack }) => {
    // -------------------------------------------------------------
    // Source State 
    // -------------------------------------------------------------
    const [sourceYear, setSourceYear] = useState(localStorage.getItem('academicYear') || '');
    const [sourceClass, setSourceClass] = useState('');
    const [sourceSection, setSourceSection] = useState('');
    const [sourceStudents, setSourceStudents] = useState<Student[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
    const [sourceSearch, setSourceSearch] = useState('');

    // -------------------------------------------------------------
    // Target State
    // -------------------------------------------------------------
    const [targetYear, setTargetYear] = useState('');
    const [targetClass, setTargetClass] = useState('');
    const [targetSection, setTargetSection] = useState('');
    const [targetStudents, setTargetStudents] = useState<Student[]>([]); // To show who is already there

    // -------------------------------------------------------------
    // Common Data
    // -------------------------------------------------------------
    const [years, setYears] = useState<string[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [sourceSections, setSourceSections] = useState<string[]>([]);
    const [targetSections, setTargetSections] = useState<string[]>([]);
    const [loadingSource, setLoadingSource] = useState(false);
    const [loadingTarget, setLoadingTarget] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        // Fetch Metadata
        api.get('/classes').then(res => setClasses(res.data.classes || []));
        api.get('/org/academic-years').then(res => {
            const y = res.data.academic_years?.map((item: any) => item.name) || [];
            setYears(y);
        });
    }, []);

    useEffect(() => {
        if (!sourceClass) {
            setSourceSections([]);
            setSourceSection('');
            return;
        }
        const branch = localStorage.getItem('currentBranch') || 'All';
        api.get('/sections', {
            params: {
                class: sourceClass,
                branch,
                academic_year: sourceYear,
            }
        })
            .then(res => setSourceSections(res.data.sections || []))
            .catch(() => setSourceSections([]));
    }, [sourceClass, sourceYear]);

    useEffect(() => {
        if (!targetClass) {
            setTargetSections([]);
            setTargetSection('');
            return;
        }
        const branch = localStorage.getItem('currentBranch') || 'All';
        api.get('/sections', {
            params: {
                class: targetClass,
                branch,
                academic_year: targetYear,
            }
        })
            .then(res => setTargetSections(res.data.sections || []))
            .catch(() => setTargetSections([]));
    }, [targetClass, targetYear]);

    // Fetch Source Students
    useEffect(() => {
        if (!sourceYear || !sourceClass) return;
        setLoadingSource(true);
        const globalBranch = localStorage.getItem('currentBranch') || 'All';

        // We need a way to fetch students BY ACADEMIC YEAR (History)
        // Check if our /students endpoint supports 'academic_year' explicitly, 
        // or we rely on the Header 'X-Academic-Year' which usually drives global state.
        // But here we might want to override.
        // Assuming we update /students to accept `academic_year` param specifically or we use the Header trick.
        // Let's try passing param first.

        api.get('/students', {
            params: {
                class: sourceClass,
                section: sourceSection,
                search: sourceSearch,
                branch: globalBranch,
                include_fee_due: true,
                // We need to tell backend we want THIS specific year's data
                // If backend relies solely on Header, we might need to swap header or update backend.
                // Assuming we updated backend to look for ANY year if provided (we need to verify this).
            },
            headers: {
                'X-Academic-Year': sourceYear // Override header for this request
            }
        })
            .then(res => setSourceStudents(res.data.students || []))
            .catch(err => {
                console.error(err);
                alert("Error fetching source students: " + (err.response?.data?.error || err.message));
            })
            .finally(() => setLoadingSource(false));
    }, [sourceYear, sourceClass, sourceSection, sourceSearch]);

    // Fetch Target Students (to see availability)
    useEffect(() => {
        if (!targetYear || !targetClass) return;
        setLoadingTarget(true);
        const globalBranch = localStorage.getItem('currentBranch') || 'All';

        api.get('/students', {
            params: {
                class: targetClass,
                section: targetSection,
                branch: globalBranch
            },
            headers: {
                'X-Academic-Year': targetYear
            }
        })
            .then(res => setTargetStudents(res.data.students || []))
            .catch(err => console.error(err))
            .finally(() => setLoadingTarget(false));
    }, [targetYear, targetClass, targetSection]);


    const eligibleStudents = sourceStudents.filter(s => !s.total_due || s.total_due <= 0);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedStudentIds(eligibleStudents.map(s => s.student_id).filter((id): id is number => id !== undefined));
        } else {
            setSelectedStudentIds([]);
        }
    };

    const handleSelectOne = (id: number | undefined) => {
        if (!id) return;
        if (selectedStudentIds.includes(id)) {
            setSelectedStudentIds(selectedStudentIds.filter(i => i !== id));
        } else {
            setSelectedStudentIds([...selectedStudentIds, id]);
        }
    };

    const handleUpgrade = async () => {
        if (selectedStudentIds.length === 0) return alert("Select students to upgrade");
        if (!targetYear || !targetClass) return alert("Select Target Year and Class");
        if (sourceYear === targetYear) return alert("Source and Target Year cannot be same");

        if (!confirm(`Promote ${selectedStudentIds.length} students to Class ${targetClass} (${targetYear})?`)) return;

        setProcessing(true);
        try {
            await api.post('/students/promote-bulk', {
                student_ids: selectedStudentIds,
                target_year: targetYear,
                target_class: targetClass,
                target_section: targetSection
            });
            alert("Students Promoted Successfully!");
            // Refresh
            setSourceStudents(prev =>
                prev.filter(s => s.student_id === undefined || !selectedStudentIds.includes(s.student_id))
            ); // Remove locally or refresh
            setSelectedStudentIds([]);

            // Reload target list
            const globalBranch = localStorage.getItem('currentBranch') || 'All';
            const res = await api.get('/students', {
                params: { class: targetClass, section: targetSection, branch: globalBranch },
                headers: { 'X-Academic-Year': targetYear }
            });
            setTargetStudents(res.data.students || []);

        } catch (error) {
            console.error(error);
            alert("Failed to promote students Please Check If students are already in targeted class and Academic Year");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="p-4 bg-gray-100 min-h-screen">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Bulk Student Upgrade</h2>
                {onBack && <button onClick={onBack} className="text-sm bg-gray-200 px-3 py-1 rounded">Back</button>}
            </div>

            <div className="flex gap-4 h-[80vh]">
                {/* ----------------- SOURCE PANEL ----------------- */}
                <div className="flex-1 bg-white rounded shadow flex flex-col">
                    <div className="p-3 border-b bg-indigo-50 rounded-t">
                        <h3 className="font-semibold text-indigo-700">Source (Current State)</h3>
                        <div className="flex gap-2 mt-2">
                            <select value={sourceYear} onChange={e => setSourceYear(e.target.value)} className="border p-1 rounded text-sm w-1/3">
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={sourceClass} onChange={e => setSourceClass(e.target.value)} className="border p-1 rounded text-sm w-1/3">
                                <option value="">Select Class</option>
                                {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                            <select value={sourceSection} onChange={e => setSourceSection(e.target.value)} className="border p-1 rounded text-sm w-1/4">
                                <option value="">All Sec</option>
                                {sourceSections.map(section => <option key={section} value={section}>{section}</option>)}
                            </select>
                        </div>
                        <input
                            placeholder="Search Source Students..."
                            className="w-full border p-1 rounded text-sm mt-2"
                            value={sourceSearch}
                            onChange={e => setSourceSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-auto p-2">
                        <h4 className="text-sm font-bold mb-2">{sourceStudents.length} Students Found</h4>
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="p-2 border"><input type="checkbox" onChange={handleSelectAll} checked={eligibleStudents.length > 0 && selectedStudentIds.length === eligibleStudents.length} /></th>
                                    <th className="p-2 border">Adm No</th>
                                    <th className="p-2 border">Name</th>
                                    <th className="p-2 border">Class</th>
                                    <th className="p-2 border text-right">Total Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingSource ? <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr> :
                                    sourceStudents.map((s) => {
                                        const hasDue = s.total_due && s.total_due > 0;
                                        return (
                                            <tr key={s.student_id} className="hover:bg-indigo-50">
                                                <td className="p-2 border">
                                                    <input
                                                        type="checkbox"
                                                        checked={s.student_id ? selectedStudentIds.includes(s.student_id) : false}
                                                        onChange={() => {
                                                            if (hasDue) {
                                                                alert(`Cannot select student. Pending due: ₹${s.total_due}`);
                                                                return;
                                                            }
                                                            handleSelectOne(s.student_id);
                                                        }}
                                                        disabled={Boolean(hasDue)}
                                                        title={hasDue ? 'Clear dues to promote' : undefined}
                                                    />
                                                </td>
                                                <td className="p-2 border">{s.admNo}</td>
                                                <td className="p-2 border">{s.first_name || s.name} {s.last_name || ''}</td>
                                                <td className="p-2 border">{s.class} {s.section}</td>
                                                <td className={`p-2 border text-right ${hasDue ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                                                    ₹{s.total_due || 0}
                                                </td>
                                            </tr>
                                        )
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ----------------- ACTION CENTER ----------------- */}
                <div className="flex flex-col justify-center items-center gap-4 w-32">
                    <button
                        onClick={handleUpgrade}
                        disabled={selectedStudentIds.length === 0 || processing}
                        className={`px-4 py-8 rounded font-bold shadow-lg transform transition-all 
                            ${selectedStudentIds.length > 0 && !processing ? 'bg-indigo-600 text-white hover:scale-105 hover:bg-indigo-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                        `}
                    >
                        {processing ? '...' : 'Upgrade >>'}
                    </button>
                    <div className="text-xs text-center text-gray-500">
                        {selectedStudentIds.length} Selected
                    </div>
                </div>

                {/* ----------------- TARGET PANEL ----------------- */}
                <div className="flex-1 bg-white rounded shadow flex flex-col">
                    <div className="p-3 border-b bg-green-50 rounded-t">
                        <h3 className="font-semibold text-green-700">Target (Promote To)</h3>
                        <div className="flex gap-2 mt-2">
                            <select value={targetYear} onChange={e => setTargetYear(e.target.value)} className="border p-1 rounded text-sm w-1/2">
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={targetClass} onChange={e => setTargetClass(e.target.value)} className="border p-1 rounded text-sm w-1/3">
                                <option value="">Select Class</option>
                                {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                            <select value={targetSection} onChange={e => setTargetSection(e.target.value)} className="border p-1 rounded text-sm w-1/4">
                                <option value="">All Sec</option>
                                {targetSections.map(section => <option key={section} value={section}>{section}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-2">
                        <h4 className="text-sm font-bold mb-2">{targetStudents.length} Students Already in Target</h4>
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-left">
                                    <th className="p-2 border">Adm No</th>
                                    <th className="p-2 border">Name</th>
                                    <th className="p-2 border">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingTarget ? <tr><td colSpan={3} className="p-4 text-center">Loading...</td></tr> :
                                    targetStudents.map((s) => (
                                        <tr key={s.student_id}>
                                            <td className="p-2 border">{s.admNo}</td>
                                            <td className="p-2 border">{s.first_name || s.name}</td>
                                            <td className="p-2 border text-green-600">Promoted</td>
                                        </tr>
                                    ))}
                                {targetStudents.length === 0 && !loadingTarget && (
                                    <tr><td colSpan={3} className="p-4 text-center text-red-400">No Records Found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PromoteStudents;
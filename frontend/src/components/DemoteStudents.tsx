import React, { useState, useEffect } from 'react';
import api from '../api';
import { Student } from '../types';

interface DemoteStudentsProps {
    onBack?: () => void;
}

const DemoteStudents: React.FC<DemoteStudentsProps> = ({ onBack }) => {
    const [sourceYear, setSourceYear] = useState('');
    const [restoreYear, setRestoreYear] = useState('');
    const [years, setYears] = useState<string[]>([]);

    const [promotedStudents, setPromotedStudents] = useState<Student[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [search, setSearch] = useState('');

    const getStartYear = (yearStr: string): number => {
        const match = yearStr.match(/^(\d{4})/);
        return match ? parseInt(match[1], 10) : 0;
    };

    const sortedYears = [...years].sort((a, b) => getStartYear(b) - getStartYear(a));

    const getPreviousYears = (): string[] => {
        if (!sourceYear) return [];
        const sourceStart = getStartYear(sourceYear);
        return sortedYears.filter(y => getStartYear(y) < sourceStart);
    };

    useEffect(() => {
        api.get('/org/academic-years').then(res => {
            const y = res.data.academic_years?.map((item: any) => item.name) || [];
            setYears(y);
        });
    }, []);

    // ── KEY FIX: Fetch students whose Student.academic_year == sourceYear ──
    // These are students currently POINTING to sourceYear (promoted INTO it)
    useEffect(() => {
        if (!sourceYear) { setPromotedStudents([]); return; }
        setLoading(true);
        setSelectedIds([]);
        const branch = localStorage.getItem('currentBranch') || 'All';

        // Fetch students currently in sourceYear
        // Using X-Academic-Year header so backend returns students
        // whose academic_year matches OR have academic record in that year
        api.get('/students', {
            params: { branch, include_inactive: 'false' },
            headers: { 'X-Academic-Year': sourceYear }
        })
            .then(res => {
                const all: Student[] = res.data.students || [];
                // Filter: students whose CURRENT academic_year is sourceYear
                // AND who have a record showing they were promoted INTO this year
                // (i.e., they have an academic record in a PREVIOUS year with is_promoted=true)
                //
                // Since the backend returns is_promoted from the sourceYear record:
                // - is_promoted=false in sourceYear means student is CURRENTLY here
                //   (they haven't been promoted OUT yet)
                // - is_promoted=true in sourceYear means student LEFT this year
                //
                // We want students who are CURRENTLY in sourceYear (is_promoted=false or undefined)
                // AND whose academic_year on the Student record == sourceYear
                const currentStudents = all.filter(s => {
                    // Student is currently in this year
                    const isCurrentlyHere = s.academic_year === sourceYear;
                    // Student was NOT promoted OUT of this year
                    // (is_promoted in the response refers to the sourceYear record)
                    const notPromotedOut = s.is_promoted !== true;
                    return isCurrentlyHere && notPromotedOut;
                });
                setPromotedStudents(currentStudents);
            })
            .catch(err => {
                console.error(err);
                alert('Failed to load students: ' + (err.response?.data?.error || err.message));
            })
            .finally(() => setLoading(false));
    }, [sourceYear]);

    // Auto-select immediate previous year
    useEffect(() => {
        if (!sourceYear) { setRestoreYear(''); return; }
        const prevYears = getPreviousYears();
        if (prevYears.length > 0) {
            setRestoreYear(prevYears[0]);
        } else {
            setRestoreYear('');
        }
    }, [sourceYear, years]);

    const filtered = promotedStudents.filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (s.admNo || '').toLowerCase().includes(q) ||
            (s.first_name || s.name || '').toLowerCase().includes(q) ||
            (s.last_name || '').toLowerCase().includes(q)
        );
    });

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(filtered.map(s => s.student_id!).filter(Boolean));
        } else {
            setSelectedIds([]);
        }
    };

    const toggleOne = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleDemote = async () => {
        if (!sourceYear) return alert('Select the year to demote FROM.');
        if (!restoreYear) return alert('Select the year to demote BACK TO.');
        if (sourceYear === restoreYear) return alert('Both years cannot be the same.');
        if (selectedIds.length === 0) return alert('Select at least one student to demote.');

        // Validate direction: sourceYear must be AFTER restoreYear
        if (getStartYear(sourceYear) <= getStartYear(restoreYear)) {
            return alert(
                `Invalid direction!\n\n` +
                `"Demote FROM" (${sourceYear}) must be a LATER year than "Demote TO" (${restoreYear}).\n\n` +
                `Example: Demote FROM 2027-2028 → TO 2026-2027`
            );
        }

        const confirmed = window.confirm(
            `⚠️ DEMOTION CONFIRMATION\n\n` +
            `You are about to demote ${selectedIds.length} student(s):\n` +
            `  From: ${sourceYear}  →  Back to: ${restoreYear}\n\n` +
            `What will happen:\n` +
            `• Students will be moved from ${sourceYear} back to ${restoreYear}\n` +
            `• Fee structures in ${sourceYear} will be deactivated\n` +
            `• Collected payments are PRESERVED (audit trail)\n` +
            `• Attendance & marks remain in history\n\n` +
            `This reverses a mistaken promotion.\n` +
            `Are you sure?`
        );
        if (!confirmed) return;

        setProcessing(true);
        try {
            const res = await api.post('/students/demote-bulk', {
                student_ids: selectedIds,
                source_year: sourceYear,    // e.g., 2027-2028 (remove from here)
                restore_year: restoreYear,  // e.g., 2026-2027 (put back here)
            });

            const { success_count, errors } = res.data;
            let msg = `✅ ${success_count} student(s) successfully demoted from ${sourceYear} back to ${restoreYear}.`;
            if (errors?.length) {
                msg += `\n\n⚠️ Warnings / Errors:\n${errors.slice(0, 5).join('\n')}`;
            }
            alert(msg);
            setSelectedIds([]);
            setPromotedStudents(prev => prev.filter(s => !selectedIds.includes(s.student_id!)));
        } catch (err: any) {
            const msg = err.response?.data?.error || err.message;
            alert('❌ Demotion failed: ' + msg);
        } finally {
            setProcessing(false);
        }
    };

    const previousYears = getPreviousYears();

    return (
        <div className="p-4 min-h-screen bg-gray-50">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">De-promote Students</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Correction tool — reverses a mistaken promotion. Financial records are preserved.
                    </p>
                </div>
                {onBack && (
                    <button onClick={onBack} className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-100">
                        ← Back
                    </button>
                )}
            </div>

            {/* ── ERP Info Banner ── */}
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-sm text-amber-800 flex gap-2">
                <span className="text-lg">ℹ️</span>
                <div>
                    <strong>ERP Rule — No Financial Data is Deleted:</strong> De-promotion deactivates fee
                    structures in the promoted year and moves the student back to the previous year.
                    All collected payments, attendance, and marks remain for audit.
                </div>
            </div>

            {/* ── Year Selectors ── */}
            <div className="bg-white rounded-lg shadow p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* STEP 1: The LATER year (where students were wrongly promoted TO) */}
                    <div>
                        <label className="block text-sm font-semibold text-red-700 mb-1">
                            ① Demote FROM (Current Year — Students Are Here Now)
                        </label>
                        <select
                            value={sourceYear}
                            onChange={e => { setSourceYear(e.target.value); setRestoreYear(''); }}
                            className="w-full border border-red-300 p-2 rounded bg-red-50 text-sm"
                        >
                            <option value="">— Select Year —</option>
                            {sortedYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <p className="text-xs text-red-500 mt-1">
                            e.g., <strong>2027-2028</strong> — the year students were mistakenly promoted to
                        </p>
                    </div>

                    {/* STEP 2: The EARLIER year (where students should go back) */}
                    <div>
                        <label className="block text-sm font-semibold text-green-700 mb-1">
                            ② Demote BACK TO (Previous Year — Send Them Back Here)
                        </label>
                        <select
                            value={restoreYear}
                            onChange={e => setRestoreYear(e.target.value)}
                            className="w-full border border-green-300 p-2 rounded bg-green-50 text-sm"
                            disabled={!sourceYear}
                        >
                            <option value="">— Select Year —</option>
                            {previousYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <p className="text-xs text-green-600 mt-1">
                            {sourceYear
                                ? <>Only shows years <strong>before</strong> {sourceYear}</>
                                : 'Select "Demote FROM" year first'
                            }
                        </p>
                        {sourceYear && previousYears.length === 0 && (
                            <p className="text-xs text-orange-600 mt-1 font-medium">
                                ⚠️ No previous years found before {sourceYear}
                            </p>
                        )}
                    </div>
                </div>

                {sourceYear && restoreYear && (
                    <div className="mt-3 p-3 bg-gray-100 rounded text-center">
                        <div className="text-sm font-medium text-gray-700 flex items-center justify-center gap-3 flex-wrap">
                            <span className="bg-red-100 text-red-700 px-3 py-1 rounded font-bold">{sourceYear}</span>
                            <span className="text-red-500 font-bold text-lg">→</span>
                            <span className="text-gray-500 font-semibold">DEMOTE BACK TO</span>
                            <span className="text-green-500 font-bold text-lg">→</span>
                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded font-bold">{restoreYear}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Students currently in {sourceYear} will be moved back to {restoreYear}
                        </p>
                    </div>
                )}
            </div>

            {/* ── Student Table ── */}
            {sourceYear && (
                <div className="bg-white rounded-lg shadow">
                    <div className="p-3 border-b flex items-center justify-between gap-3 bg-red-50 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-red-700">
                                🔍 Students currently in <strong>{sourceYear}</strong>
                            </span>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                {promotedStudents.length} found
                            </span>
                        </div>
                        <input
                            placeholder="Search by name or adm no..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="border p-1.5 rounded text-sm w-56"
                        />
                    </div>

                    <div className="overflow-auto max-h-[50vh]">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Loading students...</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                {promotedStudents.length === 0
                                    ? `No students found currently in ${sourceYear}.`
                                    : 'No students match your search.'
                                }
                            </div>
                        ) : (
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="p-2 border text-center w-10">
                                            <input
                                                type="checkbox"
                                                //checked={filtered.length > 0 && selectedIds.length === filtered.length}
                                                checked={filtered.length > 0 && filtered.every(s => selectedIds.includes(s.student_id!))}
                                                onChange={handleSelectAll}
                                            />
                                        </th>
                                        <th className="p-2 border text-left">Adm No</th>
                                        <th className="p-2 border text-left">Student Name</th>
                                        <th className="p-2 border text-left">Class</th>
                                        <th className="p-2 border text-left">Section</th>
                                        <th className="p-2 border text-left">Branch</th>
                                        <th className="p-2 border text-center">Current Year</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(s => (
                                        <tr
                                            key={s.student_id}
                                            className={`hover:bg-red-50 cursor-pointer ${selectedIds.includes(s.student_id!) ? 'bg-red-50' : ''}`}
                                            onClick={() => toggleOne(s.student_id!)}
                                        >
                                            <td className="p-2 border text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(s.student_id!)}
                                                    onChange={() => toggleOne(s.student_id!)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </td>
                                            <td className="p-2 border font-mono text-xs">{s.admNo}</td>
                                            <td className="p-2 border font-medium">
                                                {s.first_name || s.name} {s.last_name || ''}
                                            </td>
                                            <td className="p-2 border">{s.class}</td>
                                            <td className="p-2 border">{s.section}</td>
                                            <td className="p-2 border text-gray-500">{s.branch}</td>
                                            <td className="p-2 border text-center">
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                    {sourceYear}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer action */}
                    <div className="p-3 border-t bg-gray-50 rounded-b-lg flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                            {selectedIds.length} student(s) selected
                        </span>
                        <button
                            onClick={handleDemote}
                            disabled={selectedIds.length === 0 || !restoreYear || processing}
                            className={`px-6 py-2 rounded font-semibold text-sm transition-all
                                ${selectedIds.length > 0 && restoreYear && !processing
                                    ? 'bg-red-600 text-white hover:bg-red-700 shadow'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {processing
                                ? '⏳ Processing...'
                                : `⬇ Demote ${selectedIds.length > 0 ? `(${selectedIds.length})` : ''} back to ${restoreYear || '...'}`
                            }
                        </button>
                    </div>
                </div>
            )}

            {!sourceYear && (
                <div className="text-center p-12 text-gray-400">
                    <div className="text-5xl mb-3">📋</div>
                    <p className="text-base">
                        Select the <strong>Demote FROM</strong> year to see students currently there.
                    </p>
                    <p className="text-sm mt-2">
                        Example: Students were promoted from <strong>2026-2027</strong> → <strong>2027-2028</strong><br />
                        To reverse: Select <strong>2027-2028</strong> as "Demote FROM" → <strong>2026-2027</strong> as "Demote BACK TO"
                    </p>
                </div>
            )}
        </div>
    );
};

export default DemoteStudents;
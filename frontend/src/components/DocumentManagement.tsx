import React, { useState, useEffect } from 'react';
import DocumentAdministration from './DocumentAdministration';
import StudentDocumentManagement from './StudentDocumentManagement';
import { DocumentReportIcon, SetupIcon, SearchIcon, DownloadIcon, TrashIcon, RefreshIcon, UserIcon } from './icons';
import api from '../api';
import { auth } from '../api';
import axios from 'axios';

type DocTab = 'dashboard' | 'add-category' | 'upload-documents' | 'student-doc-view';

// ─────────────────────────────────────────────
// STUDENT DOC VIEW — Report: all students with docs
// ─────────────────────────────────────────────

interface ClassItem { id: number; class_name: string; }
interface StudentRow {
    student_id: number;
    admNo: string;
    name: string;
    class: string;
    section: string;
    father?: string;
    photo?: string;
}
interface StudentDocument {
    id: number;
    document_type_code: string;
    document_type_name: string;
    document_no: string;
    issued_by: string;
    issue_date: string;
    file_name: string;
    uploaded_at: string;
    upload_by_name: string;
}

const StudentDocumentView: React.FC = () => {
    const [classOptions, setClassOptions] = useState<ClassItem[]>([]);
    const [sectionOptions, setSectionOptions] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
    const [docMap, setDocMap] = useState<Record<number, StudentDocument[]>>({});
    const [loadingDocs, setLoadingDocs] = useState<number | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        api.get('/classes').then(res => setClassOptions(res.data.classes || []));
    }, []);

    useEffect(() => {
        if (!selectedClass) { setSectionOptions([]); setSelectedSection(''); return; }
        const branch = localStorage.getItem('currentBranch') || 'All';
        const academicYear = localStorage.getItem('academicYear') || '';
        api.get('/sections', { params: { class: selectedClass, branch, academic_year: academicYear } })
            .then(res => setSectionOptions(res.data.sections || []));
    }, [selectedClass]);

    const handleSearch = () => {
        setLoading(true);
        setHasSearched(true);
        setExpandedStudent(null);
        const branch = localStorage.getItem('currentBranch') || '';
        api.get('/students', {
            params: {
                class: selectedClass || '',
                section: selectedSection || '',
                search: searchTerm,
                include_inactive: 'false',
                branch: branch === 'All' || branch === 'All Branches' ? 'All' : branch
            }
        })
            .then(res => setStudents(res.data.students || []))
            .catch(() => setStudents([]))
            .finally(() => setLoading(false));
    };

    const toggleStudent = async (student: StudentRow) => {
        const sid = student.student_id;
        if (expandedStudent === sid) {
            setExpandedStudent(null);
            return;
        }
        setExpandedStudent(sid);
        if (!docMap[sid]) {
            setLoadingDocs(sid);
            try {
                const token = auth.getToken();
                const res = await axios.get(`${API_URL}/documents/student/${sid}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setDocMap(prev => ({ ...prev, [sid]: res.data || [] }));
            } catch {
                setDocMap(prev => ({ ...prev, [sid]: [] }));
            } finally {
                setLoadingDocs(null);
            }
        }
    };

    const handleDownload = async (docId: number, fileName: string) => {
        try {
            const token = auth.getToken();
            const res = await axios.get(`${API_URL}/documents/download/${docId}`, {
                headers: { Authorization: `Bearer ${token}` }, responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch {
            alert('Download failed.');
        }
    };

    const handleDelete = async (docId: number, studentId: number) => {
        if (!window.confirm('Delete this document?')) return;
        try {
            const token = auth.getToken();
            await axios.delete(`${API_URL}/documents/${docId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDocMap(prev => ({
                ...prev,
                [studentId]: (prev[studentId] || []).filter(d => d.id !== docId)
            }));
        } catch {
            alert('Delete failed.');
        }
    };

    const formatDate = (d: string) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-5">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <DocumentReportIcon className="w-7 h-7 text-blue-700" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Student Documents — View</h1>
                        <p className="text-sm text-slate-500">See documents uploaded for each student</p>
                    </div>
                </div>

                {/* Filter */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Class</label>
                            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                                className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">▼ All Classes</option>
                                {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Section</label>
                            <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)}
                                disabled={!selectedClass}
                                className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100">
                                <option value="">▼ All Sections</option>
                                {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Search</label>
                            <input type="text" value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Admission No or Name..."
                                className="w-full border border-slate-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div className="flex items-end">
                            <button onClick={handleSearch}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md flex items-center justify-center gap-2">
                                <SearchIcon className="w-4 h-4" /> Search
                            </button>
                        </div>
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                        <RefreshIcon className="w-7 h-7 mx-auto text-blue-500 animate-spin" />
                        <p className="mt-2 text-sm text-slate-500">Loading students...</p>
                    </div>
                )}

                {/* No results */}
                {!loading && hasSearched && students.length === 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                        <UserIcon className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-slate-500">No students found. Try adjusting your filters.</p>
                    </div>
                )}

                {/* Student Rows with expandable document list */}
                {!loading && students.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700">Students</h3>
                            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{students.length} found</span>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {students.map(s => {
                                const sid = s.student_id;
                                const isExpanded = expandedStudent === sid;
                                const docs = docMap[sid] || [];
                                const isLoadingThis = loadingDocs === sid;

                                return (
                                    <div key={sid}>
                                        {/* Student Row */}
                                        <div
                                            className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                                            onClick={() => toggleStudent(s)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {s.photo
                                                        ? <img className="w-9 h-9 object-cover" src={s.photo} alt="" />
                                                        : <UserIcon className="w-4 h-4 text-slate-400" />
                                                    }
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                                                    <p className="text-xs text-slate-500 font-mono">{s.admNo} &nbsp;·&nbsp; {s.class}-{s.section}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {docMap[sid] !== undefined && (
                                                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${docs.length > 0 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                                                        {docs.length} doc{docs.length !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                                <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                                            </div>
                                        </div>

                                        {/* Expanded: Documents for this student */}
                                        {isExpanded && (
                                            <div className="bg-slate-50 border-t border-slate-100 px-5 py-4">
                                                {isLoadingThis ? (
                                                    <div className="text-center py-4">
                                                        <RefreshIcon className="w-5 h-5 mx-auto text-blue-500 animate-spin" />
                                                        <p className="text-xs text-slate-400 mt-1">Loading documents...</p>
                                                    </div>
                                                ) : docs.length === 0 ? (
                                                    <div className="text-center py-4">
                                                        <DocumentReportIcon className="w-8 h-8 mx-auto text-slate-200 mb-1" />
                                                        <p className="text-xs text-slate-400">No documents uploaded for this student yet.</p>
                                                    </div>
                                                ) : (
                                                    <table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                                                        <thead className="bg-slate-100">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Type</th>
                                                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Doc No</th>
                                                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Issued By</th>
                                                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Issue Date</th>
                                                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Uploaded At</th>
                                                                <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 uppercase">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-slate-100">
                                                            {docs.map(doc => (
                                                                <tr key={doc.id} className="hover:bg-blue-50 transition-colors">
                                                                    <td className="px-4 py-2.5">
                                                                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                                                            {doc.document_type_code}
                                                                        </span>
                                                                        <span className="ml-2 text-xs text-slate-600">{doc.document_type_name}</span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{doc.document_no || '—'}</td>
                                                                    <td className="px-4 py-2.5 text-xs text-slate-600">{doc.issued_by || '—'}</td>
                                                                    <td className="px-4 py-2.5 text-xs text-slate-600">{formatDate(doc.issue_date)}</td>
                                                                    <td className="px-4 py-2.5 text-xs text-slate-500">
                                                                        <div>{formatDate(doc.uploaded_at)}</div>
                                                                        <div className="text-slate-400">by {doc.upload_by_name}</div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-center">
                                                                        <div className="flex justify-center gap-1">
                                                                            <button onClick={() => handleDownload(doc.id, doc.file_name)}
                                                                                className="text-blue-600 bg-blue-50 p-1.5 rounded hover:bg-blue-100 transition-colors" title="Download">
                                                                                <DownloadIcon className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button onClick={() => handleDelete(doc.id, sid)}
                                                                                className="text-red-500 bg-red-50 p-1.5 rounded hover:bg-red-100 transition-colors" title="Delete">
                                                                                <TrashIcon className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// MAIN HUB
// ─────────────────────────────────────────────

const DocumentManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<DocTab>('dashboard');
    const [masterOpen, setMasterOpen] = useState(false);
    const [studentDocOpen, setStudentDocOpen] = useState(false);

    const closeDropdowns = () => { setMasterOpen(false); setStudentDocOpen(false); };

    const navBtn = (tab: DocTab, label: string) => (
        <button
            onClick={() => { setActiveTab(tab); closeDropdowns(); }}
            className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${activeTab === tab
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ─── Top Nav Bar ─── */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-5">
                    <div className="flex items-center justify-between py-3">

                        <div className="flex items-center gap-2">
                            <DocumentReportIcon className="w-5 h-5 text-blue-700" />
                            <span className="font-bold text-slate-800 text-sm uppercase tracking-wide">Document Management</span>
                        </div>

                        <div className="flex items-center gap-1 flex-wrap">

                            {navBtn('dashboard', 'Dashboard')}

                            {/* Master ▾ */}
                            <div className="relative">
                                <button
                                    onClick={() => { setMasterOpen(v => !v); setStudentDocOpen(false); }}
                                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-1 ${activeTab === 'add-category' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    Master ▾
                                </button>
                                {masterOpen && (
                                    <div className="absolute left-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                                        <button
                                            onClick={() => { setActiveTab('add-category'); closeDropdowns(); }}
                                            className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors rounded-lg"
                                        >
                                            Add Category
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Upload Documents — goes to upload form */}
                            {navBtn('upload-documents', 'Upload Documents')}

                            {/* Student Documents ▾ — report view */}
                            <div className="relative">
                                <button
                                    onClick={() => { setStudentDocOpen(v => !v); setMasterOpen(false); }}
                                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-1 ${activeTab === 'student-doc-view' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    Student Documents ▾
                                </button>
                                {studentDocOpen && (
                                    <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                                        <button
                                            onClick={() => { setActiveTab('student-doc-view'); closeDropdowns(); }}
                                            className="block w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors rounded-lg"
                                        >
                                            View Uploaded Documents
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* Click outside → close dropdowns */}
            {(masterOpen || studentDocOpen) && (
                <div className="fixed inset-0 z-40" onClick={closeDropdowns} />
            )}

            {/* ─── Page Content ─── */}
            {activeTab === 'dashboard' && <DocumentDashboard onNavigate={setActiveTab} />}
            {activeTab === 'add-category' && <DocumentAdministration />}
            {activeTab === 'upload-documents' && <StudentDocumentManagement />}
            {activeTab === 'student-doc-view' && <StudentDocumentView />}
        </div>
    );
};

// ─────────────────────────────────────────────
// DASHBOARD HOME
// ─────────────────────────────────────────────

type DashboardNavFn = (tab: DocTab) => void;

const DocumentDashboard: React.FC<{ onNavigate: DashboardNavFn }> = ({ onNavigate }) => (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
                <DocumentReportIcon className="w-7 h-7 text-blue-700" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900">Document Management</h1>
                <p className="text-sm text-slate-500">Manage student and institution documents</p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <DashCard
                icon={<SetupIcon className="w-8 h-8 text-indigo-700" />}
                iconBg="bg-indigo-100"
                title="Document Categories (Master)"
                desc="Add and manage allowed document types"
                badge="Master → Add Category"
                badgeColor="text-indigo-600 bg-indigo-50"
                onClick={() => onNavigate('add-category')}
            />
            <DashCard
                icon={<UploadIcon className="w-8 h-8 text-blue-700" />}
                iconBg="bg-blue-100"
                title="Upload Documents"
                desc="Search a student and upload their documents"
                badge="Upload Documents"
                badgeColor="text-blue-600 bg-blue-50"
                onClick={() => onNavigate('upload-documents')}
            />
            <DashCard
                icon={<DocumentReportIcon className="w-8 h-8 text-teal-700" />}
                iconBg="bg-teal-100"
                title="View Student Documents"
                desc="See all documents uploaded per student"
                badge="Student Documents → View"
                badgeColor="text-teal-600 bg-teal-50"
                onClick={() => onNavigate('student-doc-view')}
            />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">📊 Student Documents Count</h3>
            </div>
            <div className="p-5 text-center text-sm text-slate-400 py-10">
                Summary data will appear here once documents are uploaded.
            </div>
        </div>
    </div>
);

const DashCard: React.FC<{
    icon: React.ReactNode; iconBg: string;
    title: string; desc: string; badge: string; badgeColor: string; onClick: () => void;
}> = ({ icon, iconBg, title, desc, badge, badgeColor, onClick }) => (
    <div
        onClick={onClick}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
    >
        <div className={`p-3 ${iconBg} rounded-xl group-hover:opacity-80 transition-opacity flex-shrink-0`}>{icon}</div>
        <div>
            <h3 className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{title}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
            <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
        </div>
    </div>
);

function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
    );
}

export default DocumentManagement;

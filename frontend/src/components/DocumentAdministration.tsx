import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { PencilIcon, TrashIcon } from './icons';
import { SetupIcon } from './icons';
import { auth } from '../api';

interface DocumentType {
    id: number;
    code: string;
    name: string;
    description: string;
    is_active: boolean;
}

const DocumentAdministration: React.FC = () => {
    const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    // ── Access control ────────────────────────────────────────────
    const isAdminAllBranches = useMemo(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const currentBranch = (localStorage.getItem('currentBranch') || '').trim();
        const isAdmin = user?.role === 'Admin';
        const isAllBranches = currentBranch === '' || currentBranch === 'All' || currentBranch === 'All Branches';
        return isAdmin && isAllBranches;
    }, []);

    const [editingDocType, setEditingDocType] = useState<DocumentType | null>(null);
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        description: '',
        is_active: true
    });

    const API_URL = import.meta.env.VITE_API_URL;

        if (!API_URL) {
        throw new Error("VITE_API_URL is not defined");
        }

    useEffect(() => {
        fetchDocumentTypes();
    }, []);

    const fetchDocumentTypes = async () => {
        setLoading(true);
        try {
            const token = auth.getToken();
            const response = await axios.get(`${API_URL}/documents/types`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDocumentTypes(response.data);
            setError('');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to fetch document types');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (docType: DocumentType) => {
        setEditingDocType(docType);
        setFormData({
            code: docType.code,
            name: docType.name,
            description: docType.description,
            is_active: docType.is_active
        });
    };

    const handleReset = () => {
        setEditingDocType(null);
        setFormData({ code: '', name: '', description: '', is_active: true });
        setError('');
        setSuccessMessage('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            const token = auth.getToken();
            const headers = { Authorization: `Bearer ${token}` };

            if (editingDocType) {
                await axios.put(`${API_URL}/documents/types/${editingDocType.id}`, formData, { headers });
                setSuccessMessage('Document type updated successfully.');
            } else {
                await axios.post(`${API_URL}/documents/types`, formData, { headers });
                setSuccessMessage('Document type created successfully.');
            }

            fetchDocumentTypes();
            handleReset();
            setTimeout(() => setSuccessMessage(''), 4000);

        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save document type');
        } finally {
            setLoading(false);
        }
    };

    const filteredTypes = documentTypes.filter((t) => {
    const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
        statusFilter === 'all'
            ? true
            : statusFilter === 'active'
                ? t.is_active
                : !t.is_active;

    return matchesSearch && matchesStatus;
    });

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex items-center space-x-3 mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <SetupIcon className="w-7 h-7 text-blue-700" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Add Document Category</h1>
                        <p className="text-sm text-slate-500">Manage allowed document categories for the institution</p>
                    </div>
                </div>

                {/* Main Content: Two Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* LEFT: Add / Edit Form — Admin @ All Branches only */}
                    <div className="lg:col-span-2">
                        {isAdminAllBranches ? (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                                    <h2 className="text-sm font-semibold text-slate-700">
                                        {editingDocType ? '✏️ Edit Document Category' : '➕ Add Document Category'}
                                    </h2>
                                </div>

                                <form onSubmit={handleSubmit} className="p-5 space-y-4">

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
                                            {error}
                                        </div>
                                    )}
                                    {successMessage && (
                                        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-md text-sm">
                                            {successMessage}
                                        </div>
                                    )}

                                    {/* Document Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Document Name <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            placeholder="e.g. Aadhaar Card"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>

                                    {/* Document Code */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Document Code <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                required
                                                disabled={!!editingDocType}
                                                className={`flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${editingDocType ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                                placeholder="e.g. AADHAAR"
                                                value={formData.code}
                                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            />
                                            <label className="flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    checked={formData.is_active}
                                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                />
                                                Is Active
                                            </label>
                                        </div>
                                        {!editingDocType && (
                                            <p className="text-xs text-slate-400 mt-1">Unique code. Cannot be changed later. E.g. AADHAAR, TC</p>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                        <textarea
                                            rows={3}
                                            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                                            placeholder="Document Description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        />
                                    </div>

                                    {/* Buttons */}
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md shadow-sm transition-colors"
                                        >
                                            {loading ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-5 py-2 rounded-md border border-slate-300 shadow-sm transition-colors"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-amber-200 flex flex-col items-center justify-center p-8 text-center h-full min-h-[200px]">
                                <div className="text-3xl mb-3">🔒</div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-1">Access Restricted</h3>
                                <p className="text-xs text-slate-500">
                                    Only <span className="font-medium text-amber-600">Admins</span> at{' '}
                                    <span className="font-medium text-amber-600">All Branches</span> level can
                                    add or edit document categories.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Document Categories Table */}
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-sm font-semibold text-slate-700">📋 Document categories</h2>
                                    <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                        Total: {filteredTypes.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder="Category name"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-40"
                                    />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) =>
                                            setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
                                        }
                                        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                                    >
                                        <option value="all">All Type</option>
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                    <button
                                        onClick={fetchDocumentTypes}
                                        className="p-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors"
                                        title="Refresh"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                                Document category
                                            </th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                                Code
                                            </th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                                Type
                                            </th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                                Edit | Delete
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100">
                                        {loading && filteredTypes.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                                                    Loading...
                                                </td>
                                            </tr>
                                        ) : filteredTypes.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-5 py-8 text-center text-sm text-red-400 bg-red-50">
                                                    No category
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredTypes.map((type) => (
                                                <tr key={type.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">
                                                        {type.name}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                            {type.code}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        {type.is_active ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                Inactive
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        {isAdminAllBranches ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleEdit(type)}
                                                                    className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-md transition-colors mr-1"
                                                                    title="Edit"
                                                                >
                                                                    <PencilIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                                                                    title="Delete (Deactivate)"
                                                                    onClick={() => {
                                                                        handleEdit(type);
                                                                        setFormData(prev => ({ ...prev, is_active: false }));
                                                                    }}
                                                                >
                                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 italic">View only</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default DocumentAdministration;

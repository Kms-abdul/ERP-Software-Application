// ---------------- COMPLETE & FIXED StudentAdministration.tsx ----------------

import React, { useState, useEffect } from 'react';
import { Page } from '../App';
import { ChevronDownIcon, SearchIcon, ImportIcon, CreateStudentIcon } from './icons';
import ComingSoon from './ComingSoon';
import ImportStudentData from './ImportStudentData';
import CreateStudent from './CreateStudent';
import PromoteStudents from './PromoteStudents';
import DemoteStudents from './DemoteStudents';
import ClassSummary from './ClassSummary';
import MakeStudentInactive from './MakeStudentInactive';
import SearchStudent from './SearchStudent';
import { Student } from '../types';
import api from '../api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface StudentAdministrationProps {
    navigateTo: (page: Page) => void;
}

// Page view types
type StudentAdminView =
    'students' | 'search' | 'summary' | 'reports' | 'certificates' | 'upgrade'
    | 'import' | 'addStudent' | 'viewStudent' | 'editStudent'
    | 'inactive' | 'inactiveReport' | 'demote';

// ---------------------------------------------------------------------------
// Dropdown Component
// ---------------------------------------------------------------------------
const Dropdown: React.FC<{ title: string; isOpen: boolean; onToggle: () => void; children: any }> =
    ({ title, isOpen, onToggle, children }) => (
        <div className="relative inline-block text-left">
            <button
                className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={onToggle}
            >
                {title}
                <ChevronDownIcon className="ml-2 h-5 w-5" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                    <div className="py-1">{children}</div>
                </div>
            )}
        </div>
    );

const DropdownItem: React.FC<{ children: any; onClick?: () => void }> =
    ({ children, onClick }) => (
        <a
            href="#"
            onClick={(e) => { e.preventDefault(); onClick?.(); }}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
            {children}
        </a>
    );

// ---------------------------------------------------------------------------
// Header Component
// ---------------------------------------------------------------------------
const StudentAdminHeader: React.FC<{ activeView: StudentAdminView; setActiveView: any }> =
    ({ activeView, setActiveView }) => {
        const [open, setOpen] = useState<string | null>(null);

        const toggle = (name: string) => setOpen(open === name ? null : name);

        const btn = (view: StudentAdminView) =>
            `px-3 py-2 text-sm rounded-md ${activeView === view
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`;

        return (
            <div className="bg-gray-50 p-3 border-b border-gray-300">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <h2 className="text-xl font-semibold text-gray-800">STUDENTS</h2>

                    <div className="flex items-center flex-wrap gap-2">
                        <button className={btn('students')} onClick={() => setActiveView('students')}>Students</button>
                        <button className={btn('addStudent')} onClick={() => setActiveView('addStudent')}>Create Student</button>
                        {/*<button className={btn('import')} onClick={() => setActiveView('import')}>Import</button>*/}
                        <button className={btn('search')} onClick={() => setActiveView('search')}>Search</button>
                        <button className={btn('summary')} onClick={() => setActiveView('summary')}>Class Summary</button>

                        <Dropdown title="Report" isOpen={open === 'report'} onToggle={() => toggle('report')}>
                            <DropdownItem>Custom Download</DropdownItem>
                            <DropdownItem>Pre-defined Download</DropdownItem>
                        </Dropdown>

                        <Dropdown title="Certificates" isOpen={open === 'certs'} onToggle={() => toggle('certs')}>
                            <DropdownItem>Student Certificate</DropdownItem>
                            <DropdownItem>Teacher Certificate</DropdownItem>
                        </Dropdown>

                        <Dropdown
                            title="Inactive"
                            isOpen={open === 'inactive'}
                            onToggle={() => toggle('inactive')}
                        >
                            <DropdownItem onClick={() => { setActiveView('inactive'); setOpen(null); }}>
                                Make Student Inactive
                            </DropdownItem>
                            <DropdownItem onClick={() => { setActiveView('inactiveReport'); setOpen(null); }}>
                                Inactive Student Report
                            </DropdownItem>
                        </Dropdown>

                        <button className={btn('upgrade')} onClick={() => setActiveView('upgrade')}>Upgrade</button>
                        <button className={btn('demote')} onClick={() => setActiveView('demote')}>De-promote</button>
                    </div>
                </div>
            </div>
        );
    };

// ---------------------------------------------------------------------------
// Student List Component
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Student List Component
// ---------------------------------------------------------------------------

interface ClassItem {
    id: number;
    class_name: string;
}

const StudentList: React.FC<{ onView: any; onEdit: any; setActiveView: any }> =
    ({ onView, onEdit, setActiveView }) => {

        // Filters
        // Branch filtering is now handled globally via the MainContent dropdown.
        // We just read localStorage.getItem('currentBranch') when fetching API.

        const [students, setStudents] = useState<Student[]>([]);
        const [loading, setLoading] = useState(false);
        const [showInactive, setShowInactive] = useState(false);

        const [selectedClass, setSelectedClass] = useState('');
        const [selectedSection, setSelectedSection] = useState('');
        const [searchTerm, setSearchTerm] = useState('');
        const [isAdmin, setIsAdmin] = useState(false);
        const [classOptions, setClassOptions] = useState<ClassItem[]>([]);
        const [sectionOptions, setSectionOptions] = useState<string[]>([]);

        // Delete State
        const [passwordModalOpen, setPasswordModalOpen] = useState(false);
        const [password, setPassword] = useState('');
        const [studentToDelete, setStudentToDelete] = useState<any>(null);

        // Promotion State
        const [promoteModalOpen, setPromoteModalOpen] = useState(false);
        const [studentToPromote, setStudentToPromote] = useState<Student | null>(null);

        // Load classes and students
        useEffect(() => {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const u = JSON.parse(userStr);
                setIsAdmin(u.role === 'Admin');
            }

            api.get('/classes')
                .then(res => setClassOptions(res.data.classes || []))
                .catch(() => console.log("Failed loading classes"));

            // Initial Load
            loadStudents();
        }, []);

        // Trigger reload when filter changes 
        useEffect(() => {
            loadStudents();
        }, [selectedClass, selectedSection, searchTerm, showInactive]);

        useEffect(() => {
            if (!selectedClass) {
                setSectionOptions([]);
                setSelectedSection('');
                return;
            }

            const branch = localStorage.getItem('currentBranch') || 'All';
            const academicYear = localStorage.getItem('academicYear') || '';

            api.get('/sections', {
                params: {
                    class: selectedClass,
                    branch,
                    academic_year: academicYear
                }
            })
                .then(res => setSectionOptions(res.data.sections || []))
                .catch(() => setSectionOptions([]));
        }, [selectedClass]);

        const loadStudents = () => {
            setLoading(true);
            const globalBranch = localStorage.getItem('currentBranch') || ''; // default empty or handle appropriately in backend

            api.get('/students', {
                params: {
                    class: selectedClass || '',
                    section: selectedSection || '',
                    search: searchTerm || '',
                    include_inactive: showInactive ? "true" : "false",
                    branch: globalBranch === "All" || globalBranch === "All Branches" ? "All" : globalBranch
                }
            })
                .then(res => setStudents(res.data.students || []))
                .catch(() => setStudents([]))
                .finally(() => setLoading(false));
        };

        // Handle Delete Click
        const handleDeleteClick = (s: any) => {
            setStudentToDelete(s);
            setPassword('');
            setPasswordModalOpen(true);
        };

        const handlePromoteClick = (s: any) => {
            setStudentToPromote(s);
            setPromoteModalOpen(true);
        };

        const handleActivate = async (s: any) => {
            if (window.confirm(`Are you sure you want to Activate ${s.name}?`)) {
                try {
                    await api.put(`/students/${s.student_id || s.id}`, { status: 'Active' });
                    alert("Student Activated successfully");
                    loadStudents();
                } catch (e) {
                    console.error(e);
                    alert("Failed to activate student");
                }
            }
        };

        // Confirm Delete
        const confirmDelete = async () => {
            if (!password) return alert("Please enter password");

            try {
                // Verify password
                const verifyRes = await api.post('/verify-current-password', { password });
                if (verifyRes.data.success) {
                    // Delete student
                    // Assuming student object has student_id based on backend model
                    const id = studentToDelete.student_id || studentToDelete.id;
                    await api.delete(`/students/${id}`);
                    alert("Student marked as Inactive successfully");
                    setPasswordModalOpen(false);
                    loadStudents();
                } else {
                    alert("Invalid Password");
                }
            } catch (error: any) {
                console.error(error);
                if (error.response && error.response.data && error.response.data.error) {
                    alert(error.response.data.error);
                } else {
                    alert("Error deleting student");
                }
            }
        };

        // Print Report
        const handlePrint = (s: any) => {
            const printWindow = window.open('', '', 'width=900,height=800');
            if (printWindow) {
                printWindow.document.write(`
                     <html>
                         <head>
                            <title>Student Report - ${s.name}</title>
                            <style>
                                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
                                h1 { text-align: center; color: #4c1d95; margin-bottom: 10px; }
                                h2 { border-bottom: 2px solid #4c1d95; padding-bottom: 5px; margin-top: 30px; color: #5b21b6; font-size: 18px; }
                                .header { text-align: center; margin-bottom: 40px; }
                                .photo-box { width: 120px; height: 120px; border: 1px solid #ddd; margin: 0 auto 10px; object-fit: cover; display: block; }
                                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                                .field { margin-bottom: 8px; }
                                .label { font-weight: bold; color: #555; width: 140px; display: inline-block; }
                                .value { color: #000; }
                                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
                                th { bg-color: #f3f4f6; }
                            </style>
                         </head>
                         <body>
                             <div class="header">
                                <img src="https://www.mshifzacademy.com/assets/images/ms-logo.jpg" style="max-width: 300px; height: auto; margin-bottom: 10px;" />
                                <p>Student Profile Report</p>
                             </div>

                             <img src="${s.photo || 'https://via.placeholder.com/150'}" class="photo-box" />
                             <h2 style="text-align:center; border:none;">${s.name}</h2>
                             <p style="text-align:center;">${s.admNo} | Class: ${s.class} - ${s.section}</p>

                             <h2>Academic Details</h2>
                             <div class="grid">
                                <div>
                                    <div class="field"><span class="label">Admission No:</span> <span class="value">${s.admNo || '-'}</span></div>
                                    <div class="field"><span class="label">Roll No:</span> <span class="value">${s.rollNo || '-'}</span></div>
                                    <div class="field"><span class="label">Class:</span> <span class="value">${s.class || '-'}</span></div>
                                    <div class="field"><span class="label">Section:</span> <span class="value">${s.section || '-'}</span></div>
                                </div>
                                <div>
                                    <div class="field"><span class="label">Admission Date:</span> <span class="value">${s.admission_date || '-'}</span></div>
                                    <div class="field"><span class="label">Status:</span> <span class="value">${s.status || '-'}</span></div>
                                    <div class="field"><span class="label">Category:</span> <span class="value">${s.Category || '-'}</span></div>
                                </div>
                             </div>

                             <h2>Personal Details</h2>
                             <div class="grid">
                                <div>
                                    <div class="field"><span class="label">First Name:</span> <span class="value">${s.first_name || '-'}</span></div>
                                    <div class="field"><span class="label">Last Name:</span> <span class="value">${s.last_name || '-'}</span></div>
                                    <div class="field"><span class="label">Gender:</span> <span class="value">${s.gender || '-'}</span></div>
                                    <div class="field"><span class="label">DOB:</span> <span class="value">${s.dob || '-'}</span></div>
                                    <div class="field"><span class="label">Blood Group:</span> <span class="value">${s.BloodGroup || '-'}</span></div>
                                </div>
                                <div>
                                    <div class="field"><span class="label">Aadhar No:</span> <span class="value">${s.Adharcardno || '-'}</span></div>
                                    <div class="field"><span class="label">Religion:</span> <span class="value">${s.Religion || '-'}</span></div>
                                    <div class="field"><span class="label">Caste:</span> <span class="value">${s.Caste || '-'}</span></div>
                                    <div class="field"><span class="label">Mother Tongue:</span> <span class="value">${s.MotherTongue || '-'}</span></div>
                                </div>
                             </div>

                             <h2>Contact Info</h2>
                             <div class="field"><span class="label">Mobile:</span> <span class="value">${s.phone || '-'}</span></div>
                             <div class="field"><span class="label">Email:</span> <span class="value">${s.email || '-'}</span></div>
                             <div class="field"><span class="label">Address:</span> <span class="value">${s.address || '-'}</span></div>

                             <h2>Parent / Guardian Details</h2>
                             <div class="grid">
                                <div>
                                    <h3>Father</h3>
                                    <div class="field"><span class="label">Name:</span> <span class="value">${s.Fatherfirstname || '-'}</span></div>
                                    <div class="field"><span class="label">Phone:</span> <span class="value">${s.FatherPhone || '-'}</span></div>
                                    <div class="field"><span class="label">Occupation:</span> <span class="value">${s.FatherOccuption || '-'}</span></div>
                                </div>
                                <div>
                                    <h3>Mother</h3>
                                    <div class="field"><span class="label">Name:</span> <span class="value">${s.Motherfirstname || '-'}</span></div>
                                    <div class="field"><span class="label">Phone:</span> <span class="value">${s.SecondaryPhone || '-'}</span></div>
                                    <div class="field"><span class="label">Occupation:</span> <span class="value">${s.SecondaryOccupation || '-'}</span></div>
                                </div>
                             </div>

                             <h2>Previous School Details</h2>
                             <div class="grid">
                                <div class="field"><span class="label">School Name:</span> <span class="value">${s.SchoolName || '-'}</span></div>
                                <div class="field"><span class="label">Admission No:</span> <span class="value">${s.AdmissionNumber || '-'}</span></div>
                                <div class="field"><span class="label">TC No:</span> <span class="value">${s.TCNumber || '-'}</span></div>
                                <div class="field"><span class="label">Previous School Class:</span> <span class="value">${s.PreviousSchoolClass || '-'}</span></div>
                             </div>

                             <script>window.print();</script>
                         </body>
                     </html>
                 `);
                printWindow.document.close();
            }
        };

        // Render table
        const table = () => {
            if (loading) return <div className="p-6 text-gray-600 text-center">Loading...</div>;
            if (!students.length) return <div className="p-6 text-gray-600 text-center">No students found</div>;

            return (
                <div className="overflow-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-violet-600 text-white">
                            <tr>
                                <th className="px-4 py-3 text-left">Student Name</th>
                                <th className="px-4 py-3 text-left">Adm No.</th>
                                <th className="px-4 py-3 text-left">Roll No.</th>
                                <th className="px-4 py-3 text-left">Class</th>
                                <th className="px-4 py-3 text-left">Branch</th>
                                <th className="px-4 py-3 text-left">Father/ Guardian Name</th>
                                <th className="px-4 py-3 text-left">Father Mobile</th>
                                <th className="px-4 py-3 text-left">Tools</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200 bg-white">
                            {students.map(s => (
                                <tr key={s.admNo} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 flex items-center gap-2">
                                        <img src={s.photo || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full object-cover border" />
                                        <span className="font-medium text-blue-600">{s.name}</span>
                                    </td>
                                    <td className="px-4 py-2">{s.admNo}</td>
                                    <td className="px-4 py-2">{s.rollNo}</td>
                                    <td className="px-4 py-2">{s.class} {s.section}</td>
                                    <td className="px-4 py-2">{s.branch}</td>
                                    <td className="px-4 py-2">{s.father}</td>
                                    <td className="px-4 py-2">{s.fatherMobile}</td>


                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onView(s)} className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1" title="Details">
                                                <span>ℹ️</span> Details
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (s.is_locked) {
                                                        alert("This student record is locked for this academic year and cannot be edited.");
                                                    } else {
                                                        onEdit(s);
                                                    }
                                                }}
                                                className={`px-2 py-1 text-xs flex items-center gap-1 rounded ${s.is_locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                                title={s.is_locked ? "Record locked (Promoted)" : "Edit"}
                                            >
                                                <span>{s.is_locked ? '🔒' : '✏️'}</span> Edit
                                            </button>
                                            <button onClick={() => handlePrint(s)} className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 flex items-center gap-1" title="Print">
                                                <span>🖨️</span> Print
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (s.is_locked) {
                                                        alert("This student record is locked for this academic year and cannot be deactivated.");
                                                    } else {
                                                        handleDeleteClick(s);
                                                    }
                                                }}
                                                className={`px-2 py-1 text-xs flex items-center gap-1 rounded ${s.is_locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                                title={s.is_locked ? "Record locked (Promoted)" : "Deactivate"}
                                            >
                                                <span>{s.is_locked ? '🔒' : '🚫'}</span> Inactivate
                                            </button>
                                            {s.status === 'Inactive' && (
                                                <button onClick={() => handleActivate(s)} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1" title="Activate">
                                                    <span>✅</span> Activate
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        };

        return (
            <div className="p-6">

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                    {/* Class dropdown */}
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="border px-3 py-2 rounded-md"
                    >
                        <option value="">-- All Classes --</option>
                        {/* FIXED: Map over objects correctly */}
                        {Array.isArray(classOptions) && classOptions.map(c => (
                            <option key={c.id} value={c.class_name}>
                                {c.class_name}
                            </option>
                        ))}
                    </select>

                    {/* Section dropdown */}
                    <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="border px-3 py-2 rounded-md"
                    >
                        <option value="">-- All Sections --</option>
                        {sectionOptions.map(section => (
                            <option key={section} value={section}>{section}</option>
                        ))}
                    </select>

                    <div className="md:col-span-2 relative">
                        <input
                            className="border px-3 py-2 w-full rounded-md pl-10"
                            placeholder="Search by Name, Adm No..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <SearchIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>

                    <button
                        onClick={loadStudents}
                        className="bg-violet-600 text-white px-4 py-2 rounded-md"
                    >
                        Search
                    </button>

                    <div className="flex items-center">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={e => setShowInactive(e.target.checked)}
                                className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">Show Inactive</span>
                        </label>
                    </div>

                </div>

                {table()}

                {/* Password Modal */}
                {passwordModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-lg w-96">
                            <h3 className="text-lg font-bold mb-4">Confirm Deactivation</h3>
                            <p className="mb-4 text-gray-600">Enter your password to mark <b>{studentToDelete?.name}</b> as Inactive.</p>
                            <input
                                type="password"
                                className="w-full border p-2 rounded mb-4"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setPasswordModalOpen(false)}
                                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                    Deactivate
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        );
    };

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
const StudentAdministration: React.FC<StudentAdministrationProps> = ({ navigateTo }) => {

    const [activeView, setActiveView] = useState<StudentAdminView>('students');
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

    const render = () => {
        switch (activeView) {

            case 'students':
                return <StudentList
                    onView={(s: Student) => { setSelectedStudent(s); setActiveView('viewStudent'); }}
                    onEdit={(s: Student) => { setSelectedStudent(s); setActiveView('editStudent'); }}
                    setActiveView={setActiveView}
                />;

            case 'addStudent':
                return <CreateStudent mode="create" onSave={() => setActiveView('students')} onCancel={() => setActiveView('students')} />;

            case 'viewStudent':
                return <CreateStudent mode="view" studentData={selectedStudent!} onCancel={() => setActiveView('students')} onEdit={() => setActiveView('editStudent')} />;

            case 'editStudent':
                return <CreateStudent mode="edit" studentData={selectedStudent!} onSave={() => setActiveView('students')} onCancel={() => setActiveView('students')} />;

            case 'import':
                return <ImportStudentData onImportSuccess={() => setActiveView('students')} />;

            case 'upgrade':
                return <PromoteStudents onBack={() => setActiveView('students')} />;

            case 'demote':
                return <DemoteStudents onBack={() => setActiveView('students')} />;

            case 'summary':
                return <ClassSummary onBack={() => setActiveView('students')} />;

            case 'search':
                return <SearchStudent />;

            case 'inactive':
                return <MakeStudentInactive />;

            case 'inactiveReport':
                return <ComingSoon pageTitle="Inactive Student Report" />;

            default:
                return <ComingSoon pageTitle="Coming Soon" />;
        }
    };

    return (
        <div className="h-full bg-gray-100 overflow-y-auto">
            <StudentAdminHeader activeView={activeView} setActiveView={setActiveView} />
            {render()}
        </div>
    );
};

export default StudentAdministration;

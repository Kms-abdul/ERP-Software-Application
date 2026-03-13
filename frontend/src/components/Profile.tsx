import React, { useState, useEffect } from 'react';
import api from '../api';

const Profile: React.FC = () => {
    const [username, setUsername] = useState('AUDIT-MN');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Teacher Details State
    const [teacherFirstName, setTeacherFirstName] = useState('');
    const [teacherLastName, setTeacherLastName] = useState('');
    const [teacherEmail, setTeacherEmail] = useState('');
    const [teacherMobile, setTeacherMobile] = useState('');

    // Add User State
    const [newUserUsername, setNewUserUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    // const [newUserBranch, setNewUserBranch] = useState('North'); // Deprecated single select
    const [newUserRole, setNewUserRole] = useState('User');
    const [newUserLocation, setNewUserLocation] = useState('');

    // New Multi-Branch State
    const [availableBranches, setAvailableBranches] = useState<any[]>([]);
    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [locationData, setLocationData] = useState<any[]>([]); // Dynamic Location Data available

    const [addUserStatus, setAddUserStatus] = useState<{ type: 'success' | 'error' | '', msg: string }>({ type: '', msg: '' });
    const [isBranchLocked, setIsBranchLocked] = useState(false);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const globalBranch = localStorage.getItem('currentBranch');

        // Fetch Branches & Locations
        const fetchData = async () => {
            try {
                const [branchRes, locRes] = await Promise.all([
                    api.get('/branches'),
                    api.get('/org/locations')
                ]);
                setAvailableBranches(branchRes.data.branches || []);
                setLocationData(locRes.data.locations || []);
            } catch (err) {
                console.error("Failed to fetch branches/locations", err);
            }
        };
        fetchData();

        if (user.role === 'Admin') {
            if (globalBranch && globalBranch !== 'All') {
                setSelectedBranches([globalBranch]);
            } else {
                setIsBranchLocked(false);
            }
        } else {
            if (user.branch) {
                setSelectedBranches([user.branch]);
                setIsBranchLocked(true);
            }
        }
    }, []);

    // Auto-update location when specific branch is selected
    // Auto-update location when specific branch is selected
    useEffect(() => {
        // Check if "All" is selected
        if (selectedBranches.includes('All')) {
            setNewUserLocation('All');
            return;
        }

        // Only auto-fill location for single specific branch
        if (selectedBranches.length === 1 && locationData.length > 0) {
            // Case-insensitive match for branch
            const b = availableBranches.find(br =>
                br.branch_code.toLowerCase() === selectedBranches[0].toLowerCase() ||
                br.branch_name.toLowerCase() === selectedBranches[0].toLowerCase()
            );

            if (b) {
                const code = (b.location_code || '').toUpperCase();
                // Find matching location name from fetched data
                const matchedLoc = locationData.find((l: any) => l.code.toUpperCase() === code);
                if (matchedLoc) {
                    setNewUserLocation(matchedLoc.name);
                }
            }
        } else if (selectedBranches.length === 0) {
            // Clear location if no branches selected
            setNewUserLocation('');
        } else if (selectedBranches.length > 1) {
            // Multiple specific branches selected - set to "Multiple"
            setNewUserLocation('Multiple');
        }
    }, [selectedBranches, availableBranches, locationData]);

    const handleBranchToggle = (branchCode: string) => {
        if (isBranchLocked) return;

        if (branchCode === 'All') {
            if (selectedBranches.includes('All')) {
                setSelectedBranches([]);
            } else {
                setSelectedBranches(['All']);
            }
            return;
        }

        // If All was selected, clear it when specific ones are toggled? 
        // Or keep it? Backend handles "All" as "All active".
        // Let's remove 'All' if specific ones are clicked for clarity, or handle mixing.
        // Simpler: If All is clicked, it's just "All". if others clicked, remove "All".

        let newSelection = selectedBranches.filter(b => b !== 'All');
        if (selectedBranches.includes(branchCode)) {
            newSelection = newSelection.filter(b => b !== branchCode);
        } else {
            newSelection.push(branchCode);
        }
        setSelectedBranches(newSelection);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddUserStatus({ type: '', msg: '' });

        if (!newUserUsername || !newUserPassword || !newUserEmail) {
            setAddUserStatus({ type: 'error', msg: 'Username, Password, and User Email are required.' });
            return;
        }

        const payload = {
            username: newUserUsername,
            password: newUserPassword,
            useremail: newUserEmail,
            branches: selectedBranches.length > 0 ? selectedBranches : (newUserRole === 'Admin' ? ['All'] : []), // Default All for Admin if empty ? Or required?
            branch: selectedBranches[0] || 'North', // Legacy fallback
            location: newUserLocation,
            role: newUserRole
        };
        console.log("Sending Add User Payload:", payload);

        try {
            await api.post(`/users/add`, payload);
            setAddUserStatus({ type: 'success', msg: 'User created successfully!' });
            // Reset form
            setNewUserUsername('');
            setNewUserPassword('');
            setNewUserEmail('');
            setSelectedBranches([]);
            setNewUserRole('User');
        } catch (error: any) {
            const errMsg = error.response?.data?.error || "Failed to create user.";
            setAddUserStatus({ type: 'error', msg: errMsg });
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="mb-6">
                <h4 className="text-xl font-semibold text-gray-700">CHANGE USERNAME/PASSWORD</h4>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Change Username Form */}
                    <form>
                        <div className="space-y-4 border border-gray-200 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Change Username</h3>
                            <div>
                                <label htmlFor="txtuserName" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                                <input
                                    type="text"
                                    id="txtuserName"
                                    name="txtuserName"
                                    maxLength={100}
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                />
                            </div>
                            <div className="flex items-center space-x-4">
                                <button type="button" className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500">
                                    Save
                                </button>
                                <button type="button" className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Change Password Form */}
                    <form>
                        <div className="space-y-4 border border-green-200 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Change Password</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="txtNewPassword" className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-red-500">*</span></label>
                                    <input
                                        type="password"
                                        id="txtNewPassword"
                                        name="txtNewPassword"
                                        maxLength={99}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="txtConfirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                                    <input
                                        type="password"
                                        id="txtConfirmPassword"
                                        name="txtConfirmPassword"
                                        maxLength={20}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button type="button" className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500">
                                    Save Password
                                </button>
                                <button type="button" className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Teacher Detail Form */}
                    <form className="lg:col-span-2">
                        <div className="space-y-4 border border-gray-200 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Teacher Detail</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="txtteacherfirstname" className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        id="txtteacherfirstname"
                                        name="txtteacherfirstname"
                                        maxLength={100}
                                        value={teacherFirstName}
                                        onChange={(e) => setTeacherFirstName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="txtteacherLastName" className="block text-sm font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        id="txtteacherLastName"
                                        name="txtteacherLastName"
                                        maxLength={100}
                                        value={teacherLastName}
                                        onChange={(e) => setTeacherLastName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="txtteacheremail" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        id="txtteacheremail"
                                        name="txtteacheremail"
                                        maxLength={100}
                                        value={teacherEmail}
                                        onChange={(e) => setTeacherEmail(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="txtTMobile" className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                                    <input
                                        type="tel"
                                        id="txtTMobile"
                                        name="txtTMobile"
                                        maxLength={100}
                                        value={teacherMobile}
                                        onChange={(e) => setTeacherMobile(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button type="button" className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500">
                                    Save
                                </button>
                                <button type="button" className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>

                </div>

                {/* Add User Section */}
                <div className="mt-8">
                    <div className="bg-white p-6 rounded-lg shadow-md border border-blue-200">
                        <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Add User (Admin Only)</h3>

                        {addUserStatus.msg && (
                            <div className={`p-4 mb-4 rounded-md ${addUserStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {addUserStatus.msg}
                            </div>
                        )}

                        <form onSubmit={handleAddUser}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div>
                                    <label htmlFor="newUserName" className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        id="newUserName"
                                        value={newUserUsername}
                                        onChange={(e) => setNewUserUsername(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Enter username"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="newUserPassword" className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
                                    <input
                                        type="password"
                                        id="newUserPassword"
                                        value={newUserPassword}
                                        onChange={(e) => setNewUserPassword(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Enter password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="newUserEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                        User Email <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        id="newUserEmail"
                                        value={newUserEmail}
                                        onChange={(e) => setNewUserEmail(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Enter user email"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Branches</label>
                                    <div className="border border-gray-300 rounded-md p-2 h-32 overflow-y-auto bg-white">
                                        <div className="flex items-center space-x-2 p-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedBranches.includes('All')}
                                                onChange={() => handleBranchToggle('All')}
                                            />
                                            <span className="text-sm">All Branches</span>
                                        </div>
                                        {availableBranches.map(b => (
                                            <div key={b.branch_code} className="flex items-center space-x-2 p-1 border-t border-gray-100">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedBranches.includes(b.branch_code)}
                                                    onChange={() => handleBranchToggle(b.branch_code)}
                                                    disabled={isBranchLocked || selectedBranches.includes('All')}
                                                />
                                                <span className="text-sm">{b.branch_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Select multiple or All</p>
                                </div>
                                <div>
                                    <label htmlFor="newUserLocation" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                    <input
                                        type="text"
                                        id="newUserLocation"
                                        value={newUserLocation}
                                        onChange={(e) => setNewUserLocation(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />

                                </div>
                                <div>
                                    <label htmlFor="newUserRole" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                    <select
                                        id="newUserRole"
                                        value={newUserRole}
                                        onChange={(e) => setNewUserRole(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="User">User</option>
                                        <option value="Admin">Admin</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mt-6">
                                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                    Create User
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
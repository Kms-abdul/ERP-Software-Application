import React, { useState, useEffect } from 'react';
import api from '../api';

const Profile: React.FC = () => {
    // Username State
    const [username, setUsername] = useState('');
    const [originalUsername, setOriginalUsername] = useState('');
    const [usernameLoading, setUsernameLoading] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState<{ type: 'success' | 'error' | '', msg: string }>({ type: '', msg: '' });

    // Password State
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error' | '', msg: string }>({ type: '', msg: '' });

    // Add User State
    const [newUserUsername, setNewUserUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserRole, setNewUserRole] = useState('User');
    const [newUserLocation, setNewUserLocation] = useState('');

    // Multi-Branch State
    const [availableBranches, setAvailableBranches] = useState<any[]>([]);
    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [locationData, setLocationData] = useState<any[]>([]);

    const [addUserStatus, setAddUserStatus] = useState<{ type: 'success' | 'error' | '', msg: string }>({ type: '', msg: '' });
    const [addUserLoading, setAddUserLoading] = useState(false);
    const [isBranchLocked, setIsBranchLocked] = useState(false);

    // Current user role to show/hide admin features
    const [currentUserRole, setCurrentUserRole] = useState('');

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const globalBranch = localStorage.getItem('currentBranch');

        // Set current user data
        if (user) {
            setCurrentUserRole(user.role || '');
            setUsername(user.username || '');
            setOriginalUsername(user.username || '');
        }

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

        // Fetch current user profile from API
        const fetchUserProfile = async () => {
            try {
                const response = await api.get('/users/profile');
                const userData = response.data.user || response.data;
                setUsername(userData.username || '');
                setOriginalUsername(userData.username || '');
            } catch (err) {
                console.error("Failed to fetch user profile", err);
            }
        };
        fetchUserProfile();

        // Branch locking logic
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
    useEffect(() => {
        if (selectedBranches.includes('All')) {
            setNewUserLocation('All');
            return;
        }

        if (selectedBranches.length === 1 && locationData.length > 0) {
            const b = availableBranches.find(br =>
                br.branch_code?.toLowerCase() === selectedBranches[0].toLowerCase() ||
                br.branch_name?.toLowerCase() === selectedBranches[0].toLowerCase()
            );

            if (b) {
                const code = (b.location_code || '').toUpperCase();
                const matchedLoc = locationData.find((l: any) => l.code?.toUpperCase() === code);
                if (matchedLoc) {
                    setNewUserLocation(matchedLoc.name);
                }
            }
        } else if (selectedBranches.length === 0) {
            setNewUserLocation('');
        } else if (selectedBranches.length > 1) {
            setNewUserLocation('Multiple');
        }
    }, [selectedBranches, availableBranches, locationData]);

    // ==================== USERNAME HANDLERS ====================
    const handleSaveUsername = async () => {
        if (!username.trim()) {
            setUsernameStatus({ type: 'error', msg: 'Username cannot be empty' });
            return;
        }

        if (username.trim() === originalUsername) {
            setUsernameStatus({ type: 'error', msg: 'Username has not changed' });
            return;
        }

        setUsernameLoading(true);
        setUsernameStatus({ type: '', msg: '' });

        try {
            await api.put('/users/update-username', {
                username: username.trim()
            });

            // Update localStorage with new username
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            user.username = username.trim();
            localStorage.setItem('user', JSON.stringify(user));

            setOriginalUsername(username.trim());
            setUsernameStatus({ type: 'success', msg: 'Username updated successfully!' });

        } catch (error: any) {
            const errMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to update username';
            setUsernameStatus({ type: 'error', msg: errMsg });
        } finally {
            setUsernameLoading(false);
        }
    };

    const handleCancelUsername = () => {
        setUsername(originalUsername);
        setUsernameStatus({ type: '', msg: '' });
    };

    // ==================== PASSWORD HANDLERS ====================
    const handleSavePassword = async () => {
        if (!newPassword) {
            setPasswordStatus({ type: 'error', msg: 'New password is required' });
            return;
        }

        if (newPassword.length < 6) {
            setPasswordStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordStatus({ type: 'error', msg: 'Passwords do not match' });
            return;
        }

        setPasswordLoading(true);
        setPasswordStatus({ type: '', msg: '' });

        try {
            await api.put('/users/update-password', {
                newPassword: newPassword
            });

            setPasswordStatus({ type: 'success', msg: 'Password updated successfully!' });
            setNewPassword('');
            setConfirmPassword('');

        } catch (error: any) {
            const errMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to update password';
            setPasswordStatus({ type: 'error', msg: errMsg });
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleCancelPassword = () => {
        setNewPassword('');
        setConfirmPassword('');
        setPasswordStatus({ type: '', msg: '' });
    };

    // ==================== BRANCH TOGGLE HANDLER ====================
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

        let newSelection = selectedBranches.filter(b => b !== 'All');
        if (selectedBranches.includes(branchCode)) {
            newSelection = newSelection.filter(b => b !== branchCode);
        } else {
            newSelection.push(branchCode);
        }
        setSelectedBranches(newSelection);
    };

    // ==================== ADD USER HANDLER ====================
    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddUserStatus({ type: '', msg: '' });

        // Validation
        if (!newUserUsername.trim()) {
            setAddUserStatus({ type: 'error', msg: 'Username is required' });
            return;
        }

        if (!newUserPassword) {
            setAddUserStatus({ type: 'error', msg: 'Password is required' });
            return;
        }

        if (newUserPassword.length < 6) {
            setAddUserStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
            return;
        }

        if (!newUserEmail.trim()) {
            setAddUserStatus({ type: 'error', msg: 'Email is required' });
            return;
        }

        if (selectedBranches.length === 0) {
            setAddUserStatus({ type: 'error', msg: 'Please select at least one branch' });
            return;
        }

        setAddUserLoading(true);

        const payload = {
            username: newUserUsername.trim(),
            password: newUserPassword,
            useremail: newUserEmail.trim(),
            branches: selectedBranches,
            branch: selectedBranches[0] || 'North',
            location: newUserLocation,
            role: newUserRole
        };

        console.log("Creating user with payload:", payload);

        try {
            await api.post('/users/add', payload);
            setAddUserStatus({ type: 'success', msg: 'User created successfully!' });

            // Reset form
            setNewUserUsername('');
            setNewUserPassword('');
            setNewUserEmail('');
            setSelectedBranches([]);
            setNewUserRole('User');
            setNewUserLocation('');

        } catch (error: any) {
            const errMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to create user';
            setAddUserStatus({ type: 'error', msg: errMsg });
        } finally {
            setAddUserLoading(false);
        }
    };

    const handleResetAddUserForm = () => {
        setNewUserUsername('');
        setNewUserPassword('');
        setNewUserEmail('');
        setSelectedBranches([]);
        setNewUserRole('User');
        setNewUserLocation('');
        setAddUserStatus({ type: '', msg: '' });
    };

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="mb-6">
                <h4 className="text-xl font-semibold text-gray-700">CHANGE USERNAME/PASSWORD</h4>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* ==================== CHANGE USERNAME FORM ==================== */}
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="space-y-4 border border-gray-200 p-6 rounded-lg h-full">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Change Username</h3>

                            {usernameStatus.msg && (
                                <div className={`p-3 rounded-md text-sm ${usernameStatus.type === 'success'
                                    ? 'bg-green-50 border border-green-200 text-green-700'
                                    : 'bg-red-50 border border-red-200 text-red-700'
                                    }`}>
                                    {usernameStatus.msg}
                                </div>
                            )}

                            <div>
                                <label htmlFor="txtuserName" className="block text-sm font-medium text-gray-700 mb-1">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    id="txtuserName"
                                    name="txtuserName"
                                    maxLength={100}
                                    value={username}
                                    disabled={true}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        setUsernameStatus({ type: '', msg: '' });
                                    }}
                                    // disabled={usernameLoading}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-100"
                                />
                            </div>

                            <div className="flex items-center space-x-4">
                                <button
                                    type="button"
                                    onClick={handleSaveUsername}
                                    disabled={usernameLoading || username === originalUsername}
                                    className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    {usernameLoading ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelUsername}
                                    disabled={usernameLoading || username === originalUsername}
                                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* ==================== CHANGE PASSWORD FORM ==================== */}
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="space-y-4 border border-green-200 p-6 rounded-lg h-full">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Change Password</h3>

                            {passwordStatus.msg && (
                                <div className={`p-3 rounded-md text-sm ${passwordStatus.type === 'success'
                                    ? 'bg-green-50 border border-green-200 text-green-700'
                                    : 'bg-red-50 border border-red-200 text-red-700'
                                    }`}>
                                    {passwordStatus.msg}
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label htmlFor="txtNewPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                        New Password <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="txtNewPassword"
                                        name="txtNewPassword"
                                        maxLength={99}
                                        value={newPassword}
                                        onChange={(e) => {
                                            setNewPassword(e.target.value);
                                            setPasswordStatus({ type: '', msg: '' });
                                        }}
                                        disabled={passwordLoading}
                                        placeholder="Enter new password"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-100"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="txtConfirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                        Confirm Password <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="txtConfirmPassword"
                                        name="txtConfirmPassword"
                                        maxLength={99}
                                        value={confirmPassword}
                                        onChange={(e) => {
                                            setConfirmPassword(e.target.value);
                                            setPasswordStatus({ type: '', msg: '' });
                                        }}
                                        disabled={passwordLoading}
                                        placeholder="Confirm new password"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 disabled:bg-gray-100"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center space-x-4">
                                <button
                                    type="button"
                                    onClick={handleSavePassword}
                                    disabled={passwordLoading || (!newPassword && !confirmPassword)}
                                    className="bg-violet-600 text-white px-4 py-2 rounded-md hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    {passwordLoading ? 'Saving...' : 'Save Password'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelPassword}
                                    disabled={passwordLoading || (!newPassword && !confirmPassword)}
                                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </form>

                </div>

                {/* ==================== ADD USER SECTION (ADMIN ONLY) ==================== */}
                {currentUserRole === 'Admin' && (
                    <div className="mt-8">
                        <div className="bg-white p-6 rounded-lg shadow-md border border-blue-200">
                            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
                                Add New User
                            </h3>

                            {addUserStatus.msg && (
                                <div className={`p-4 mb-4 rounded-md ${addUserStatus.type === 'success'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : 'bg-red-100 text-red-700 border border-red-200'
                                    }`}>
                                    {addUserStatus.msg}
                                </div>
                            )}

                            <form onSubmit={handleAddUser}>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                                    {/* Username */}
                                    <div>
                                        <label htmlFor="newUserName" className="block text-sm font-medium text-gray-700 mb-1">
                                            Username <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="newUserName"
                                            value={newUserUsername}
                                            onChange={(e) => {
                                                setNewUserUsername(e.target.value);
                                                setAddUserStatus({ type: '', msg: '' });
                                            }}
                                            disabled={addUserLoading}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                            placeholder="Enter username"
                                        />
                                    </div>

                                    {/* Password */}
                                    <div>
                                        <label htmlFor="newUserPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                            Password <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="password"
                                            id="newUserPassword"
                                            value={newUserPassword}
                                            onChange={(e) => {
                                                setNewUserPassword(e.target.value);
                                                setAddUserStatus({ type: '', msg: '' });
                                            }}
                                            disabled={addUserLoading}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                            placeholder="Enter password (min 6 chars)"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div>
                                        <label htmlFor="newUserEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                            Email <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            id="newUserEmail"
                                            value={newUserEmail}
                                            onChange={(e) => {
                                                setNewUserEmail(e.target.value);
                                                setAddUserStatus({ type: '', msg: '' });
                                            }}
                                            disabled={addUserLoading}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                            placeholder="Enter user email"
                                        />
                                    </div>

                                    {/* Branch Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Allowed Branches <span className="text-red-500">*</span>
                                        </label>
                                        <div className="border border-gray-300 rounded-md p-2 h-40 overflow-y-auto bg-white">
                                            {/* All Branches Option */}
                                            <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                                                <input
                                                    type="checkbox"
                                                    id="branch-all"
                                                    checked={selectedBranches.includes('All')}
                                                    onChange={() => handleBranchToggle('All')}
                                                    disabled={addUserLoading || isBranchLocked}
                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <label htmlFor="branch-all" className="text-sm font-medium text-gray-700">
                                                    All Branches
                                                </label>
                                            </div>

                                            <hr className="my-1" />

                                            {/* Individual Branches */}
                                            {availableBranches.map((b) => (
                                                <div key={b.branch_code} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                                                    <input
                                                        type="checkbox"
                                                        id={`branch-${b.branch_code}`}
                                                        checked={selectedBranches.includes(b.branch_code)}
                                                        onChange={() => handleBranchToggle(b.branch_code)}
                                                        disabled={addUserLoading || isBranchLocked || selectedBranches.includes('All')}
                                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                    />
                                                    <label htmlFor={`branch-${b.branch_code}`} className="text-sm text-gray-700">
                                                        {b.branch_name}
                                                    </label>
                                                </div>
                                            ))}

                                            {availableBranches.length === 0 && (
                                                <p className="text-sm text-gray-500 p-2">No branches available</p>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Selected: {selectedBranches.length === 0 ? 'None' : selectedBranches.join(', ')}
                                        </p>
                                    </div>

                                    {/* Location (Auto-filled) */}
                                    <div>
                                        <label htmlFor="newUserLocation" className="block text-sm font-medium text-gray-700 mb-1">
                                            Location
                                        </label>
                                        <input
                                            type="text"
                                            id="newUserLocation"
                                            value={newUserLocation}
                                            onChange={(e) => setNewUserLocation(e.target.value)}
                                            disabled={addUserLoading}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 bg-gray-50"
                                            placeholder="Auto-filled from branch"
                                            readOnly
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Auto-filled based on branch selection</p>
                                    </div>

                                    {/* Role */}
                                    <div>
                                        <label htmlFor="newUserRole" className="block text-sm font-medium text-gray-700 mb-1">
                                            Role
                                        </label>
                                        <select
                                            id="newUserRole"
                                            value={newUserRole}
                                            onChange={(e) => setNewUserRole(e.target.value)}
                                            disabled={addUserLoading}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                        >
                                            <option value="User">User</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="mt-6 flex items-center space-x-4">
                                    <button
                                        type="submit"
                                        disabled={addUserLoading}
                                        className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    >
                                        {addUserLoading ? 'Creating...' : 'Create User'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetAddUserForm}
                                        disabled={addUserLoading}
                                        className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;
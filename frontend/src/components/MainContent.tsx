import React, { useState } from 'react';
import { Page } from '../App';
import { SearchIcon, TimeIcon, ChevronDownIcon } from './icons';
import SummaryBar from './SummaryBar';
import dashboardImg from '../images/Dashboard.png';

interface MainContentProps {
    navigateTo: (page: Page) => void;
}

interface WelcomeBarProps {
    navigateTo: (page: Page) => void;
}
const WelcomeBar: React.FC<WelcomeBarProps> = ({ navigateTo }) => {

    const menuItems = [
        { name: 'Fee', icon: 'https://cdn-icons-png.flaticon.com/512/1001/1001096.png', page: 'fee' as Page },
        { name: 'Admission', icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063820.png', page: 'dashboard' as Page },
        { name: 'Account', icon: 'https://cdn-icons-png.flaticon.com/512/272/272997.png', page: 'dashboard' as Page },
        { name: 'Student', icon: 'https://cdn-icons-png.flaticon.com/512/921/921347.png', page: 'dashboard' as Page },
        { name: 'Staff', icon: 'https://cdn-icons-png.flaticon.com/512/2940/2940626.png', page: 'dashboard' as Page },
    ];

    const savedUser = localStorage.getItem('user');
    const user = savedUser ? JSON.parse(savedUser) : null;

    // --- Branch Logic (ID Based) ---
    interface BranchOption { id: string; name: string; }
    let branchOptions: BranchOption[] = [];

    if (user?.allowed_branches && Array.isArray(user.allowed_branches)) {
        branchOptions = user.allowed_branches.map((b: any) => ({
            id: String(b.branch_id),
            name: b.branch_name
        }));
    }
    // Fallback
    if (branchOptions.length === 0 && user?.branch) {
        branchOptions = [{ id: user.branch, name: user.branch }];
    }
    // Admin View All
    const canViewAll = user?.role === 'Admin';
    const hasAll = branchOptions.some(b => b.id === 'All' || b.name === 'All');
    if (canViewAll && !hasAll) {
        branchOptions = [{ id: 'All', name: 'All Branches' }, ...branchOptions];
    }

    const showDropdown = branchOptions.length > 1;

    // State
    const [currentBranch, setCurrentBranch] = useState(() => {
        const stored = localStorage.getItem('currentBranch');
        if (stored) return stored;
        if (canViewAll) return 'All';
        return branchOptions.length > 0 ? branchOptions[0].id : 'All';
    });

    const handleBranchChange = (branchId: string) => {
        localStorage.setItem('currentBranch', branchId);
        setCurrentBranch(branchId);
        window.location.reload();
    };

    const currentBranchName = branchOptions.find(b => b.id === currentBranch)?.name || currentBranch;

    return (
        <div className="bg-white shadow-sm">
            <div className="container-fluid mx-auto px-4">
                <div className="flex items-center justify-between flex-wrap">
                    <div className="py-4 flex items-center">
                        <h2 className="text-xl text-gray-800 mr-4">Welcome, <span className="font-semibold">{user?.username || 'User'}</span></h2>



                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-4 overflow-x-auto py-2">
                        {menuItems.map((item, index) => (
                            <a
                                key={index}
                                href="#"
                                onClick={(e) => { e.preventDefault(); navigateTo(item.page); }}
                                className="flex-shrink-0 text-center p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 w-24">
                                <img src={item.icon} alt={item.name} className="h-8 w-8 mx-auto object-contain" />
                                <span className="text-xs text-gray-600 mt-1 block">{item.name}</span>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DashboardHome: React.FC = () => {
    return (
        <div className="p-2 md:p-2 space-y-2">
            <SummaryBar />
            <div className="flex justify-center w-full mt-14">
                <img
                    src={dashboardImg}
                    alt="Dashboard Illustration"
                    className="max-w-full h-auto rounded-lg shadow-sm"
                    style={{ maxHeight: '55vh', objectFit: 'contain' }}
                />
            </div>
        </div>
    );
};


const MainContent: React.FC<MainContentProps> = ({ navigateTo }) => {
    return (
        <>
            <WelcomeBar navigateTo={navigateTo} />
            <DashboardHome />
        </>
    );
};

export default MainContent;
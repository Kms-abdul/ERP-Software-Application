import React from 'react';
import { Page } from '../App';
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
            <div className="w-full mt-4 flex flex-col items-center">
                <h2 className="text-M font-medium text-green-600">
                    MS Hifz Academy - Academy Learning Overview
                </h2>
                <img
                    src={dashboardImg}
                    alt="Dashboard Illustration"
                    className="w-full h-auto rounded-lg shadow-sm"
                    style={{ maxHeight: '55vh', objectFit: 'cover' }}
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
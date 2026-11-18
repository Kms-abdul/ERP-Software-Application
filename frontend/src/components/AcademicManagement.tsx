import React from 'react';
import { Page } from '../App';
import {
    AcademicIcon,
    ChartBarIcon,
    DocumentReportIcon,
    TimeIcon,
    DashboardIcon,
    PencilIcon,
    UserIcon,
    CurrencyRupeeIcon,
} from './icons';

interface AcademicManagementProps {
    navigateTo: (page: Page) => void;
}

interface AcademicModule {
    id: string;
    name: string;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    page?: Page;
    comingSoon?: boolean;
}

const AcademicManagement: React.FC<AcademicManagementProps> = ({ navigateTo }) => {
    const academicModules: AcademicModule[] = [
        { id: 'academic', name: 'Academic', icon: <AcademicIcon className="w-8 h-8" />, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', page: 'academics' },
        { id: 'hifz-rewards', name: 'Hifz Rewards', icon: <CurrencyRupeeIcon className="w-8 h-8" />, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',page: 'hifz-rewards'},
        { id: 'classwork', name: 'Classwork', icon: <ChartBarIcon className="w-8 h-8" />, iconBg: 'bg-purple-50', iconColor: 'text-purple-600', comingSoon: true },
        { id: 'homework', name: 'Homework', icon: <DocumentReportIcon className="w-8 h-8" />, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', comingSoon: true },
        { id: 'lesson-plan', name: 'Lesson Plan', icon: <PencilIcon className="w-8 h-8" />, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', comingSoon: true },
        { id: 'time-table', name: 'Time Table', icon: <TimeIcon className="w-8 h-8" />, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', comingSoon: true },
        { id: 'time-table-2', name: 'Time Table', icon: <TimeIcon className="w-8 h-8" />, iconBg: 'bg-green-50', iconColor: 'text-green-600', comingSoon: true },
        { id: 'online-exam', name: 'Online Exam', icon: <DocumentReportIcon className="w-8 h-8" />, iconBg: 'bg-pink-50', iconColor: 'text-pink-600', comingSoon: true },
        { id: 'academic-content', name: 'Academic Content', icon: <DashboardIcon className="w-8 h-8" />, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', comingSoon: true },
        { id: 'assessment', name: 'Assessment', icon: <ChartBarIcon className="w-8 h-8" />, iconBg: 'bg-red-50', iconColor: 'text-red-600', comingSoon: true },
        { id: 'online-class', name: 'Online Class', icon: <UserIcon className="w-8 h-8" />, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600', comingSoon: true },
        
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="bg-white shadow-sm border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 rounded-lg"><AcademicIcon className="w-6 h-6 text-blue-600" /></div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900">Academic Management</h1>
                            <p className="text-sm text-slate-600 mt-0.5">Manage all academic activities and resources</p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {academicModules.map((module) => (
                        <button
                            key={module.id}
                            onClick={() => module.page && navigateTo(module.page)}
                            className="group relative bg-white rounded-xl p-6 border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <div className={module.iconBg + ' ' + module.iconColor + ' w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200'}>{module.icon}</div>
                            <h3 className="font-semibold text-slate-900 text-base mb-1 group-hover:text-blue-600 transition-colors">{module.name}</h3>
                            {module.comingSoon && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Coming Soon</span>}
                            {module.page && !module.comingSoon && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AcademicManagement;

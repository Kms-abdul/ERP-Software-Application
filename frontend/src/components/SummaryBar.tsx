import React, { useState, useEffect } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { UserIcon, CurrencyRupeeIcon } from './icons';
import api from '../api';

const SummaryCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white p-4 rounded-lg shadow-sm flex items-center space-x-4 border-l-4" style={{ borderColor: color }}>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${color}1A`, color }}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-xl font-semibold text-gray-800">{value}</p>
        </div>
    </div>
);


const SummaryBar: React.FC = () => {
    const { students } = useSchool();
    const [presentToday, setPresentToday] = useState(0);

    // Read selected branch from localStorage (matches api.ts usage)
    const currentBranch = (localStorage.getItem('currentBranch') || 'All').trim();
    const normalizedBranch = currentBranch.toLowerCase();
    const isAll = !normalizedBranch || normalizedBranch.startsWith('all');

    // Resolve Branch Name from ID (SAFE fix for Mixed Data)
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const allowed = user.allowed_branches || [];
    let targetBranchName = currentBranch;

    if (Array.isArray(allowed)) {
        const branchObj = allowed.find((b: any) => String(b.branch_id) === currentBranch);
        if (branchObj) targetBranchName = branchObj.branch_name;
    }

    const filteredStudents = isAll
        ? students
        : students.filter(s => {
            const sBranch = (s.branch || '').toLowerCase().trim();
            return sBranch === normalizedBranch || sBranch === targetBranchName.toLowerCase().trim();
        });

    const totalStudents = filteredStudents.length;

    const totalDues = filteredStudents.reduce((total, student) => {
        return total + (student.total_due || 0);
    }, 0);

    useEffect(() => {
        const fetchAttendance = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const res = await api.get(`/attendance?date=${today}`);
                const attendanceMap = res.data.attendance || {};
                
                // If branch filter is applied, we only count students who are in the filtered list
                // The attendanceMap contains student_id -> status
                const filteredStudentIds = new Set(filteredStudents.map(s => s.student_id));
                
                const count = Object.entries(attendanceMap).filter(([studentId, status]) => {
                    return filteredStudentIds.has(Number(studentId)) && status === 'Present';
                }).length;
                
                setPresentToday(count);
            } catch (err) {
                console.error('Failed to fetch today\'s attendance:', err);
                setPresentToday(0);
            }
        };

        fetchAttendance();
    }, [filteredStudents]); // Re-run when filtered students change (e.g. branch change)

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SummaryCard
                title="Total Students"
                value={totalStudents}
                icon={<UserIcon className="w-6 h-6" />}
                color="#4f46e5"
            />
            <SummaryCard
                title="Total Fee Dues"
                value={totalDues}
                icon={<CurrencyRupeeIcon className="w-6 h-6" />}
                color="#db2777"
            />

            <SummaryCard
                title="Total Present Students"
                value={presentToday}
                icon={<UserIcon className="w-6 h-6" />}
                color="#10b981"
            />

        </div>
    );
};

export default SummaryBar;

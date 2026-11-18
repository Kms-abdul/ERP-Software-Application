import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import Profile from './Profile';
import Fee from './Fee';
import FeeType from './FeeType';
import ClassFeeStructure from './ClassFeeStructure';
import AssignSpecialFee from './AssignSpecialFee';
import FeeInstallments from './FeeInstallments';
import TakeFee from './TakeFee';
import Administration from './Administration';
import SetupSchool from './SetupSchool';
import ClassesManagement from './ClassesManagement';
import AcademicManagement from './AcademicManagement';
import Academics from './Academics';
import StaffSupport from './StaffSupport';
import StudentAttendance from './StudentAttendance';
import StudentAdministration from './StudentAdministration';
import ConcessionMaster from './ConcessionMaster';
import StudentConcession from './StudentConcession';
import UpdateStudentFeeStructure from './UpdateStudentFeeStructure';
import UpdateRebateDate from './UpdateRebateDate';
import FeeReports from './FeeReports';
import DeletedReceiptsReport from './DeletedReceiptsReport';
import FeeConcessionReport from './FeeConcessionReport';
import AdjustFeeReport from './AdjustFeeReport';
import Configuration from './Configuration';
import DocumentManagement from './DocumentManagement';
import CreateStudent from './CreateStudent';
import PettyCash from './PettyCash';
import PettyCashReport from './PettyCashReport';
import FundAllocation from './FundAllocation';
import MonthWiseLedger from './MonthWiseLedger';
import RemittanceDeposit from './RemittanceDeposit';
import RemittanceApprovals from './RemittanceApprovals';
import HifzRewards from "./HifzRewards";
import ReconciliationDashboard from './ReconciliationDashboard';
import FeeDueReports from './FeeDueReports';
import FinancialLayout from './FinancialLayout';
import { useNavigationHistory } from '../hooks/useNavigationHistory';

const financialPages = [
  'fee', 'fee-type', 'class-fee-structure', 'assign-special-fee',
  'fee-installments', 'take-fee', 'concession-master', 'student-concession',
  'update-student-fee-structure', 'update-rebate-date', 'fee-reports',
  'deleted-receipts', 'fee-concession-report', 'adjust-fee-report', 'fee-due-reports',
  'petty-cash', 'petty-cash-report', 'fund-allocation', 'month-wise-ledger', 'user-daily-report',
  'remittance-deposit', 'remittance-approvals', 'reconciliation-dashboard'
];

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const {
    currentPage,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward
  } = useNavigationHistory('dashboard');

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isTeacher = user?.role === 'Teacher';
  const teacherAllowedPages = [
    'dashboard', 'profile', 'staff-support', 'administration',
    'student-attendance', 'attendance-report', 'student-administration', 'document-management',
    'hifz-rewards'
  ];

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} navigateTo={navigateTo} currentPage={currentPage} />
      <div className="flex flex-col flex-1 overflow-auto">
        <Header
          toggleSidebar={toggleSidebar}
          navigateTo={navigateTo}
          onLogout={onLogout}
          goBack={goBack}
          goForward={goForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
        <main className="flex-1">
        <div className="mx-auto w-full max-w-[1920px] px-4">
          {isTeacher && !teacherAllowedPages.includes(currentPage) ? (
            <Administration navigateTo={navigateTo} />
          ) : (
            <>
              {currentPage === 'dashboard' && <MainContent navigateTo={navigateTo} />}
              {currentPage === 'profile' && <Profile />}
              {financialPages.includes(currentPage) ? (
                <FinancialLayout currentPage={currentPage} navigateTo={navigateTo}>
                  {currentPage === 'fee' && <Fee navigateTo={navigateTo} />}
                  {currentPage === 'fee-type' && <FeeType />}
                  {currentPage === 'class-fee-structure' && <ClassFeeStructure />}
                  {currentPage === 'assign-special-fee' && <AssignSpecialFee />}
                  {currentPage === 'fee-installments' && <FeeInstallments />}
                  {currentPage === 'take-fee' && <TakeFee navigateTo={navigateTo} />}
                  {currentPage === 'concession-master' && <ConcessionMaster />}
                  {currentPage === 'student-concession' && <StudentConcession />}
                  {currentPage === 'update-student-fee-structure' && <UpdateStudentFeeStructure />}
                  {currentPage === 'update-rebate-date' && <UpdateRebateDate />}
                  {currentPage === 'fee-reports' && <FeeReports />}
                  {currentPage === 'fee-due-reports' && <FeeDueReports />}
                  {currentPage === 'deleted-receipts' && <DeletedReceiptsReport />}
                  {currentPage === 'fee-concession-report' && <FeeConcessionReport />}
                  {currentPage === 'adjust-fee-report' && <AdjustFeeReport />}
                  {currentPage === 'petty-cash' && <PettyCash />}
                  {currentPage === 'petty-cash-report' && <PettyCashReport />}
                  {currentPage === 'fund-allocation' && <FundAllocation />}
                  {currentPage === 'month-wise-ledger' && <MonthWiseLedger />}
                  {currentPage === 'user-daily-report' && <FeeReports singleDailyMode={true} />}
                  {currentPage === 'remittance-deposit' && <RemittanceDeposit />}
                  {currentPage === 'remittance-approvals' && <RemittanceApprovals />}
                  {currentPage === 'reconciliation-dashboard' && <ReconciliationDashboard />}
                </FinancialLayout>
              ) : (
                <>
                  {currentPage === 'administration' && <Administration navigateTo={navigateTo} />}
                  {currentPage === 'academic' && <AcademicManagement navigateTo={navigateTo} />}
                  {currentPage === 'academics' && <Academics />}
                  {currentPage === "hifz-rewards" && <HifzRewards />}
                  {currentPage === 'setup' && <SetupSchool navigateTo={navigateTo} />}
                  {currentPage === 'classes-management' && <ClassesManagement navigateTo={navigateTo} />}
                  {currentPage === 'student-attendance' && <StudentAttendance navigateTo={navigateTo} />}
                  {currentPage === 'attendance-report' && <StudentAttendance navigateTo={navigateTo} defaultTab="absent-report" />}
                  {currentPage === 'student-administration' && <StudentAdministration navigateTo={navigateTo} />}
                  {currentPage === 'staff-support' && <StaffSupport />}
                  {currentPage === 'configuration' && <Configuration navigateTo={navigateTo} />}
                  {currentPage === 'document-management' && <DocumentManagement />}
                  {currentPage === 'create-student' && <CreateStudent mode="create" onCancel={() => navigateTo('dashboard')} onSave={() => navigateTo('student-administration')} />}
                </>
              )}
            </>
          )}
        </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
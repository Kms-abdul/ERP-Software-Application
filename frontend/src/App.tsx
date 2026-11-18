import React, { useState } from "react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import { auth } from "./api";

export type Page =
  | "dashboard"
  | "profile"
  | "fee"
  | "fee-type"
  | "class-fee-structure"
  | "assign-special-fee"
  | "fee-installments"
  | "take-fee"
  | "administration"
  | "academic"
  | "academics"
  | "hifz-rewards"
  | "setup"
  | "classes-management"
  | "student-attendance"
  | "student-administration"
  | "concession-master"
  | "student-concession"
  | "update-student-fee-structure"
  | "update-rebate-date"
  | "create-student"
  | "import-student-data"
  | "fee-reports"
  | "attendance-report"
  | "configuration"
  | "document-administration"
  | "student-document-management"
  | "document-management"
  | "staff-support"
  | "petty-cash"
  | "petty-cash-report"
  | "deleted-receipts"
  | "fee-concession-report"
  | "adjust-fee-report"
  | "fee-due-report"
  | "fee-due-reports"
  | "user-daily-report"
  | "fund-allocation"
  | "month-wise-ledger"
  | "remittance-deposit"
  | "remittance-approvals"
  | "reconciliation-dashboard";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return auth.isAuthenticated();
  });

  const handleLogout = () => {
    auth.clearToken();
    localStorage.removeItem('user');
    setIsAuthenticated(false);
  };

  return (
    <>
      {isAuthenticated ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
      )}
    </>
  );
};

export default App;

import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  ClassOption,
  SectionOption,
  TestOption,
  StudentOption,
  ProgressReportData,
  AcademicHistoryRecord,
  HistoricalPerformance
} from '../reportcardtypes';
import ReportCard from './ReportCard';

// Import the reusable component

// API_BASE_URL is now handled by the api instance

const StudentReportCard: React.FC = () => {
  // ============== PRINT STYLES ==============
  React.useEffect(() => {
    // Add print-specific styles
    const style = document.createElement('style');
    style.id = 'student-report-print-styles';
    style.textContent = `
      /* Hide summary page on screen — it's print-only */
      @media screen {
        .print-summary-page {
          display: none !important;
        }
      }

      @media print {
        @page {
          margin: 8mm;
          size: A4;
        }

        /* ── 1. Kill the Dashboard layout scrollbar (the culprit) ── */
        .flex.h-screen.overflow-hidden,
        .flex.flex-col.flex-1.overflow-y-auto,
        .flex.flex-col.flex-1.overflow-x-hidden {
          overflow: visible !important;
          height: auto !important;
        }

        /* ── 2. Reset html/body ── */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          width: 100% !important;
          overflow: visible !important;
          background: white !important;
        }

        /* ── 3. Kill ALL scrollbars from every element ── */
        * {
          scrollbar-width: none !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        *::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        /* ── 4. Hide UI chrome ── */
        .no-print,
        aside,
        nav,
        header,
        footer,
        button,
        a[href*="back"],
        .sidebar,
        .menu,
        [role="tablist"],
        [class*="sidebar"],
        [class*="nav"] {
          display: none !important;
        }

        /* ── 5. Main content area ── */
        main.flex-1,
        main,
        .main-content {
          overflow: visible !important;
          height: auto !important;
          padding: 0 !important;
          margin-left: 0 !important;
          padding-left: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        /* ── 6. Student reports wrapper ── */
        .student-reports-wrapper {
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
          height: auto !important;
          width: 100% !important;
        }

        /* ── 7. Report card container ── */
        .report-card-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: 1px solid #1e3a5f !important;
          display: block !important;
          overflow: visible !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* ── 8. Page breaks ── */
        .report-card-container {
          page-break-after: always !important;
          break-after: page !important;
        }
        /* When only single report and no summary page */
        .all-reports-container > .report-card-container:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }

        /* ── 9. Prevent content cutting inside rows ── */
        .report-card-container table {
          page-break-inside: auto !important;
        }
        .report-card-container tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        /* ── 10. Hide recharts tooltip ── */
        .recharts-tooltip-wrapper {
          display: none !important;
          visibility: hidden !important;
        }

        /* ── 11. SVG / images ── */
        svg, img {
          max-width: 100% !important;
          overflow: visible !important;
          display: block !important;
        }

        .recharts-responsive-container,
        .recharts-wrapper {
          max-width: 100% !important;
          width: 100% !important;
        }

        /* ── 12. All reports container ── */
        .all-reports-container {
          overflow: visible !important;
          width: 100% !important;
          height: auto !important;
          display: block !important;
        }

        /* ── 13. Summary Page (Last Page) ── */
        .print-summary-page {
          display: flex !important;
          page-break-before: always !important;
          break-before: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          overflow: visible !important;
          width: 100% !important;
          min-height: 90vh !important;
          box-sizing: border-box !important;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById('student-report-print-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // ============== CONTEXT STATE (from localStorage like MarksEntry) ==============
  const [academicYear, setAcademicYear] = useState<string>("");
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  // ============== DROPDOWN OPTIONS STATE ==============
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [tests, setTests] = useState<TestOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  // ============== SELECTED VALUES STATE ==============
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedTestId, setSelectedTestId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectAllStudents, setSelectAllStudents] = useState<boolean>(false);

  // ============== LOADING STATES ==============
  const [loadingClasses, setLoadingClasses] = useState<boolean>(false);
  const [loadingSections, setLoadingSections] = useState<boolean>(false);
  const [loadingTests, setLoadingTests] = useState<boolean>(false);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [loadingAllReports, setLoadingAllReports] = useState<boolean>(false);

  // ============== MESSAGE STATE ==============
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // ============== REPORT DATA STATE ==============
  const [data, setData] = useState<ProgressReportData | null>(null);
  const [allStudentsData, setAllStudentsData] = useState<ProgressReportData[]>([]);

  // ============== PRINT HANDLER ==============
  const handlePrint = () => {
    window.print();
  };

  // ============== GET ALL STUDENTS REPORTS HANDLER ==============
  const handleGetAllStudentsReports = async () => {
    if (!selectedTestId || students.length === 0) {
      setMessage({ type: 'error', text: 'Please select Test and ensure students are loaded' });
      return;
    }

    setLoadingAllReports(true);
    setMessage(null);
    const reportsData: ProgressReportData[] = [];

    try {
      // Fetch reports for all students
      for (const student of students) {
        const studentId = student.student_id || student.id;
        const response = await api.get('/report/student', {
          params: {
            student_id: studentId,
            test_id: selectedTestId,
            academic_year: academicYear,
            branch: selectedBranch,
            class_id: selectedClass,
            section: selectedSection
          }
        });
        reportsData.push(response.data);
      }

      setAllStudentsData(reportsData);
      setMessage({ type: 'success', text: `Successfully loaded ${reportsData.length} student reports! You can now print.` });

    } catch (err: any) {
      console.error('Error fetching all student reports:', err);
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load all student reports' });
    } finally {
      setLoadingAllReports(false);
    }
  };

  // ============== INITIALIZATION ==============
  useEffect(() => {
    const storedYear = localStorage.getItem("academicYear") || "";
    const userStr = localStorage.getItem("user");
    let storedBranch = "All";

    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'Director' || user.branch === 'All' || user.branch === 'AllBranches' || user.branch === 'All Branches') {
          const selected = localStorage.getItem("currentBranch");
          if (selected && selected !== "All" && selected !== "All Locations") {
            storedBranch = selected;
          }
        } else {
          storedBranch = user.branch || "All";
        }
      } catch (e) {
        console.error("Error parsing user", e);
      }
    }

    setAcademicYear(storedYear);
    setSelectedBranch(storedBranch);
    setBranches([{ branch_name: storedBranch, branch_code: storedBranch }]);
  }, []);

  // ============== FETCH CLASSES ==============
  useEffect(() => {
    if (!selectedBranch) return;

    setLoadingClasses(true);
    api.get('/classes', {
      params: { branch: selectedBranch }
    })
      .then(res => {
        const classData = res.data.classes || res.data || [];
        setClasses(classData);
      })
      .catch(err => {
        console.error('Error fetching classes:', err);
        setMessage({ type: 'error', text: 'Failed to load classes' });
      })
      .finally(() => setLoadingClasses(false));
  }, [selectedBranch]);

  // ============== FETCH SECTIONS ==============
  useEffect(() => {
    const clsObj = classes.find(c => String(c.id) === selectedClass);
    if (!clsObj) {
      setSections([]);
      setSelectedSection('');
      return;
    }

    setLoadingSections(true);
    api.get('/sections', {
      params: { class: clsObj.class_name }
    })
      .then(res => {
        const sectionData = res.data.sections || res.data || [];
        setSections(sectionData);
      })
      .catch(err => {
        console.error('Error fetching sections:', err);
        setSections([]);
      })
      .finally(() => setLoadingSections(false));
  }, [selectedClass, classes]);

  // ============== FETCH TESTS ==============
  useEffect(() => {
    if (!selectedClass || !academicYear) {
      setTests([]);
      setSelectedTestId('');
      return;
    }

    setLoadingTests(true);
    api.get('/class-tests/list', {
      params: {
        academic_year: academicYear,
        branch: selectedBranch,
        class_id: selectedClass
      }
    })
      .then(res => {
        const testData = res.data || [];
        setTests(testData);
      })
      .catch(err => {
        console.error('Error fetching tests:', err);
        setTests([]);
      })
      .finally(() => setLoadingTests(false));
  }, [selectedClass, academicYear, selectedBranch]);

  // ============== FETCH STUDENTS ==============
  useEffect(() => {
    if (!selectedClass || !selectedSection) {
      setStudents([]);
      setSelectedStudentId('');
      return;
    }

    const clsObj = classes.find(c => String(c.id) === selectedClass);
    if (!clsObj) return;

    setLoadingStudents(true);
    api.get('/students', {
      params: {
        branch: selectedBranch,
        class: clsObj.class_name,
        section: selectedSection,
        academic_year: academicYear
      }
    })
      .then(res => {
        const studentData = res.data.students || res.data || [];
        setStudents(studentData);
      })
      .catch(err => {
        console.error('Error fetching students:', err);
        setStudents([]);
      })
      .finally(() => setLoadingStudents(false));
  }, [selectedClass, selectedSection, selectedBranch, academicYear, classes]);

  // ============== FETCH REPORT DATA ==============
  const handleGetReport = () => {
    if (!selectedStudentId || !selectedTestId) {
      setMessage({ type: 'error', text: 'Please select Test and Student' });
      return;
    }

    setLoadingReport(true);
    setMessage(null);
    setData(null);

    api.get('/report/student', {
      params: {
        student_id: selectedStudentId,
        test_id: selectedTestId,
        academic_year: academicYear,
        branch: selectedBranch,
        class_id: selectedClass,
        section: selectedSection
      }
    })
      .then(res => {
        setData(res.data);
        setMessage({ type: 'success', text: 'Report loaded successfully!' });
      })
      .catch(err => {
        console.error('Error fetching report:', err);
        setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load report' });
      })
      .finally(() => setLoadingReport(false));
  };

  // ============== HANDLE DROPDOWN CHANGES ==============
  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBranch(e.target.value);
    setSelectedClass('');
    setSelectedSection('');
    setSelectedTestId('');
    setSelectedStudentId('');
    setData(null);
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClass(e.target.value);
    setSelectedSection('');
    setSelectedTestId('');
    setSelectedStudentId('');
    setData(null);
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSection(e.target.value);
    setSelectedStudentId('');
    setData(null);
  };

  const handleTestChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTestId(e.target.value);
    setData(null);
  };

  const handleStudentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStudentId(e.target.value);
    setData(null);
  };

  // ============== RESET FILTERS ==============
  const handleReset = () => {
    setSelectedClass('');
    setSelectedSection('');
    setSelectedTestId('');
    setSelectedStudentId('');
    setSections([]);
    setTests([]);
    setStudents([]);
    setData(null);
    setMessage(null);
  };

  // ============== RENDER FILTER SECTION ==============
  const renderFilterSection = () => (
    <div className="bg-white p-4 rounded shadow-sm mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-700 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Select Report Filters
        </h2>
        <button
          onClick={handleReset}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        {/* Branch */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Branch <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedBranch}
            onChange={handleBranchChange}
            disabled={branches.length <= 1}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100"
          >
            {branches.map(b => (
              <option key={b.branch_code} value={b.branch_code}>{b.branch_name}</option>
            ))}
          </select>
        </div>

        {/* Class */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Class <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedClass}
              onChange={handleClassChange}
              disabled={loadingClasses}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100"
            >
              <option value="">
                {loadingClasses ? 'Loading...' : 'Select Class'}
              </option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
            {loadingClasses && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Section <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedSection}
              onChange={handleSectionChange}
              disabled={!selectedClass || loadingSections}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100"
            >
              <option value="">
                {!selectedClass ? 'Select Class First' : loadingSections ? 'Loading...' : 'Select Section'}
              </option>
              {sections.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {loadingSections && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Test */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Test/Exam <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedTestId}
              onChange={handleTestChange}
              disabled={!selectedClass || loadingTests}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100"
            >
              <option value="">
                {!selectedClass ? 'Select Class First' : loadingTests ? 'Loading...' : 'Select Test'}
              </option>
              {tests.map(t => (
                <option key={t.test_id} value={t.test_id}>{t.test_name}</option>
              ))}
            </select>
            {loadingTests && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Student */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Student <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            <div className="relative">
              <select
                value={selectAllStudents ? "all" : selectedStudentId}
                onChange={handleStudentChange}
                disabled={!selectedSection || loadingStudents || selectAllStudents}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 disabled:bg-gray-100"
              >
                <option value="">
                  {!selectedSection
                    ? 'Select Section First'
                    : loadingStudents
                      ? 'Loading...'
                      : `Select Student (${students.length})`}
                </option>
                {students.map(s => (
                  <option key={s.student_id || s.id} value={s.student_id || s.id}>
                    {s.roll_number} - {s.name || s.student_name}
                  </option>
                ))}
              </select>
              {loadingStudents && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </div>
            {students.length > 0 && (
              <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAllStudents}
                  onChange={(e) => {
                    setSelectAllStudents(e.target.checked);
                    if (e.target.checked) {
                      setSelectedStudentId('');
                      setData(null);
                    }
                  }}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="font-medium">Select All Students ({students.length})</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Get Report Button */}
      <div className="flex items-center gap-4">
        {!selectAllStudents ? (
          <button
            type="button"
            onClick={handleGetReport}
            disabled={loadingReport || !selectedTestId || !selectedStudentId}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loadingReport ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading Report...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Get Report
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGetAllStudentsReports}
            disabled={loadingAllReports || !selectedTestId || students.length === 0}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loadingAllReports ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading {students.length} Reports...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Get Reports ({students.length})
              </>
            )}
          </button>
        )}

        {/* Print Button (shown when reports are loaded) */}
        {(data || allStudentsData.length > 0) && (
          <button
            type="button"
            onClick={handlePrint}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            {allStudentsData.length > 0 ? `Print All Reports (${allStudentsData.length})` : 'Print Report'}
          </button>
        )}

        {/* Selection Tags */}
        {(selectedClass || selectedSection || selectedTestId || selectedStudentId || selectAllStudents) && (
          <div className="flex flex-wrap gap-2">
            {selectedClass && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Class: {classes.find(c => String(c.id) === selectedClass)?.class_name}
              </span>
            )}
            {selectedSection && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Section: {selectedSection}
              </span>
            )}
            {selectedTestId && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Test: {tests.find(t => String(t.test_id) === selectedTestId)?.test_name}
              </span>
            )}
            {selectAllStudents && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                All Students ({students.length})
              </span>
            )}
            {selectedStudentId && !selectAllStudents && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                Student: {students.find(s => String(s.student_id || s.id) === selectedStudentId)?.name ||
                  students.find(s => String(s.student_id || s.id) === selectedStudentId)?.student_name}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ============== RENDER EMPTY STATE ==============
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <div className="bg-blue-50 rounded-full p-6 mb-6">
        <svg className="w-16 h-16 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">No Report Selected</h3>
      <p className="text-gray-500 text-center max-w-md mb-4">
        Please select Class, Section, Test, and Student from the filters above, then click "Get Report" to view the progress report.
      </p>
      <div className="flex items-center space-x-2 text-sm text-blue-600">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Tip: All filters are required to generate the report</span>
      </div>
    </div>
  );

  // ============== RENDER LOADING STATE ==============
  const renderLoadingState = () => (
    <div className="flex items-center justify-center py-16 bg-white rounded shadow">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium text-lg">Loading Report Data...</p>
        <p className="text-gray-400 text-sm mt-2">Please wait while we fetch the student report</p>
      </div>
    </div>
  );

  // ============== RENDER HISTORICAL PERFORMANCE ==============
  const renderHistoricalPerformance = () => {
    if (!data?.historicalPerformance || data.historicalPerformance.length <= 1) return null;

    const previousYears = data.historicalPerformance.filter(
      (hp: HistoricalPerformance) => hp.academicYear !== data.student.academicYear
    );

    if (previousYears.length === 0) return null;

    return (
      <div className="mb-8 no-print">
        <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold">
            PREVIOUS YEAR PERFORMANCE
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {previousYears.map((yearData: HistoricalPerformance, idx: number) => (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 flex justify-between items-center">
                    <span className="font-semibold text-gray-700">
                      {yearData.academicYear} - Class {yearData.class} {yearData.section}
                    </span>
                  </div>
                  <div className="p-3">
                    {yearData.tests.map((test, tIdx: number) => (
                      <div key={tIdx} className="mb-3 last:mb-0">
                        <h5 className="text-sm font-medium text-indigo-700 mb-2">{test.testName}</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {test.subjects.map((subj, sIdx: number) => (
                            <div key={sIdx} className={`text-xs p-2 rounded 
                              ${subj.isAbsent ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                              <span className="font-medium">{subj.subject}</span>
                              <span className="float-right">
                                {subj.isAbsent ? 'AB' : `${subj.securedMarks}/${subj.maxMarks}`}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-right text-sm">
                          <span className="font-medium">Total: </span>
                          <span className="text-indigo-600">
                            {test.securedMarks}/{test.totalMarks}
                            ({test.totalMarks > 0 ? Math.round((test.securedMarks / test.totalMarks) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============== MAIN RENDER ==============
  return (
    <div className="p-4 student-reports-wrapper">
      <h2 className="no-print text-xl font-bold text-gray-700 mb-4 border-b pb-2">Student Progress Report</h2>

      {/* Filter Section */}
      <div className="no-print">
        {renderFilterSection()}
      </div>

      {/* Message Display */}
      {message && (
        <div className={`no-print p-3 rounded mb-4 flex items-center ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.type === 'error' ? (
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {message.text}
        </div>
      )}

      {/* Report Card Container */}
      {loadingReport || loadingAllReports ? (
        renderLoadingState()
      ) : !data && allStudentsData.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="all-reports-container">
          {/* Historical Performance (only for single student) */}
          {data && renderHistoricalPerformance()}

          {/* Render single student report */}
          {data && (
            <ReportCard data={data} />
          )}

          {/* Render all students reports */}
          {allStudentsData.length > 0 && allStudentsData.map((studentData, index) => (
            <ReportCard key={index} data={studentData} />
          ))}

          {/* ── PRINT SUMMARY PAGE (last page, only for bulk print) ──────────────
              Appears as the final page when printing all students.
              Lists the batch details: branch, class, section, test, students.
              This ensures that even if the last report card is slightly clipped,
              the administrator always has a clean reference of what was printed. */}
          {allStudentsData.length > 0 && (() => {
            const first = allStudentsData[0];
            const className = classes.find(c => String(c.id) === selectedClass)?.class_name ?? selectedClass;
            const testName = tests.find(t => String(t.test_id) === selectedTestId)?.test_name ?? selectedTestId;
            const printedAt = new Date().toLocaleString('en-IN', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                className="print-summary-page"
                style={{
                  pageBreakBefore: 'always',
                  breakBefore: 'page',
                  width: '100%',
                  minHeight: '100vh',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Segoe UI', system-ui, sans-serif",
                  padding: '40px 60px',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                }}
              >
                {/* Title block */}
                <div style={{
                  width: '100%', textAlign: 'center',
                  borderBottom: '3px solid #1e3a5f',
                  paddingBottom: '18px', marginBottom: '24px',
                }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '2px',
                    textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px',
                  }}>
                    MS Hifz Academy — Print Summary
                  </div>
                  <div style={{
                    fontSize: '26px', fontWeight: 800, color: '#1e3a5f',
                    letterSpacing: '0.5px', marginBottom: '4px',
                  }}>
                    Progress Report — Batch Print Record
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Printed on: {printedAt}
                  </div>
                </div>

                {/* Batch meta */}
                <div style={{
                  width: '100%', display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px',
                  marginBottom: '28px',
                }}>
                  {[
                    ['Branch', first?.student?.branchName ?? selectedBranch],
                    ['Class', className],
                    ['Section', selectedSection || '—'],
                    ['Academic Year', first?.student?.academicYear ?? academicYear],
                    ['Test / Exam', testName],
                    ['Total Students Printed', String(allStudentsData.length)],
                  ].map(([label, value]) => (
                    <div key={label} style={{
                      border: '1px solid #e2e8f0', borderRadius: '8px',
                      padding: '12px 16px', backgroundColor: '#f8fafc',
                    }}>
                      <div style={{
                        fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px',
                        textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px',
                      }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                        {value || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Student list table */}
                <div style={{ width: '100%' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
                    textTransform: 'uppercase', color: '#1e3a5f',
                    borderBottom: '2px solid #1e3a5f', paddingBottom: '6px',
                    marginBottom: '10px',
                  }}>
                    Students Included in This Print Run
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, borderRight: '1px solid #2d4f7f' }}>#</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, borderRight: '1px solid #2d4f7f' }}>Student Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, borderRight: '1px solid #2d4f7f' }}>Father's Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, borderRight: '1px solid #2d4f7f' }}>Roll No</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Class / Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allStudentsData.map((sd, idx) => (
                        <tr key={idx} style={{
                          backgroundColor: idx % 2 === 0 ? '#f8fafc' : '#ffffff',
                          borderBottom: '1px solid #e2e8f0',
                        }}>
                          <td style={{ padding: '7px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1e293b' }}>{sd.student?.studentName ?? '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#475569' }}>{sd.student?.fathersName ?? '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#475569' }}>{sd.student?.groupRollNo ?? '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#475569' }}>{sd.student?.classSection ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer note */}
                <div style={{
                  marginTop: 'auto', paddingTop: '30px', width: '100%',
                  borderTop: '1px dashed #cbd5e1', textAlign: 'center',
                  fontSize: '10px', color: '#94a3b8',
                }}>
                  This page is auto-generated by the MS Hifz Academy Report System.
                  It confirms that the above {allStudentsData.length} progress report(s)
                  were printed from the system. Keep for records.
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
};

export default StudentReportCard;
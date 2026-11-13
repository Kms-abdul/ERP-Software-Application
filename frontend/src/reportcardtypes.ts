// Type definitions for Student Report Card component

export interface ClassOption {
    id: number | string;
    class_name: string;
}

export interface SectionOption {
    section: string;
}

export interface TestOption {
    test_id: number | string;
    test_name: string;
    display_order?: number;
}

export interface StudentOption {
    id?: number | string;
    student_id?: number | string;
    name?: string;
    student_name?: string;
    roll_number?: number | string;
    father_name?: string;
    admission_no?: string;
}

export interface GradingScale {
    label: string;
    values: number[];
    colors: string[];
}

export interface HifzDataItem {
    subject: string;
    urduSubject: string;
    totalMarks: number;
    securedMarks: number;
    classMarks: number;
    grade: string;
}

export interface AcademicPerformanceItem {
    subject: string;
    urduSubject: string;
    totalMarks: number;
    securedMarks: number;
    percentage: number;
    grade: string;
    color: string;
}

export interface MonthlyAttendance {
    month: string;
    total: number | string;
    present: number | string;
    absent: number | string;
}

export interface AttendanceSummary {
    presentCount: number;
    presentPercentage: number;
    absentCount: number;
    absentPercentage: number;
    totalCount: number;
}

export interface Attendance {
    monthly: MonthlyAttendance[];
    summary: AttendanceSummary;
}

export interface StudentDetails {
    studentName: string;
    fathersName: string;
    classSection: string;
    groupRollNo: string;
    branchName: string;
    academicYear: string;
    admissionCategory?: string;
}

export interface AcademicHistoryRecord {
    academic_year: string;
    class: string;
    section: string;
    roll_number?: number | string;
    is_promoted: number | boolean;
    promoted_date?: string;
    enrolled_date?: string;
}

export interface HistoricalSubject {
    subject: string;
    subjectUrdu?: string;
    type: string;
    maxMarks: number;
    securedMarks: number;
    percentage: number;
    isAbsent: boolean;
}

export interface HistoricalTest {
    testName: string;
    subjects: HistoricalSubject[];
    totalMarks: number;
    securedMarks: number;
    overallPercentage?: number;
}

export interface HistoricalPerformance {
    academicYear: string;
    class: string;
    section: string;
    rollNumber?: number | string;
    isPromoted?: boolean;
    promotedDate?: string;
    enrolledDate?: string;
    tests: HistoricalTest[];
    attendance?: {
        total: number;
        present: number;
        absent: number;
        percentage: number;
    };
}

export interface ProgressReportData {
    reportTitle: string;
    student: StudentDetails;
    gradingScales: GradingScale[];
    hifzData: HifzDataItem[];
    academicPerformance: AcademicPerformanceItem[];
    attendance: Attendance;
    hifzTargetLevel: any[];
    teacherRemark: string;
    academicHistory: AcademicHistoryRecord[];
    historicalPerformance: HistoricalPerformance[];
}

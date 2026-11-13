import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { ProgressReportData } from '../reportcardtypes';
interface ReportCardProps {
  data: ProgressReportData;
}
import MSEducationAcademylogo from '../images/MSEducationAcademylogo.png';
import HifzAcademylogo from '../images/HifzAcademylogo.png';
import { formatReportBranch } from '../utils/branchHelper';

const HIFZ_TARGET_X_TICKS = Array.from({ length: 11 }, (_, i) => i * 3);
const HIFZ_TARGET_Y_TICKS = [0, 5, 10, 15, 20, 25, 30];
const HIFZ_CHART_HEIGHT = 215;

function useMeasuredChartSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = React.useState({ width: 0, height: HIFZ_CHART_HEIGHT });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const width = Math.floor(el.getBoundingClientRect().width);
      if (width > 0) {
        setSize({ width, height: HIFZ_CHART_HEIGHT });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    window.addEventListener('resize', updateSize);
    window.addEventListener('beforeprint', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('beforeprint', updateSize);
    };
  }, [containerRef]);

  return size;
}

const ReportCard: React.FC<ReportCardProps> = ({ data }) => {
  const hifzChartRef = React.useRef<HTMLDivElement>(null);
  const hifzChartSize = useMeasuredChartSize(hifzChartRef);
  // ============== DEBUG: Check what data we're getting ==============
  React.useEffect(() => {
    console.log("=== REPORT CARD DATA DEBUG ===");
    console.log("1. Data exists:", !!data);
    console.log("2. Grading Scales:", data?.gradingScales);
    console.log("3. HIFZ Data length:", data?.hifzData?.length);
    console.log("4. Academic Performance length:", data?.academicPerformance?.length);
    console.log("5. Hifz Target Level:", data?.hifzTargetLevel);
    console.log("6. Teacher Remark:", data?.teacherRemark);

    // Check for empty/undefined values that could cause squares
    if (data?.hifzData) {
      data.hifzData.forEach((item, index) => {
        console.log(`HIFZ Item ${index}:`, {
          subject: item.subject,
          urduSubject: item.urduSubject,
          grade: item.grade,
          hasUrdu: !!item.urduSubject?.trim(),
          isArabic: item.urduSubject?.match(/[\u0600-\u06FF]/) ? "Yes" : "No"
        });
      });
    }
  }, [data]);

  // ============== SAFE DATA PREPARATION ==============

  // Fix: Add proper null checks and defaults
  const hifzChartData = data?.hifzData
    ?.filter(h => h && h.subject && h.subject !== "Total/Grade" && h.subject !== "")
    .map(h => ({
      name: h.subject || 'Subject',
      "Total Marks": h.totalMarks || 0,
      "Secured Marks": h.securedMarks || 0,
      "Class Marks": h.classMarks || 0
    })) || [];

  const academicPieData = data?.academicPerformance
    ?.filter(ap => ap && ap.subject && ap.subject !== 'Total/Grade' && ap.subject !== "")
    .map(ap => ({
      name: ap.subject || 'Subject',
      value: ap.percentage || 0,
      color: ap.color || '#cccccc'
    })) || [];

  // Fix: Check if attendance data exists
  const attendancePieData = data?.attendance?.summary ? [
    {
      name: 'Present',
      value: data.attendance.summary.presentCount || 0,
      color: '#4ade80'
    },
    {
      name: 'Absent',
      value: data.attendance.summary.absentCount || 0,
      color: '#f87171'
    }
  ] : [
    { name: 'Present', value: 0, color: '#4ade80' },
    { name: 'Absent', value: 0, color: '#f87171' }
  ];

  // ============== GRADING TABLE WITH FALLBACK ==============
  const renderGradingTable = () => {
    // If no grading scales, show placeholder
    if (!data?.gradingScales || data.gradingScales.length === 0 ||
      !data.gradingScales[0]?.values || data.gradingScales[0].values.length < 2) {
      return (
        <div className="text-center p-2 text-gray-500 text-xs">
          Grading scale not available
        </div>
      );
    }

    const grades = ['E', 'D', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              {grades.map((grade, idx) => (
                <th key={idx} className={`border border-white text-white p-1 
                  ${idx < 2 ? 'bg-red-500' : idx < 4 ? 'bg-orange-500' : 'bg-green-600'}`}>
                  {grade}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.gradingScales.map((scale, sIdx) => (
              <tr key={sIdx}>
                {scale.values?.slice(1)?.map((val, vIdx) => (
                  <td key={vIdx} className="border border-gray-300 p-0.5 text-center">
                    {val || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ============== RENDER WITH SAFETY CHECKS ==============

  // Check if we have basic data
  if (!data) {
    return (
      <div className="report-card-container p-8 text-center text-gray-500">
        No report data available
      </div>
    );
  }

  return (
    <div className="report-card-container max-w-5xl mx-auto w-full bg-white shadow-2xl rounded-lg border border-gray-200 p-2">
      {/* Add Arabic/Urdu font support inline */}
      <style>
        {`
          .font-arabic {
            font-family: 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Arial Unicode MS', 'Simplified Arabic', 'Traditional Arabic', 'Arial', sans-serif !important;
            font-weight: 600;
            font-size: inherit;
            line-height: 1.6; /* Adjust line height for Nastaliq */
          }
          [dir="rtl"] {
            direction: rtl;
            unicode-bidi: bidi-override;
            font-family: 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Arial Unicode MS', 'Simplified Arabic', 'Traditional Arabic', 'Arial', sans-serif !important;
          }
          @media print {
            .font-arabic {
              font-family: 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Arial Unicode MS', 'Simplified Arabic', 'Traditional Arabic', 'Arial', sans-serif !important;
              font-weight: 600;
              font-size: inherit;
              line-height: 1.6;
            }
            [dir="rtl"] {
              font-family: 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Arial Unicode MS', 'Simplified Arabic', 'Traditional Arabic', 'Arial', sans-serif !important;
            }
            /* Ensure background colors print in all browsers */
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .hifz-target-chart {
              overflow: hidden !important;
            }
            .hifz-target-chart .hifz-target-chart-plot {
              height: 215px !important;
              min-height: 215px !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            .hifz-target-chart .recharts-wrapper {
              width: 100% !important;
              max-width: 100% !important;
            }
            .hifz-target-chart svg.recharts-surface,
            .hifz-target-chart svg {
              width: 100% !important;
              max-width: 100% !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .recharts-wrapper,
            .recharts-surface {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center mb-1 px-1">
        <div className="logo-container" style={{ width: 'auto', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <img
            src={HifzAcademylogo}
            alt="MS HIFZ Academy Logo"
            style={{ maxWidth: '180px', maxHeight: '55px', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        </div>
        <div className="logo-container" style={{ width: 'auto', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginRight: '10px' }}>
          <img
            src={MSEducationAcademylogo}
            alt="MS Education Academy Logo"
            referrerPolicy="no-referrer"
            style={{ maxWidth: '180px', maxHeight: '55px', width: 'auto', height: 'auto', objectFit: 'contain' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              console.log('Logo 1 failed to load');
            }}
          />
        </div>
      </div>

      <div className="bg-red-700 text-white text-center py-2 font-bold tracking-widest text-lg mb-1 shadow-md uppercase">
        {data.reportTitle || 'Student Progress Report'}
      </div>

      {/* Top Section: Student Details and Grading Scale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.5">
        <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold">Student Detail</div>
          <div className="p-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-m font-semibold">
            <span className="text-gray-700 whitespace-nowrap">Student Name</span>
            <span className="text-gray-900">: {data.student?.studentName || 'N/A'}</span>
            <span className="text-gray-700 whitespace-nowrap">Father's Name</span>
            <span className="text-gray-900">: {data.student?.fathersName || 'N/A'}</span>
            <span className="text-gray-700 whitespace-nowrap">Class/ Section</span>
            <span className="text-gray-900">: {data.student?.classSection || 'N/A'}</span>
            <span className="text-gray-700 whitespace-nowrap">Group/ Roll No</span>
            <span className="text-gray-900">: {data.student?.groupRollNo || 'N/A'}</span>
            <span className="text-gray-700 whitespace-nowrap">Branch Name</span>
            <span className="text-gray-900">: {formatReportBranch(data.student?.branchName)}</span>
            <span className="text-gray-700 whitespace-nowrap">Academic Year</span>
            <span className="text-gray-900">: {data.student?.academicYear || 'N/A'}</span>
          </div>
        </div>

        <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold">GRADING SCALE</div>
          <div className="p-2 text-sm font-bold">
            {renderGradingTable()}
          </div>
        </div>
      </div>

      {/* Second Section: HIFZ Progress */}
      {data.hifzData && data.hifzData.length > 0 && data.hifzData.some(h => h.subject && h.subject !== '') ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.5">
          <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm">
            <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold flex justify-between">
              <span>HIFZ / NAZIRA</span>
              <span dir="rtl" className="font-arabic">حفظ قرآن رپورٹ</span>
            </div>
            <div className="p-2 flex-1 flex items-center justify-center min-h-[220px]">
              {hifzChartData.length > 0 ? (
                <ResponsiveContainer width={400} height={200}>
                  <BarChart data={hifzChartData} barSize={34}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} domain={[0, 'auto']} />
                    <Tooltip />
                    <Legend iconType="rect" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="Secured Marks" fill="#38bdf8" />
                    <Bar dataKey="Total Marks" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  No HIFZ chart data available
                </div>
              )}
            </div>
          </div>

          <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold flex justify-between">
              <span>HIFZ / NAZIRA REPORT</span>
              <span dir="rtl" className="font-arabic">حفظ قرآن رپورٹ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-indigo-900">
                  <tr>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">گریڈ</th>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">حاصل شدہ نمبرات</th>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">کل نمبرات</th>
                    <th className="p-2.5 text-right font-arabic text-xs md:text-sm font-bold text-gray-800">مضامین</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hifzData.map((h, idx) => {
                    // Skip empty rows
                    if (!h.subject || h.subject === '') return null;

                    return (
                      <tr key={idx} className={`border-b ${h.subject === 'Total/Grade' ? 'border-t-2 border-indigo-900 bg-gray-50 font-bold' : 'border-gray-200'}`}>
                        <td className="p-2.5">
                          {h.grade && h.grade !== '-' ? (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold
                              ${['A1', 'A2'].includes(h.grade) ? 'bg-green-600' :
                                ['B1', 'B2'].includes(h.grade) ? 'bg-orange-400' :
                                  ['C', 'C1', 'C2'].includes(h.grade) ? 'bg-orange-600' : 'bg-red-500'}`}>
                              {h.grade}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-gray-900 text-sm">{h.securedMarks || 0}</td>
                        <td className="p-2.5 font-medium text-gray-700 text-sm">{h.totalMarks || 0}</td>
                        <td className="p-2.5 text-right font-bold text-gray-900 text-sm">
                          <span className="block text-xs text-gray-600 font-arabic" dir="rtl">
                            {h.urduSubject || ' '}
                          </span>
                          {h.subject}
                        </td>
                      </tr>
                    );
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-indigo-900 rounded-lg p-4 mb-2 text-center text-gray-500">
          No HIFZ data available for this student
        </div>
      )}

      {/* Third Section: Academic Performance */}
      {data.academicPerformance && data.academicPerformance.length > 0 && data.academicPerformance.some(ap => ap.subject && ap.subject !== '') ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.5">
          <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm">
            <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold flex justify-between">
              <span>STUDENT PERFORMANCE</span>
              <span dir="rtl" className="font-arabic">طلبہ کا مظاہرہ</span>
            </div>
            <div className="p-3 flex-1 flex flex-col items-center justify-between min-h-[250px]">
              <div className="flex items-center justify-center w-full flex-1 min-h-[180px]">
                {academicPieData.length > 0 ? (
                  <PieChart width={240} height={180}>
                    <Pie
                      data={academicPieData}
                      cx={120}
                      cy={90}
                      innerRadius={30}
                      outerRadius={85}
                      paddingAngle={0}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                    >
                      {academicPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    No academic data
                  </div>
                )}
              </div>
              <div className="w-full pt-2.5 mt-1 border-t border-gray-200 flex flex-wrap justify-center items-center gap-x-4 gap-y-1.5">
                {data.academicPerformance
                  .filter(ap => ap.subject && ap.subject !== '')
                  .map((ap, idx) => (
                    <div key={idx} className="flex items-center space-x-1.5 text-xs md:text-sm font-semibold text-gray-800">
                      <div className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ap.color || '#f8f8f8ff' }}></div>
                      <span className="whitespace-nowrap">{ap.subject}: {ap.percentage || 0}%</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold flex justify-between">
              <span>STUDENT PERFORMANCE</span>
              <span dir="rtl" className="font-arabic">طلبہ کا مظاہرہ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-indigo-900">
                  <tr>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">گریڈ</th>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">حاصل شدہ نمبرات</th>
                    <th className="p-2.5 text-left font-arabic text-xs md:text-sm font-bold text-gray-800">کل نمبرات</th>
                    <th className="p-2.5 text-right font-arabic text-xs md:text-sm font-bold text-gray-800">مضامین</th>
                  </tr>
                </thead>
                <tbody>
                  {data.academicPerformance
                    .filter(ap => ap.subject && ap.subject !== '')
                    .map((ap, idx) => (
                      <tr key={idx} className={`border-b ${ap.subject === 'Total/Grade' ? 'border-t-2 border-indigo-900 bg-gray-50 font-bold' : 'border-gray-200'}`}>
                        <td className="p-2.5">
                          {ap.grade && ap.grade !== '-' ? (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold
                              ${['A1', 'A2'].includes(ap.grade) ? 'bg-green-600' :
                                ['B1', 'B2'].includes(ap.grade) ? 'bg-orange-400' :
                                  ['C', 'C1', 'C2'].includes(ap.grade) ? 'bg-orange-600' : 'bg-red-500'}`}>
                              {ap.grade}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-gray-900 text-sm">{ap.securedMarks || 0}</td>
                        <td className="p-2.5 font-medium text-gray-700 text-sm">{ap.totalMarks || 0}</td>
                        <td className="p-2.5 text-right font-bold text-gray-900 text-sm">
                          <span className="block text-xs text-gray-600 font-arabic" dir="rtl">
                            {ap.urduSubject || ' '}
                          </span>
                          {ap.subject}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-indigo-900 rounded-lg p-4 mb-2 text-center text-gray-500">
          No academic performance data available
        </div>
      )}

      {/* Fourth Section: Attendance and Target Level */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.1">
        <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm">
          <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold uppercase">Attendance</div>
          <div className="p-4 flex-1 flex flex-col justify-between">
            <div className="w-full">
              <h4 className="text-red-600 text-sm font-bold mb-3 uppercase text-center tracking-wide">Monthly Attendance</h4>
              {data.attendance?.monthly && data.attendance.monthly.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm border border-indigo-200 rounded-md overflow-hidden">
                    <thead>
                      <tr className="bg-indigo-100">
                        <th className="border border-indigo-200 p-2 font-bold text-indigo-950 text-center w-24"></th>
                        {data.attendance.monthly.map((m, i) => (
                          <th key={i} className="border border-indigo-200 p-2 text-center font-bold text-indigo-950">{m.month || `Month ${i + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-indigo-200 p-2 font-bold bg-gray-50 uppercase text-gray-800 text-center">Total</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className={`border border-indigo-200 p-2 text-center font-bold ${m.total === '-' ? 'text-gray-400 font-semibold' : 'text-gray-900'}`}>
                            {m.total ?? '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="border border-indigo-200 p-2 font-bold bg-gray-50 uppercase text-gray-800 text-center">Present</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className={`border border-indigo-200 p-2 text-center font-bold ${m.present === '-' ? 'text-gray-400 font-semibold' : 'text-green-700 bg-green-50/40'}`}>
                            {m.present ?? '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="border border-indigo-200 p-2 font-bold bg-gray-50 uppercase text-gray-800 text-center">Absent</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className={`border border-indigo-200 p-2 text-center font-bold ${m.absent === '-' ? 'text-gray-400 font-semibold' : 'text-red-700 bg-red-50/40'}`}>
                            {m.absent ?? '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400 text-center text-sm py-4">No attendance data available</p>
              )}
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-xs md:text-sm font-bold mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 bg-green-500 rounded-sm"></div>
                <span className="text-green-800">PRESENT : {data.attendance?.summary?.presentCount || 0} ({data.attendance?.summary?.presentPercentage || 0}%)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3.5 h-3.5 bg-red-500 rounded-sm"></div>
                <span className="text-red-800">ABSENT : {data.attendance?.summary?.absentCount || 0} ({data.attendance?.summary?.absentPercentage || 0}%)</span>
              </div>
              <div className="flex items-center space-x-2 text-indigo-950">
                <span>TOTAL : {data.attendance?.summary?.totalCount || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm min-w-0 hifz-target-chart">
          <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold">HIFZ TARGET LEVEL</div>
          <div className="p-2 min-w-0 flex-1 flex flex-col justify-center">
            {data.hifzTargetLevel && data.hifzTargetLevel.length > 0 ? (
              <div ref={hifzChartRef} className="hifz-target-chart-plot h-[215px] w-full min-w-0">
                {hifzChartSize.width > 0 && (
                  <LineChart
                    width={hifzChartSize.width}
                    height={hifzChartSize.height}
                    data={data.hifzTargetLevel}
                    margin={{ top: 8, right: 28, left: 2, bottom: 28 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis
                      type="number"
                      dataKey="month"
                      domain={[0, 30]}
                      ticks={HIFZ_TARGET_X_TICKS}
                      allowDecimals={false}
                      padding={{ left: 8, right: 8 }}
                      tickMargin={4}
                      label={{ value: 'MONTHS', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#4b5563' }}
                      fontSize={9}
                    />
                    <YAxis
                      width={38}
                      domain={[0, 30]}
                      ticks={HIFZ_TARGET_Y_TICKS}
                      interval={0}
                      allowDecimals={false}
                      tickMargin={2}
                      label={{ value: 'PARAS', angle: -90, position: 'insideLeft', offset: 8, fontSize: 9, style: { textAnchor: 'middle' } }}
                      fontSize={9}
                    />
                    <Tooltip />
                    <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px', paddingTop: 20 }} />
                    <Line
                      type="monotone"
                      dataKey="targetParas"
                      name={data.student?.admissionCategory?.trim().toLowerCase() === "hifz" ? "Hifz" : "Hifz + Nazira"}
                      stroke={data.student?.admissionCategory?.trim().toLowerCase() === "hifz" ? "#22c55e" : "#8b5cf6"}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualParas"
                      name="Student Performance"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[190px] text-gray-400">
                <span>No target data available</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Teacher's Remark */}
      <div className="border border-gray-300 rounded p-2 mb-2 bg-gray-50 relative">
        <div className="absolute top-2 right-4 text-right">
          <span dir="rtl" className="font-arabic text-green-700">معلم تاثرات:</span>
          <span className="font-bold text-sm block">: Teacher's Remark</span>
        </div>
        <div className="pt-6 text-gray-700 italic mt-2 min-h-[40px]">
          {data.teacherRemark || ''}
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="flex justify-between items-end pt-5 border-t border-gray-200">
        <div className="text-center">
          <span className="font-bold text-sm text-indigo-900">Signature of Parent</span>
        </div>
        <div className="text-center">
          <span className="font-bold text-sm text-indigo-900">Signature of Teacher</span>
        </div>
        <div className="text-center">
          <span className="font-bold text-sm text-indigo-900">Signature of Principal</span>
        </div>
      </div>
    </div >
  );
};

export default ReportCard;
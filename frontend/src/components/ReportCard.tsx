import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { ProgressReportData } from '../reportcardtypes';
interface ReportCardProps {
  data: ProgressReportData;
}
import logo1 from '../images/logo1.png';

const ReportCard: React.FC<ReportCardProps> = ({ data }) => {
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
    <div className="report-card-container bg-white shadow-2xl rounded-lg border border-gray-200 p-2">
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
          }
        `}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center mb-0">
        <div className="logo-container" style={{ width: 'auto', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <img
            src="https://mshifzacademy.com/assets/images/ms-logo.jpg"
            alt="MS HIFZ Academy Logo"
            referrerPolicy="no-referrer"
            style={{ maxWidth: '250px', maxHeight: '80px', width: 'auto', height: '80px', objectFit: 'contain' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              console.log('Logo 2 failed to load');
            }}
          />
        </div>
        <div className="logo-container" style={{ width: 'auto', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginRight: '20px' }}>
          <img
            src={logo1}
            alt="MS Education Academy Logo"
            referrerPolicy="no-referrer"
            style={{ maxWidth: '100px', maxHeight: '50px', width: 'auto', height: '80px', objectFit: 'contain' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              console.log('Logo 1 failed to load');
            }}
          />
        </div>
      </div>

      <div className="bg-violet-800 text-white text-center py-2 font-bold tracking-widest text-lg mb-0 shadow-md uppercase">
        {data.reportTitle || 'Student Progress Report'}
      </div>

      {/* Top Section: Student Details and Grading Scale */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.5">
        <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
          <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold">Student Detail</div>
          <div className="p-4 grid grid-cols-[1fr,2fr] gap-y-2 text-sm font-semibold">
            <span className="text-black-600">Student Name</span>
            <span className="text-black-900">: {data.student?.studentName || 'N/A'}</span>
            <span className="text-black-600">Father's Name</span>
            <span className="text-black-900">: {data.student?.fathersName || 'N/A'}</span>
            <span className="text-black-600">Class/ Section</span>
            <span className="text-black-900">: {data.student?.classSection || 'N/A'}</span>
            <span className="text-black-600">Group/ Roll No</span>
            <span className="text-black-900">: {data.student?.groupRollNo || 'N/A'}</span>
            <span className="text-black-600">Branch Name</span>
            <span className="text-black-900">: {data.student?.branchName || 'N/A'}</span>
            <span className="text-black-600">Academic Year</span>
            <span className="text-black-900">: {data.student?.academicYear || 'N/A'}</span>
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
              <span>HIFZ</span>
              <span dir="rtl" className="font-arabic">حفظ قرآن رپورٹ</span>
            </div>
            <div className="p-2" style={{ height: '240px' }}>
              {hifzChartData.length > 0 ? (
                <ResponsiveContainer width={400} height={220}>
                  <BarChart data={hifzChartData} barSize={30}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} domain={[0, 'auto']} />
                    <Tooltip />
                    <Legend iconType="rect" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="Total Marks" fill="#22c55e" />
                    <Bar dataKey="Secured Marks" fill="#38bdf8" />
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
              <span>HIFZ REPORT</span>
              <span dir="rtl" className="font-arabic">حفظ قرآن رپورٹ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b border-indigo-900">
                  <tr>
                    <th className="p-2 text-left font-arabic">گریڈ</th>
                    <th className="p-2 text-left font-arabic">حاصل شدہ نمبرات</th>
                    <th className="p-2 text-left font-arabic">کل نمبرات</th>
                    <th className="p-2 text-right font-arabic">مضامین</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hifzData.map((h, idx) => {
                    // Skip empty rows
                    if (!h.subject || h.subject === '') return null;

                    return (
                      <tr key={idx} className={`border-b ${h.subject === 'Total/Grade' ? 'border-t-2 border-indigo-900 bg-gray-50 font-bold' : 'border-gray-200'}`}>
                        <td className="p-2">
                          {h.grade && h.grade !== '-' ? (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold
                              ${['A1', 'A2'].includes(h.grade) ? 'bg-green-600' :
                                ['B1', 'B2'].includes(h.grade) ? 'bg-orange-400' :
                                  ['C', 'C1', 'C2'].includes(h.grade) ? 'bg-orange-600' : 'bg-red-500'}`}>
                              {h.grade}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2 font-semibold">{h.securedMarks || 0}</td>
                        <td className="p-2 font-medium">{h.totalMarks || 0}</td>
                        <td className="p-2 text-right font-bold">
                          <span className="block text-[10px] text-gray-600 font-arabic" dir="rtl">
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
            <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold">ACADEMIC PERFORMANCE</div>
            <div className="p-4 grid grid-cols-[1fr,1.5fr]" style={{ height: '220px' }}>
              <div className="flex flex-col justify-center space-y-2">
                {data.academicPerformance
                  .filter(ap => ap.subject && ap.subject !== '')
                  .map((ap, idx) => (
                    <div key={idx} className="flex items-center space-x-2 text-[10px] font-medium">
                      <div className="w-3 h-3" style={{ backgroundColor: ap.color || '#f8f8f8ff' }}></div>
                      <span>{ap.subject}: {ap.percentage || 0}%</span>
                    </div>
                  ))
                }
              </div>
              <div className="relative" style={{ width: '220px', height: '220px' }}>
                {academicPieData.length > 0 ? (
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={academicPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
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
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    No academic data
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-indigo-900 rounded-lg overflow-hidden shadow-sm">
            <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold flex justify-between">
              <span>ACADEMIC PERFORMANCE</span>
              <span dir="rtl" className="font-arabic">تعلیمی مظاہرہ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b border-indigo-900">
                  <tr>
                    <th className="p-2 text-left font-arabic">گریڈ</th>
                    <th className="p-2 text-left font-arabic">حاصل شدہ نمبرات</th>
                    <th className="p-2 text-left font-arabic">کل نمبرات</th>
                    <th className="p-2 text-right font-arabic">مضامین</th>
                  </tr>
                </thead>
                <tbody>
                  {data.academicPerformance
                    .filter(ap => ap.subject && ap.subject !== '')
                    .map((ap, idx) => (
                      <tr key={idx} className={`border-b ${ap.subject === 'Total/Grade' ? 'border-t-2 border-indigo-900 bg-gray-50 font-bold' : 'border-gray-200'}`}>
                        <td className="p-2">
                          {ap.grade && ap.grade !== '-' ? (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold
                              ${['A1', 'A2'].includes(ap.grade) ? 'bg-green-600' :
                                ['B1', 'B2'].includes(ap.grade) ? 'bg-orange-400' :
                                  ['C', 'C1', 'C2'].includes(ap.grade) ? 'bg-orange-600' : 'bg-red-500'}`}>
                              {ap.grade}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2 font-medium">{ap.securedMarks || 0}</td>
                        <td className="p-2 font-medium">{ap.totalMarks || 0}</td>
                        <td className="p-2 text-right font-bold">
                          <span className="block text-[10px] text-gray-600 font-arabic" dir="rtl">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-0.5">
        <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm">
          <div className="bg-[#4a235a] text-white px-4 py-2 text-sm font-semibold uppercase">Attendance</div>
          <div className="p-4">
            <div className="flex justify-between items-start mb-4">
              <div className="w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attendancePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={45}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {attendancePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 ml-4">
                <h4 className="text-red-500 text-xs font-bold mb-2 uppercase text-center">Monthly Attendance</h4>
                {data.attendance?.monthly && data.attendance.monthly.length > 0 ? (
                  <table className="w-full text-[10px] border border-gray-200">
                    <thead>
                      <tr className="bg-indigo-100">
                        <th className="border p-1"></th>
                        {data.attendance.monthly.map((m, i) => (
                          <th key={i} className="border p-1">{m.month || `Month ${i + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border p-1 font-bold bg-gray-50 uppercase">Total</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className="border p-1 text-center">{m.total || 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="border p-1 font-bold bg-gray-50 uppercase">Present</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className="border p-1 text-center">{m.present || 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="border p-1 font-bold bg-gray-50 uppercase">Absent</td>
                        {data.attendance.monthly.map((m, i) => (
                          <td key={i} className="border p-1 text-center">{m.absent || 0}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-400 text-center text-sm">No attendance data available</p>
                )}
              </div>
            </div>
            <div className="flex justify-center space-x-6 text-[10px] font-bold mt-2">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-400"></div>
                <span>PRESENT : {data.attendance?.summary?.presentCount || 0} ({data.attendance?.summary?.presentPercentage || 0}%)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-400"></div>
                <span>ABSENT : {data.attendance?.summary?.absentCount || 0} ({data.attendance?.summary?.absentPercentage || 0}%)</span>
              </div>
              <div className="flex items-center space-x-2 text-indigo-900">
                <span>TOTAL : {data.attendance?.summary?.totalCount || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-indigo-900 rounded-lg overflow-hidden flex flex-col shadow-sm">
          <div className="bg-[#1a5276] text-white px-4 py-2 text-sm font-semibold">HIFZ TARGET LEVEL</div>
          <div className="p-4" style={{ height: '220px' }}>
            {data.hifzTargetLevel && data.hifzTargetLevel.length > 0 ? (
              <ResponsiveContainer width={450} height={220}>
                <LineChart data={data.hifzTargetLevel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" label={{ value: 'MONTHS', position: 'insideBottom', offset: -5, fontSize: 10 }} fontSize={10} />
                  <YAxis label={{ value: 'PARAS', angle: -90, position: 'insideLeft', fontSize: 10 }} fontSize={10} />
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <Line type="monotone" dataKey="targetParas" name="Nazira+Hifz" stroke="#4a235a" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="actualParas" name="Student Performance" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <span>No target data available</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Teacher's Remark */}
      <div className="border border-gray-300 rounded p-2 mb-8 bg-gray-50 relative">
        <div className="absolute top-2 right-4 text-right">
          <span dir="rtl" className="font-arabic text-green-700">معلم تاثرات:</span>
          <span className="font-bold text-sm block">: Teacher's Remark</span>
        </div>
        <div className="pt-6 text-gray-700 italic mt-2 min-h-[40px]">
          {data.teacherRemark || 'No remarks provided.'}
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="flex justify-between items-end mt-10 pt-0 border-t border-gray-200">
        <div className="text-center">
          <div className="border-t-2 border-dotted border-gray-400 w-48 mb-2 mx-auto"></div>
          <span className="font-bold text-sm text-indigo-900">Signature of Parent</span>
        </div>
        <div className="text-center">
          <div className="border-t-2 border-dotted border-gray-400 w-48 mb-2 mx-auto"></div>
          <span className="font-bold text-sm text-indigo-900">Signature of Teacher</span>
        </div>
        <div className="text-center">
          <div className="border-t-2 border-dotted border-gray-400 w-48 mb-2 mx-auto"></div>
          <span className="font-bold text-sm text-indigo-900">Signature of Principal</span>
        </div>
      </div>
    </div>
  );
};

export default ReportCard;
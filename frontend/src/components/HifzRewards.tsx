import React, { useEffect, useMemo, useRef, useState } from "react";
import { Award, ChevronRight, Download, Search, Users, WalletCards, X } from "lucide-react";
import * as XLSX from "xlsx";
import api from "../api";

interface RewardRule {
  id: number;
  para_number: number;
  days_limit: number;
  excellent_amount: number;
  very_good_amount: number;
  good_amount: number;
}

interface RewardRuleForm {
  para_number: string;
  days_limit: string;
  excellent_amount: string;
  very_good_amount: string;
  good_amount: string;
}

interface ClassOption {
  id: number;
  class_name: string;
}

interface StudentOption {
  student_id: number;
  admission_no: string;
  student_name: string;
  class_name: string;
  section: string;
  roll_number: number | string;
}

interface StudentReward {
  id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  roll_number: number | string;
  branch: string;
  class_name: string;
  section: string;
  para_number: number;
  no_of_days: number;
  performance_type: string;
  days_limit: number;
  is_eligible: boolean;
  reward_amount: number;
  completed_date: string;
}

interface StudentRewardSummary {
  student_id: number;
  student_name: string;
  admission_no: string;
  branch: string;
  class_name: string;
  section: string;
  prizes_won: number;
  reward_amount: number;
}

interface ParaLimitSummary {
  para_number: number;
  days_limit: number;
  entries: number;
  winners: number;
  reward_amount: number;
}

type HifzRewardsTab = "dashboard" | "entry" | "settings";

const rewardTabs: { id: HifzRewardsTab; label: string }[] = [
  { id: "dashboard", label: "Reward Dashboard" },
  { id: "entry", label: "Student Reward Entry" },
  { id: "settings", label: "Hifz Reward Settings" },
];

const emptyRule: RewardRuleForm = {
  para_number: "",
  days_limit: "",
  excellent_amount: "",
  very_good_amount: "",
  good_amount: "",
};

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

const HifzRewards: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HifzRewardsTab>("dashboard");
  const user = getStoredUser();
  const isTeacher = user.role === "Teacher";
  const [selectedBranch] = useState(
    () => localStorage.getItem("currentBranch") || user.branch || "All"
  );
  const isAllBranch = ["all", "all branches", "allbranches"].includes(
    selectedBranch.toLowerCase()
  );
  const branchDisplayName = isAllBranch ? "All Branches" : selectedBranch;

  const [rules, setRules] = useState<RewardRule[]>([]);
  const [form, setForm] = useState<RewardRuleForm>(emptyRule);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loadingRules, setLoadingRules] = useState(true);

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedPara, setSelectedPara] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [daysTaken, setDaysTaken] = useState("");
  const [performance, setPerformance] = useState("Excellent");
  const [entryMessage, setEntryMessage] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingReward, setSavingReward] = useState(false);

  const [studentRewards, setStudentRewards] = useState<StudentReward[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportMessage, setReportMessage] = useState("");
  const studentRequestId = useRef(0);

  const loadRules = async () => {
    try {
      setLoadingRules(true);
      const response = await api.get("/hifz/rewards");
      setRules(response.data.rewards || []);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Unable to load reward settings.");
    } finally {
      setLoadingRules(false);
    }
  };

  const loadStudentRewards = async () => {
    if (!selectedBranch) {
      setLoadingReport(false);
      return;
    }

    try {
      setLoadingReport(true);
      setReportMessage("");
      const params: Record<string, string> = {};
      if (!isAllBranch) {
        params.branch = selectedBranch;
      }
      if (selectedClass) params.class_name = selectedClass;
      if (selectedSection) params.section = selectedSection;

      const response = await api.get("/hifz/student-rewards", { params });
      setStudentRewards(response.data.rewards || []);
    } catch (error: any) {
      setReportMessage(
        error.response?.data?.message || "Unable to load student reward records."
      );
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    if (!selectedBranch || isAllBranch) {
      studentRequestId.current += 1;
      setClasses([]);
      setSections([]);
      setSelectedClass("");
      setSelectedSection("");
      setStudents([]);
      setSelectedStudentId("");
      return;
    }

    api.get("/classes", {
      params: {
        branch: selectedBranch,
        academic_year: localStorage.getItem("academicYear") || "",
      },
    })
      .then((response) => setClasses(response.data.classes || []))
      .catch((error: any) => {
        setClasses([]);
        setEntryMessage(error.response?.data?.message || "Unable to load classes.");
      });
    setSelectedClass("");
    setSelectedSection("");
    setStudents([]);
    setSelectedStudentId("");
  }, [selectedBranch, isAllBranch]);

  useEffect(() => {
    if (!selectedClass) {
      studentRequestId.current += 1;
      setSections([]);
      setSelectedSection("");
      setStudents([]);
      setSelectedStudentId("");
      return;
    }

    api.get("/sections", {
      params: {
        class: selectedClass,
        branch: selectedBranch,
        academic_year: localStorage.getItem("academicYear") || "",
      },
    })
      .then((response) => setSections(response.data.sections || []))
      .catch((error: any) => {
        setSections([]);
        setEntryMessage(error.response?.data?.message || "Unable to load sections.");
      });
    setSelectedSection("");
    setStudents([]);
    setSelectedStudentId("");
  }, [selectedClass, selectedBranch, isAllBranch]);

  useEffect(() => {
    loadStudentRewards();
  }, [selectedBranch, selectedClass, selectedSection, isAllBranch]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const resetForm = () => {
    setForm(emptyRule);
    setEditingId(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");

    try {
      if (editingId) {
        await api.put(`/hifz/rewards/${editingId}`, form);
        setMessage("Reward settings updated successfully.");
      } else {
        await api.post("/hifz/rewards", form);
        setMessage("Reward settings created successfully.");
      }

      resetForm();
      await loadRules();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Unable to save settings.");
    }
  };

  const editRule = (rule: RewardRule) => {
    setEditingId(rule.id);
    setForm({
      para_number: String(rule.para_number),
      days_limit: String(rule.days_limit),
      excellent_amount: String(rule.excellent_amount),
      very_good_amount: String(rule.very_good_amount),
      good_amount: String(rule.good_amount),
    });
  };

  const deleteRule = async (id: number) => {
    try {
      await api.delete(`/hifz/rewards/${id}`);
      setMessage("Reward settings deleted successfully.");
      await loadRules();
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Unable to delete settings.");
    }
  };

  const loadStudents = async () => {
    if (!selectedBranch || !selectedClass || !selectedSection) {
      setStudents([]);
      return;
    }

    const requestId = ++studentRequestId.current;
    setLoadingStudents(true);
    setEntryMessage("");
    try {
      const params: Record<string, string> = {
        class_name: selectedClass,
        section: selectedSection,
      };
      if (!isAllBranch) {
        params.branch = selectedBranch;
      }

      const response = await api.get("/hifz/students", { params });
      if (requestId !== studentRequestId.current) return;
      setStudents(response.data || []);
      setSelectedStudentId((current) =>
        response.data?.some((student: StudentOption) => String(student.student_id) === current)
          ? current
          : ""
      );
      if (!response.data?.length) {
        setEntryMessage("No active students found for this branch, class, and section.");
      }
    } catch (error: any) {
      if (requestId !== studentRequestId.current) return;
      setEntryMessage(error.response?.data?.message || "Unable to load students.");
    } finally {
      if (requestId === studentRequestId.current) setLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (selectedBranch && selectedClass && selectedSection) {
      loadStudents();
    } else {
      studentRequestId.current += 1;
      setStudents([]);
      setLoadingStudents(false);
      setSelectedStudentId("");
    }
  }, [selectedBranch, selectedClass, selectedSection, isAllBranch]);

  const paraRules = useMemo(
    () => rules.filter((rule) => String(rule.para_number) === selectedPara),
    [rules, selectedPara]
  );
  const selectedRule = paraRules.find(
    (rule) => String(rule.id) === selectedRuleId
  );

  const saveStudentReward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudentId || !selectedPara || !selectedRuleId || !daysTaken) {
      setEntryMessage("Select a student, Para, day-limit category, and days taken.");
      return;
    }

    setSavingReward(true);
    setEntryMessage("");
    try {
      const response = await api.post("/hifz/student-rewards", {
        student_id: Number(selectedStudentId),
        para_number: Number(selectedPara),
        reward_rule_id: Number(selectedRuleId),
        no_of_days: Number(daysTaken),
        performance_type: performance,
      });
      const reward = response.data.reward as StudentReward;
      setEntryMessage(
        `${response.data.message} Reward amount: ₹${reward.reward_amount.toFixed(2)}.`
      );
      setSelectedPara("");
      setSelectedRuleId("");
      setDaysTaken("");
      await loadStudentRewards();
    } catch (error: any) {
      setEntryMessage(error.response?.data?.message || "Unable to save student reward.");
    } finally {
      setSavingReward(false);
    }
  };

  const studentSummaries = useMemo(() => {
    const summary = new Map<number, StudentRewardSummary>();
    studentRewards.forEach((reward) => {
      const row = summary.get(reward.student_id) || {
        student_id: reward.student_id,
        student_name: reward.student_name,
        admission_no: reward.admission_no,
        branch: reward.branch,
        class_name: reward.class_name,
        section: reward.section,
        prizes_won: 0,
        reward_amount: 0,
      };
      if (reward.is_eligible) row.prizes_won += 1;
      row.reward_amount += reward.reward_amount;
      summary.set(reward.student_id, row);
    });
    return Array.from(summary.values()).sort(
      (a, b) => b.prizes_won - a.prizes_won || a.student_name.localeCompare(b.student_name)
    );
  }, [studentRewards]);

  const paraLimitSummaries = useMemo(() => {
    const summary = new Map<string, ParaLimitSummary>();
    studentRewards.forEach((reward) => {
      const key = `${reward.para_number}-${reward.days_limit}`;
      const row = summary.get(key) || {
        para_number: reward.para_number,
        days_limit: reward.days_limit,
        entries: 0,
        winners: 0,
        reward_amount: 0,
      };
      row.entries += 1;
      if (reward.is_eligible) row.winners += 1;
      row.reward_amount += reward.reward_amount;
      summary.set(key, row);
    });
    return Array.from(summary.values()).sort(
      (a, b) => a.para_number - b.para_number || a.days_limit - b.days_limit
    );
  }, [studentRewards]);

  const totalPrizesWon = studentRewards.filter((reward) => reward.is_eligible).length;
  const totalRewardAmount = studentRewards.reduce(
    (total, reward) => total + reward.reward_amount,
    0
  );
  const filteredStudents = students.filter((student) => {
    const search = studentSearch.trim().toLowerCase();
    return !search ||
      String(student.student_name || "").toLowerCase().includes(search) ||
      String(student.admission_no || "").toLowerCase().includes(search) ||
      String(student.roll_number).toLowerCase().includes(search);
  });
  const selectedStudent =
    students.find((student) => String(student.student_id) === selectedStudentId) ||
    studentRewards.find((reward) => String(reward.student_id) === selectedStudentId);
  const selectedStudentRewards = studentRewards.filter(
    (reward) => String(reward.student_id) === selectedStudentId
  );
  const selectedStudentWins = selectedStudentRewards.filter(
    (reward) => reward.is_eligible
  ).length;
  const selectedStudentAmount = selectedStudentRewards.reduce(
    (total, reward) => total + reward.reward_amount,
    0
  );

  const openStudentDetails = (studentId: number) => {
    setSelectedStudentId(String(studentId));
    setSelectedPara("");
    setSelectedRuleId("");
    setDaysTaken("");
    setEntryMessage("");
  };

  const exportReport = () => {
    const detailRows = studentRewards.map((reward) => ({
      Branch: reward.branch,
      Class: reward.class_name,
      Section: reward.section,
      "Admission No": reward.admission_no,
      Student: reward.student_name,
      "Roll No": reward.roll_number,
      Para: reward.para_number,
      "Day Limit": reward.days_limit,
      "Days Taken": reward.no_of_days,
      Performance: reward.performance_type,
      Eligible: reward.is_eligible ? "Yes" : "No",
      "Reward Amount": reward.reward_amount,
      Date: reward.completed_date,
    }));
    const studentRows = studentSummaries.map((student) => ({
      Branch: student.branch,
      Class: student.class_name,
      Section: student.section,
      "Admission No": student.admission_no,
      Student: student.student_name,
      "Prizes Won": student.prizes_won,
      "Total Reward Amount": student.reward_amount,
    }));
    const paraRows = paraLimitSummaries.map((summary) => ({
      Para: summary.para_number,
      "Day Limit": summary.days_limit,
      "Student Entries": summary.entries,
      "Students Won": summary.winners,
      "Total Reward Amount": summary.reward_amount,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(detailRows),
      "Student Rewards"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(studentRows),
      "Student Summary"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(paraRows),
      "Para Limit Summary"
    );
    XLSX.writeFile(workbook, "Hifz_Rewards_Report.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Hifz Rewards</h1>
          <p className="mt-1 text-slate-600">
            Enter student rewards by Para and day-limit category, then review and export results.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-slate-200" aria-label="Hifz Rewards sections">
          {rewardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedStudentId("");
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "settings" && message && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
            {message}
          </div>
        )}

        {activeTab === "settings" && (
          <>
            {!isTeacher && (
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-5 font-semibold text-slate-900">
                {editingId ? "Edit Reward Settings" : "Add Reward Settings"}
              </h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <input
                  name="para_number"
                  value={form.para_number}
                  onChange={handleChange}
                  placeholder="Para number"
                  type="number"
                  min="1"
                  max="30"
                  className="rounded-lg border px-3 py-2"
                  required
                />
                <input
                  name="days_limit"
                  value={form.days_limit}
                  onChange={handleChange}
                  placeholder="Limit days"
                  type="number"
                  min="1"
                  className="rounded-lg border px-3 py-2"
                  required
                />
                <input
                  name="excellent_amount"
                  value={form.excellent_amount}
                  onChange={handleChange}
                  placeholder="Excellent amount"
                  type="number"
                  min="0"
                  className="rounded-lg border px-3 py-2"
                  required
                />
                <input
                  name="very_good_amount"
                  value={form.very_good_amount}
                  onChange={handleChange}
                  placeholder="Very Good amount"
                  type="number"
                  min="0"
                  className="rounded-lg border px-3 py-2"
                  required
                />
                <input
                  name="good_amount"
                  value={form.good_amount}
                  onChange={handleChange}
                  placeholder="Good amount"
                  type="number"
                  min="0"
                  className="rounded-lg border px-3 py-2"
                  required
                />
                <div className="flex gap-3 md:col-span-5">
                  <button className="rounded-lg bg-emerald-600 px-5 py-2 text-white">
                    {editingId ? "Update Settings" : "Save Settings"}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-slate-300 px-5 py-2"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>
            )}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b px-6 py-4">
                <h2 className="font-semibold text-slate-900">Para Reward Settings</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-3 text-left">Para</th>
                      <th className="px-6 py-3 text-left">Limit</th>
                      <th className="px-6 py-3 text-left">Excellent</th>
                      <th className="px-6 py-3 text-left">Very Good</th>
                      <th className="px-6 py-3 text-left">Good</th>
                      <th className="px-6 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRules ? (
                      <tr><td colSpan={6} className="px-6 py-5">Loading...</td></tr>
                    ) : rules.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-5">No reward settings yet.</td></tr>
                    ) : rules.map((rule) => (
                      <tr key={rule.id} className="border-t">
                        <td className="px-6 py-3">Para {rule.para_number}</td>
                        <td className="px-6 py-3">{rule.days_limit} days</td>
                        <td className="px-6 py-3">₹{rule.excellent_amount}</td>
                        <td className="px-6 py-3">₹{rule.very_good_amount}</td>
                        <td className="px-6 py-3">₹{rule.good_amount}</td>
                        <td className="space-x-3 px-6 py-3">
                          {!isTeacher && (
                            <>
                              <button onClick={() => editRule(rule)} className="text-blue-600">Edit</button>
                              <button onClick={() => deleteRule(rule.id)} className="text-red-600">Delete</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeTab === "entry" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Student Reward Entry</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Choose a class and section to see the full student roster. Select a student to view their history or enter a reward.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-b border-slate-100 p-5 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">
                Branch
                <input
                  value={branchDisplayName}
                  readOnly
                  aria-readonly="true"
                  className="mt-1 block w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Class
                <select
                  value={selectedClass}
                  onChange={(event) => {
                    setSelectedClass(event.target.value);
                    setSelectedStudentId("");
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                  disabled={!classes.length}
                  required
                >
                  <option value="">Select class</option>
                  {classes.map((classOption) => (
                    <option key={classOption.id} value={classOption.class_name}>
                      {classOption.class_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Section
                <select
                  value={selectedSection}
                  onChange={(event) => {
                    setSelectedSection(event.target.value);
                    setSelectedStudentId("");
                  }}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                  disabled={!sections.length}
                  required
                >
                  <option value="">Select section</option>
                  {sections.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {selectedClass && selectedSection
                    ? `${selectedClass} · Section ${selectedSection}`
                    : "Students"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {loadingStudents
                    ? "Loading students..."
                    : `${students.length} student${students.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <label className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Search name, admission no. or roll"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                  disabled={!students.length}
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Admission No.</th>
                    <th className="px-5 py-3">Roll</th>
                    <th className="px-5 py-3">Prizes won</th>
                    <th className="px-5 py-3">Total amount</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingStudents ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                        Loading students...
                      </td>
                    </tr>
                  ) : !selectedClass || !selectedSection ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                        Select a class and section to display all students.
                      </td>
                    </tr>
                  ) : filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                        {students.length ? "No students match your search." : "No students found for this section."}
                      </td>
                    </tr>
                  ) : filteredStudents.map((student) => {
                    const rewards = studentRewards.filter(
                      (reward) => reward.student_id === student.student_id
                    );
                    const wins = rewards.filter((reward) => reward.is_eligible).length;
                    const amount = rewards.reduce(
                      (total, reward) => total + reward.reward_amount,
                      0
                    );

                    return (
                      <tr
                        key={student.student_id}
                        className="transition-colors hover:bg-emerald-50/60"
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-slate-900">{student.student_name}</span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{student.admission_no}</td>
                        <td className="px-5 py-3.5 text-slate-600">{student.roll_number || "—"}</td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                            {wins}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">
                          ₹{amount.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openStudentDetails(student.student_id)}
                            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-900"
                          >
                            View / Add <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {entryMessage && (
              <div className="m-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800">
                {entryMessage}
              </div>
            )}
          </section>
        )}

        {activeTab === "dashboard" && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 p-6 text-white shadow-sm">
              <div>
                <div className="mb-2 flex items-center gap-2 text-emerald-100">
                  <Award className="h-5 w-5" />
                  <span className="text-sm font-medium">Hifz Rewards Overview</span>
                </div>
                <h2 className="text-2xl font-bold">Student Reward Dashboard</h2>
                <p className="mt-1 text-sm text-emerald-100">
                  Track prize wins and reward amounts for the branch selected in the header.
                </p>
              </div>
              <button
                onClick={exportReport}
                disabled={loadingReport || studentRewards.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Branch
              <input
                value={branchDisplayName}
                readOnly
                aria-readonly="true"
                className="mt-1 block w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Class
              <select
                value={selectedClass}
                onChange={(event) => {
                  setSelectedClass(event.target.value);
                  setSelectedStudentId("");
                }}
                className="mt-1 block w-full rounded-lg border px-3 py-2"
                disabled={!classes.length}
              >
                <option value="">All Classes</option>
                {classes.map((classOption) => (
                  <option key={classOption.id} value={classOption.class_name}>
                    {classOption.class_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Section
              <select
                value={selectedSection}
                onChange={(event) => {
                  setSelectedSection(event.target.value);
                  setSelectedStudentId("");
                }}
                className="mt-1 block w-full rounded-lg border px-3 py-2"
                disabled={!sections.length}
              >
                <option value="">All Sections</option>
                {sections.map((section) => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
            </label>
            </div>

          {reportMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {reportMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-slate-500">Reward entries</p>
                <p className="text-2xl font-bold text-slate-900">{studentRewards.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Award className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-slate-500">Prizes won</p>
                <p className="text-2xl font-bold text-emerald-700">{totalPrizesWon}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><WalletCards className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-slate-500">Total reward amount</p>
                <p className="text-2xl font-bold text-amber-700">₹{totalRewardAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Student Prize Summary</h3>
            <p className="mt-1 text-sm text-slate-500">Select a student to review their full reward history.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Class / Section</th>
                  <th className="px-4 py-3">Admission No</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Prizes Won</th>
                  <th className="px-4 py-3">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {loadingReport ? (
                  <tr><td colSpan={6} className="px-4 py-4">Loading report...</td></tr>
                ) : studentSummaries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-4">No student rewards found.</td></tr>
                ) : studentSummaries.map((student) => (
                  <tr key={student.student_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">{student.branch}</td>
                    <td className="px-4 py-3">{student.class_name} / {student.section}</td>
                    <td className="px-4 py-3">{student.admission_no}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openStudentDetails(student.student_id)}
                        className="font-medium text-emerald-800 hover:underline"
                      >
                        {student.student_name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                        {student.prizes_won}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">₹{student.reward_amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Para and Day-limit Winners</h3>
            <p className="mt-1 text-sm text-slate-500">Compare student wins for each configured Para limit.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Para</th>
                  <th className="px-4 py-3">Day Limit</th>
                  <th className="px-4 py-3">Student Entries</th>
                  <th className="px-4 py-3">Students Won</th>
                  <th className="px-4 py-3">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {paraLimitSummaries.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-4">No Para results found.</td></tr>
                ) : paraLimitSummaries.map((summary) => (
                  <tr key={`${summary.para_number}-${summary.days_limit}`} className="border-t border-slate-100">
                    <td className="px-4 py-3">Para {summary.para_number}</td>
                    <td className="px-4 py-3">{summary.days_limit} days</td>
                    <td className="px-4 py-3">{summary.entries}</td>
                    <td className="px-4 py-3">{summary.winners}</td>
                    <td className="px-4 py-3">₹{summary.reward_amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">Reward Entry Details</h3>
            <p className="mt-1 text-sm text-slate-500">Full list of rewards matching the selected filters.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Branch / Class / Section</th>
                  <th className="px-4 py-3">Para</th>
                  <th className="px-4 py-3">Limit</th>
                  <th className="px-4 py-3">Days Taken</th>
                  <th className="px-4 py-3">Performance</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {studentRewards.map((reward) => (
                  <tr key={reward.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{reward.student_name}</td>
                    <td className="px-4 py-3">{reward.branch} / {reward.class_name} / {reward.section}</td>
                    <td className="px-4 py-3">Para {reward.para_number}</td>
                    <td className="px-4 py-3">{reward.days_limit} days</td>
                    <td className="px-4 py-3">{reward.no_of_days}</td>
                    <td className="px-4 py-3">{reward.performance_type}</td>
                    <td className="px-4 py-3">{reward.is_eligible ? "Won" : "Not eligible"}</td>
                    <td className="px-4 py-3">₹{reward.reward_amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
          </section>
        )}

        {selectedStudent && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-reward-dialog-title"
          >
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
                <div>
                  <p className="text-sm font-medium text-emerald-700">
                    {selectedStudent.admission_no} · Roll {selectedStudent.roll_number || "—"}
                  </p>
                  <h2 id="student-reward-dialog-title" className="mt-1 text-xl font-bold text-slate-900">
                    {selectedStudent.student_name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedStudent.class_name} · Section {selectedStudent.section}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudentId("")}
                  aria-label="Close student details"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6 p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Total reward entries</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedStudentRewards.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-700">Prizes won</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-800">
                      {selectedStudentWins}
                    </p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-sm text-amber-700">Total reward amount</p>
                    <p className="mt-1 text-2xl font-bold text-amber-800">
                      ₹{selectedStudentAmount.toFixed(2)}
                    </p>
                  </div>
                </div>

                <section>
                  <h3 className="mb-3 font-semibold text-slate-900">Previous reward history</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Para</th>
                          <th className="px-4 py-3">Day limit</th>
                          <th className="px-4 py-3">Days taken</th>
                          <th className="px-4 py-3">Performance</th>
                          <th className="px-4 py-3">Result</th>
                          <th className="px-4 py-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedStudentRewards.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                              No previous rewards for this student.
                            </td>
                          </tr>
                        ) : selectedStudentRewards.map((reward) => (
                          <tr key={reward.id}>
                            <td className="whitespace-nowrap px-4 py-3">{reward.completed_date}</td>
                            <td className="px-4 py-3">Para {reward.para_number}</td>
                            <td className="px-4 py-3">{reward.days_limit} days</td>
                            <td className="px-4 py-3">{reward.no_of_days}</td>
                            <td className="px-4 py-3">{reward.performance_type}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                reward.is_eligible
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}>
                                {reward.is_eligible ? "Won" : "Not eligible"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">₹{reward.reward_amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 p-5">
                  <h3 className="mb-4 font-semibold text-slate-900">Add a reward for this student</h3>
                  <form onSubmit={saveStudentReward} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Para
                      <select
                        value={selectedPara}
                        onChange={(event) => {
                          setSelectedPara(event.target.value);
                          setSelectedRuleId("");
                        }}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                        required
                      >
                        <option value="">Select Para</option>
                        {Array.from(new Set(rules.map((rule) => rule.para_number)))
                          .sort((a, b) => a - b)
                          .map((para) => <option key={para} value={para}>Para {para}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Day-limit category
                      <select
                        value={selectedRuleId}
                        onChange={(event) => setSelectedRuleId(event.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                        disabled={!selectedPara}
                        required
                      >
                        <option value="">Select category</option>
                        {paraRules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            Limit {rule.days_limit} days
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Days taken
                      <input
                        value={daysTaken}
                        onChange={(event) => setDaysTaken(event.target.value)}
                        type="number"
                        min="1"
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Performance
                      <select
                        value={performance}
                        onChange={(event) => setPerformance(event.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5"
                      >
                        <option value="Excellent">Excellent</option>
                        <option value="Very Good">Very Good</option>
                        <option value="Good">Good</option>
                      </select>
                    </label>
                    {selectedRule && (
                      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 sm:col-span-2">
                        Limit {selectedRule.days_limit} days · Excellent ₹{selectedRule.excellent_amount}
                        {" · "}Very Good ₹{selectedRule.very_good_amount}
                        {" · "}Good ₹{selectedRule.good_amount}
                      </div>
                    )}
                    {entryMessage && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 sm:col-span-2">
                        {entryMessage}
                      </div>
                    )}
                    <div className="flex justify-end gap-3 sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStudentId("")}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Close
                      </button>
                      <button
                        disabled={savingReward || !selectedRule}
                        className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingReward ? "Saving..." : "Save reward"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HifzRewards;

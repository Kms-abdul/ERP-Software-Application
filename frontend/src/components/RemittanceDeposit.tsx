import React, { useState, useEffect, useRef } from 'react';
import api, { remittanceApi } from '../api';
import HifzAcademylogo from '../images/HifzAcademylogo.png'

interface DenominationRow {
  denomination: number;
  quantity: string;
  amount: number;
}

const DEFAULT_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

const RemittanceDeposit: React.FC = () => {
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const selectedBranchRef = useRef<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Read-only system calculated cash position
  const [cashPosition, setCashPosition] = useState<{
    cash_in_hand: number;
    opening_balance: number;
    today_collection: number;
    today_remitted: number;
    total_cash_collected: number;
    total_remitted: number;
    unremitted_receipts: any[];
    branch_name: string;
  }>({
    cash_in_hand: 0,
    opening_balance: 0,
    today_collection: 0,
    today_remitted: 0,
    total_cash_collected: 0,
    total_remitted: 0,
    unremitted_receipts: [],
    branch_name: ''
  });

  // Form State
  const [businessDate, setBusinessDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [depositType, setDepositType] = useState<'Corporate Office' | 'Bank'>('Corporate Office');
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [printModalData, setPrintModalData] = useState<any | null>(null);

  const [denominations, setDenominations] = useState<DenominationRow[]>(
    DEFAULT_DENOMINATIONS.map(d => ({ denomination: d, quantity: '', amount: 0 }))
  );

  // Recent Submissions
  const [recentRemittances, setRecentRemittances] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'deposit' | 'history'>('deposit');

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    selectedBranchRef.current = selectedBranch;
    if (selectedBranch) {
      const controller = new AbortController();
      fetchCashPosition(selectedBranch, controller.signal);
      fetchRecentRemittances(selectedBranch, controller.signal);
      return () => {
        controller.abort();
      };
    }
  }, [selectedBranch]);

  const fetchBranches = async () => {
    try {
      const res = await api.get('/branches');
      const branchList = res.data?.branches || [];
      setBranches(branchList);

      const storedBranch = localStorage.getItem('currentBranch') || '';
      if (storedBranch && storedBranch !== 'All') {
        const found = branchList.find((b: any) => b.branch_name === storedBranch || b.id.toString() === storedBranch);
        if (found) {
          setSelectedBranch(found.id.toString());
          return;
        }
      }
      if (branchList.length > 0) {
        setSelectedBranch(branchList[0].id.toString());
      }
    } catch (e: any) {
      console.error('Error fetching branches:', e);
      setMessage({
        text: e.response?.data?.error || e.message || 'Failed to fetch branches. Please verify your connection and login status.',
        type: 'error'
      });
    }
  };

  const fetchCashPosition = async (branchToFetch = selectedBranch, signal?: AbortSignal) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await remittanceApi.getCashPosition({ branch_id: branchToFetch }, { signal });
      if (branchToFetch !== selectedBranchRef.current) return;
      if (res.data) {
        setCashPosition({
          cash_in_hand: res.data.cash_in_hand || 0,
          opening_balance: res.data.opening_balance || 0,
          today_collection: res.data.today_collection || 0,
          today_remitted: res.data.today_remitted || 0,
          total_cash_collected: res.data.total_cash_collected || 0,
          total_remitted: res.data.total_remitted || 0,
          unremitted_receipts: res.data.unremitted_receipts || [],
          branch_name: res.data.branch_name || ''
        });
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.message === 'canceled') return;
      if (branchToFetch !== selectedBranchRef.current) return;
      console.error('Failed to fetch cash position:', err);
      setMessage({
        text: err.response?.data?.error || 'Failed to fetch read-only cash position from system.',
        type: 'error'
      });
    } finally {
      if (branchToFetch === selectedBranchRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchRecentRemittances = async (branchToFetch = selectedBranch, signal?: AbortSignal) => {
    try {
      const res = await remittanceApi.listRemittances({ branch_id: branchToFetch }, { signal });
      if (branchToFetch !== selectedBranchRef.current) return;
      if (res.data && Array.isArray(res.data)) {
        setRecentRemittances(res.data);
      }
    } catch (e: any) {
      if (e.name === 'CanceledError' || e.code === 'ERR_CANCELED' || e.message === 'canceled') return;
      if (branchToFetch !== selectedBranchRef.current) return;
      console.error('Error fetching recent remittances:', e);
    }
  };

  const handleDenomChange = (index: number, qtyStr: string) => {
    const val = parseInt(qtyStr, 10);
    const validQty = isNaN(val) || val < 0 ? 0 : val;

    const updated = [...denominations];
    updated[index].quantity = qtyStr;
    updated[index].amount = updated[index].denomination * validQty;
    setDenominations(updated);
  };

  const totalDenomValue = denominations.reduce((sum, row) => sum + row.amount, 0);
  const depositVal = parseFloat(depositAmount) || 0;
  const remainingCash = cashPosition.cash_in_hand - depositVal;
  const isDenomMatch = Math.abs(totalDenomValue - depositVal) < 0.01;

  const handleSubmit = async (e: React.FormEvent, shouldPrint: boolean = false) => {
    e.preventDefault();
    setMessage(null);

    if (depositVal <= 0) {
      setMessage({ text: 'Please enter a valid deposit amount greater than zero.', type: 'error' });
      return;
    }

    if (depositVal > cashPosition.cash_in_hand) {
      setMessage({
        text: `Fraud Prevention Verification Failed: Deposit Amount (₹${depositVal.toLocaleString()}) cannot exceed available system Cash in Hand (₹${cashPosition.cash_in_hand.toLocaleString()}).`,
        type: 'error'
      });
      return;
    }

    if (!isDenomMatch) {
      setMessage({
        text: `Denomination breakdown total (₹${totalDenomValue.toLocaleString()}) must exactly match Deposit Amount (₹${depositVal.toLocaleString()}).`,
        type: 'error'
      });
      return;
    }

    if (depositType === 'Bank' && (!bankName.trim() || !accountNumber.trim() || !referenceNo.trim())) {
      setMessage({
        text: 'For Bank Deposit, Bank Name, Account Number, and Slip/Challan Reference No are mandatory.',
        type: 'error'
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('branch_id', selectedBranch);
      formData.append('business_date', businessDate);
      formData.append('deposit_amount', depositVal.toString());
      formData.append('deposit_type', depositType);
      if (depositType === 'Bank') {
        formData.append('bank_name', bankName);
        formData.append('account_number', accountNumber);
        formData.append('reference_no', referenceNo);
      } else {
        formData.append('reference_no', referenceNo);
      }
      formData.append('remarks', remarks);

      const activeDenoms = denominations
        .filter(d => parseInt(d.quantity, 10) > 0)
        .map(d => ({ denomination: d.denomination, quantity: parseInt(d.quantity, 10) }));
      formData.append('denominations', JSON.stringify(activeDenoms));

      if (attachment) {
        formData.append('attachment', attachment);
      }

      const res = await remittanceApi.createRemittance(formData);
      setMessage({
        text: `Remittance ${res.data.remittance_no} submitted successfully! Pending Head Office review.`,
        type: 'success'
      });

      const fullRemittance = res.data.remittance || {
        ...res.data,
        branch_name: branches.find((b: any) => b.id.toString() === selectedBranch)?.branch_name || selectedBranch,
        business_date: businessDate,
        deposit_type: depositType,
        bank_name: bankName,
        account_number: accountNumber,
        reference_no: referenceNo,
        remarks: remarks,
        deposit_amount: depositVal,
        cash_in_hand: cashPosition.cash_in_hand,
        remaining_cash: remainingCash,
        denominations: activeDenoms,
        created_at: new Date().toLocaleString()
      };
      // Reset form
      setDepositAmount('');
      setRemarks('');
      setAttachment(null);
      setBankName('');
      setAccountNumber('');
      setReferenceNo('');
      setDenominations(DEFAULT_DENOMINATIONS.map(d => ({ denomination: d, quantity: '', amount: 0 })));

      // Reload real-time position and history
      fetchCashPosition();
      fetchRecentRemittances();
      setActiveTab('history');

      if (shouldPrint) {
        setPrintModalData(fullRemittance);
      }
    } catch (err: any) {
      console.error('Submission failed:', err);
      setMessage({
        text: err.response?.data?.error || 'Failed to submit remittance deposit.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const printReceipt = () => {
    setTimeout(() => {
      const content = document.getElementById('printable-remittance-receipt');
      if (!content) return window.print();

      const printWindow = window.open('', '_blank', 'width=900,height=750');
      if (!printWindow) return window.print();

      const head = Array.from(
        document.querySelectorAll('link[rel="stylesheet"], style')
      )
        .map((el) => el.outerHTML)
        .join('');
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head>${head}<style>body{margin:0;padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial;}</style></head><body>${content.innerHTML}</body></html>`);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      };
    }, 500);
  };

  const handleDownloadAttachment = async (id: number, remittance_no: string) => {
    try {
      const url = remittanceApi.getAttachmentUrl(id);
      const token = localStorage.getItem('token') || '';
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Could not fetch attachment');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Deposit_Slip_${remittance_no}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('Failed to download deposit slip attachment. File may not exist.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-white-900 via-indigo-800 to-slate-900 text-black rounded-xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-blue-500/20 rounded-lg border border-blue-800/30 text-blue-800 font-bold">₹</span>
            <h1 className="text-2xl font-black tracking-tight">Cash Remittance Deposit & Day Closing</h1>
          </div>
          <p className="text-blue-800 text-sm mt-1">
            Audit-Proof Financial Workflow &bull; Direct Remittance to Corporate Office
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 rounded-lg border border-white/15 w-full md:w-auto justify-between">
          <label className="text-xs uppercase tracking-wider text-blue-800 font-semibold">Branch:</label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-white text-black text-sm border border-slate-700 rounded px-2.5 py-1  focus:ring-amber-400"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name}
              </option>
            ))}
          </select>
          <button
            onClick={() => { fetchCashPosition(); fetchRecentRemittances(); }}
            className="text-blue-800 hover:text-black transition-colors text-xs bg-blue-100/60 px-2 py-1 rounded"
            title="Refresh System Calculations"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg shadow font-medium flex items-center justify-between ${message.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
          : 'bg-rose-50 text-rose-800 border border-rose-300'
          }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold ml-4 text-sm uppercase opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('deposit')}
          className={`py-3 px-1 font-semibold text-sm border-b-2 transition-all ${activeTab === 'deposit'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
          ➕ Create New Remittance Deposit
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 px-1 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${activeTab === 'history'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
        >
          📜 Remittance History & Status
          {recentRemittances.filter(r => r.status === 'Pending').length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-300">
              {recentRemittances.filter(r => r.status === 'Pending').length} Pending
            </span>
          )}
        </button>
      </div>

      {activeTab === 'deposit' ? (
        <div className="space-y-6">
          {/* KPI Summary Cards (Audit Proof) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Opening Balance</span>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-slate-800">₹{(cashPosition.opening_balance || 0).toLocaleString()}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Yesterday Closing</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Yesterday's closing cash carry-forward</p>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today Collections</span>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-blue-600">₹{(cashPosition.today_collection || 0).toLocaleString()}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-700 rounded-full">Cash Fee</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Today's collection of fee in cash mode</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 shadow-sm border border-amber-300 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-bl shadow">
                🔒 System Locked
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-800">Current Cash in Hand</span>
              <div className="mt-3">
                <span className="text-3xl font-black text-amber-900">₹{(cashPosition.cash_in_hand || 0).toLocaleString()}</span>
              </div>
              <p className="text-[11px] font-semibold text-amber-800 mt-2">
                ⚠️ Cash in Hand = Opening Balance + Today Collection {cashPosition.today_remitted > 0 ? `(minus today's deposits ₹${cashPosition.today_remitted.toLocaleString()})` : ''}
              </p>
            </div>
          </div>

          {/* Form & Denomination Grid */}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Deposit Parameters */}
            <div className="lg:col-span-6 bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-5 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
                  <span>🏦</span> Deposit Instructions & Details
                </h3>

                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Business Date</label>
                    <input
                      type="date"
                      value={businessDate}
                      onChange={(e) => setBusinessDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Deposit Amount (₹) <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="1"
                        placeholder="0"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className={`w-full pl-8 pr-4 py-2.5 border rounded-lg shadow-sm font-black text-lg outline-none focus:ring-2 ${depositVal > cashPosition.cash_in_hand ? 'border-rose-500 text-rose-700 focus:ring-rose-500 bg-rose-50/50' : 'border-slate-300 text-slate-900 focus:ring-blue-500'
                          }`}
                        required
                      />
                    </div>
                    {depositVal > cashPosition.cash_in_hand && (
                      <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
                        ⚠️ Cannot deposit more than current system Cash in Hand (₹{cashPosition.cash_in_hand.toLocaleString()}).
                      </p>
                    )}
                  </div>

                  {/* Remaining Cash Preview Banner */}
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase">Projected Remaining Cash:</span>
                    <span className={`text-lg font-black ${remainingCash < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      ₹{isNaN(remainingCash) ? '0' : remainingCash.toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Deposit Destination Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDepositType('Corporate Office')}
                        className={`p-3 rounded-lg border-2 font-bold text-sm flex items-center justify-center gap-2 transition ${depositType === 'Corporate Office'
                          ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        <span>🏢</span> Corporate Office
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositType('Bank')}
                        className={`p-3 rounded-lg border-2 font-bold text-sm flex items-center justify-center gap-2 transition ${depositType === 'Bank'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        <span>🏦</span> Bank Deposit
                      </button>
                    </div>
                  </div>

                  {depositType === 'Bank' ? (
                    <div className="space-y-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
                      <div className="text-xs font-extrabold text-emerald-800 uppercase flex items-center gap-1">
                        <span>🏦</span> Bank Account Details
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Bank Name <span className="text-rose-600">*</span></label>
                          <input
                            type="text"
                            placeholder="e.g. State Bank of India, HDFC"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            required={depositType === 'Bank'}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Account Number / Name <span className="text-rose-600">*</span></label>
                          <input
                            type="text"
                            placeholder="e.g. A/C xxx1234"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            required={depositType === 'Bank'}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Bank Deposit Slip / Challan Reference No <span className="text-rose-600">*</span></label>
                        <input
                          type="text"
                          placeholder="Enter Bank Challan or Deposit Slip Ref Number..."
                          value={referenceNo}
                          onChange={(e) => setReferenceNo(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          required={depositType === 'Bank'}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Messenger Name / Reference Number</label>
                      <input
                        type="text"
                        placeholder="Enter staff/messenger name carrying physical cash to Corporate Office..."
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )}

                  {/*<div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      {depositType === 'Bank' ? 'Upload Bank Deposit Slip / Challan Photo (Recommended)' : 'Upload Deposit Voucher / Proof (Optional)'}
                      </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50 hover:bg-slate-100 transition">
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        id="slip-upload"
                        onChange={(e) => setAttachment(e.target.files ? e.target.files[0] : null)}
                        className="hidden"
                      />
                      <label htmlFor="slip-upload" className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-800 block">
                        {attachment ? (
                          <span className="text-emerald-700 font-bold flex items-center justify-center gap-2">
                            📎 Selected: {attachment.name}
                          </span>
                        ) : (
                          <span>📤 Click to Upload Deposit Proof (JPG / PNG / PDF)</span>
                        )}
                      </label>
                    </div>
                  </div>*/}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Remarks / Notes</label>
                    <textarea
                      rows={2}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Enter any optional notes or instructions..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, false)}
                  disabled={submitting || loading || depositVal <= 0 || depositVal > cashPosition.cash_in_hand || !isDenomMatch}
                  className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm sm:text-base rounded-xl shadow transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? 'Submitting...' : '💾 Save Deposit Only'}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={submitting || loading || depositVal <= 0 || depositVal > cashPosition.cash_in_hand || !isDenomMatch}
                  className="flex-[1.5] py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:shadow-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? 'Submitting...' : '🖨️ Save & Print Receipt'}
                </button>
              </div>
            </div>

            {/* Right Column: Denomination Breakdown */}
            <div className="lg:col-span-6 bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">💵 Currency Denomination Counter</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-extrabold ${isDenomMatch && depositVal > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                  {isDenomMatch && depositVal > 0 ? '✓ Balanced' : '⚖ Requires Balance'}
                </span>
              </h3>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b font-bold text-xs uppercase">
                      <th className="py-2.5 px-3 text-left">Note / Coin</th>
                      <th className="py-2.5 px-3 text-center">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {denominations.map((row, idx) => (
                      <tr key={row.denomination} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-extrabold text-slate-800">
                          ₹ {row.denomination}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.quantity}
                            onChange={(e) => handleDenomChange(idx, e.target.value)}
                            className="w-24 text-center border border-slate-300 rounded-md py-1 px-2 font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-inner bg-slate-50 text-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          ₹ {row.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900 text-base">
                      <td colSpan={2} className="py-3 px-3 text-right">Total Denomination Value:</td>
                      <td className={`py-3 px-3 text-right ${isDenomMatch ? 'text-emerald-700' : 'text-rose-600'}`}>
                        ₹ {totalDenomValue.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </form>

          {/* Unremitted Cash Receipts Table (Audit View) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            {/*<div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <span>📋</span> Active Cash Fee Receipts Contributing to Balance ({cashPosition.unremitted_receipts.length})
              </h3>
              <span className="text-xs text-slate-500">Only physical cash fee receipts appear in this audit log.</span>
            </div>

            {cashPosition.unremitted_receipts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 font-medium bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                No unremitted cash receipts found for this branch. All collected cash has been accounted for!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold text-xs uppercase border-y">
                      <th className="p-3">Receipt No</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Class</th>
                      <th className="p-3">Payment Date</th>
                      <th className="p-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashPosition.unremitted_receipts.map((rec) => (
                      <tr key={rec.payment_id} className="hover:bg-slate-50 font-medium">
                        <td className="p-3 font-extrabold text-blue-600">{rec.receipt_no}</td>
                        <td className="p-3 text-slate-800 font-semibold">{rec.student_name}</td>
                        <td className="p-3 text-slate-600">{rec.class_name || 'N/A'}</td>
                        <td className="p-3 text-slate-600">{rec.payment_date}</td>
                        <td className="p-3 text-right font-extrabold text-slate-900">₹{rec.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}*/}
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <h3 className="text-lg font-extrabold text-slate-800">Branch Remittance History</h3>
            <button
              onClick={() => fetchRecentRemittances()}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"
            >
              🔄 Refresh List
            </button>
          </div>

          {recentRemittances.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              No cash remittances found for this branch.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold text-xs uppercase border-y">
                    <th className="p-3">Remittance No</th>
                    <th className="p-3">Type & Details</th>
                    <th className="p-3">Business Date</th>
                    <th className="p-3 text-right">Deposit Amount</th>
                    <th className="p-3 text-right">Remaining Cash</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {recentRemittances.map((rem) => (
                    <tr key={rem.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-extrabold text-blue-700">{rem.remittance_no}</td>
                      <td className="p-3 text-xs">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase inline-block ${rem.deposit_type === 'Bank' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}>
                          {rem.deposit_type === 'Bank' ? '🏦 Bank' : '🏢 Corporate Office'}
                        </span>
                        {rem.deposit_type === 'Bank' && rem.bank_name && (
                          <div className="text-[11px] text-slate-600 font-semibold mt-1">
                            {rem.bank_name} {rem.account_number ? `(••••${String(rem.account_number).slice(-4)})` : ''}
                          </div>
                        )}
                        {rem.reference_no && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[150px]" title={rem.reference_no}>
                            Ref: {rem.reference_no}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">{rem.business_date}</td>
                      <td className="p-3 text-right font-black text-slate-900">₹{rem.deposit_amount.toLocaleString()}</td>
                      <td className="p-3 text-right text-slate-600">₹{rem.remaining_cash.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold inline-block ${rem.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : rem.status === 'Rejected'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          }`}>
                          {rem.status === 'Approved' ? '✓ Approved' : rem.status === 'Rejected' ? '✕ Rejected' : '⌛ Pending HO Review'}
                        </span>
                      </td>
                      <td className="p-3 text-center space-x-1.5 whitespace-nowrap">
                        {rem.attachment_path && (
                          <button
                            onClick={() => handleDownloadAttachment(rem.id, rem.remittance_no)}
                            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-2.5 py-1.5 rounded border border-blue-300 transition inline-flex items-center gap-1"
                            title="View / Download Deposit Slip"
                          >
                            📎 Slip
                          </button>
                        )}
                        <button
                          onClick={() => setPrintModalData(rem)}
                          className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-2.5 py-1.5 rounded border border-emerald-300 transition inline-flex items-center gap-1 shadow-sm"
                          title="Print Remittance Receipt"
                        >
                          🖨️ Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {printModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto no-print">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center no-print">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>🖨️</span> Remittance Deposit Voucher Preview
              </h3>
              <button onClick={() => setPrintModalData(null)} className="text-slate-400 hover:text-white font-bold text-lg px-2">✕</button>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 text-slate-800" id="printable-remittance-receipt">
              <div className="text-center border-b-2 border-slate-800 pb-4">
                <img src={HifzAcademylogo} className="h-10 mx-auto" alt="Company Logo" />
                <p className="text-sm font-bold text-slate-600 mt-0.5">CASH REMITTANCE DEPOSIT VOUCHER</p>
                <span className="inline-block mt-2 px-3 py-1 bg-slate-100 border border-slate-300 font-black text-xs uppercase tracking-widest rounded text-slate-800">
                  {printModalData.deposit_type === 'Bank' ? '🏦 Bank Deposit Copy' : '🏢 Corporate Office Copy'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <p><span className="text-slate-500 font-semibold text-xs block">VOUCHER NO:</span> <strong className="text-blue-700 text-base font-black">{printModalData.remittance_no}</strong></p>
                  <p className="mt-2"><span className="text-slate-500 font-semibold text-xs block">BRANCH:</span> <strong className="text-slate-900">{printModalData.branch_name || branches.find((b: any) => b.id.toString() === selectedBranch)?.branch_name || '—'}</strong></p>
                </div>
                <div className="text-right">
                  <p><span className="text-slate-500 font-semibold text-xs block">BUSINESS DATE:</span> <strong className="text-slate-900">{printModalData.business_date}</strong></p>
                  <p className="mt-2"><span className="text-slate-500 font-semibold text-xs block">STATUS:</span> <strong className="text-slate-900 uppercase font-bold">{printModalData.status || 'Pending'}</strong></p>
                </div>
              </div>

              {printModalData.deposit_type === 'Bank' && (
                <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-300 text-sm">
                  <h4 className="font-extrabold text-emerald-900 text-xs uppercase mb-2 border-b border-emerald-200 pb-1">Bank Deposit Information</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-emerald-700 font-semibold block">Bank Name:</span>
                      <strong className="text-emerald-950 text-sm">{printModalData.bank_name || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-700 font-semibold block">Account Number:</span>
                      <strong className="text-emerald-950 text-sm">{printModalData.account_number || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-emerald-700 font-semibold block">Slip / Challan Ref:</span>
                      <strong className="text-emerald-950 text-sm">{printModalData.reference_no || 'N/A'}</strong>
                    </div>
                  </div>
                </div>
              )}

              {printModalData.deposit_type !== 'Bank' && printModalData.reference_no && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-xs">
                  <span className="text-blue-700 font-semibold block">Messenger / Reference Info:</span>
                  <strong className="text-blue-950 text-sm">{printModalData.reference_no}</strong>
                </div>
              )}

              <div className="border border-slate-300 rounded-lg overflow-hidden text-sm">
                <div className="bg-slate-100 px-4 py-2 font-black text-slate-700 text-xs uppercase border-b border-slate-300 flex justify-between">
                  <span>Financial Summary</span>
                  <span>Amount (₹)</span>
                </div>
                <div className="p-4 space-y-2 divide-y divide-slate-100 font-medium">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">Available Cash in Hand Before Deposit:</span>
                    <span className="font-bold">₹{(printModalData.cash_in_hand || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-emerald-50/60 px-2 rounded text-base">
                    <span className="font-extrabold text-slate-900">DEPOSIT AMOUNT REMITTED:</span>
                    <span className="font-black text-emerald-800 text-lg">₹{(printModalData.deposit_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 pt-2 text-slate-600">
                    <span>Carry-Forward Remaining Cash in Hand:</span>
                    <span className="font-bold text-slate-800">₹{(printModalData.remaining_cash || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {printModalData.denominations && printModalData.denominations.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600 mb-2">Currency Denominations Submitted</h4>
                  <table className="w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                        <th className="p-2 text-left border-r border-slate-300">Note / Coin</th>
                        <th className="p-2 text-center border-r border-slate-300">Quantity</th>
                        <th className="p-2 text-right">Value (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-semibold">
                      {printModalData.denominations.map((d: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 border-r border-slate-200 font-bold">₹ {d.denomination}</td>
                          <td className="p-2 text-center border-r border-slate-200">{d.quantity}</td>
                          <td className="p-2 text-right font-black">₹ {(d.amount || d.denomination * d.quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-black border-t-2 border-slate-300">
                        <td colSpan={2} className="p-2 text-right">Total Value:</td>
                        <td className="p-2 text-right text-sm text-slate-900">₹ {(printModalData.deposit_amount || 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {printModalData.remarks && (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded border">
                  <span className="font-bold uppercase text-slate-500 block mb-1">Remarks / Notes:</span>
                  <p>{printModalData.remarks}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-12 text-center text-xs text-slate-700">
                <div>
                  <div className="border-t border-slate-400 pt-2 w-48 mx-auto font-extrabold uppercase">
                    Cashier / Branch Manager
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Prepared & Verified</p>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-2 w-48 mx-auto font-extrabold uppercase">
                    Corporate Office / Finance
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Received & Confirmed</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3 no-print">
              <button
                type="button"
                onClick={() => setPrintModalData(null)}
                className="px-5 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-lg shadow-md transition flex items-center gap-2"
              >
                <span>🖨️</span> Print Voucher Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemittanceDeposit;

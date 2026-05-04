import React, { useState, useEffect } from 'react';

const StaffSupport: React.FC = () => {
    const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/FFcwsA705dt8mMS4FciHxR';

    const [userName, setUserName] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState('General');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const categories = [
        { label: 'General',    icon: '💬' },
        { label: 'Technical',  icon: '🔧' },
        { label: 'Attendance', icon: '📋' },
        { label: 'Salary',     icon: '💰' },
        { label: 'Leave',      icon: '🗓️' },
        { label: 'Other',      icon: '📌' },
    ];

    const referenceDocs = [
        { title: 'Academic Module', href: new URL('../images/Academic Module.pdf', import.meta.url).href },
        { title: 'Attendance Module', href: new URL('../images/Attendance Module.pdf', import.meta.url).href },
        { title: 'Fee Module', href: new URL('../images/Fee Module.pdf', import.meta.url).href },
        { title: 'Student Administration Module', href: new URL('../images/Student Administration Module.pdf', import.meta.url).href },
        { title: 'User Management Module', href: new URL('../images/User Management Module.pdf', import.meta.url).href },
    ];

    const faqs = [
        {
            question: 'How do I reset my password?',
            answer: 'Contact your admin or send a support query. We will reset it within 24 hours.',
        },
        {
            question: 'How can I view my attendance records?',
            answer: 'Navigate to the Attendance module from the sidebar under "My Attendance".',
        },
        {
            question: 'How do I apply for leave?',
            answer: 'Go to Leave Management and click "Apply Leave". Fill in details and submit.',
        },
        {
            question: 'When will my salary be credited?',
            answer: 'Salary is processed on the last working day of each month.',
        },
    ];

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        let name =
            localStorage.getItem('userName') ||
            localStorage.getItem('user_name') ||
            localStorage.getItem('name') ||
            localStorage.getItem('staffName') ||
            localStorage.getItem('displayName') ||
            '';

        if (!name && savedUser) {
            try {
                const userObj = JSON.parse(savedUser);
                name =
                    userObj?.name ||
                    userObj?.username ||
                    userObj?.userName ||
                    userObj?.displayName ||
                    userObj?.fullName ||
                    userObj?.full_name ||
                    userObj?.first_name ||
                    userObj?.staff_name ||
                    '';
            } catch {
                name = '';
            }
        }

        setUserName(name || '');
    }, []);

    const validate = (): boolean => {
        const e: { subject?: string; message?: string } = {};
        if (!subject.trim() || subject.trim().length < 5) {
            e.subject = 'Subject must be at least 5 characters';
        }
        if (!message.trim() || message.trim().length < 20) {
            e.message = 'Please describe your issue in at least 20 characters';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const buildMessage = (): string => {
        const timestamp = new Date().toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
        return (
            `🎓 *Staff Support Query*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `👤 *From* : ${userName || 'Staff Member'}\n\n` +
            `📋 *Query Details*\n` +
            `• Category : ${category}\n` +
            `• Subject  : ${subject}\n\n` +
            `💬 *Message*\n` +
            `${message}\n\n` +
            `🕐 *Sent on* : ${timestamp}\n` +
            `━━━━━━━━━━━━━━━━━━━━`
        );
    };

    // ── Copy message to clipboard ─────────────────────────────────────────────
    const copyToClipboard = async (text: string): Promise<boolean> => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers / non-HTTPS
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '-9999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                return success;
            }
        } catch {
            return false;
        }
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSubmitting) return;
        if (!validate()) return;

        setIsSubmitting(true);

        try {
            const text = buildMessage();

            // Step 1: Copy message to clipboard
            const copied = await copyToClipboard(text);
            setIsCopied(copied);

            // Step 2: Open the WhatsApp group
            window.open(WHATSAPP_GROUP_LINK, '_blank', 'noopener,noreferrer');

            setIsSubmitted(true);

            // Auto-reset after 20s
            setTimeout(() => {
                setIsSubmitted(false);
                setIsCopied(false);
                setSubject('');
                setMessage('');
                setCategory('General');
                setErrors({});
            }, 20000);
        } catch (err) {
            console.error(err);
            window.open(WHATSAPP_GROUP_LINK, '_blank', 'noopener,noreferrer');
            setIsSubmitted(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Manual copy on success screen ────────────────────────────────────────
    const handleManualCopy = async () => {
        const copied = await copyToClipboard(buildMessage());
        if (copied) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 3000);
        }
    };

    const WaIcon = ({ cls = 'w-5 h-5' }: { cls?: string }) => (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-green-50 to-emerald-50 p-6">
            <div className="max-w-6xl mx-auto">

                {/* ── Header ── */}
                <div className="mb-8 flex items-center gap-3">
                    <div className="bg-green-500 p-2.5 rounded-xl shadow-md">
                        <WaIcon cls="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Staff Support</h1>
                        <p className="text-gray-500 text-sm">
                            Get help from our support team via WhatsApp
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ══════════════════════════════════════════
                        LEFT — Form
                    ══════════════════════════════════════════ */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

                            {/* Card header */}
                            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 flex items-center gap-3">
                                <div className="bg-white/20 p-2 rounded-lg">
                                    <WaIcon cls="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Submit Your Query</h2>
                                    <p className="text-green-100 text-xs mt-0.5">
                                        Message is copied to clipboard — just paste it in WhatsApp
                                    </p>
                                </div>
                            </div>

                            {/* ── Success screen ── */}
                            {isSubmitted ? (
                                <div className="p-10 flex flex-col items-center text-center min-h-96">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-5 animate-bounce">
                                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>

                                    <h3 className="text-2xl font-bold text-gray-800 mb-1">
                                        ✅ WhatsApp Group Opened!
                                    </h3>

                                    {/* Clipboard status badge */}
                                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4 ${
                                        isCopied
                                            ? 'bg-green-100 text-green-700 border border-green-300'
                                            : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                                    }`}>
                                        {isCopied ? (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Message copied to clipboard!
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Clipboard access denied — copy manually below
                                            </>
                                        )}
                                    </div>

                                    {/* Step guide */}
                                    <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-left w-full max-w-md mb-4">
                                        <p className="text-sm font-bold text-green-700 mb-4">
                                            📋 Follow these steps:
                                        </p>
                                        <div className="space-y-3">
                                            {[
                                                'Switch to the WhatsApp tab that just opened',
                                                isCopied
                                                    ? 'Click the message box and press Ctrl+V (or long-press → Paste) to paste'
                                                    : 'Copy the message manually using the button below',
                                                'Press Send 🚀',
                                            ].map((step, i) => (
                                                <div key={i} className="flex items-start gap-3">
                                                    <span className="bg-green-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold">
                                                        {i + 1}
                                                    </span>
                                                    <p className="text-sm text-green-800">{step}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Message box — for manual copy */}
                                    <div className="w-full max-w-md mb-4">
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left">
                                            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-40 overflow-y-auto">
                                                {buildMessage()}
                                            </pre>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                                        <button
                                            type="button"
                                            onClick={handleManualCopy}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                                isCopied
                                                    ? 'bg-green-50 text-green-700 border-green-300'
                                                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                            }`}
                                        >
                                            {isCopied ? (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Copied!
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                    Copy Message
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => window.open(WHATSAPP_GROUP_LINK, '_blank', 'noopener,noreferrer')}
                                            className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md"
                                        >
                                            <WaIcon cls="w-4 h-4 text-white" />
                                            Open WhatsApp Again
                                        </button>
                                    </div>

                                    <p className="text-xs text-gray-400 mt-5">
                                        Resets automatically in a few seconds…
                                    </p>
                                </div>

                            ) : (
                                /* ── Form ── */
                                <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">

                                    {/* Sender chip */}
                                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-gray-400 font-medium">Sending as</p>
                                            <p className="text-sm font-bold text-gray-800 truncate">
                                                {userName || (
                                                    <span className="italic text-gray-400">Staff Member</span>
                                                )}
                                            </p>
                                        </div>
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                            Auto-detected
                                        </span>
                                    </div>

                                    {/* Category chips */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            Query Category <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {categories.map((cat) => (
                                                <button
                                                    type="button"
                                                    key={cat.label}
                                                    onClick={() => setCategory(cat.label)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 flex items-center gap-1.5 ${
                                                        category === cat.label
                                                            ? 'bg-green-500 text-white border-green-500 shadow-md scale-105'
                                                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-600'
                                                    }`}
                                                >
                                                    <span>{cat.icon}</span>
                                                    {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Subject */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                            Subject <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                </svg>
                                            </div>
                                            <input
                                                type="text"
                                                value={subject}
                                                onChange={e => {
                                                    setSubject(e.target.value);
                                                    if (errors.subject) setErrors(p => ({ ...p, subject: undefined }));
                                                }}
                                                placeholder="Brief subject of your query"
                                                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all bg-gray-50 focus:bg-white ${
                                                    errors.subject
                                                        ? 'border-red-400 focus:ring-red-300'
                                                        : 'border-gray-200 focus:ring-green-300 focus:border-green-400'
                                                }`}
                                            />
                                        </div>
                                        {errors.subject && (
                                            <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                                <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                {errors.subject}
                                            </p>
                                        )}
                                    </div>

                                    {/* Message */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                            Your Message <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            value={message}
                                            onChange={e => {
                                                setMessage(e.target.value);
                                                if (errors.message) setErrors(p => ({ ...p, message: undefined }));
                                            }}
                                            rows={5}
                                            placeholder="Describe your issue in detail so we can help you better..."
                                            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all resize-none bg-gray-50 focus:bg-white ${
                                                errors.message
                                                    ? 'border-red-400 focus:ring-red-300'
                                                    : 'border-gray-200 focus:ring-green-300 focus:border-green-400'
                                            }`}
                                        />
                                        <div className="flex justify-between items-center mt-1">
                                            {errors.message ? (
                                                <p className="text-xs text-red-500 flex items-center gap-1">
                                                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                    {errors.message}
                                                </p>
                                            ) : <span />}
                                            <span className={`text-xs ml-auto ${message.length >= 20 ? 'text-green-500' : 'text-gray-400'}`}>
                                                {message.length} chars
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message preview */}
                                    {(subject || message) && (
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                                                <span>👁️</span> Message Preview
                                            </p>
                                            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                                                {buildMessage()}
                                            </pre>
                                        </div>
                                    )}

                                    {/* How it works */}
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                                        <WaIcon cls="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-semibold text-green-700 mb-1">How this works</p>
                                            <p className="text-xs text-green-600 leading-relaxed">
                                                ① Click the button below — your message is <strong>copied to clipboard automatically</strong><br />
                                                ② WhatsApp group opens in a new tab<br />
                                                ③ Click the message box and press <strong>Ctrl+V</strong> (or long-press → Paste on mobile) to paste<br />
                                                ④ Press <strong>Send</strong> 🚀
                                            </p>
                                        </div>
                                    </div>

                                    {/* Submit */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 text-sm"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                Copying & Opening WhatsApp…
                                            </>
                                        ) : (
                                            <>
                                                <WaIcon cls="w-5 h-5 text-white" />
                                                Copy Message & Open WhatsApp
                                            </>
                                        )}
                                    </button>

                                    {/* ── Reference Documents ── */}
                                    <div className="pt-2">
                                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                                            <span>📚</span> Reference Documents
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {referenceDocs.map((doc, i) => (
                                                <a
                                                    key={i}
                                                    href={doc.href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-semibold text-gray-700 hover:bg-green-50 hover:border-green-400 hover:text-green-700 transition-all duration-200 whitespace-nowrap"
                                                >
                                                    <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
                                                    </svg>
                                                    {doc.title}
                                                    <span className="text-green-600 font-bold ml-0.5">↗</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>

                                </form>
                            )}
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════
                        RIGHT — Info panel
                    ══════════════════════════════════════════ */}
                    <div className="space-y-5">

                        {/* Join group card */}
                        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-5 text-white">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="bg-white/20 p-2 rounded-lg">
                                    <WaIcon cls="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm">Support WhatsApp Group</h3>
                                    <p className="text-green-100 text-xs">Join for instant support</p>
                                </div>
                            </div>
                            <p className="text-green-100 text-xs mb-4 leading-relaxed">
                                All staff queries are handled in our dedicated WhatsApp group. Join to get real-time assistance.
                            </p>
                            <button
                                type="button"
                                onClick={() => window.open(WHATSAPP_GROUP_LINK, '_blank', 'noopener,noreferrer')}
                                className="w-full bg-white text-green-600 font-bold py-2 rounded-xl text-sm hover:bg-green-50 transition-all shadow-md flex items-center justify-center gap-2"
                            >
                                <WaIcon cls="w-4 h-4 text-green-600" />
                                Join Support Group
                            </button>
                        </div>

                        {/* Support hours */}
                        <div className="bg-white rounded-2xl shadow-md p-5">
                            <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                                <span className="text-lg">🕐</span> Support Hours
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { day: 'Monday – Friday', time: '9:00 AM – 6:00 PM', active: true },
                                    { day: 'Saturday',        time: '9:00 AM – 2:00 PM', active: true },
                                    { day: 'Sunday',          time: 'Closed',             active: false },
                                ].map((item, i) => (
                                    <div key={i} className="flex justify-between items-center">
                                        <span className="text-xs text-gray-600">{item.day}</span>
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                            item.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                                        }`}>
                                            {item.time}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-xs text-green-600 font-medium">Support team is online</span>
                            </div>
                        </div>

                        {/* Response times */}
                        <div className="bg-white rounded-2xl shadow-md p-5">
                            <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                                <span className="text-lg">⚡</span> Response Times
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'WhatsApp Group',  time: '< 1 hour',  color: 'bg-green-500' },
                                    { label: 'Urgent Issues',   time: '< 30 min',  color: 'bg-emerald-500' },
                                    { label: 'General Queries', time: '< 4 hours', color: 'bg-blue-500' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${item.color}`} />
                                            <span className="text-xs text-gray-600">{item.label}</span>
                                        </div>
                                        <span className="text-xs font-bold text-gray-800">{item.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* FAQ accordion */}
                        <div className="bg-white rounded-2xl shadow-md p-5">
                            <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                                <span className="text-lg">❓</span> Quick FAQs
                            </h3>
                            <div className="space-y-2">
                                {faqs.map((faq, i) => (
                                    <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                            className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                            <span className="text-xs font-semibold text-gray-700 pr-2">{faq.question}</span>
                                            <svg
                                                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {openFaq === i && (
                                            <div className="px-4 pb-3 bg-green-50 border-t border-gray-100">
                                                <p className="text-xs text-gray-600 leading-relaxed pt-2">{faq.answer}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffSupport;
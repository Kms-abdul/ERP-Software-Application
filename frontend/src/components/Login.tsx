import React, { useState } from 'react';
import axios from "axios";
import { API_URL } from "../config";
import { auth } from '../api';


interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

type ViewState = 'login' | 'forgot-email' | 'forgot-otp' | 'forgot-reset';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<ViewState>('login');

  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Forgot Password states
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      // Clear legacy/Header keys (Hard Reset)
      localStorage.removeItem("branch");
      localStorage.removeItem("location");
      localStorage.removeItem("academicYear");
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      localStorage.removeItem("currentBranch");
      localStorage.removeItem("currentLocation");

      const response = await axios.post(`${API_URL}/users/login`, {
        username,
        password
      });

      console.log("Login successful:", response.data);

      try {
        if (response.data.token) {
          auth.setToken(response.data.token);
          console.log("Token saved");
        } else {
          console.warn("No token found in login response");
        }

        if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          console.log("User saved to localStorage");
        }
      } catch (ex) {
        console.warn('Could not persist to localStorage', ex);
      }

      // send user info to parent (App.tsx)
      onLoginSuccess(response.data.user);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Invalid username or password';
      setError(msg);
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    resetMessages();
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/users/forgot-password`, { email });
      setMessage(response.data.message || "OTP has been sent to your email.");
      setView('forgot-otp');
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtp();
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      await axios.post(`${API_URL}/users/verify-otp`, { email, otp });
      setMessage("OTP verified. Please set a new password.");
      setView('forgot-reset');
    } catch (err: any) {
      setError(err?.response?.data?.error || "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/users/reset-password`, {
        email,
        otp,
        new_password: newPassword
      });
      setMessage(response.data.message || "Password successfully reset! You can now login.");
      // Optional: Delay transition back to login screen so they can read the success message
      setTimeout(() => {
        setView('login');
        setEmail('');
        setOtp('');
        setNewPassword('');
        setPassword('');
      }, 2000);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-sm mx-auto bg-white rounded-lg shadow-md transition-all duration-300">
        <div className="p-8">
          <div className="text-center space-y-4 mb-8">
            <img src="https://www.mshifzacademy.com/assets/images/ms-logo.jpg"
              alt="MS Education Academy Logo"
              className="mx-auto h-12 object-contain" />

            {view === 'login' && <p className="text-gray-500 font-medium">Admin Login</p>}
            {view === 'forgot-email' && <p className="text-gray-500 font-medium">Forgot Password</p>}
            {view === 'forgot-otp' && <p className="text-gray-500 font-medium">Enter OTP</p>}
            {view === 'forgot-reset' && <p className="text-gray-500 font-medium">Reset Password</p>}
          </div>

          {/* LOGIN VIEW */}
          {view === 'login' && (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="border border-gray-300 rounded-md">
                <div className="px-3 py-2 border-b border-gray-300">
                  <label className="block text-xs font-medium text-gray-500">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full p-0 border-0 bg-transparent focus:ring-0 sm:text-sm"
                  />
                </div>

                <div className="px-3 py-2">
                  <label className="block text-xs font-medium text-gray-500">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full p-0 border-0 bg-transparent focus:ring-0 sm:text-sm"
                  />
                </div>
              </div>

              {error && <p className="text-center text-sm text-red-600 pt-2">{error}</p>}
              {message && <p className="text-center text-sm text-green-600 pt-2">{message}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                title="Login with your credentials"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => { setView('forgot-email'); resetMessages(); }}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD - EMAIL VIEW */}
          {view === 'forgot-email' && (
            <form className="space-y-4" onSubmit={handleForgotPassword}>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Enter your registered email address to receive an OTP.
              </p>

              <div className="border border-gray-300 rounded-md">
                <div className="px-3 py-2">
                  <label className="block text-xs font-medium text-gray-500">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full p-0 border-0 bg-transparent focus:ring-0 sm:text-sm"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>

              {error && <p className="text-center text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => { setView('login'); resetMessages(); }}
                  className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD - OTP VIEW */}
          {view === 'forgot-otp' && (
            <form className="space-y-4" onSubmit={handleVerifyOTP}>
              <p className="text-sm text-gray-600 mb-4 text-center">
                We've sent a 6-digit OTP to <br />
                <span className="font-semibold">{email}</span>
              </p>

              <div className="border border-gray-300 rounded-md">
                <div className="px-3 py-2">
                  <label className="block text-xs font-medium text-gray-500">Enter OTP</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="block w-full p-0 border-0 bg-transparent focus:ring-0 sm:text-sm tracking-widest text-center"
                    placeholder="------"
                  />
                </div>
              </div>

              {error && <p className="text-center text-sm text-red-600">{error}</p>}
              {message && <p className="text-center text-sm text-green-600">{message}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <div className="flex justify-between items-center text-sm mt-4">
                <button
                  type="button"
                  onClick={() => { setView('forgot-email'); resetMessages(); }}
                  className="text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Change Email
                </button>
                <button
                  type="button"
                  onClick={() => requestOtp()}
                  disabled={loading}
                  className="text-blue-600 hover:text-blue-800 hover:underline disabled:text-blue-300"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          )}

          {/* FORGOT PASSWORD - RESET VIEW */}
          {view === 'forgot-reset' && (
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <p className="text-sm text-gray-600 mb-4 text-center">
                OTP verified! Please enter your new password below.
              </p>

              <div className="border border-gray-300 rounded-md">
                <div className="px-3 py-2">
                  <label className="block text-xs font-medium text-gray-500">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full p-0 border-0 bg-transparent focus:ring-0 sm:text-sm"
                    placeholder="Enter new password"
                  />
                </div>
              </div>

              {error && <p className="text-center text-sm text-red-600">{error}</p>}
              {message && <p className="text-center text-sm text-green-600">{message}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Resetting...' : 'Set New Password'}
              </button>

              {/* Ensure user can cancel if needed */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => { setView('login'); resetMessages(); }}
                  className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Cancel & Back to Login
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;

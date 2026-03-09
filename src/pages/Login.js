// pages/Login.js
import React from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { signIn, denied } = useAuth();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">📺</div>
        <h1>NCP+ADK Program Weekly KPIs</h1>
        <p>Disney Streaming · Partnerships &amp; Devices<br/>Sign in with your Disney or Disney Streaming account to continue.</p>

        {denied && (
          <div className="alert alert-error" style={{ marginBottom: 20, textAlign: 'left' }}>
            ⛔ Access restricted to <strong>@disney.com</strong> and <strong>@disneystreaming.com</strong> accounts only.
          </div>
        )}

        <button className="btn-google" onClick={signIn}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.7 0 6.7 5.4 2.8 13.3l7.8 6.1C12.5 13 17.8 9.5 24 9.5z"/>
            <path fill="#34A853" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.2-10 7.2-17z"/>
            <path fill="#4A90D9" d="M10.6 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l8.1-6.2z"/>
            <path fill="#FBBC05" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-4.2-13.4-9.8l-8.1 6.2C6.7 42.6 14.7 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="login-footer">Restricted to @disney.com and @disneystreaming.com accounts</p>
      </div>
    </div>
  );
}

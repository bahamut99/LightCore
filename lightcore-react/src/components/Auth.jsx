import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
    }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setAuthError(error.message);
    } else {
      alert('Success! Please check your email for a confirmation link.');
    }
    setLoading(false);
  };

  return (
    <div id="auth-container">
      <div className="header-container">
        <img src="https://i.imgur.com/d5N9dkk.png" alt="LightCore Logo" style={{ height: '44px' }} />
        <h1>LightCore</h1>
      </div>
      <div className="card">
        {isSignUp ? (
          <form onSubmit={handleSignup}>
            <h2>Sign Up</h2>
            <label htmlFor="signup-email">Email</label>
            <input type="email" id="signup-email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="signup-password">Password</label>
            <input type="password" id="signup-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" />
            <button type="submit" disabled={loading}>{loading ? 'Signing Up...' : 'Sign Up'}</button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <h2>Log In</h2>
            <label htmlFor="login-email">Email</label>
            <input type="email" id="login-email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="login-password">Password</label>
            <input type="password" id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? 'Logging In...' : 'Log In'}</button>
          </form>
        )}
        {authError && <p className="error-message">{authError}</p>}
        <p className="auth-toggle">
          <a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); }}>
            {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
          </a>
        </p>
      </div>
    </div>
  );
}
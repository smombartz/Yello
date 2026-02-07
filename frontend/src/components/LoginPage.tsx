import { useAuth } from '../hooks/useAuth';
import logoSvg from '../assets/logo.svg';

export function LoginPage() {
  const { login, isLoading } = useAuth();

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src={logoSvg} alt="Yellow" className="login-logo" />
          <p>Manage and organize your contacts with ease</p>
        </div>

        <div className="login-content">
          <button
            className="google-login-btn"
            onClick={login}
            disabled={isLoading}
          >
            <svg
              className="google-icon"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>

        <div className="login-footer">
          <p>Your contacts are stored securely and never shared</p>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(46deg, #7C3AED 7.03%, #273DE3 94.08%);
          padding: 20px;
        }

        .login-container {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          text-align: center;
        }

        .login-header {
          margin-bottom: 32px;
        }

        .login-logo {
          height: 40px;
          width: auto;
          margin-bottom: 8px;
        }

        .login-header p {
          color: #718096;
          margin: 0;
          font-size: 14px;
        }

        .login-content {
          margin-bottom: 32px;
        }

        .google-login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 14px 24px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .google-login-btn:hover:not(:disabled) {
          background: #f7fafc;
          border-color: #cbd5e0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .google-login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .google-icon {
          flex-shrink: 0;
        }

        .login-footer {
          color: #a0aec0;
          font-size: 12px;
        }

        .login-footer p {
          margin: 0;
        }
      `}</style>
    </div>
  );
}

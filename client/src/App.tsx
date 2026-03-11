import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import RegisterPage from './features/auth/RegisterPage';
import LoginPage from './features/auth/LoginPage';
import CockpitView from './features/cockpit/CockpitView';
import AccountsPage from './features/accounts/AccountsPage';
import SubscriptionsPage from './features/subscriptions/SubscriptionsPage';
import PlatformsPage from './features/platforms/PlatformsPage';
import FinancePage from './features/finance/FinancePage';
import GmailAuditPage from './features/gmail/GmailAuditPage';
import type { ReactNode } from 'react';
import './index.css';

function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
            </div>
        );
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/register" replace />;
}

function PublicRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
            </div>
        );
    }

    return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={
                <ProtectedRoute>
                    <CockpitView />
                </ProtectedRoute>
            } />
            <Route path="/accounts" element={
                <ProtectedRoute>
                    <AccountsPage />
                </ProtectedRoute>
            } />
            <Route path="/subscriptions" element={
                <ProtectedRoute>
                    <SubscriptionsPage />
                </ProtectedRoute>
            } />
            <Route path="/platforms" element={
                <ProtectedRoute>
                    <PlatformsPage />
                </ProtectedRoute>
            } />
            <Route path="/finance" element={
                <ProtectedRoute>
                    <FinancePage />
                </ProtectedRoute>
            } />
            <Route path="/gmail" element={
                <ProtectedRoute>
                    <GmailAuditPage />
                </ProtectedRoute>
            } />
            <Route path="/register" element={
                <PublicRoute>
                    <RegisterPage />
                </PublicRoute>
            } />
            <Route path="/login" element={
                <PublicRoute>
                    <LoginPage />
                </PublicRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </BrowserRouter>
    );
}

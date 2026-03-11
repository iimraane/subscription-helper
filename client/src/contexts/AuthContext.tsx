import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { OperatorProfile } from '@shared/types';
import { authApi, setAccessToken } from '../lib/api';

interface AuthContextType {
    operator: OperatorProfile | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [operator, setOperator] = useState<OperatorProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session on mount using refresh token cookie
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const data = await authApi.refresh();
                if (data) {
                    setAccessToken(data.accessToken);
                    setOperator(data.operator);
                } else {
                    setOperator(null);
                }
            } catch {
                setOperator(null);
            } finally {
                setIsLoading(false);
            }
        };
        restoreSession();
    }, []);

    const register = useCallback(async (email: string, password: string) => {
        const data = await authApi.register(email, password);
        setAccessToken(data.accessToken);
        setOperator(data.operator);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const data = await authApi.login(email, password);
        setAccessToken(data.accessToken);
        setOperator(data.operator);
    }, []);

    const logout = useCallback(async () => {
        await authApi.logout();
        setAccessToken(null);
        setOperator(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                operator,
                isLoading,
                isAuthenticated: !!operator,
                login,
                register,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

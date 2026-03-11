import type { ApiSuccess, ApiError, AuthResponse } from '@shared/types';

const API_BASE = '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
    accessToken = token;
}

export function getAccessToken(): string | null {
    return accessToken;
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
    });

    const json = await res.json();

    if (!res.ok) {
        const error = json as ApiError;

        // If 401 and we have a token, try refresh
        if (res.status === 401 && accessToken) {
            const refreshed = await tryRefreshToken();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${accessToken}`;
                const retryRes = await fetch(`${API_BASE}${path}`, {
                    ...options,
                    headers,
                    credentials: 'include',
                });
                const retryJson = await retryRes.json();
                if (!retryRes.ok) {
                    throw retryJson as ApiError;
                }
                return (retryJson as ApiSuccess<T>).data;
            }
        }

        throw error;
    }

    return (json as ApiSuccess<T>).data;
}

async function tryRefreshToken(): Promise<AuthResponse | null> {
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!res.ok) return null;
        const json = await res.json();
        const data = (json as ApiSuccess<AuthResponse>).data;
        accessToken = data.accessToken;
        return data;
    } catch {
        accessToken = null;
        return null;
    }
}

// === Auth API ===
export const authApi = {
    register: (email: string, password: string) =>
        request<AuthResponse>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    login: (email: string, password: string) =>
        request<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    refresh: () => tryRefreshToken(),

    logout: () =>
        request<{ message: string }>('/auth/logout', { method: 'POST' }),
};

export default request;

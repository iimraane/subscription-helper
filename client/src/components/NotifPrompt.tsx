import { useState, useEffect } from 'react';

interface NotifPromptProps {
    onSubscribed?: () => void;
}

export default function NotifPrompt({ onSubscribed }: NotifPromptProps) {
    const [status, setStatus] = useState<'loading' | 'prompt' | 'subscribed' | 'denied' | 'unsupported'>('loading');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setStatus('unsupported');
            return;
        }
        if (Notification.permission === 'denied' || localStorage.getItem('notifPromptDismissed')) {
            setStatus('denied');
            return;
        }
        if (Notification.permission === 'granted') {
            // Check if already subscribed
            checkExistingSubscription();
        } else {
            setStatus('prompt');
        }
    }, []);

    const checkExistingSubscription = async () => {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            setStatus(sub ? 'subscribed' : 'prompt');
        } catch {
            setStatus('prompt');
        }
    };

    const handleEnable = async () => {
        try {
            // 1. Register service worker
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;

            // 2. Get VAPID key from server
            const res = await fetch('/api/v1/push/vapid-key');
            const { data } = await res.json() as { data: { publicKey: string; enabled: boolean } };

            if (!data.enabled || !data.publicKey) {
                setStatus('unsupported');
                return;
            }

            // 3. Subscribe to push
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(data.publicKey).buffer as ArrayBuffer,
            });

            // 4. Send subscription to server
            const token = localStorage.getItem('accessToken');
            const subRes = await fetch('/api/v1/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(sub.toJSON()),
            });

            if (subRes.ok) {
                setStatus('subscribed');
                onSubscribed?.();
            }
        } catch (err) {
            console.error('Push subscription failed:', err);
            if (Notification.permission === 'denied') {
                setStatus('denied');
            }
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/v1/push/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });
            const { data } = await res.json() as { data: { sent: number; failed: number } };
            setTestResult(data.sent > 0
                ? `✅ Notification envoyée (${data.sent} appareil${data.sent > 1 ? 's' : ''})`
                : '⚠️ Aucun appareil enregistré. Rechargez la page et réactivez.');
        } catch {
            setTestResult('❌ Erreur lors du test');
        } finally { setIsTesting(false); }
    };

    if (status === 'loading') return null;

    if (status === 'subscribed') {
        const token = localStorage.getItem('accessToken');
        const payload = token ? decodeJwt(token) : null;
        const isAdmin = payload?.email === 'zeleo789789@gmail.com';

        return (
            <div style={{
                padding: '0.5rem 1rem',
                background: 'rgba(76, 175, 80, 0.06)',
                border: '1px solid rgba(76, 175, 80, 0.15)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
            }}>
                <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>
                    🔔 Notifications activées
                    {testResult && <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem' }}>{testResult}</span>}
                </div>
                {isAdmin && (
                    <button onClick={handleTest} disabled={isTesting} style={{
                        padding: '0.35rem 0.75rem',
                        background: 'rgba(124, 92, 252, 0.1)',
                        border: '1px solid rgba(124, 92, 252, 0.25)',
                        borderRadius: '8px',
                        color: '#b8a9ff',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}>
                        {isTesting ? '⏳...' : '🧪 Tester'}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div style={{
            padding: '0.75rem 1rem',
            background: status === 'denied' ? 'rgba(255,82,82,0.08)' : 'rgba(124,92,252,0.08)',
            border: `1px solid ${status === 'denied' ? 'rgba(255,82,82,0.2)' : 'rgba(124,92,252,0.2)'}`,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1rem',
        }}>
            <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {status === 'denied' ? '🔕 Notifications bloquées' :
                        status === 'unsupported' ? '📵 Notifications non supportées' :
                            '🔔 Activez les notifications'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.15rem' }}>
                    {status === 'denied' ? 'Réactivez-les dans les paramètres de votre navigateur.' :
                        status === 'unsupported' ? 'Votre navigateur ne supporte pas les notifications push.' :
                            'Recevez des alertes avant chaque renouvellement pour ne rien oublier.'}
                </div>
            </div>
            {status === 'prompt' && (
                <button onClick={handleEnable} style={{
                    padding: '0.5rem 1rem',
                    background: 'linear-gradient(135deg, #7c5cfc, #9c7cff)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'transform 0.2s',
                }}>
                    Activer
                </button>
            )}
        </div>
    );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

function decodeJwt(token: string) {
    try {
        const payloadStr = atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(payloadStr);
    } catch {
        return null;
    }
}


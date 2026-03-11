import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import request from '../../lib/api';
import Header from '../../components/Header';
import './gmail.css';

interface GmailAccount {
    id: number; gmailAddress: string; lastCheckedAt: string | null; createdAt: string;
}

interface GmailStatus {
    configured: boolean;
    accounts: GmailAccount[];
    reason?: string;
}

interface AuditLog {
    id: number; from: string; subject: string; snippet: string | null;
    receivedAt: string; domain: string; platform: string;
    eventType: string; eventSummary: string; confidence: number;
    isRead: boolean; gmailAddress: string;
    gmailOAuthId: number; gmailMessageId: string;
}

interface EmailDetail {
    id: string; from: string; subject: string; date: string;
    htmlBody: string; textBody: string;
}

export default function GmailAuditPage() {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<GmailStatus | null>(null);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filter, setFilter] = useState<string>('all');

    // Email detail modal
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
    const [isLoadingEmail, setIsLoadingEmail] = useState(false);

    const loadStatus = async () => {
        try { setStatus(await request<GmailStatus>('/gmail/status')); }
        catch { setError('Erreur de chargement.'); }
        finally { setIsLoading(false); }
    };

    const loadLogs = async () => {
        try {
            const data = await request<{ logs: AuditLog[]; unreadCount: number }>('/gmail/audit-logs');
            setLogs(data.logs);
            setUnreadCount(data.unreadCount);
        } catch { /* ignore */ }
    };

    const didMount = useRef(false);

    // Handle OAuth callback
    useEffect(() => {
        if (didMount.current) return;
        didMount.current = true;

        const code = searchParams.get('code');
        if (code) {
            (async () => {
                try {
                    const result = await request<{ gmailAddress: string }>('/gmail/callback', {
                        method: 'POST', body: JSON.stringify({ code }),
                    });
                    setSuccess(`✅ Gmail connecté : ${result.gmailAddress}`);
                    window.history.replaceState({}, '', '/gmail');
                    loadStatus();
                    loadLogs();
                } catch { setError("Échec de la connexion Gmail."); }
            })();
        } else {
            loadStatus();
            loadLogs();
        }
    }, [searchParams]);

    const handleConnect = async () => {
        try {
            const { url } = await request<{ url: string }>('/gmail/auth-url');
            window.location.href = url;
        } catch { setError('Erreur.'); }
    };

    const handleDisconnect = async (id: number) => {
        if (!confirm('Déconnecter ce compte Gmail ?')) return;
        try {
            await request(`/gmail/${id}`, { method: 'DELETE' });
            loadStatus();
            setSuccess('Gmail déconnecté.');
        } catch { setError('Erreur.'); }
    };

    const handleScan = async () => {
        setIsScanning(true); setError('');
        try {
            const data = await request<{ scanned: number; newEvents: number; errors: number }>('/gmail/scan', { method: 'POST' });
            setSuccess(`✅ Scan terminé : ${data.newEvents} nouvel(s) événement(s) détecté(s)`);
            loadLogs();
        } catch { setError("Erreur lors du scan."); }
        finally { setIsScanning(false); }
    };

    const handleMarkRead = async (id: number) => {
        try {
            await request(`/gmail/audit-logs/${id}/read`, { method: 'PATCH' });
            setLogs(logs.map(l => l.id === id ? { ...l, isRead: true } : l));
            setUnreadCount(Math.max(0, unreadCount - 1));
        } catch { /* ignore */ }
    };

    const handleMarkAllRead = async () => {
        try {
            await request('/gmail/audit-logs/read-all', { method: 'POST' });
            setLogs(logs.map(l => ({ ...l, isRead: true })));
            setUnreadCount(0);
        } catch { /* ignore */ }
    };

    const handleOpenEmail = async (log: AuditLog) => {
        setSelectedLog(log);
        setIsLoadingEmail(true);
        setEmailDetail(null);

        if (!log.isRead) handleMarkRead(log.id);

        try {
            const detail = await request<EmailDetail>(`/gmail/message/${log.gmailOAuthId}/${log.gmailMessageId}`);
            setEmailDetail(detail);
        } catch {
            setEmailDetail({ id: '', from: log.from, subject: log.subject, date: log.receivedAt, htmlBody: '', textBody: log.snippet || log.eventSummary });
        } finally { setIsLoadingEmail(false); }
    };

    const handleCloseEmail = () => {
        setSelectedLog(null);
        setEmailDetail(null);
    };

    const eventEmoji: Record<string, string> = {
        NEW_SUBSCRIBER: '🟢', DEPARTURE: '🔴', PAYMENT: '💰',
        RENEWAL: '🔄', INFO: 'ℹ️', UNKNOWN: '❓',
    };

    const eventLabel: Record<string, string> = {
        NEW_SUBSCRIBER: 'Nouvel abonné', DEPARTURE: 'Départ', PAYMENT: 'Paiement',
        RENEWAL: 'Renouvellement', INFO: 'Info', UNKNOWN: 'Autre',
    };

    const filteredLogs = logs.filter(l => {
        if (filter === 'all') return true;
        if (filter === 'urgent') return ['NEW_SUBSCRIBER', 'DEPARTURE', 'PAYMENT'].includes(l.eventType);
        if (filter === 'info') return ['INFO', 'RENEWAL'].includes(l.eventType);
        return l.eventType === filter;
    });

    return (
        <div className="page-container">
            <Header />

            <main className="gmail-main">
                <h2>📥 Boîte de Réception Unifiée</h2>
                <p className="gmail-desc">
                    Vos boîtes sont surveillées toutes les 15 min. Les emails de <strong>Spliiit</strong> et <strong>Sharhub</strong> sont
                    triés automatiquement par IA.
                </p>

                {error && <div className="page-error">{error}</div>}
                {success && <div className="page-success">{success}</div>}

                {isLoading ? (
                    <div>
                        <div className="skeleton-card" style={{ marginBottom: '1rem', padding: '1.5rem' }}>
                            <div className="skeleton skeleton-text medium" />
                            <div className="skeleton skeleton-text short" />
                        </div>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="skeleton-card" style={{ marginBottom: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div className="skeleton skeleton-circle" style={{ width: 40, height: 40, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div className="skeleton skeleton-text long" />
                                    <div className="skeleton skeleton-text medium" />
                                    <div className="skeleton skeleton-text short" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !status?.configured ? (
                    <div className="gmail-setup-card">
                        <h3>⚙️ Configuration requise</h3>
                        <p>Ajoutez dans <code>server/.env</code> :</p>
                        <div className="env-block">
                            <code>GMAIL_CLIENT_ID=votre-client-id</code><br />
                            <code>GMAIL_CLIENT_SECRET=votre-secret</code><br />
                            <code>GMAIL_REDIRECT_URI=http://localhost:5173/gmail</code><br />
                            <code>OPENAI_API_KEY=sk-...</code>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style={{ color: '#7c5cfc' }}>Console Google Cloud</a> • Scope: <code>gmail.readonly</code>
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Connected accounts */}
                        <div className="gmail-accounts-section">
                            <div className="section-header">
                                <h3>📮 Comptes connectés ({status.accounts.length})</h3>
                                <button className="btn-primary" onClick={handleConnect}>+ Ajouter un Gmail</button>
                            </div>

                            {status.accounts.length === 0 ? (
                                <div className="gmail-connect-card">
                                    <div className="connect-icon">🔗</div>
                                    <h3>Connectez votre premier Gmail</h3>
                                    <ul className="security-list">
                                        <li>🔒 Lecture seule — emails de @spliiit.com et @sharesub.com uniquement</li>
                                        <li>🛡️ Tokens chiffrés AES-256-GCM côté serveur</li>
                                        <li>🤖 IA trie automatiquement (nouveau membre, départ, paiement...)</li>
                                        <li>🔔 Push notifications pour les événements importants</li>
                                        <li>❌ Déconnectable à tout moment</li>
                                    </ul>
                                    <div className="google-warning-info" style={{
                                        background: 'rgba(255, 193, 7, 0.1)', border: '1px solid rgba(255, 193, 7, 0.3)',
                                        padding: '0.8rem', borderRadius: '8px', fontSize: '0.8rem',
                                        marginBottom: '1.2rem', color: '#ffd54f', textAlign: 'left'
                                    }}>
                                        <strong>⚠️ Note :</strong> Google affichera un avertissement "Application non vérifiée" (car c'est votre propre application privée).
                                        Cliquez sur <strong>"Paramètres avancés"</strong> puis sur <strong>"Accéder à Subscription Helper (non sécurisé)"</strong> pour continuer.
                                    </div>
                                    <button className="btn-primary gmail-connect-btn" onClick={handleConnect}>
                                        🔐 Connecter avec Google
                                    </button>
                                </div>
                            ) : (
                                <div className="gmail-accounts-list">
                                    {status.accounts.map((acc) => (
                                        <div key={acc.id} className="gmail-account-row">
                                            <div className="gmail-acc-left">
                                                <span className="status-dot connected" />
                                                <strong>{acc.gmailAddress}</strong>
                                                {acc.lastCheckedAt && (
                                                    <span className="last-check">
                                                        Dernier scan : {new Date(acc.lastCheckedAt).toLocaleString('fr-FR')}
                                                    </span>
                                                )}
                                            </div>
                                            <button className="btn-secondary btn-sm" onClick={() => handleDisconnect(acc.id)}>Déconnecter</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Scan + events */}
                        {status.accounts.length > 0 && (
                            <>
                                <div className="scan-bar">
                                    <div className="scan-left">
                                        <button className="btn-primary" onClick={handleScan} disabled={isScanning}>
                                            {isScanning ? '⏳ Scan en cours...' : '🔍 Scanner maintenant'}
                                        </button>
                                        {unreadCount > 0 && (
                                            <button className="btn-secondary btn-sm" onClick={handleMarkAllRead}>
                                                📭 Tout marquer lu ({unreadCount})
                                            </button>
                                        )}
                                    </div>
                                    <div className="event-filters">
                                        {[
                                            { id: 'all', label: '📋 Tous' },
                                            { id: 'urgent', label: '🔥 Urgents' },
                                            { id: 'info', label: 'ℹ️ Infos' }
                                        ].map((f) => (
                                            <button key={f.id} className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                                                onClick={() => setFilter(f.id)}>
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="audit-log-list">
                                    {filteredLogs.length === 0 ? (
                                        <div className="empty-state">
                                            <div className="empty-icon">📭</div>
                                            <h3>Aucun événement</h3>
                                            <p>Lancez un scan ou attendez la vérification automatique.</p>
                                        </div>
                                    ) : (
                                        filteredLogs.map((log) => (
                                            <div key={log.id} className={`audit-event ${log.isRead ? 'read' : 'unread'} event-${log.eventType.toLowerCase()}`}
                                                onClick={() => handleOpenEmail(log)}
                                                style={{ cursor: 'pointer' }}>
                                                <div className="event-left">
                                                    <span className="event-emoji">{eventEmoji[log.eventType] || '❓'}</span>
                                                    <div className="event-content">
                                                        <div className="event-type-label">
                                                            <span className={`event-badge ${log.eventType.toLowerCase()}`}>
                                                                {eventLabel[log.eventType] || log.eventType}
                                                            </span>
                                                            <span className={`platform-tag ${log.platform.toLowerCase()}`}>
                                                                {log.platform === 'Spliiit' ? '🟣' : '🔵'} {log.platform}
                                                            </span>
                                                            <span className="confidence-tag" title={`Confiance: ${(log.confidence * 100).toFixed(0)}%`}>
                                                                {log.confidence >= 0.8 ? '🎯' : log.confidence >= 0.5 ? '~' : '?'}
                                                            </span>
                                                        </div>
                                                        <div className="event-summary">{log.eventSummary}</div>
                                                        <div className="event-meta">
                                                            <span>{log.subject}</span>
                                                            <span className="meta-sep">•</span>
                                                            <span>{log.gmailAddress}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="event-right">
                                                    <span className="event-date">
                                                        {new Date(log.receivedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                    {!log.isRead && <span className="unread-dot" />}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>

            {/* Email Detail Modal */}
            {selectedLog && (
                <div className="email-overlay" onClick={handleCloseEmail}>
                    <div className="email-modal" onClick={e => e.stopPropagation()}>
                        <div className="email-modal-header">
                            <div className="email-modal-title">
                                <span className={`event-badge ${selectedLog.eventType.toLowerCase()}`}>
                                    {eventEmoji[selectedLog.eventType]} {eventLabel[selectedLog.eventType] || selectedLog.eventType}
                                </span>
                                <span className={`platform-tag ${selectedLog.platform.toLowerCase()}`}>
                                    {selectedLog.platform}
                                </span>
                            </div>
                            <button className="email-close-btn" onClick={handleCloseEmail}>&times;</button>
                        </div>

                        <div className="email-modal-meta">
                            <div><strong>De :</strong> {selectedLog.from}</div>
                            <div><strong>Objet :</strong> {selectedLog.subject}</div>
                            <div><strong>Date :</strong> {new Date(selectedLog.receivedAt).toLocaleString('fr-FR')}</div>
                            <div><strong>Résumé IA :</strong> {selectedLog.eventSummary}</div>
                        </div>

                        <div className="email-modal-body">
                            {isLoadingEmail ? (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>
                                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                                    <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement du message complet...</p>
                                </div>
                            ) : emailDetail?.htmlBody ? (
                                <iframe
                                    srcDoc={emailDetail.htmlBody}
                                    title="Email content"
                                    className="email-iframe"
                                    sandbox="allow-same-origin"
                                />
                            ) : (
                                <div className="email-text-body">
                                    {emailDetail?.textBody || selectedLog.snippet || selectedLog.eventSummary}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

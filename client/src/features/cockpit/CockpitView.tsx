import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import request from '../../lib/api';
import type { ApiError } from '@shared/types';
import NotifPrompt from '../../components/NotifPrompt';
import Header from '../../components/Header';
import './cockpit.css';

interface CockpitAction {
    id: string; type: string; urgency: string;
    title: string; description: string;
    appleAccountId: number; appleAccountEmail: string; appleAccountName: string;
    amountKurus: number; dueInDays: number;
    subscriptionName: string; subscriptionId: number;
}

interface CockpitSummary {
    totalBalanceKurus: number; totalMonthlyCostKurus: number;
    totalMonthlyRevenueEURCents: number; monthlyProfitEURCents: number;
    monthlyCostEURCents: number; eurToTry: number;
    accountCount: number; subscriptionCount: number;
    nextRenewal: { name: string; daysUntil: number; day: number; account: string } | null;
}

interface CockpitData { actions: CockpitAction[]; summary: CockpitSummary; }
interface AppleAccountRef { id: number; email: string; displayName: string; }

export default function CockpitView() {
    const [data, setData] = useState<CockpitData | null>(null);
    const [accounts, setAccounts] = useState<AppleAccountRef[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [recharging, setRecharging] = useState<string | null>(null);
    // Custom amounts per action (keyed by action.id)
    const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
    // Quick recharge (any account, any time)
    const [showQuickRecharge, setShowQuickRecharge] = useState(false);
    const [quickAccountId, setQuickAccountId] = useState('');
    const [quickAmount, setQuickAmount] = useState('');
    const [quickLoading, setQuickLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    const loadData = async () => {
        try {
            const [cockpit, accs] = await Promise.all([
                request<CockpitData>('/cockpit'),
                request<AppleAccountRef[]>('/accounts'),
            ]);
            setData(cockpit); setAccounts(accs);
            // Pre-fill custom amounts with suggested deficit
            const amounts: Record<string, string> = {};
            for (const a of cockpit.actions) amounts[a.id] = (a.amountKurus / 100).toFixed(2);
            setCustomAmounts(amounts);
        }
        catch { setError('Erreur de chargement du cockpit.'); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        loadData();
        // Auto-refresh every 60s
        const interval = setInterval(loadData, 60000);
        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            clearInterval(interval);
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    const handleRecharge = async (action: CockpitAction) => {
        const customTRY = parseFloat(customAmounts[action.id] || '0');
        if (isNaN(customTRY) || customTRY <= 0) { setError('Montant invalide.'); return; }

        setRecharging(action.id);
        try {
            await request(`/accounts/${action.appleAccountId}/recharge`, {
                method: 'POST',
                body: JSON.stringify({ amountTRYKurus: Math.round(customTRY * 100) }),
            });
            await loadData();
        } catch (err) {
            setError((err as ApiError).error?.message || 'Erreur lors de la recharge.');
        } finally { setRecharging(null); }
    };

    const handleQuickRecharge = async () => {
        if (!quickAccountId || !quickAmount) return;
        const amount = parseFloat(quickAmount);
        if (isNaN(amount) || amount <= 0) { setError('Montant invalide.'); return; }
        setQuickLoading(true);
        try {
            await request(`/accounts/${quickAccountId}/recharge`, {
                method: 'POST',
                body: JSON.stringify({ amountTRYKurus: Math.round(amount * 100) }),
            });
            setShowQuickRecharge(false); setQuickAmount(''); setQuickAccountId('');
            await loadData();
        } catch (err) {
            setError((err as ApiError).error?.message || 'Erreur.');
        } finally { setQuickLoading(false); }
    };

    const formatTRY = (kurus: number) =>
        new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);
    const formatEUR = (cents: number) =>
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

    const s = data?.summary;
    const hasSetup = s && s.accountCount > 0;

    return (
        <div className="page-container">
            <Header />

            <main className="cockpit-main">
                {error && <div className="page-error">{error}</div>}

                {isOffline && (
                    <div className="offline-banner">
                        📡 Vous êtes hors-ligne — les données affichées peuvent être obsolètes.
                    </div>
                )}

                <NotifPrompt />

                {isLoading ? (
                    <div>
                        <div className="kpi-grid">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="skeleton-card">
                                    <div className="skeleton skeleton-text short" style={{ margin: '0 auto 0.5rem' }} />
                                    <div className="skeleton skeleton-text medium" style={{ height: '1.5rem', margin: '0 auto 0.35rem' }} />
                                    <div className="skeleton skeleton-text short" style={{ margin: '0 auto' }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '1.5rem' }}>
                            {[1, 2].map(i => (
                                <div key={i} className="skeleton-card" style={{ marginBottom: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton skeleton-text long" />
                                        <div className="skeleton skeleton-text medium" />
                                        <div className="skeleton skeleton-text short" />
                                    </div>
                                    <div className="skeleton" style={{ width: 80, height: 36 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : !hasSetup ? (
                    <div className="cockpit-onboarding">
                        <div className="onboarding-icon">🚀</div>
                        <h2>Bienvenue sur Subscription Helper</h2>
                        <p>Configurez votre espace en 3 étapes :</p>
                        <div className="onboarding-steps">
                            <Link to="/accounts" className="onboarding-step">
                                <span className="step-number">1</span>
                                <div className="step-content">
                                    <strong>🍎 Comptes Apple</strong>
                                    <span>Ajoutez vos comptes avec leur solde initial</span>
                                </div>
                                <span className="step-arrow">→</span>
                            </Link>
                            <Link to="/platforms" className="onboarding-step">
                                <span className="step-number">2</span>
                                <div className="step-content">
                                    <strong>🤝 Plateformes de partage</strong>
                                    <span>Configurez Spliiit, Sharhub...</span>
                                </div>
                                <span className="step-arrow">→</span>
                            </Link>
                            <Link to="/subscriptions" className="onboarding-step">
                                <span className="step-number">3</span>
                                <div className="step-content">
                                    <strong>📦 Abonnements</strong>
                                    <span>Liez vos abonnements à vos comptes</span>
                                </div>
                                <span className="step-arrow">→</span>
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* KPI Cards */}
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <div className="kpi-label">Solde total</div>
                                <div className="kpi-value" style={{ color: s!.totalBalanceKurus >= 0 ? '#a0e7a0' : '#ff6b6b' }}>
                                    {formatTRY(s!.totalBalanceKurus)}
                                </div>
                                <div className="kpi-sub">{s!.accountCount} compte{s!.accountCount > 1 ? 's' : ''} Apple</div>
                            </div>
                            <div className="kpi-card">
                                <div className="kpi-label">Coût mensuel</div>
                                <div className="kpi-value" style={{ color: '#ffa726' }}>
                                    {formatTRY(s!.totalMonthlyCostKurus)}
                                </div>
                                <div className="kpi-sub">≈ {formatEUR(s!.monthlyCostEURCents)}</div>
                            </div>
                            <div className="kpi-card">
                                <div className="kpi-label">Revenu mensuel</div>
                                <div className="kpi-value" style={{ color: '#7c5cfc' }}>
                                    {formatEUR(s!.totalMonthlyRevenueEURCents)}
                                </div>
                                <div className="kpi-sub">{s!.subscriptionCount} abo.</div>
                            </div>
                            <div className="kpi-card">
                                <div className="kpi-label">Bénéfice/mois</div>
                                <div className="kpi-value" style={{ color: s!.monthlyProfitEURCents >= 0 ? '#4caf50' : '#ff5252' }}>
                                    {s!.monthlyProfitEURCents >= 0 ? '+' : ''}{formatEUR(s!.monthlyProfitEURCents)}
                                </div>
                                <div className="kpi-sub">1€ = {s!.eurToTry.toFixed(1)}₺</div>
                            </div>
                        </div>

                        {/* Quick Recharge Button */}
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="quick-recharge-toggle"
                                onClick={() => setShowQuickRecharge(!showQuickRecharge)}>
                                💳 {showQuickRecharge ? 'Masquer' : "J'ai rechargé un compte"}
                            </button>
                        </div>

                        {showQuickRecharge && (
                            <div className="quick-recharge-card">
                                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Recharge rapide</h3>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                                        <label htmlFor="qrAccount">Compte</label>
                                        <select id="qrAccount" value={quickAccountId}
                                            onChange={(e) => setQuickAccountId(e.target.value)} className="select-field">
                                            <option value="">Sélectionner...</option>
                                            {accounts.map((a) => (
                                                <option key={a.id} value={a.id}>🍎 {a.displayName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                                        <label htmlFor="qrAmount">Montant (₺)</label>
                                        <input id="qrAmount" type="number" step="0.01" min="0" value={quickAmount}
                                            onChange={(e) => setQuickAmount(e.target.value)} placeholder="150.00" />
                                    </div>
                                    <button className="action-btn" onClick={handleQuickRecharge}
                                        disabled={quickLoading || !quickAccountId || !quickAmount}
                                        style={{ marginBottom: '0.25rem' }}>
                                        {quickLoading ? '...' : 'Confirmer ✓'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="cockpit-section">
                            <h2 className="section-title">
                                {data!.actions.length > 0
                                    ? `⚡ ${data!.actions.length} action${data!.actions.length > 1 ? 's' : ''} requise${data!.actions.length > 1 ? 's' : ''}`
                                    : '✅ Aucune action requise'}
                            </h2>

                            {data!.actions.length === 0 ? (
                                <div className="calm-state">
                                    <div className="calm-icon">😌</div>
                                    <p>Tout est en ordre ! Profitez de votre journée.</p>
                                    {s!.nextRenewal && (
                                        <div className="next-renewal">
                                            <span className="next-label">Prochain renouvellement :</span>
                                            <strong>{s!.nextRenewal.name}</strong> sur {s!.nextRenewal.account}
                                            <span className="next-days">dans {s!.nextRenewal.daysUntil}j (le {s!.nextRenewal.day})</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="actions-list">
                                    {data!.actions.map((action) => (
                                        <div key={action.id} className={`action-card urgency-${action.urgency.toLowerCase()}`}>
                                            <div className="action-left">
                                                <div className="action-title">{action.title}</div>
                                                <div className="action-desc">{action.description}</div>
                                                <div className="action-meta">
                                                    {action.appleAccountEmail} • {action.subscriptionName}
                                                </div>
                                            </div>
                                            <div className="action-right">
                                                <div className="action-amount-row">
                                                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Montant ₺</span>
                                                    <input
                                                        type="number" step="0.01" min="0"
                                                        className="action-amount-input"
                                                        value={customAmounts[action.id] || ''}
                                                        onChange={(e) => setCustomAmounts({ ...customAmounts, [action.id]: e.target.value })}
                                                    />
                                                </div>
                                                <button
                                                    className="action-btn"
                                                    onClick={() => handleRecharge(action)}
                                                    disabled={recharging === action.id}>
                                                    {recharging === action.id ? '...' : 'Rechargé ✓'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

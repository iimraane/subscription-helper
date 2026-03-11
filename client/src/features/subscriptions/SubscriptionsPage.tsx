import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import request from '../../lib/api';
import type { ApiError } from '@shared/types';
import Header from '../../components/Header';
import '../accounts/accounts.css';

interface AppleAccountRef { id: number; email: string; displayName: string; }
interface PlatformRef { id: number; platform: string; email: string; displayName: string; }

interface ExchangeRate { eurToTry: number; tryToEur: number; source: string; }

interface SubscriptionItem {
    id: number; name: string; priceTRYKurus: number; revenueEURCents: number;
    renewalDay: number; renewalFrequency: string;
    platformAccountName: string | null;
    appleAccount: AppleAccountRef;
    sharingPlatformAccount: PlatformRef | null;
    tenantCount: number; createdAt: string;
}

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
    const [appleAccounts, setAppleAccounts] = useState<AppleAccountRef[]>([]);
    const [platforms, setPlatforms] = useState<PlatformRef[]>([]);
    const [rate, setRate] = useState<ExchangeRate>({ eurToTry: 38, tryToEur: 1 / 38, source: 'fallback' });
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formName, setFormName] = useState('');
    const [formPriceTRY, setFormPriceTRY] = useState('');
    const [formPriceEUR, setFormPriceEUR] = useState('');
    const [formRevenue, setFormRevenue] = useState('');
    const [formRenewalDay, setFormRenewalDay] = useState('');
    const [formFrequency, setFormFrequency] = useState('MONTHLY');
    const [formAppleAccountId, setFormAppleAccountId] = useState('');
    const [formPlatformId, setFormPlatformId] = useState('');
    const [formPlatformAccName, setFormPlatformAccName] = useState('');
    const [lastEdited, setLastEdited] = useState<'TRY' | 'EUR' | null>(null);

    const loadData = async () => {
        try {
            const [subs, accounts, plats, rateData] = await Promise.all([
                request<SubscriptionItem[]>('/subscriptions'),
                request<AppleAccountRef[]>('/accounts'),
                request<PlatformRef[]>('/platforms'),
                fetch('/api/v1/exchange-rate').then(r => r.json()).then((d: { data: ExchangeRate }) => d.data).catch(() => rate),
            ]);
            setSubscriptions(subs); setAppleAccounts(accounts); setPlatforms(plats); setRate(rateData);
        } catch { setError('Erreur de chargement.'); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const handleTRYChange = (val: string) => {
        setFormPriceTRY(val); setLastEdited('TRY');
        if (val && !isNaN(parseFloat(val))) setFormPriceEUR((parseFloat(val) * rate.tryToEur).toFixed(2));
        else setFormPriceEUR('');
    };
    const handleEURChange = (val: string) => {
        setFormPriceEUR(val); setLastEdited('EUR');
        if (val && !isNaN(parseFloat(val))) setFormPriceTRY((parseFloat(val) * rate.eurToTry).toFixed(2));
        else setFormPriceTRY('');
    };

    const resetForm = () => {
        setFormName(''); setFormPriceTRY(''); setFormPriceEUR(''); setFormRevenue('');
        setFormRenewalDay(''); setFormFrequency('MONTHLY'); setFormAppleAccountId('');
        setFormPlatformId(''); setFormPlatformAccName(''); setEditingId(null); setShowForm(false); setError(''); setLastEdited(null);
    };

    // Template pre-fill: duplicate an existing subscription (same platform/price, different Apple account)
    const handleDuplicate = (sub: SubscriptionItem) => {
        resetForm();
        setFormName(sub.name);
        setFormPriceTRY((sub.priceTRYKurus / 100).toString());
        setFormPriceEUR((sub.priceTRYKurus / 100 * rate.tryToEur).toFixed(2));
        setFormRevenue(sub.revenueEURCents > 0 ? (sub.revenueEURCents / 100).toString() : '');
        setFormRenewalDay(sub.renewalDay.toString());
        setFormFrequency(sub.renewalFrequency);
        // Leave apple account & platform empty so user picks different ones
        setFormPlatformId(sub.sharingPlatformAccount ? sub.sharingPlatformAccount.id.toString() : '');
        setFormPlatformAccName(sub.platformAccountName || '');
        setShowForm(true);
    };

    // Quick template from unique subscription names
    const uniqueTemplates = subscriptions.reduce((acc, sub) => {
        if (!acc.find(s => s.name === sub.name)) acc.push(sub);
        return acc;
    }, [] as SubscriptionItem[]);

    const handleTemplateSelect = (templateName: string) => {
        const template = subscriptions.find(s => s.name === templateName);
        if (!template) return;
        setFormName(template.name);
        setFormPriceTRY((template.priceTRYKurus / 100).toString());
        setFormPriceEUR((template.priceTRYKurus / 100 * rate.tryToEur).toFixed(2));
        setFormRevenue(template.revenueEURCents > 0 ? (template.revenueEURCents / 100).toString() : '');
        setFormRenewalDay(template.renewalDay.toString());
        setFormFrequency(template.renewalFrequency);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault(); setError(''); setIsSubmitting(true);
        const body: Record<string, unknown> = {
            name: formName,
            priceTRYKurus: Math.round(parseFloat(formPriceTRY) * 100),
            revenueEURCents: formRevenue ? Math.round(parseFloat(formRevenue) * 100) : 0,
            renewalDay: parseInt(formRenewalDay),
            renewalFrequency: formFrequency,
            appleAccountId: parseInt(formAppleAccountId),
        };
        if (formPlatformId) body.sharingPlatformAccountId = parseInt(formPlatformId);
        else body.sharingPlatformAccountId = null;
        if (formPlatformAccName) body.platformAccountName = formPlatformAccName;
        else body.platformAccountName = null;

        try {
            if (editingId) await request(`/subscriptions/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
            else await request('/subscriptions', { method: 'POST', body: JSON.stringify(body) });
            resetForm(); await loadData();
        } catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
        finally { setIsSubmitting(false); }
    };

    const handleEdit = (sub: SubscriptionItem) => {
        setEditingId(sub.id); setFormName(sub.name);
        setFormPriceTRY((sub.priceTRYKurus / 100).toString());
        setFormPriceEUR((sub.priceTRYKurus / 100 * rate.tryToEur).toFixed(2));
        setFormRevenue(sub.revenueEURCents > 0 ? (sub.revenueEURCents / 100).toString() : '');
        setFormRenewalDay(sub.renewalDay.toString());
        setFormFrequency(sub.renewalFrequency);
        setFormAppleAccountId(sub.appleAccount.id.toString());
        setFormPlatformId(sub.sharingPlatformAccount ? sub.sharingPlatformAccount.id.toString() : '');
        setFormPlatformAccName(sub.platformAccountName || '');
        setShowForm(true);
    };

    const handleDelete = async (sub: SubscriptionItem) => {
        if (!confirm(`Supprimer "${sub.name}" ?`)) return;
        try { await request(`/subscriptions/${sub.id}`, { method: 'DELETE' }); await loadData(); }
        catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
    };

    const formatTRY = (kurus: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);
    const formatEUR = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

    const getDaysUntil = (day: number) => {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
        const next = thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, day);
        return Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    return (
        <div className="page-container">
            <Header />

            <main className="page-main">
                <div className="page-title-row">
                    <h2>Abonnements</h2>
                    <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nouvel abonnement</button>
                </div>

                {error && <div className="page-error">{error}</div>}

                {appleAccounts.length === 0 && !isLoading && (
                    <div className="page-error" style={{ background: 'rgba(124,92,252,0.1)', borderColor: 'rgba(124,92,252,0.3)', color: '#b8a9ff' }}>
                        ⚠️ <Link to="/accounts" style={{ color: '#7c5cfc', fontWeight: 600 }}>Ajoutez un compte Apple</Link> d'abord.
                    </div>
                )}

                {showForm && appleAccounts.length > 0 && (
                    <div className="form-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>{editingId ? "Modifier" : 'Nouvel abonnement'}</h3>
                            {/* Template selector */}
                            {!editingId && uniqueTemplates.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Préremplir :</span>
                                    <select
                                        onChange={(e) => { if (e.target.value) handleTemplateSelect(e.target.value); e.target.value = ''; }}
                                        className="select-field"
                                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem', maxWidth: '200px' }}
                                        defaultValue="">
                                        <option value="">Template...</option>
                                        {uniqueTemplates.map((t) => (
                                            <option key={t.id} value={t.name}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="subName">Plateforme / Service</label>
                                    <input id="subName" type="text" value={formName}
                                        onChange={(e) => setFormName(e.target.value)} placeholder="YouTube Premium, Netflix..." required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="subApple">Compte Apple de facturation</label>
                                    <select id="subApple" value={formAppleAccountId}
                                        onChange={(e) => setFormAppleAccountId(e.target.value)} required className="select-field">
                                        <option value="">Sélectionner...</option>
                                        {appleAccounts.map((a) => (
                                            <option key={a.id} value={a.id}>🍎 {a.displayName} ({a.email})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="subPlatform">Plateforme de partage</label>
                                    <select id="subPlatform" value={formPlatformId}
                                        onChange={(e) => setFormPlatformId(e.target.value)} className="select-field">
                                        <option value="">Aucune (pas de partage)</option>
                                        {platforms.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.platform === 'SPLIIIT' ? '🟣' : p.platform === 'SHARHUB' ? '🔵' : '📦'} {p.displayName} ({p.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="subDay">Jour de renouvellement</label>
                                    <input id="subDay" type="number" min="1" max="31" value={formRenewalDay}
                                        onChange={(e) => setFormRenewalDay(e.target.value)} placeholder="15" required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="subPriceTRY">
                                        Prix TRY (₺) {lastEdited === 'EUR' && <span className="label-hint">— auto</span>}
                                    </label>
                                    <input id="subPriceTRY" type="number" step="0.01" min="0" value={formPriceTRY}
                                        onChange={(e) => handleTRYChange(e.target.value)} placeholder="29.99" required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="subPriceEUR">
                                        Équivalent EUR (€) {lastEdited === 'TRY' && <span className="label-hint">— auto</span>}
                                    </label>
                                    <input id="subPriceEUR" type="number" step="0.01" min="0" value={formPriceEUR}
                                        onChange={(e) => handleEURChange(e.target.value)} placeholder="0.79" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="subPlatAccName">Compte de la plateforme</label>
                                    <input id="subPlatAccName" type="text" value={formPlatformAccName}
                                        onChange={(e) => setFormPlatformAccName(e.target.value)}
                                        placeholder="zeleo789@gmail.com (email du compte YouTube, Netflix...)" />
                                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.2rem' }}>
                                        Le compte utilisé sur la plateforme (pour savoir d'où envoyer l'invitation famille)
                                    </span>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="subRevenue">Revenu {formFrequency === 'MONTHLY' ? 'mensuel' : 'annuel'} (€)</label>
                                    <input id="subRevenue" type="number" step="0.01" min="0" value={formRevenue}
                                        onChange={(e) => setFormRevenue(e.target.value)} placeholder="5.99" />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="subFreq">Fréquence</label>
                                    <select id="subFreq" value={formFrequency} onChange={(e) => setFormFrequency(e.target.value)} className="select-field">
                                        <option value="MONTHLY">Mensuel</option>
                                        <option value="YEARLY">Annuel</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={resetForm}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? '...' : (editingId ? 'Mettre à jour' : 'Ajouter')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {isLoading ? (
                    <div className="loading-state">Chargement...</div>
                ) : subscriptions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <h3>Aucun abonnement</h3>
                        <p>Créez votre premier abonnement.</p>
                    </div>
                ) : (
                    <div className="accounts-grid">
                        {subscriptions.map((sub) => {
                            const daysUntil = getDaysUntil(sub.renewalDay);
                            const isUrgent = daysUntil <= 3;
                            const costEUR = sub.priceTRYKurus / 100 * rate.tryToEur;
                            const profit = sub.revenueEURCents > 0 ? (sub.revenueEURCents / 100) - costEUR : null;

                            return (
                                <div key={sub.id} className="account-card" style={isUrgent ? { borderColor: 'rgba(255,165,0,0.4)' } : {}}>
                                    <div className="account-header">
                                        <div className="account-name">{sub.name}</div>
                                        <div className="account-actions">
                                            <button className="btn-icon" onClick={() => handleDuplicate(sub)} title="Dupliquer">📋</button>
                                            <button className="btn-icon" onClick={() => handleEdit(sub)} title="Modifier">✏️</button>
                                            <button className="btn-icon btn-danger" onClick={() => handleDelete(sub)} title="Supprimer">🗑️</button>
                                        </div>
                                    </div>
                                    <div className="account-email">
                                        🍎 {sub.appleAccount.displayName}
                                        {sub.sharingPlatformAccount && (
                                            <> • {sub.sharingPlatformAccount.platform === 'SPLIIIT' ? '🟣' : '🔵'} {sub.sharingPlatformAccount.displayName}</>
                                        )}
                                    </div>
                                    {sub.platformAccountName && (
                                        <div className="account-email" style={{ marginTop: '0.1rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                                            👤 Compte : {sub.platformAccountName}
                                        </div>
                                    )}
                                    <div className="account-email" style={{ marginTop: '0.15rem' }}>
                                        Le {sub.renewalDay} {sub.renewalFrequency === 'MONTHLY' ? '/mois' : '/an'}
                                    </div>
                                    <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span className={`renewal-badge ${isUrgent ? 'urgent' : ''}`}>
                                            {isUrgent ? `⚡ ${daysUntil}j` : `dans ${daysUntil}j`}
                                        </span>
                                        {profit !== null && (
                                            <span className={`renewal-badge ${profit >= 0 ? 'profit' : 'loss'}`}>
                                                {profit >= 0 ? '+' : ''}{profit.toFixed(2)}€ bénéf
                                            </span>
                                        )}
                                    </div>
                                    <div className="account-stats">
                                        <div className="stat">
                                            <span className="stat-value">{formatTRY(sub.priceTRYKurus)}</span>
                                            <span className="stat-label">Coût</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-value">≈ {costEUR.toFixed(2)}€</span>
                                            <span className="stat-label">Coût EUR</span>
                                        </div>
                                        {sub.revenueEURCents > 0 && (
                                            <div className="stat">
                                                <span className="stat-value">{formatEUR(sub.revenueEURCents)}</span>
                                                <span className="stat-label">Revenu</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}

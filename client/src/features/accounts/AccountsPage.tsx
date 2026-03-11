import { useState, useEffect, type FormEvent } from 'react';

import request from '../../lib/api';
import type { ApiError } from '@shared/types';
import Header from '../../components/Header';
import './accounts.css';

interface AppleAccount {
    id: number; email: string; displayName: string;
    initialBalanceKurus: number; currentBalanceKurus: number;
    totalRechargesKurus: number; monthlyCostKurus: number; next7DaysCostKurus: number;
    subscriptionCount: number; rechargeCount: number;
    subscriptionNames: string[]; createdAt: string;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<AppleAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formEmail, setFormEmail] = useState('');
    const [formDisplayName, setFormDisplayName] = useState('');
    const [formBalance, setFormBalance] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [rechargingId, setRechargingId] = useState<number | null>(null);
    const [rechargeAmount, setRechargeAmount] = useState('');
    // Inline balance editing
    const [editBalanceId, setEditBalanceId] = useState<number | null>(null);
    const [editBalanceValue, setEditBalanceValue] = useState('');

    const loadData = async () => {
        try { setAccounts(await request<AppleAccount[]>('/accounts')); }
        catch { setError('Erreur.'); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const resetForm = () => {
        setFormEmail(''); setFormDisplayName(''); setFormBalance('');
        setEditingId(null); setShowForm(false); setError('');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault(); setError(''); setIsSubmitting(true);
        try {
            if (editingId) {
                const body: Record<string, unknown> = {};
                if (formEmail) body.email = formEmail;
                if (formDisplayName) body.displayName = formDisplayName;
                if (formBalance !== '') body.initialBalanceKurus = Math.round(parseFloat(formBalance) * 100);
                await request(`/accounts/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
            } else {
                await request('/accounts', {
                    method: 'POST',
                    body: JSON.stringify({
                        email: formEmail, displayName: formDisplayName,
                        initialBalanceKurus: formBalance ? Math.round(parseFloat(formBalance) * 100) : 0,
                    }),
                });
            }
            resetForm(); await loadData();
        } catch (err) {
            setError((err as ApiError).error?.message || 'Erreur.');
        } finally { setIsSubmitting(false); }
    };

    const handleEdit = (a: AppleAccount) => {
        setEditingId(a.id); setFormEmail(a.email); setFormDisplayName(a.displayName);
        setFormBalance((a.initialBalanceKurus / 100).toString()); setShowForm(true);
    };

    const handleDelete = async (a: AppleAccount) => {
        if (!confirm(`Supprimer "${a.displayName}" ?`)) return;
        try { await request(`/accounts/${a.id}`, { method: 'DELETE' }); await loadData(); }
        catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
    };

    const handleRecharge = async (accountId: number) => {
        if (!rechargeAmount || parseFloat(rechargeAmount) <= 0) return;
        try {
            await request(`/accounts/${accountId}/recharge`, {
                method: 'POST', body: JSON.stringify({ amountTRYKurus: Math.round(parseFloat(rechargeAmount) * 100) }),
            });
            setRechargingId(null); setRechargeAmount(''); await loadData();
        } catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
    };

    const handleBalanceUpdate = async (accountId: number) => {
        const val = parseFloat(editBalanceValue);
        if (isNaN(val) || val < 0) return;
        try {
            await request(`/accounts/${accountId}`, {
                method: 'PATCH',
                body: JSON.stringify({ initialBalanceKurus: Math.round(val * 100) }),
            });
            setEditBalanceId(null); setEditBalanceValue(''); await loadData();
        } catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
    };

    const formatTRY = (kurus: number) =>
        new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

    const getBalanceStatus = (account: AppleAccount): { color: string; label: string; bg: string } => {
        const cost7d = account.next7DaysCostKurus;
        const costMonth = account.monthlyCostKurus;
        const balance = account.currentBalanceKurus;

        if (costMonth === 0) {
            return { color: 'rgba(255,255,255,0.5)', label: 'Aucun abonnement lié', bg: 'rgba(255,255,255,0.05)' };
        }
        // Only check against 7-day renewals for urgency
        if (cost7d > 0 && balance < cost7d) {
            return { color: '#ff5252', label: `🚨 Solde insuffisant (${(cost7d / 100).toFixed(0)}₺ dans 7j)`, bg: 'rgba(255,82,82,0.1)' };
        }
        if (cost7d > 0 && balance < cost7d * 1.5) {
            return { color: '#ffa726', label: '⚠️ Recharge bientôt', bg: 'rgba(255,167,38,0.08)' };
        }
        if (balance >= costMonth * 3) {
            return { color: '#4caf50', label: '✅ Solde confortable', bg: 'rgba(76,175,80,0.08)' };
        }
        if (balance >= costMonth) {
            return { color: '#a0e7a0', label: '👍 OK', bg: 'rgba(160,231,160,0.08)' };
        }
        return { color: '#a0e7a0', label: '👍 OK', bg: 'rgba(160,231,160,0.08)' };
    };

    return (
        <div className="page-container">
            <Header />

            <main className="page-main">
                <div className="page-title-row">
                    <h2>Comptes Apple</h2>
                    <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Ajouter un compte</button>
                </div>

                {error && <div className="page-error">{error}</div>}

                {showForm && (
                    <div className="form-card">
                        <h3>{editingId ? 'Modifier' : 'Nouveau compte Apple'}</h3>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="displayName">Nom d'affichage</label>
                                    <input id="displayName" type="text" value={formDisplayName}
                                        onChange={(e) => setFormDisplayName(e.target.value)} placeholder="Ex: Compte Netflix" required={!editingId} />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="accountEmail">Email Apple</label>
                                    <input id="accountEmail" type="email" value={formEmail}
                                        onChange={(e) => setFormEmail(e.target.value)} placeholder="netflix-tr@gmail.com" required={!editingId} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="solde">Solde actuel (₺)</label>
                                <input id="solde" type="number" step="0.01" min="0" value={formBalance}
                                    onChange={(e) => setFormBalance(e.target.value)} placeholder="150.00" />
                                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.25rem' }}>
                                    Le solde total actuellement disponible sur ce compte Apple
                                </span>
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
                ) : accounts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🍎</div>
                        <h3>Aucun compte Apple</h3>
                        <p>Ajoutez votre premier compte Apple pour commencer.</p>
                    </div>
                ) : (
                    <div className="accounts-grid">
                        {accounts.map((account) => {
                            const status = getBalanceStatus(account);
                            return (
                                <div key={account.id} className="account-card">
                                    <div className="account-header">
                                        <div className="account-name">{account.displayName}</div>
                                        <div className="account-actions">
                                            <button className="btn-icon" onClick={() => handleEdit(account)} title="Modifier">✏️</button>
                                            <button className="btn-icon btn-danger" onClick={() => handleDelete(account)} title="Supprimer">🗑️</button>
                                        </div>
                                    </div>
                                    <div className="account-email">{account.email}</div>

                                    {/* Balance section — clickable to edit */}
                                    <div style={{ margin: '0.75rem 0', textAlign: 'center', padding: '0.75rem', borderRadius: '10px', background: status.bg, cursor: 'pointer' }}
                                        onClick={() => { if (editBalanceId !== account.id) { setEditBalanceId(account.id); setEditBalanceValue((account.initialBalanceKurus / 100).toString()); } }}
                                        title="Cliquez pour modifier le solde">
                                        {editBalanceId === account.id ? (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}
                                                onClick={(e) => e.stopPropagation()}>
                                                <input type="number" step="0.01" min="0" value={editBalanceValue}
                                                    onChange={(e) => setEditBalanceValue(e.target.value)}
                                                    autoFocus
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleBalanceUpdate(account.id); if (e.key === 'Escape') setEditBalanceId(null); }}
                                                    style={{ width: '100px', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center' }} />
                                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>₺</span>
                                                <button className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                    onClick={() => handleBalanceUpdate(account.id)}>OK</button>
                                                <button className="btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                                                    onClick={() => setEditBalanceId(null)}>✕</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: status.color }}>
                                                    {formatTRY(account.currentBalanceKurus)}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: status.color, marginTop: '0.3rem', fontWeight: 500 }}>
                                                    {status.label}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Subscription names */}
                                    {account.subscriptionNames.length > 0 && (
                                        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            {account.subscriptionNames.map((name, i) => (
                                                <span key={i} className="renewal-badge">{name}</span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="account-stats">
                                        <div className="stat">
                                            <span className="stat-value">{account.subscriptionCount}</span>
                                            <span className="stat-label">Abo.</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-value">{formatTRY(account.totalRechargesKurus)}</span>
                                            <span className="stat-label">Rechargé</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-value">{formatTRY(account.monthlyCostKurus)}</span>
                                            <span className="stat-label">Coût/mois</span>
                                        </div>
                                    </div>

                                    {rechargingId === account.id ? (
                                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input type="number" step="0.01" min="0.01" placeholder="Montant ₺"
                                                value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)}
                                                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.5rem', color: '#fff', fontSize: '0.85rem' }} />
                                            <button className="btn-primary" style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleRecharge(account.id)}>OK</button>
                                            <button className="btn-secondary" style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem' }} onClick={() => { setRechargingId(null); setRechargeAmount(''); }}>✕</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setRechargingId(account.id)} className="recharge-btn">
                                            💰 J'ai rechargé ce compte
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}

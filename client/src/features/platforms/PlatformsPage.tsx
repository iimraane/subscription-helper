import { useState, useEffect, type FormEvent } from 'react';
import request from '../../lib/api';
import type { ApiError } from '@shared/types';
import Header from '../../components/Header';
import '../accounts/accounts.css';

interface PlatformAccount {
    id: number; platform: string; email: string; displayName: string;
    hasPassword: boolean; subscriptionCount: number; tenantCount: number; createdAt: string;
}

const PLATFORM_OPTIONS = ['SPLIIIT', 'SHARHUB', 'AUTRE'];
const PLATFORM_ICONS: Record<string, string> = { SPLIIIT: '🟣', SHARHUB: '🔵', AUTRE: '📦' };
const PLATFORM_DESCRIPTIONS: Record<string, string> = {
    SPLIIIT: 'Audit automatique par email — aucun mot de passe requis',
    SHARHUB: 'Audit automatique par email — aucun mot de passe requis',
    AUTRE: 'Plateforme personnalisée',
};

export default function PlatformsPage() {
    const [platforms, setPlatforms] = useState<PlatformAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formPlatform, setFormPlatform] = useState('SPLIIIT');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formDisplayName, setFormDisplayName] = useState('');

    const loadData = async () => {
        try { setPlatforms(await request<PlatformAccount[]>('/platforms')); }
        catch { setError('Erreur.'); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const resetForm = () => {
        setFormPlatform('SPLIIIT'); setFormEmail(''); setFormPassword(''); setFormDisplayName('');
        setEditingId(null); setShowForm(false); setError('');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault(); setError(''); setIsSubmitting(true);
        try {
            const body: Record<string, string> = { platform: formPlatform, email: formEmail, displayName: formDisplayName };
            if (formPassword) body.password = formPassword;
            if (editingId) await request(`/platforms/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
            else await request('/platforms', { method: 'POST', body: JSON.stringify(body) });
            resetForm(); await loadData();
        } catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
        finally { setIsSubmitting(false); }
    };

    const handleEdit = (p: PlatformAccount) => {
        setEditingId(p.id); setFormPlatform(p.platform); setFormEmail(p.email);
        setFormDisplayName(p.displayName); setFormPassword(''); setShowForm(true);
    };

    const handleDelete = async (p: PlatformAccount) => {
        if (!confirm(`Supprimer "${p.displayName}" ?`)) return;
        try { await request(`/platforms/${p.id}`, { method: 'DELETE' }); await loadData(); }
        catch (err) { setError((err as ApiError).error?.message || 'Erreur.'); }
    };

    const needsPassword = false;

    return (
        <div className="page-container">
            <Header />

            <main className="page-main">
                <div className="page-title-row">
                    <h2>Plateformes de partage</h2>
                    <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Ajouter</button>
                </div>

                {error && <div className="page-error">{error}</div>}

                {showForm && (
                    <div className="form-card">
                        <h3>{editingId ? 'Modifier' : 'Nouvelle plateforme'}</h3>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="pfPlatform">Plateforme</label>
                                    <select id="pfPlatform" value={formPlatform}
                                        onChange={(e) => setFormPlatform(e.target.value)} className="select-field">
                                        {PLATFORM_OPTIONS.map((p) => (
                                            <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>
                                        ))}
                                    </select>
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.25rem' }}>
                                        {PLATFORM_DESCRIPTIONS[formPlatform]}
                                    </span>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="pfDisplayName">Nom d'affichage</label>
                                    <input id="pfDisplayName" type="text" value={formDisplayName}
                                        onChange={(e) => setFormDisplayName(e.target.value)} placeholder="Mon Spliiit Netflix" required />
                                </div>
                            </div>
                            <div className={needsPassword ? 'form-row' : ''}>
                                <div className="form-group">
                                    <label htmlFor="pfEmail">Email</label>
                                    <input id="pfEmail" type="email" value={formEmail}
                                        onChange={(e) => setFormEmail(e.target.value)} placeholder="email@spliiit.com" required />
                                </div>
                                {needsPassword && (
                                    <div className="form-group">
                                        <label htmlFor="pfPassword">
                                            Mot de passe Sharhub {editingId && <span className="label-hint">(vide = inchangé)</span>}
                                        </label>
                                        <input id="pfPassword" type="password" value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            placeholder={editingId ? '••••••••' : 'Mot de passe'}
                                            required={!editingId} />
                                    </div>
                                )}
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
                ) : platforms.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🤝</div>
                        <h3>Aucune plateforme</h3>
                        <p>Ajoutez votre compte Spliiit ou Sharhub pour gérer vos co-abonnés.</p>
                    </div>
                ) : (
                    <div className="accounts-grid">
                        {platforms.map((p) => (
                            <div key={p.id} className="account-card">
                                <div className="account-header">
                                    <div className="account-name">{PLATFORM_ICONS[p.platform] || '📦'} {p.displayName}</div>
                                    <div className="account-actions">
                                        <button className="btn-icon" onClick={() => handleEdit(p)} title="Modifier">✏️</button>
                                        <button className="btn-icon btn-danger" onClick={() => handleDelete(p)} title="Supprimer">🗑️</button>
                                    </div>
                                </div>
                                <div className="account-email">{p.email}</div>
                                <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                                    <span className="renewal-badge">{p.platform}</span>
                                    {p.platform === 'SHARHUB' && (
                                        <span className="renewal-badge profit">📧 Audit email</span>
                                    )}
                                    {p.platform === 'SPLIIIT' && (
                                        <span className="renewal-badge profit">📧 Audit email</span>
                                    )}
                                </div>
                                <div className="account-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                    <div className="stat">
                                        <span className="stat-value">{p.subscriptionCount}</span>
                                        <span className="stat-label">Abonnements</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-value">{p.tenantCount}</span>
                                        <span className="stat-label">Abonnés</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { ApiError } from '@shared/types';
import './auth.css';

const isIosSafari = () => {
    const ua = window.navigator.userAgent;
    const webkit = !!ua.match(/WebKit/i);
    const isIOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    // Exclude Chrome, Edge, Firefox, Opera on iOS
    const isSafari = isIOS && webkit && !ua.match(/CriOS/i) && !ua.match(/OPiOS/i) && !ua.match(/FxiOS/i) && !ua.match(/EdgiOS/i);
    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;
    return isSafari && !isStandalone;
};

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPwaPrompt, setShowPwaPrompt] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isIosSafari()) setShowPwaPrompt(true);
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas.');
            return;
        }

        if (password.length < 8) {
            setError('Le mot de passe doit contenir au moins 8 caractères.');
            return;
        }

        setIsSubmitting(true);
        try {
            await register(email, password);
            navigate('/');
        } catch (err) {
            const apiError = err as ApiError;
            setError(apiError.error?.message || 'Une erreur est survenue.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Subscription Helper</h1>
                    <p className="auth-subtitle">Créez votre compte opérateur</p>
                </div>

                {showPwaPrompt && (
                    <div style={{
                        background: 'rgba(52, 199, 89, 0.1)', border: '1px solid rgba(52, 199, 89, 0.3)',
                        borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem',
                        fontSize: '0.85rem', color: '#e0e0e0', textAlign: 'left'
                    }}>
                        <div style={{ fontWeight: 'bold', color: '#34c759', marginBottom: '0.5rem' }}>📱 Installer l'application mobile</div>
                        Testé pour la meilleure expérience iOS :
                        <ol style={{ marginLeft: '1.2rem', marginTop: '0.5rem', marginBottom: 0 }}>
                            <li>Ouvrez le menu <strong>Partager</strong> en bas</li>
                            <li>Appuyez sur <strong>Sur l'écran d'accueil ➕</strong></li>
                        </ol>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                            (Note: l'application est optimisée exclusivement pour Safari sur iOS)
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="votre@email.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Mot de passe</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimum 8 caractères"
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirmez votre mot de passe"
                            required
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="auth-button"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Création...' : 'Créer mon compte'}
                    </button>
                </form>

                <p className="auth-footer">
                    Déjà un compte ? <Link to="/login">Se connecter</Link>
                </p>
            </div>
        </div>
    );
}

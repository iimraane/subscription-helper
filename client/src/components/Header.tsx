import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

export default function Header() {
    const { operator, logout } = useAuth();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    const navLinks = [
        { path: '/', label: 'Cockpit' },
        { path: '/accounts', label: 'Comptes Apple' },
        { path: '/subscriptions', label: 'Abonnements' },
        { path: '/platforms', label: 'Plateformes' },
        { path: '/finance', label: 'Finance' },
        { path: '/gmail', label: 'Inbox 📥' },
    ];

    return (
        <header className="page-header">
            <div className="header-left">
                <Link to="/" className="brand-link" onClick={closeMenu}>
                    <h1>Subscription Helper</h1>
                </Link>

                <div className={`nav-overlay ${isMenuOpen ? 'open' : ''}`} onClick={closeMenu}></div>

                <nav className={`nav-links ${isMenuOpen ? 'open' : ''}`}>
                    <div className="nav-header-mobile">
                        <span>Menu</span>
                        <button className="btn-close-menu" onClick={closeMenu}>&times;</button>
                    </div>
                    {navLinks.map(({ path, label }) => (
                        <Link
                            key={path}
                            to={path}
                            className={location.pathname === path ? 'active' : ''}
                            onClick={closeMenu}
                        >
                            {label}
                        </Link>
                    ))}
                    <div className="nav-footer-mobile">
                        <span className="header-email mobile-only">{operator?.email}</span>
                        <button onClick={logout} className="btn-logout mobile-only" style={{ width: '100%', marginTop: '0.5rem' }}>
                            Déconnexion
                        </button>
                    </div>
                </nav>
            </div>

            <div className="header-right desktop-only">
                <span className="header-email">{operator?.email}</span>
                <button onClick={logout} className="btn-logout">Déconnexion</button>
            </div>

            <button className="burger-menu-btn" onClick={toggleMenu} aria-label="Menu">
                <span></span>
                <span></span>
                <span></span>
            </button>
        </header>
    );
}

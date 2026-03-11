import { useState, useEffect } from 'react';
import request from '../../lib/api';
import Header from '../../components/Header';
import './finance.css';

interface MonthData {
    month: string; label: string;
    costKurus: number; revenueEURCents: number; rechargeTotalKurus: number;
    profitEURCents: number;
    subscriptions: { name: string; costKurus: number; revenueEURCents: number }[];
}

interface FinanceData {
    current: MonthData;
    history: MonthData[];
    totals: { revenueEURCents: number; costKurus: number; profitEURCents: number; months: number };
    eurToTry: number;
}

export default function FinancePage() {
    const [data, setData] = useState<FinanceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandMonth, setExpandMonth] = useState<string | null>(null);

    useEffect(() => {
        request<FinanceData>('/finance')
            .then(setData)
            .catch(() => { })
            .finally(() => setIsLoading(false));
    }, []);

    const formatTRY = (k: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(k / 100);
    const formatEUR = (c: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100);

    const t = data?.totals;
    const c = data?.current;

    return (
        <div className="page-container">
            <Header />

            <main className="finance-main">
                <h2>📊 Résumé Financier</h2>

                {isLoading ? (
                    <div className="loading-state">Chargement...</div>
                ) : !data ? (
                    <div className="page-error">Erreur de chargement.</div>
                ) : (
                    <>
                        {/* Current month KPIs */}
                        <div className="finance-kpis">
                            <div className="fin-kpi">
                                <div className="fin-kpi-label">Ce mois — Coût total</div>
                                <div className="fin-kpi-value" style={{ color: '#ffa726' }}>{formatTRY(c!.costKurus)}</div>
                                <div className="fin-kpi-sub">≈ {formatEUR(Math.round(c!.costKurus / data.eurToTry))}</div>
                            </div>
                            <div className="fin-kpi">
                                <div className="fin-kpi-label">Ce mois — Revenu</div>
                                <div className="fin-kpi-value" style={{ color: '#7c5cfc' }}>{formatEUR(c!.revenueEURCents)}</div>
                            </div>
                            <div className="fin-kpi">
                                <div className="fin-kpi-label">Ce mois — Bénéfice</div>
                                <div className="fin-kpi-value" style={{ color: c!.profitEURCents >= 0 ? '#4caf50' : '#ff5252' }}>
                                    {c!.profitEURCents >= 0 ? '+' : ''}{formatEUR(c!.profitEURCents)}
                                </div>
                            </div>
                            <div className="fin-kpi">
                                <div className="fin-kpi-label">Ce mois — Rechargé</div>
                                <div className="fin-kpi-value" style={{ color: '#a0e7a0' }}>{formatTRY(c!.rechargeTotalKurus)}</div>
                            </div>
                        </div>

                        {/* Grand totals */}
                        <div className="grand-totals">
                            <div className="gt-item">
                                <span className="gt-label">Total dépensé (12 mois)</span>
                                <span className="gt-value">{formatTRY(t!.costKurus)}</span>
                            </div>
                            <div className="gt-item">
                                <span className="gt-label">Total gagné (12 mois)</span>
                                <span className="gt-value" style={{ color: '#7c5cfc' }}>{formatEUR(t!.revenueEURCents)}</span>
                            </div>
                            <div className="gt-item">
                                <span className="gt-label">Bénéfice cumulé</span>
                                <span className="gt-value" style={{ color: t!.profitEURCents >= 0 ? '#4caf50' : '#ff5252' }}>
                                    {t!.profitEURCents >= 0 ? '+' : ''}{formatEUR(t!.profitEURCents)}
                                </span>
                            </div>
                        </div>

                        {/* Monthly history */}
                        <h3 style={{ margin: '1.5rem 0 0.75rem' }}>📅 Historique mensuel</h3>
                        <div className="month-list">
                            {data.history.map((m) => (
                                <div key={m.month} className="month-row">
                                    <div className="month-header" onClick={() => setExpandMonth(expandMonth === m.month ? null : m.month)}>
                                        <div className="month-label">{m.label}</div>
                                        <div className="month-stats">
                                            <span style={{ color: '#ffa726' }}>{formatTRY(m.costKurus)}</span>
                                            <span style={{ color: '#7c5cfc' }}>{formatEUR(m.revenueEURCents)}</span>
                                            <span style={{ color: m.profitEURCents >= 0 ? '#4caf50' : '#ff5252', fontWeight: 700 }}>
                                                {m.profitEURCents >= 0 ? '+' : ''}{formatEUR(m.profitEURCents)}
                                            </span>
                                            <span style={{ fontSize: '0.75rem' }}>{expandMonth === m.month ? '▲' : '▼'}</span>
                                        </div>
                                    </div>

                                    {expandMonth === m.month && (
                                        <div className="month-detail">
                                            {m.rechargeTotalKurus > 0 && (
                                                <div className="detail-line recharge-line">
                                                    💰 Rechargé : <strong>{formatTRY(m.rechargeTotalKurus)}</strong>
                                                </div>
                                            )}
                                            {m.subscriptions.length === 0 ? (
                                                <div className="detail-line" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucun abonnement actif</div>
                                            ) : (
                                                m.subscriptions.map((s, i) => (
                                                    <div key={i} className="detail-line">
                                                        <span>{s.name}</span>
                                                        <span className="detail-costs">
                                                            <span style={{ color: '#ffa726' }}>{formatTRY(s.costKurus)}</span>
                                                            {s.revenueEURCents > 0 && (
                                                                <span style={{ color: '#7c5cfc' }}>+{formatEUR(s.revenueEURCents)}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

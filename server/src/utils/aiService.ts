import logger from './logger.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

interface TriageResult {
    eventType: 'NEW_SUBSCRIBER' | 'DEPARTURE' | 'PAYMENT' | 'RENEWAL' | 'INFO' | 'UNKNOWN';
    eventSummary: string;
    confidence: number;
}

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans le triage d'emails provenant de plateformes de partage d'abonnements (Spliiit, Sharhub/Sharesub).

Analyse l'email fourni et détermine le type d'événement. Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "eventType": "NEW_SUBSCRIBER" | "DEPARTURE" | "PAYMENT" | "RENEWAL" | "INFO" | "UNKNOWN",
  "eventSummary": "Résumé court en français (1-2 phrases max)",
  "confidence": 0.0 à 1.0
}

Types d'événements:
- NEW_SUBSCRIBER: Un nouveau membre a rejoint un partage / invitation acceptée
- DEPARTURE: Un membre a quitté un partage / désabonnement
- PAYMENT: Confirmation de paiement reçu d'un membre / virement
- RENEWAL: Renouvellement d'abonnement / rappel de renouvellement
- INFO: Information générale, newsletter, notification non urgente
- UNKNOWN: Impossible à classifier

Sois précis dans ton résumé et inclus le nom du service si mentionné (YouTube, Netflix, etc.).`;

export async function triageEmail(email: {
    from: string; subject: string; snippet: string; platform: string;
}): Promise<TriageResult> {
    if (!OPENAI_API_KEY) {
        return { eventType: 'UNKNOWN', eventSummary: 'Clé API OpenAI non configurée', confidence: 0 };
    }

    try {
        const userMsg = `Email de ${email.platform}:
De: ${email.from}
Sujet: ${email.subject}
Extrait: ${email.snippet}`;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMsg },
                ],
                max_tokens: 200,
                temperature: 0.1,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            logger.error({ status: res.status, errText }, 'OpenAI API error');
            return { eventType: 'UNKNOWN', eventSummary: 'Erreur API OpenAI', confidence: 0 };
        }

        const data = await res.json() as {
            choices: Array<{ message: { content: string } }>;
        };

        const content = data.choices[0]?.message?.content?.trim();
        if (!content) {
            return { eventType: 'UNKNOWN', eventSummary: 'Réponse vide', confidence: 0 };
        }

        // Parse JSON response (handle markdown code blocks)
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr) as TriageResult;

        // Validate
        const validTypes = ['NEW_SUBSCRIBER', 'DEPARTURE', 'PAYMENT', 'RENEWAL', 'INFO', 'UNKNOWN'];
        if (!validTypes.includes(parsed.eventType)) parsed.eventType = 'UNKNOWN';
        if (typeof parsed.confidence !== 'number') parsed.confidence = 0.5;
        parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

        return parsed;
    } catch (err) {
        logger.error({ err }, 'AI triage failed');
        return { eventType: 'UNKNOWN', eventSummary: 'Erreur de triage', confidence: 0 };
    }
}

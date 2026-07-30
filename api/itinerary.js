// Vercel Serverless Function — AI itinerary generator
// Focused on QUALITY, not speed — gives DeepSeek time to craft the best holiday
const fetch = require('node-fetch');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

// Day themes that rotate to ensure variety
const DAY_THEMES = [
  'Arrivo & esplorazione iniziale — sistemati, primo giro a piedi, cena tipica',
  'Cultura & monumenti — musei, chiese, palazzi storici, quartieri antichi',
  'Natura & panorami — parchi, giardini, punti panoramici, costa, tramonti',
  'Cibo & tradizioni — mercati locali, street food, ristoranti tipici, cooking class',
  'Gita fuori porta — escursione nei dintorni, isola, montagna, borgo vicino',
  'Gemme nascoste — luoghi segreti, street art, quartieri alternativi, artisan',
  'Avventura & attività — hiking, kayak, bike, sport, esperienze uniche',
  'Shopping & artigianato — mercatini, boutique, prodotti locali, souvenir',
  'Relax & benessere — spiaggia, spa, mattinata slow, aperitivo al tramonto',
  'Vita notturna — bar, musica dal vivo, locali tipici, serata speciale',
  'Arte & creatività — gallerie, murales, musei d\'arte, workshop fotografici',
  'Storia approfondita — castelli, rovine, siti UNESCO, tour guidati',
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DeepSeek API key not configured' });

  try {
    const { destination, checkIn, checkOut, hotel, preferences } = req.body;
    if (!destination || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing required fields: destination, checkIn, checkOut' });
    }

    const year = req.body.year || new Date().getFullYear();

    const prefs = preferences || {};
    const style = prefs.style || 'balanced';
    const interests = prefs.interests || ['food', 'nature', 'history'];
    const vibe = prefs.vibe || 'moderate';
    const wish = prefs.wish || '';

    const styleNames = { relaxed: 'Rilassato — slow mornings, no rush', balanced: 'Bilanciato — mix di relax e scoperta', adventure: 'Avventuroso — hiking, action, sport', cultural: 'Culturale — musei, storia, arte' };
    const vibeNames = { budget: 'Budget — risparmio, street food, free activities', moderate: 'Moderato — buon rapporto qualità/prezzo', luxury: 'Lusso — ristoranti stellati, esperienze premium' };

    // Parse dates
    const parseDate = (str, y) => {
      if (!str) return new Date();
      const d = new Date(str);
      if (!isNaN(d)) return d;
      const parts = str.split(' ');
      const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      if (parts.length >= 2 && months[parts[0]] !== undefined) {
        return new Date(y || year, months[parts[0]], parseInt(parts[1]));
      }
      return new Date();
    };

    const dIn = parseDate(checkIn);
    const dOut = parseDate(checkOut, year);
    const totalDays = Math.max(1, Math.ceil((dOut - dIn) / (1000 * 60 * 60 * 24)));

    // Assign themes to each day
    const themes = [];
    for (let i = 0; i < totalDays; i++) {
      if (i === 0) themes.push('Arrivo & primo giro');
      else if (i === totalDays - 1) themes.push('Ultimo giorno — saluti, souvenir, partenza');
      else {
        const used = new Set(themes);
        const available = DAY_THEMES.filter(t => !used.has(t.split(' — ')[0]));
        const chosen = available.length > 0
          ? available[(i - 1) % available.length]
          : DAY_THEMES[(i - 1) % DAY_THEMES.length];
        themes.push(chosen);
      }
    }

    const styleText = styleNames[style] || 'Bilanciato';
    const vibeText = vibeNames[vibe] || 'Moderato';
    const interestText = interests.map(i => {
      const map = {
        food: '🍝 Cibo & vino',
        nature: '🌿 Natura',
        history: '🏛️ Storia & cultura',
        shopping: '🛍️ Shopping',
        nightlife: '🍸 Vita notturna',
        beach: '🏖️ Spiaggia & relax',
        photography: '📸 Fotografia',
        sports: '⚽ Sport & attività'
      };
      return map[i] || i;
    }).join(', ');

    const dayDescriptions = themes.map((t, i) =>
      `Day ${i + 1}: ${t}`
    ).join('\n');

    // Build the prompt — focused on quality, with concrete examples
    const systemPrompt = `Sei Grillo 🦗, un'espertissima guida turistica AI. Il tuo compito è creare l'itinerario PERFETTO per ogni viaggiatore, PERSONALIZZATO al 100% in base alle loro risposte.

DATI VIAGGIO:
- Destinazione: ${destination}
- Date: ${checkIn} → ${checkOut} (${totalDays} giorni)
- Hotel: ${hotel || 'Non specificato'}
- Stile di viaggio: ${styleText}
- Budget: ${vibeText}
- Interessi specifici: ${interestText}
${wish ? `\n🎯 DESIDERIO SPECIALE DELL'UTENTE (È LA COSA PIÙ IMPORTANTE — DEVE ESSERE IL CUORE DELL'ITINERARIO):\n«${wish}»\n` : ''}

FORMATO JSON RICHIESTO — RISPONDERE SOLO CON QUESTO JSON:
{
  "days": [
    {
      "day": "Lun 1",
      "label": "Arrivo",
      "icon": "✈️",
      "subtitle": "Arrivo a [zona specifica]",
      "location": "Quartiere/zona (cambia ogni giorno)",
      "activities": [
        {
          "time": "Mattina / Pomeriggio / Sera",
          "icon": "🚶",
          "title": "NOME ATTIVITÀ con luogo REALE",
          "desc": "Descrizione breve ma invitante (1 frase)",
          "price": "~€XX o null"
        }
      ]
    }
  ],
  "tips": [
    {
      "icon": "☂️",
      "title": "Titolo consiglio",
      "desc": "Consiglio specifico e personalizzato"
    }
  ]
}

IMPORTANTE: genera 5-8 TIPS personalizzati per questo viaggio. I tips devono essere UTILI, SPECIFICI e BASATI sull'itinerario creato. Esempi:
- Consigli sul meteo nel periodo specifico
- Cosa mettere in valigia (basato sulle attività)
- Piatti tipici da assaggiare legati alla destinazione
- Consigli di trasporto locale
- Etichetta culturale / usanze locali
- Consigli di sicurezza
- App utili per la destinazione
- Migliori momenti per visitare le attrazioni nell'itinerario
- Alternative low-cost per esperienze nell'itinerario

${wish ? `\nPRIORITÀ MAX — IL DESIDERIO DELL'UTENTE VIENE PRIMA DI TUTTO:\n- L'itinerario DEVE ruotare attorno a "${wish}"\n- Se richiede un'esperienza specifica (es. "sushi", "concerto", "barca"), DEVE essere inclusa\n- Tutti i giorni devono contribuire a realizzare questo desiderio\n` : ''}
REGOLE PER UN ITINERARIO DA 10/10 — SEGUIRE ASSOLUTAMENTE:
1. OGNI GIORNO DEVE AVERE ATTIVITÀ COMPLETAMENTE DIVERSE — niente ripetizioni di temi o luoghi
2. Gli INTERESSI dell'utente DEVONO GUIDARE la scelta delle attività — se ha scelto "food & wine" ogni giorno deve includere esperienze culinarie uniche, se ha scelto "nature" ogni giorno deve avere un'attività all'aperto diversa
3. Lo STILE influenza il ritmo: se "relaxed" meno attività ma più tempo libero, se "adventure" più attività attive
4. Il BUDGET influenza i prezzi: se "budget" attività gratuite e street food, se "luxury" ristoranti rinomati e esperienze esclusive
5. OGNI attività DEVE nominare un LUOGO SPECIFICO REALE (ristorante, monumento, quartiere, spiaggia, museo, parco)
6. MAI scrivere solo "Pranzo" o "Cena" — specifica SEMPRE DOVE (es. "Pranzo da Trattoria Da Mario")
7. Se non conosci un posto vero, INVENTANE uno con nome realistico locale
8. Location (quartiere/zona) DIVERSO ogni giorno
9. Ogni giorno 3-5 attività (coprendo mattina, pranzo, pomeriggio, sera)
10. Titoli invitanti che fanno venire voglia di partire SUBITO
11. Tutto in ITALIANO

ASSOLUTAMENTE VIETATO:
- Giorni tutti uguali con solo il titolo diverso
- Ripetere lo stesso tipo di attività in giorni diversi
- Scrivere "Pranzo" senza dire dove
- Mettere lo stesso prezzo per tutte le attività
- Usare descrizioni generiche come "visita la città"
- NOME CHIAVI DUPLICATE in uno stesso oggetto JSON (es. due "icon" nella stessa activity)`;

    const userPrompt = `Ciao Grillo! 🦗 Devo organizzare il viaggio PERFETTO a ${destination} (${checkIn} → ${checkOut}, ${totalDays} giorni)${hotel ? `, alloggio al ${hotel}` : ''}.

Il mio stile è ${styleText} e il budget è ${vibeText}. Mi interessano: ${interestText}.${wish ? `\n\nMA SOPRATTUTTO, QUESTO È IL MIO SOGNO — DEVI REALIZZARLO:\n«${wish}»` : ''}

Ogni giorno ha un tema specifico. SEGUI QUESTO SCHEMA:
${dayDescriptions}

CREA l'itinerario migliore della mia vita! ✨`;

    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8000,
        temperature: 0.95,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    // Extract JSON
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : reply;
      const itinerary = JSON.parse(jsonStr);
      res.json(itinerary);
    } catch {
      // Return the raw text and the generated days count
      res.json({
        days: [],
        raw: reply,
        error: 'JSON parse failed',
        totalDays,
        destination,
        themes: themes
      });
    }
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

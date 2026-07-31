// Vercel Serverless Function — AI itinerary generator
// ARCHITECTURE: parallel day-by-day generation.
// Instead of one giant 8000-token call (which times out at 60s and produces
// generic content), we split the work:
//   1. Planner call → assigns a unique THEME to each day (fast, ~600 tokens)
//   2. Parallel calls → one per day, each crafts 3-5 rich activities
//   3. Parallel tips call → personalized advice for the whole trip
// All parallel calls run concurrently → total ≈ max(single call) ≈ 20-30s
const fetch = require('node-fetch');
const { withAuth } = require('../lib/auth');

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

module.exports = withAuth(async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DeepSeek API key not configured' });

  try {
    const { destination, checkIn, checkOut, hotel, preferences, type } = req.body;
    if (!destination || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing required fields: destination, checkIn, checkOut' });
    }

    const year = req.body.year || new Date().getFullYear();
    const prefs = preferences || {};
    const style = prefs.style || 'balanced';
    const interests = prefs.interests || ['food', 'nature', 'history'];
    const vibe = prefs.vibe || 'moderate';
    const wish = prefs.wish || '';
    // booking type: 'hotel' | 'flight' | 'event' — shapes the itinerary
    const bookingType = type || 'hotel';

    const styleNames = { relaxed: 'Rilassato — slow mornings, no rush', balanced: 'Bilanciato — mix di relax e scoperta', adventure: 'Avventuroso — hiking, action, sport', cultural: 'Culturale — musei, storia, arte' };
    const vibeNames = { budget: 'Budget — risparmio, street food, free activities', moderate: 'Moderato — buon rapporto qualità/prezzo', luxury: 'Lusso — ristoranti stellati, esperienze premium' };
    const styleText = styleNames[style] || 'Bilanciato';
    const vibeText = vibeNames[vibe] || 'Moderato';

    const interestMap = {
      food: '🍝 Cibo & vino', nature: '🌿 Natura', history: '🏛️ Storia & cultura',
      shopping: '🛍️ Shopping', nightlife: '🍸 Vita notturna', beach: '🏖️ Spiaggia & relax',
      photography: '📸 Fotografia', sports: '⚽ Sport & attività', art: '🎨 Arte & musei',
      music: '🎵 Musica & concerti'
    };
    const interestText = (interests || []).map(i => interestMap[i] || i).join(', ');

    // Parse dates (handles "Aug 22", "22/08", "2026-08-22", ISO)
    const parseDate = (str, y) => {
      if (!str) return new Date();
      const d = new Date(str);
      if (!isNaN(d)) return d;
      const m = String(str).match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
      if (m) {
        const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
        const yy = m[3] ? (parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : y;
        return new Date(yy, month, day);
      }
      const parts = String(str).split(' ');
      const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      if (parts.length >= 2 && months[parts[0]] !== undefined) {
        return new Date(y || year, months[parts[0]], parseInt(parts[1]));
      }
      return new Date();
    };

    const dIn = parseDate(checkIn);
    const dOut = parseDate(checkOut, year);
    const totalDays = Math.max(1, Math.round((dOut - dIn) / (1000 * 60 * 60 * 24)));
    const dayNames = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    const dateLabels = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(dIn.getFullYear(), dIn.getMonth(), dIn.getDate() + i);
      dateLabels.push(dayNames[d.getDay()] + ' ' + d.getDate());
    }

    // ═══ STEP 1: Planner — assign unique themes to each day ═══
    const plannerPrompt = `Sei un travel planner esperto. Devi creare il piano giornaliero di un viaggio di ${totalDays} giorni a ${destination} (${checkIn} → ${checkOut}).
Stile: ${styleText}. Budget: ${vibeText}. Interessi: ${interestText}.${wish ? ` Desiderio speciale: «${wish}»` : ''}
Tipo di booking: ${bookingType === 'flight' ? 'volo' : bookingType === 'event' ? 'evento (museo/concerto/festival)' : 'hotel/viaggio'}.

Assegna a OGNI giorno un TEMA unico e specifico (mai generico, mai ripetuto). Il giorno 1 è l'arrivo, l'ultimo la partenza.
Restituisci SOLO un array JSON con ${totalDays} oggetti:
[{"day": 1, "label": "Titolo breve e accattivante del tema", "location": "Quartiere/zona della città per quel giorno (specifico e diverso ogni giorno)"}, ...]

REGOLE:
- Temi SPECIFICI e diversificati (es. "Street art nel Raval", "Paella e tapas a El Born", "Gaudí segreto", non "Cultura" o "Giro in città")
- Se il tipo è EVENT, il giorno dell'evento deve ruotare attorno ad esso
- Se il desiderio esiste, i giorni devono contribuire a realizzarlo
- Tutto in italiano`;

    const plannerResp = await callDeepSeek(apiKey, plannerPrompt, 1200, 0.8);
    let dayThemes = [];
    try {
      const arr = extractJson(plannerResp);
      if (Array.isArray(arr)) dayThemes = arr;
    } catch (e) { console.error('Planner JSON failed:', e.message); }

    // Fallback themes if planner fails
    if (dayThemes.length !== totalDays) {
      const fallbacks = ['Arrivo & primo assaggio della città','Scoperta del centro storico','Tesori nascosti & angoli segreti','Sapori locali & mercati','Gita nei dintorni','Musei & arte','Tempo libero & relax','Vita notturna & musica','Ultimo giorno — souvenir & saluti'];
      dayThemes = [];
      for (let i = 0; i < totalDays; i++) {
        dayThemes.push({
          day: i + 1,
          label: i === 0 ? 'Arrivo & primo assaggio della città' : i === totalDays - 1 ? 'Ultimo giorno — souvenir & saluti' : fallbacks[(i - 1) % (fallbacks.length - 2) + 1],
          location: ''
        });
      }
    }

    // ═══ STEP 2: Parallel — one call per day + one tips call ═══
    const dayPromises = dayThemes.map(theme =>
      callDeepSeek(apiKey, buildDayPrompt({
        destination, hotel, styleText, vibeText, interestText, wish, bookingType,
        dayNum: theme.day, totalDays, dateLabel: dateLabels[theme.day - 1],
        label: theme.label, location: theme.location || '',
      }), 1500, 0.9)
    );
    // Tips call runs in parallel with the days
    const tipsPromise = callDeepSeek(apiKey, buildTipsPrompt({
      destination, hotel, styleText, vibeText, interestText, wish, bookingType,
      totalDays, dateLabels, dayThemes
    }), 1200, 0.8);

    const results = await Promise.all([...dayPromises, tipsPromise]);
    const dayReplies = results.slice(0, totalDays);
    const tipsReply = results[totalDays];

    // ═══ STEP 3: Assemble ═══
    const days = [];
    let failedDays = 0;
    for (let i = 0; i < totalDays; i++) {
      try {
        const day = extractJson(dayReplies[i]);
        if (day && day.activities && day.activities.length) {
          days.push({
            day: dateLabels[i] || String(i + 1),
            label: day.label || dayThemes[i].label,
            icon: day.icon || (i === 0 ? '✈️' : i === totalDays - 1 ? '🏠' : '🗓️'),
            subtitle: day.subtitle || dayThemes[i].location || `Giorno ${i + 1} a ${destination}`,
            location: day.location || dayThemes[i].location || '',
            activities: Array.isArray(day.activities) ? day.activities.slice(0, 5) : [],
          });
          continue;
        }
        throw new Error('no activities');
      } catch (e) {
        failedDays++;
        days.push({
          day: dateLabels[i] || String(i + 1),
          label: dayThemes[i].label,
          icon: i === 0 ? '✈️' : i === totalDays - 1 ? '🏠' : '🗓️',
          subtitle: dayThemes[i].location || `Giorno ${i + 1} a ${destination}`,
          location: dayThemes[i].location || '',
          activities: [],
        });
      }
    }

    let tips = [];
    try {
      const t = extractJson(tipsReply);
      if (Array.isArray(t)) tips = t.slice(0, 8);
    } catch (e) { console.error('Tips JSON failed:', e.message); }

    res.json({
      destination,
      checkIn, checkOut,
      totalDays,
      hotel: hotel || null,
      type: bookingType,
      days,
      tips,
      _failedDays: failedDays,
    });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ── Helpers ──

async function callDeepSeek(apiKey, systemPrompt, maxTokens, temperature) {
  const response = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content: systemPrompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${errText.slice(0, 150)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractJson(text) {
  // Try direct parse first, then find the largest {...} or [...] block
  try { return JSON.parse(text); } catch {}
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
  // Last resort: strip markdown fences
  const fenced = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(fenced); } catch {}
  throw new Error('No valid JSON in response');
}

function buildDayPrompt({ destination, hotel, styleText, vibeText, interestText, wish, bookingType, dayNum, totalDays, dateLabel, label, location }) {
  const isEventDay = bookingType === 'event' && (dayNum === Math.ceil(totalDays / 2) || String(label).toLowerCase().includes('evento'));
  return `Sei Grillo 🦗, guida turistica AI di livello mondiale. Crea il contenuto del GIORNO ${dayNum} di ${totalDays} di un viaggio a ${destination}.

DATI VIAGGIO:
- Destinazione: ${destination}
- Alloggio: ${hotel || 'Non specificato'}
- Stile: ${styleText} | Budget: ${vibeText}
- Interessi: ${interestText}
${wish ? `- Desiderio speciale da realizzare (PRIORITÀ MAX): «${wish}»\n` : ''}
- Data: ${dateLabel}

TEMA DEL GIORNO (seguito OBBLIGATORIAMENTE): «${label}»
${location ? `ZONA CONSIGLIATA: ${location}` : ''}
${isEventDay ? '⚠️ QUESTO È IL GIORNO DELL\'EVENTO: tutte le attività devono ruotare attorno all\'evento (arrivo, esperienza, dopo-evento).' : ''}

Restituisci SOLO JSON valido:
{
  "label": "Titolo del giorno (riusa il tema, rendilo accattivante)",
  "icon": "emoji rappresentativo",
  "subtitle": "Frase evocativa (max 10 parole)",
  "location": "Quartiere/zona specifica",
  "activities": [
    {"time": "Mattina", "icon": "🚶", "title": "NOME ATTIVITÀ CON LUOGO REALE SPECIFICO", "desc": "1 frase invitante e concreta (cosa vedrai/farai)", "price": "~€15" },
    {"time": "Pranzo", "icon": "🍽️", "title": "Dove mangiare con nome reale/realistico locale", "desc": "1 frase sul cibo/atmosfera", "price": "~€20"}
  ]
}

REGOLE D'ORO:
1. 3-5 attività: Mattina, Pranzo, Pomeriggio, Sera (mai solo "Pranzo" senza luogo)
2. OGNI attività deve citare un luogo SPECIFICO (monumento, quartiere, ristorante, spiaggia, mercato) — mai generico
3. Prezzi VARIATI e coerenti col budget (street food ~€8, ristorante ~€25, attività ~€15-40)
4. Il tema del giorno guida TUTTE le attività — niente fuori tema
5. Se il desiderio esiste, almeno 1 attività lo realizza
6. Italiano naturale e accattivante, zero ripetizioni con altri giorni`;
}

function buildTipsPrompt({ destination, hotel, styleText, vibeText, interestText, wish, bookingType, totalDays, dateLabels, dayThemes }) {
  const themesText = dayThemes.map(t => `Giorno ${t.day} (${dateLabels[t.day - 1]}): ${t.label}`).join('\n');
  return `Sei Grillo 🦗, guida turistica AI. Genera CONSIGLI PERSONALIZZATI per un viaggio di ${totalDays} giorni a ${destination}.

CONTESTO:
- Alloggio: ${hotel || 'Non specificato'} | Stile: ${styleText} | Budget: ${vibeText}
- Interessi: ${interestText}
${wish ? `- Desiderio speciale: «${wish}»\n` : ''}
- Tipo booking: ${bookingType}
- PIANO GIORNI:
${themesText}

Restituisci SOLO un array JSON di 5-7 consigli:
[{"icon": "☂️", "title": "Titolo consiglio", "desc": "Consiglio SPECIFICO per questa destinazione/periodo (1-2 frasi, con nomi reali quando possibile)"}]

REGOLE:
- CONSIGLI UTILI E CONCRETI: meteo nel periodo, cosa mettere in valigia, trasporti locali, piatti da assaggiare, etichetta, sicurezza, app utili, orari migliori per le attrazioni del piano
- Niente frasi generiche ("bevi acqua", "porta la fotocamera") — sempre specifici alla destinazione
- Italiano naturale`;
}

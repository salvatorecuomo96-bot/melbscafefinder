// Vercel serverless function: POST /api/filter
// Accepts { query: string }, returns { filters, label }
// Claude maps natural language to useCafeFilters filter shape.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You map natural language cafe search queries to a structured filter object for a Melbourne cafe finder app.

Available filters:
- booleans (true/false): specialtyCoffee, matcha, hasWifi, hasPowerOutlets, laptopFriendly, outdoorSeating, dogFriendly, pramFriendly, kidFriendly, hiddenGem, locallyOwned, hasDecaf, filterCoffee
- enums (single value): noiseLevel ("quiet"|"moderate"|"lively"|"loud"), chaiType ("leaf"|"powder"), veganOptions ("excellent"|"good"|"limited")
- coffeeBrands (array): ["Single O","Code Black","Five Senses","Allpress","St Ali","Industry Beans","Axil","Seven Seeds","Market Lane","Veneziano","Proud Mary","Dukes","Rumble","Campos","Ona","Padre"]
- plantMilk (array): ["oat","soy","almond","macadamia","coconut"]
- priceLevels (array of 1-4): 1=$, 2=$$, 3=$$$, 4=$$$$
- minRating (0-5, step 0.5)
- openNow (true/false)
- openLate (true/false)
- suburb (string, exact Melbourne suburb name)

Return ONLY valid JSON in this shape:
{
  "filters": {
    "booleans": {},
    "enums": {},
    "coffeeBrands": [],
    "plantMilk": [],
    "priceLevels": [],
    "minRating": 0,
    "openNow": false,
    "openLate": false,
    "suburb": null
  },
  "label": "short human-readable summary of what was applied"
}

Only include filters that are clearly implied by the query. Do not guess. If nothing matches, return empty filters.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: query.trim() }],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const result = JSON.parse(jsonMatch[0]);
    res.status(200).json(result);
  } catch (err) {
    console.error('filter API error:', err.message);
    res.status(500).json({ error: 'Failed to parse query' });
  }
}

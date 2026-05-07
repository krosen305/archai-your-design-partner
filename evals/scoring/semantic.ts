import type { ScoreResult } from '../types.ts'

/**
 * Semantic scoring — bruges til AI-genereret output (PdfExtractorService,
 * HusDnaGeneratorService) hvor korrekthed ikke kan testes med exact match.
 *
 * Kalder Claude Haiku som LLM-judge med en struktureret rubrik.
 * Returnerer 0–1 baseret på andel af rubrik-kriterier der er opfyldt.
 *
 * Billig at køre: Haiku-priser + lille prompt = ~$0.001 per eval.
 * Kræver ANTHROPIC_API_KEY i env.
 */
export async function scoreSemantic(
  output: unknown,
  rubric: string[]
): Promise<ScoreResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    return {
      score: 0,
      passed: false,
      reason: 'ANTHROPIC_API_KEY ikke sat — semantic scoring sprunget over',
    }
  }

  const outputStr =
    typeof output === 'string' ? output : JSON.stringify(output, null, 2)

  const rubricList = rubric.map((r, i) => `${i + 1}. ${r}`).join('\n')

  const prompt = `Du er en streng, objektiv evaluator. Vurdér om dette output opfylder ALLE kriterierne nedenfor.

OUTPUT:
${outputStr}

KRITERIER:
${rubricList}

Svar KUN med dette JSON-format (ingen forklaring udenfor JSON):
{
  "results": [
    { "criterion": "<kriterium>", "met": true/false, "reason": "<kort begrundelse>" }
  ]
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    return {
      score: 0,
      passed: false,
      reason: `Haiku API fejl: ${response.status} — ${error}`,
    }
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const text = data.content.find((c) => c.type === 'text')?.text ?? ''

  let parsed: { results: Array<{ criterion: string; met: boolean; reason: string }> }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Ingen JSON i respons')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return {
      score: 0,
      passed: false,
      reason: `Kunne ikke parse Haiku-respons: ${text.slice(0, 200)}`,
    }
  }

  const met = parsed.results.filter((r) => r.met).length
  const total = parsed.results.length
  const score = total === 0 ? 0 : met / total

  const failing = parsed.results.filter((r) => !r.met)

  return {
    score,
    passed: score >= 0.8,
    reason:
      failing.length === 0
        ? `Alle ${total} kriterier opfyldt`
        : `${met}/${total} kriterier opfyldt. Ikke opfyldt: ${failing.map((f) => f.criterion).join(', ')}`,
    details: Object.fromEntries(parsed.results.map((r) => [r.criterion, r])),
  }
}

import { env } from "../../lib/env";

/**
 * Adaptador de IA para la preconsulta guiada (paso 19, rebanada 8). Contrato
 * unico con tres implementaciones seleccionables por `AI_PROVIDER`:
 *
 *   - `fake`      determinista, sin red. Default para dev/pruebas.
 *   - `openai`    SDK oficial `openai`, llave en `OPENAI_API_KEY`.
 *   - `anthropic` SDK oficial `@anthropic-ai/sdk`, llave en `ANTHROPIC_API_KEY`.
 *
 * GOBERNANZA (paso 11): el contenido que entra aqui debe venir ya
 * SEUDONIMIZADO (sin nombre, telefono, correo ni identificadores directos del
 * paciente). El llamador es responsable de no incluir PII y de NO persistir el
 * contenido ni en logs ni en telemetria (regla 4). El proveedor real solo se
 * cablea en staging con BAA (paso 16); hasta entonces se usa `fake`.
 */

export type PreconsultaTurn = {
  question: string;
  answer: string;
};

export type PreconsultaContext = {
  /** Motivo de consulta en palabras del paciente (seudonimizado, sin PII). */
  motivo: string;
  /** Turnos ya contestados, para no repetir y adaptar la siguiente pregunta. */
  answers: PreconsultaTurn[];
  /** Tope de preguntas de la entrevista (la rebanada 8 usa 5). */
  maxQuestions: number;
};

export type NextQuestion =
  | { type: "question"; question: string }
  | { type: "done" };

export interface PreconsultaAiProvider {
  readonly name: string;
  /** Devuelve la siguiente pregunta adaptativa, o `done` si ya no hay mas. */
  nextQuestion(context: PreconsultaContext): Promise<NextQuestion>;
}

const SYSTEM_PROMPT = [
  "Eres un asistente clinico que ayuda a un medico a preparar una consulta.",
  "Entrevistas al paciente con preguntas breves, una a la vez, en lenguaje sencillo (espanol de Mexico).",
  "Parte del motivo de consulta y adapta cada pregunta a las respuestas previas.",
  "No repitas preguntas ya hechas. No des diagnosticos ni consejos de tratamiento.",
  "No pidas datos personales identificables (nombre, telefono, direccion, correo).",
  "Cuando ya tengas suficiente contexto util para el medico, termina la entrevista."
].join(" ");

/** Construye el mensaje de usuario con el motivo y las respuestas previas. */
function buildConversationSummary(context: PreconsultaContext): string {
  const lines = [`Motivo de consulta: ${context.motivo || "(no especificado)"}`];
  context.answers.forEach((turn, index) => {
    lines.push(`P${index + 1}: ${turn.question}`);
    lines.push(`R${index + 1}: ${turn.answer}`);
  });
  lines.push(
    `Has hecho ${context.answers.length} de un maximo de ${context.maxQuestions} preguntas.`,
    'Responde SOLO con JSON: {"done": boolean, "question": string}. ' +
      'Si quedan preguntas utiles y no se ha alcanzado el maximo, "done": false y "question" con la siguiente pregunta. ' +
      'Si ya es suficiente o se alcanzo el maximo, "done": true y "question": "".'
  );
  return lines.join("\n");
}

/** Interpreta la salida del modelo como JSON {done, question} de forma tolerante. */
function parseModelDecision(raw: string, context: PreconsultaContext): NextQuestion {
  if (context.answers.length >= context.maxQuestions) {
    return { type: "done" };
  }
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { done?: boolean; question?: string }) : null;
    const question = typeof parsed?.question === "string" ? parsed.question.trim() : "";
    if (parsed?.done || !question) {
      return { type: "done" };
    }
    return { type: "question", question };
  } catch {
    // Salida no parseable: terminar de forma segura en vez de arriesgar PHI/loops.
    return { type: "done" };
  }
}

/**
 * Proveedor determinista sin red. Genera preguntas de un banco fijo, sin
 * repetir, arrancando del motivo. Estable para pruebas y para construir el
 * contrato antes del cableado real.
 */
export class FakePreconsultaProvider implements PreconsultaAiProvider {
  readonly name = "fake-preconsulta";

  private readonly bank = [
    "¿Desde cuándo tiene estas molestias?",
    "¿Qué tan intensas son del 1 al 10?",
    "¿Hay algo que las mejore o las empeore?",
    "¿Ha tenido fiebre u otros síntomas además de este?",
    "¿Está tomando algún medicamento por esto actualmente?"
  ];

  async nextQuestion(context: PreconsultaContext): Promise<NextQuestion> {
    const index = context.answers.length;
    if (index >= context.maxQuestions || index >= this.bank.length) {
      return { type: "done" };
    }
    // Si no hay motivo y es la primera pregunta, pedir el sintoma principal.
    if (index === 0 && !context.motivo.trim()) {
      return { type: "question", question: "¿Cuál es el síntoma principal que lo trae a consulta?" };
    }
    return { type: "question", question: this.bank[index] };
  }
}

/** Proveedor OpenAI (SDK oficial). Solo se usa con `AI_PROVIDER=openai`. */
class OpenAiPreconsultaProvider implements PreconsultaAiProvider {
  readonly name = "openai-preconsulta";

  async nextQuestion(context: PreconsultaContext): Promise<NextQuestion> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY no esta configurada.");
    }
    // Import dinamico: el SDK es una dependencia opcional, solo requerida cuando
    // se elige este proveedor (mantiene el build por defecto sin la dependencia).
    // Dependencia opcional: se resuelve en runtime solo si se elige este
    // proveedor. turbopackIgnore evita que el bundler la resuelva en build.
    const moduleName = "openai";
    const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ moduleName)) as {
      default: new (opts: { apiKey: string }) => {
        chat: {
          completions: {
            create(args: unknown): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
          };
        };
      };
    };
    const OpenAI = mod.default;
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: env.AI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildConversationSummary(context) }
      ],
      temperature: 0.4
    });
    return parseModelDecision(completion.choices[0]?.message?.content ?? "", context);
  }
}

/** Proveedor Anthropic/Claude (SDK oficial). Solo se usa con `AI_PROVIDER=anthropic`. */
class AnthropicPreconsultaProvider implements PreconsultaAiProvider {
  readonly name = "anthropic-preconsulta";

  async nextQuestion(context: PreconsultaContext): Promise<NextQuestion> {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY no esta configurada.");
    }
    // Dependencia opcional: ver nota en el proveedor OpenAI.
    const moduleName = "@anthropic-ai/sdk";
    const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ moduleName)) as {
      default: new (opts: { apiKey: string }) => {
        messages: {
          create(args: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
        };
      };
    };
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: env.AI_MODEL ?? "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildConversationSummary(context) }]
    });
    const text = message.content.find((block) => block.type === "text")?.text ?? "";
    return parseModelDecision(text, context);
  }
}

let cachedProvider: PreconsultaAiProvider | null = null;

/** Devuelve el proveedor seleccionado por `AI_PROVIDER` (memoizado). */
export function getPreconsultaAiProvider(): PreconsultaAiProvider {
  if (cachedProvider) {
    return cachedProvider;
  }
  switch (env.AI_PROVIDER) {
    case "openai":
      cachedProvider = new OpenAiPreconsultaProvider();
      break;
    case "anthropic":
      cachedProvider = new AnthropicPreconsultaProvider();
      break;
    default:
      cachedProvider = new FakePreconsultaProvider();
  }
  return cachedProvider;
}

import { flattenMedicalHistoryDisplayRows } from "./medicalHistoryFormat.ts";

export interface PreconsultaQuestion {
  question: string;
  answer: string;
}

export interface PreconsultaPresentation {
  motivo: string;
  questions: PreconsultaQuestion[];
  legacyRows: Array<[string, string]>;
}

interface AiConversationTurn {
  question?: unknown;
  answer?: unknown;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildPreconsultaPresentation(raw: string): PreconsultaPresentation {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (Array.isArray(parsed.conversation)) {
      const questions = (parsed.conversation as AiConversationTurn[]).flatMap(
        (turn, index): PreconsultaQuestion[] => {
          const question = cleanText(turn.question);
          const answer = cleanText(turn.answer);
          if (!question && !answer) return [];
          return [{ question: question || `Pregunta ${index + 1}`, answer }];
        }
      );

      return {
        motivo: cleanText(parsed.motivo),
        questions,
        legacyRows: []
      };
    }

    return {
      motivo: "",
      questions: [],
      legacyRows: flattenMedicalHistoryDisplayRows(raw)
    };
  } catch {
    return {
      motivo: "",
      questions: [],
      legacyRows: raw.trim() ? [["Respuestas", raw]] : []
    };
  }
}

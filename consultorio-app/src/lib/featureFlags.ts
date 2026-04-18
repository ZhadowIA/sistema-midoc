import { getServerEnv } from './env'

export function isClinicalHistoryEnabled(): boolean {
  return getServerEnv().CLINICAL_HISTORY_ENABLED
}

export function isConsultaUnifiedEnabled(): boolean {
  return getServerEnv().CONSULTA_UNIFIED_ENABLED
}

export function isAiAvailableOnServer(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY)
}

import { getServerEnv } from './env'

export function isClinicalHistoryEnabled(): boolean {
  return getServerEnv().CLINICAL_HISTORY_ENABLED
}

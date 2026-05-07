'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'

interface CreditBalance {
  balance: number
  reserved: number
  available: number
  tier?: 'AI_30' | 'AI_60' | 'AI_100'
}

const TIER_DESCRIPTIONS = {
  AI_30: { label: '30%', consultations: 126 },
  AI_60: { label: '60%', consultations: 252 },
  AI_100: { label: '100%', consultations: 420 },
}

const CREDIT_COSTS = {
  transcription: 2,
  dictation: 1,
  insights: 1,
  pharmacovigilance: 2,
  patientInstructions: 1,
  questionnaireFollowUp: 1,
}

const TOTAL_COST_PER_CONSULTATION = 8

export function ClinicalCreditsCard() {
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/clinical/credits')
      .then((res) => res.json())
      .then(setBalance)
      .catch((err) => {
        console.error('Failed to load credit balance:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="border rounded-md p-4 bg-card space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">Créditos Clínicos IA</p>
        </div>
        <div className="h-8 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (!balance) {
    return (
      <div className="border rounded-md p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">Créditos Clínicos IA</p>
        </div>
        <p className="text-xs text-muted-foreground">No tienes Add-on IA activado</p>
      </div>
    )
  }

  const tierInfo = balance.tier && TIER_DESCRIPTIONS[balance.tier]
  const consultationsAvailable = Math.floor(balance.available / TOTAL_COST_PER_CONSULTATION)
  const percentUsed = balance.balance > 0
    ? Math.round((100 * (balance.balance - balance.available)) / balance.balance)
    : 0

  return (
    <div className="border rounded-md p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">
            Créditos Clínicos IA {tierInfo && `(${tierInfo.label})`}
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
          {balance.available} / {balance.balance}
        </span>
      </div>

      <div className="bg-muted rounded-lg p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Disponibles {tierInfo && `(de ${tierInfo.consultations} máximo)`}
          </span>
          <span className="text-sm font-bold text-foreground">{consultationsAvailable} consultas</span>
        </div>
        <div className="w-full h-2 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          {percentUsed}% del presupuesto mensual utilizado
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-background rounded p-2">
          <p className="text-muted-foreground mb-0.5">Por consulta</p>
          <p className="font-semibold text-foreground">{TOTAL_COST_PER_CONSULTATION} créditos</p>
        </div>
        <div className="bg-background rounded p-2">
          <p className="text-muted-foreground mb-0.5">Reservados</p>
          <p className="font-semibold text-foreground">{balance.reserved} créditos</p>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1 pt-2 border-t border-border">
        <p className="font-medium text-foreground text-xs">Desglose por función:</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(CREDIT_COSTS).map(([key, cost]) => (
            <div key={key} className="flex justify-between">
              <span className="capitalize">{key}:</span>
              <span className="font-mono">{cost} cr.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

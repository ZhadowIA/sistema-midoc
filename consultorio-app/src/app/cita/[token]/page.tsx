'use client'

import { use, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Calendar, User, Clock, Stethoscope } from 'lucide-react'
import { FeedbackState } from '@/components/FeedbackState'

type Appointment = {
  appointmentId: string
  startTime: string
  status: string
  doctorName: string
  patientName: string
}

type PageStatus = 'loading' | 'ready' | 'confirming' | 'cancelling' | 'confirmed' | 'cancelled' | 'already' | 'error'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CitaActionPage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ accion?: string }> }) {
  const { token } = use(props.params)
  const { accion } = use(props.searchParams)

  const [status, setStatus] = useState<PageStatus>('loading')
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/appointments/action/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setStatus('error'); return }
        setAppointment(data)

        if (data.status === 'CONFIRMED' && accion === 'confirmar') {
          setStatus('already')
        } else if (data.status === 'CANCELLED') {
          setStatus('already')
        } else {
          setStatus('ready')
        }
      })
      .catch(() => { setError('No se pudo cargar la información de la cita.'); setStatus('error') })
  }, [token, accion])

  async function handleAction(action: 'CONFIRM' | 'CANCEL') {
    setStatus(action === 'CONFIRM' ? 'confirming' : 'cancelling')
    try {
      const res = await fetch(`/api/public/appointments/action/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al procesar la solicitud'); setStatus('error'); return }
      setStatus(action === 'CONFIRM' ? 'confirmed' : 'cancelled')
    } catch {
      setError('Error de conexión. Por favor intenta de nuevo.')
      setStatus('error')
    }
  }

  if (status === 'loading') return <Shell><FeedbackState variant="loading" title="Cargando información de tu cita" compact /></Shell>

  if (status === 'error') return (
    <Shell>
      <div className="text-center">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">No pudimos procesar tu solicitud</h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    </Shell>
  )

  if (status === 'confirmed') return (
    <Shell>
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">¡Cita confirmada!</h2>
        <p className="text-gray-500 text-sm">Gracias por confirmar. Te esperamos el {appointment && formatDate(appointment.startTime)}.</p>
      </div>
    </Shell>
  )

  if (status === 'cancelled') return (
    <Shell>
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Cita cancelada</h2>
        <p className="text-gray-500 text-sm">Tu cita ha sido cancelada. Si deseas reagendar, comunícate directamente con el consultorio.</p>
      </div>
    </Shell>
  )

  if (status === 'already') return (
    <Shell>
      <div className="text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Esta cita ya fue procesada</h2>
        <p className="text-gray-500 text-sm">El estado de tu cita ya no requiere acción adicional.</p>
      </div>
    </Shell>
  )

  const isConfirming = status === 'confirming'
  const isCancelling = status === 'cancelling'
  const isBusy = isConfirming || isCancelling

  return (
    <Shell>
      {appointment && (
        <>
          <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3">
            <InfoRow icon={<User className="w-4 h-4" />} label="Paciente" value={appointment.patientName} />
            <InfoRow icon={<Stethoscope className="w-4 h-4" />} label="Doctor" value={appointment.doctorName} />
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Fecha y hora" value={formatDate(appointment.startTime)} />
            <InfoRow icon={<Clock className="w-4 h-4" />} label="Estado" value={appointment.status === 'PENDING' ? 'Pendiente de confirmación' : 'Confirmada'} />
          </div>

          {accion === 'confirmar' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center mb-4">¿Confirmas tu asistencia a esta cita?</p>
              <button
                onClick={() => handleAction('CONFIRM')}
                disabled={isBusy}
                className="w-full py-3 px-6 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {isConfirming ? 'Confirmando...' : 'Sí, confirmar mi cita'}
              </button>
              <button
                onClick={() => setStatus('ready')}
                disabled={isBusy}
                className="w-full py-2 px-6 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                Ver otras opciones
              </button>
            </div>
          ) : accion === 'cancelar' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center mb-4">¿Deseas cancelar esta cita?</p>
              <button
                onClick={() => handleAction('CANCEL')}
                disabled={isBusy}
                className="w-full py-3 px-6 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {isCancelling ? 'Cancelando...' : 'Sí, cancelar mi cita'}
              </button>
              <button
                onClick={() => setStatus('ready')}
                disabled={isBusy}
                className="w-full py-2 px-6 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                Ver otras opciones
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center mb-4">¿Qué deseas hacer con tu cita?</p>
              <button
                onClick={() => handleAction('CONFIRM')}
                disabled={isBusy}
                className="w-full py-3 px-6 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {isConfirming ? 'Confirmando...' : '✓ Confirmar asistencia'}
              </button>
              <button
                onClick={() => handleAction('CANCEL')}
                disabled={isBusy}
                className="w-full py-3 px-6 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-60 transition-colors"
              >
                {isCancelling ? 'Cancelando...' : '✕ Cancelar cita'}
              </button>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Stethoscope className="w-7 h-7 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">MiDoc</span>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-teal-600 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  )
}

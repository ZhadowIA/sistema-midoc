export class AgendaAppointmentInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaAppointmentInputError'
  }
}

export class AgendaAppointmentForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaAppointmentForbiddenError'
  }
}

export class AgendaAppointmentNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaAppointmentNotFoundError'
  }
}

export class AgendaAppointmentConflictError extends Error {
  code: string
  detail?: string

  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'AgendaAppointmentConflictError'
    this.code = code
    this.detail = detail
  }
}

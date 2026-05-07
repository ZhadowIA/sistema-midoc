export class AgendaBlockInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaBlockInputError'
  }
}

export class AgendaBlockConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaBlockConflictError'
  }
}

export class AgendaBlockForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgendaBlockForbiddenError'
  }
}

